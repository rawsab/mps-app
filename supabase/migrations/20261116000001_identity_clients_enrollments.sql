-- M2 / migration step 1 (roadmap §6): protected roles, profiles, clients, coach assignments,
-- service enrollments, and their baseline policies. Every table ships with RLS + grants here;
-- nothing is left for a later "security pass".

create extension if not exists citext with schema extensions;

-- Authorization helpers live in a schema that PostgREST does not expose.
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.staff_role as enum ('admin', 'coach');
create type public.service_kind as enum ('personal_training', 'mesocycle', 'nutrition');
-- pending: record exists, no login yet; invited: auth user bound, invitation outstanding;
-- active: signed in at least once; disabled: blocked by policy even with a live token.
create type public.client_status as enum ('pending', 'invited', 'active', 'disabled');
create type public.enrollment_status as enum ('active', 'paused', 'ended');
create type public.weight_unit as enum ('lb', 'kg');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.profiles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 120),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  preferred_weight_unit public.weight_unit,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profiles is 'User-editable profile fields only. Roles live in staff_roles.';

create table public.staff_roles (
  auth_user_id uuid primary key references auth.users (id) on delete cascade,
  role public.staff_role not null,
  granted_at timestamptz not null default now(),
  granted_by uuid references auth.users (id)
);
comment on table public.staff_roles is 'Protected. No client-side writes; assigned by an operator or privileged function.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users (id) on delete set null,
  email extensions.citext not null unique check (position('@' in email) > 1),
  full_name text not null check (char_length(full_name) between 1 and 160),
  status public.client_status not null default 'pending',
  primary_coach_id uuid references auth.users (id) on delete set null,
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint clients_bound_status check (status = 'pending' or auth_user_id is not null or status = 'disabled')
);
comment on column public.clients.auth_user_id is 'Bound only by the server-side invitation flow, never from a browser-supplied value.';

create table public.coach_clients (
  coach_id uuid not null references auth.users (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  can_publish boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (coach_id, client_id)
);

create table public.service_enrollments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  service public.service_kind not null,
  status public.enrollment_status not null default 'active',
  starts_on date not null default current_date,
  ends_on date,
  coach_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_enrollments_dates check (ends_on is null or ends_on >= starts_on),
  constraint service_enrollments_ended_has_date check (status <> 'ended' or ends_on is not null)
);
-- One live (active/paused) enrollment per client and service; ended ones are history.
create unique index service_enrollments_one_live
  on public.service_enrollments (client_id, service) where status <> 'ended';
create index service_enrollments_client on public.service_enrollments (client_id);
create index coach_clients_client on public.coach_clients (client_id);
create index clients_primary_coach on public.clients (primary_coach_id);

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------
create or replace function private.is_admin()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff_roles where auth_user_id = (select auth.uid()) and role = 'admin');
$$;

create or replace function private.is_staff()
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.staff_roles where auth_user_id = (select auth.uid()));
$$;

-- Staff access to a specific client: admin sees all; a coach sees only explicitly assigned clients.
-- Creating an account never grants client access by itself (PRD §4).
create or replace function private.staff_can_access_client(target_client uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
      or exists (
        select 1
        from public.coach_clients cc
        join public.staff_roles sr on sr.auth_user_id = cc.coach_id and sr.role = 'coach'
        where cc.coach_id = (select auth.uid()) and cc.client_id = target_client
      );
$$;

-- The caller's own client id, or null when the caller is not a client or is disabled.
-- Disabled clients lose data access immediately, even with an unexpired token (FR-01).
create or replace function private.current_client_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from public.clients
  where auth_user_id = (select auth.uid()) and status in ('invited', 'active');
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------
create or replace function private.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function private.touch_updated_at();
create trigger clients_touch before update on public.clients
  for each row execute function private.touch_updated_at();
create trigger service_enrollments_touch before update on public.service_enrollments
  for each row execute function private.touch_updated_at();

-- Every auth user gets a profile row. Display name comes from invite metadata only.
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (auth_user_id, display_name)
  values (new.id, coalesce(left(new.raw_user_meta_data ->> 'display_name', 120), ''))
  on conflict (auth_user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- An invited client becomes active the first time they sign in.
create or replace function public.mark_client_active()
returns void language sql security definer set search_path = ''
as $$
  update public.clients set status = 'active'
  where auth_user_id = (select auth.uid()) and status = 'invited';
$$;
revoke all on function public.mark_client_active() from public, anon;
grant execute on function public.mark_client_active() to authenticated;

-- ---------------------------------------------------------------------------
-- Grants: start from nothing, then grant only what policies are written for.
-- ---------------------------------------------------------------------------
revoke all on public.profiles, public.staff_roles, public.clients, public.coach_clients,
  public.service_enrollments from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (display_name, timezone, preferred_weight_unit) on public.profiles to authenticated;

grant select on public.staff_roles to authenticated;

grant select on public.clients to authenticated;
grant insert (email, full_name, primary_coach_id, timezone) on public.clients to authenticated;
-- auth_user_id is deliberately not client-writable; binding happens in the invite function.
grant update (email, full_name, status, primary_coach_id, timezone) on public.clients to authenticated;

grant select on public.coach_clients to authenticated;
grant insert, delete on public.coach_clients to authenticated;
grant update (can_publish) on public.coach_clients to authenticated;

grant select on public.service_enrollments to authenticated;
grant insert (client_id, service, status, starts_on, ends_on, coach_id) on public.service_enrollments to authenticated;
grant update (status, starts_on, ends_on, coach_id) on public.service_enrollments to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.staff_roles enable row level security;
alter table public.clients enable row level security;
alter table public.coach_clients enable row level security;
alter table public.service_enrollments enable row level security;

-- profiles
create policy profiles_select on public.profiles for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select private.is_staff()));
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth_user_id = (select auth.uid()))
  with check (auth_user_id = (select auth.uid()));

-- staff_roles: readable by the holder and admins; no write policy exists, so no self-promotion.
create policy staff_roles_select on public.staff_roles for select to authenticated
  using (auth_user_id = (select auth.uid()) or (select private.is_admin()));

-- clients
create policy clients_select on public.clients for select to authenticated
  using (id = (select private.current_client_id()) or (select private.staff_can_access_client(id)));
create policy clients_insert_admin on public.clients for insert to authenticated
  with check ((select private.is_admin()));
create policy clients_update_admin on public.clients for update to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

-- coach_clients: admins manage; a coach can see their own assignments.
create policy coach_clients_select on public.coach_clients for select to authenticated
  using (coach_id = (select auth.uid()) or (select private.is_admin()));
create policy coach_clients_admin_insert on public.coach_clients for insert to authenticated
  with check ((select private.is_admin()));
create policy coach_clients_admin_update on public.coach_clients for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy coach_clients_admin_delete on public.coach_clients for delete to authenticated
  using ((select private.is_admin()));

-- service_enrollments: client reads own; assigned staff read; admin manages (PRD §4 access matrix).
create policy enrollments_select on public.service_enrollments for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy enrollments_admin_insert on public.service_enrollments for insert to authenticated
  with check ((select private.is_admin()));
create policy enrollments_admin_update on public.service_enrollments for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
