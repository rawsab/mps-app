-- LOCAL DEVELOPMENT DATA ONLY. People are fictional; every email is on the reserved
-- example.test domain so invitations and password resets can never reach a real inbox.
-- Applied by `supabase db reset`. Never run against a hosted project.
-- All accounts share the password: local-dev-only-password

begin;

do $$
declare
  u record;
begin
  for u in
    select * from (values
      -- staff
      ('00000000-0000-4000-a000-000000000001'::uuid, 'matt@example.test',            'Matt Lizmore'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'priya.nair@example.test',      'Priya Nair'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'liam.oconnor@example.test',    'Liam O''Connor'),
      -- clients with accounts
      ('00000000-0000-4000-a000-000000000011'::uuid, 'maya.chen@example.test',       'Maya Chen'),
      ('00000000-0000-4000-a000-000000000012'::uuid, 'daniel.okafor@example.test',   'Daniel Okafor'),
      ('00000000-0000-4000-a000-000000000013'::uuid, 'sofia.marquez@example.test',   'Sofia Márquez'),
      ('00000000-0000-4000-a000-000000000015'::uuid, 'lucas.silva@example.test',     'Lucas Silva'),
      ('00000000-0000-4000-a000-000000000017'::uuid, 'grace.liu@example.test',       'Grace Liu'),
      ('00000000-0000-4000-a000-000000000019'::uuid, 'ryan.patel@example.test',      'Ryan Patel')
    ) as t(id, email, display_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('local-dev-only-password', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.display_name),
      now() - interval '1 year', now(), '', '', '', ''
    ) on conflict (id) do nothing;
    if found then
      update public.profiles
      set timezone = case when u.email = 'ryan.patel@example.test' then 'America/Edmonton' else 'America/Toronto' end
      where auth_user_id = u.id;
    end if;
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      md5('mps-demo/identity/' || u.id)::uuid, u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', null, now() - interval '1 year', now()
    ) on conflict (provider_id, provider) do nothing;
  end loop;
end $$;

insert into public.staff_roles (auth_user_id, role) values
  ('00000000-0000-4000-a000-000000000001', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'coach'),
  ('00000000-0000-4000-a000-000000000003', 'coach')
on conflict (auth_user_id) do nothing;

-- Maya's creation date also fixes the demo day for retries. A fresh reset re-anchors the story.
with roster as (
  select * from (values
    -- Client suffix, auth suffix, name, email, status, primary coach suffix, time zone, joined days ago
    (1, 11, 'Maya Chen', 'maya.chen@example.test', 'active', 1, 'America/Toronto', 140),
    (2, 12, 'Daniel Okafor', 'daniel.okafor@example.test', 'active', 1, 'America/Toronto', 112),
    (3, 13, 'Sofia Márquez', 'sofia.marquez@example.test', 'disabled', 1, 'America/Toronto', 190),
    (4, null, 'Ethan Brooks', 'ethan.brooks@example.test', 'pending', 1, 'America/Toronto', 3),
    (6, 15, 'Lucas Silva', 'lucas.silva@example.test', 'invited', 1, 'America/Toronto', 5),
    (9, 17, 'Grace Liu', 'grace.liu@example.test', 'active', 2, 'America/Toronto', 82),
    (12, 19, 'Ryan Patel', 'ryan.patel@example.test', 'disabled', 1, 'America/Edmonton', 168)
  ) as v(client_no, user_no, name, email, status, coach_no, timezone, days_ago)
), anchor as (
  select coalesce((select (created_at at time zone 'America/Toronto')::date + 140
    from public.clients where id = '10000000-0000-4000-b000-000000000001'),
    (now() at time zone 'America/Toronto')::date) as today
)
insert into public.clients (id, auth_user_id, email, full_name, status, primary_coach_id, timezone, created_at, activated_at)
select ('10000000-0000-4000-b000-' || lpad(client_no::text, 12, '0'))::uuid,
  ('00000000-0000-4000-a000-' || lpad(user_no::text, 12, '0'))::uuid,
  email, name, status::public.client_status, ('00000000-0000-4000-a000-' || lpad(coach_no::text, 12, '0'))::uuid,
  timezone, (today - days_ago + time '10:00') at time zone timezone,
  case when status in ('active', 'disabled') then (today - days_ago + time '12:00') at time zone timezone end
from roster cross join anchor
on conflict (id) do nothing;

-- Priya is Grace's primary coach and also helps Matt with Maya. Liam has no assignments.
insert into public.coach_clients (coach_id, client_id) values
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000009')
on conflict do nothing;

with enrollments as (
  select * from (values
    (1, 'mesocycle',         'active',  136, null),
    (1, 'nutrition',         'active',  108, null),
    (2, 'personal_training', 'active',  108, null),
    (2, 'nutrition',         'active',   72, null),
    (3, 'mesocycle',         'ended',   180, 144),
    (4, 'nutrition',         'active',    2, null),
    (6, 'mesocycle',         'active',    1, null),
    (9, 'mesocycle',         'active',   78, null),
    (9, 'personal_training', 'active',   78, null),
    (12, 'personal_training','ended',   160, 130)
  ) as v(client_no, service, status, days_ago, ended_days_ago)
), anchor as (
  select (created_at at time zone 'America/Toronto')::date + 140 as today
  from public.clients where id = '10000000-0000-4000-b000-000000000001'
)
insert into public.service_enrollments (id, client_id, service, status, starts_on, ends_on, archived_at, created_at)
select md5('mps-demo/enrollment/' || client_no || '/' || service)::uuid,
  ('10000000-0000-4000-b000-' || lpad(client_no::text, 12, '0'))::uuid,
  service::public.service_kind, status::public.enrollment_status, today - days_ago, today - ended_days_ago,
  (today - ended_days_ago + time '16:00') at time zone 'America/Toronto',
  (today - days_ago + time '10:00') at time zone 'America/Toronto'
from enrollments cross join anchor
on conflict (id) do nothing;

commit;
