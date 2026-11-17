-- Clients ask for a service they don't have; requests appear in Reviews, and Reviews gains a
-- Focused filter for service and meeting requests (decision 0042).

-- ---------------------------------------------------------------------------
-- Service requests
-- ---------------------------------------------------------------------------
create table public.service_requests (
  id uuid primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  service public.service_kind not null,
  message text not null default '' check (char_length(message) <= 1000),
  -- Clock time, so requests order correctly against Reviews read marks.
  created_at timestamptz not null default clock_timestamp(),
  created_by uuid references auth.users (id) on delete set null
);
create index service_requests_client on public.service_requests (client_id, service);

create table public.staff_service_request_seen (
  staff_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null references public.service_requests (id) on delete cascade,
  seen_at timestamptz not null,
  primary key (staff_id, request_id)
);
create index staff_service_request_seen_request on public.staff_service_request_seen (request_id);

-- A request is answered once the client has the service, or has had it since sending the request.
create or replace function private.service_request_status(r public.service_requests)
returns text language sql stable security definer set search_path = ''
as $$
  select case when exists (select 1 from public.service_enrollments e
    where e.client_id = r.client_id and e.service = r.service and (e.status <> 'ended' or e.created_at >= r.created_at)) then 'enrolled' else 'pending' end;
$$;

create or replace function private.service_request_document(r public.service_requests)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'service', r.service, 'message', r.message, 'createdAt', r.created_at,
    'status', private.service_request_status(r));
$$;

-- Retrying with the same id returns the first request, so a lost reply never sends twice.
create or replace function public.request_service(p_request_id uuid, p_service text, p_message text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me_client uuid := private.current_client_id();
  existing public.service_requests;
  r public.service_requests;
begin
  if me_client is null or p_request_id is null then
    raise exception 'clients only' using errcode = '42501';
  end if;
  select * into existing from public.service_requests where id = p_request_id;
  if found then
    if existing.client_id = me_client and existing.service::text = p_service then return private.service_request_document(existing); end if;
    raise exception 'request id already used' using errcode = '22023';
  end if;
  if p_service is null or p_service not in ('personal_training', 'mesocycle', 'nutrition') then
    raise exception 'unknown service %', p_service using errcode = '22023';
  end if;
  if char_length(coalesce(p_message, '')) > 1000 then
    raise exception 'keep the message under 1000 characters' using errcode = '22023';
  end if;
  -- One request per service at a time; serialise per client so two tabs can't both pass the check.
  perform 1 from public.clients where id = me_client for update;
  if exists (select 1 from public.service_enrollments where client_id = me_client and service = p_service::public.service_kind and status <> 'ended') then
    raise exception 'you already have this service' using errcode = '55000';
  end if;
  if exists (select 1 from public.service_requests q where q.client_id = me_client and q.service = p_service::public.service_kind
    and private.service_request_status(q) = 'pending') then
    raise exception 'you have already requested this service' using errcode = '55000';
  end if;
  insert into public.service_requests (id, client_id, service, message, created_by)
  values (p_request_id, me_client, p_service::public.service_kind, btrim(coalesce(p_message, '')), (select auth.uid()))
  returning * into r;
  return private.service_request_document(r);
end;
$$;

-- The client's own requests, newest first (Home's "Request a new service").
create or replace function public.list_my_service_requests()
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(private.service_request_document(r) order by r.created_at desc), '[]'::jsonb)
  from public.service_requests r where r.client_id = (select private.current_client_id());
$$;

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
-- Security invoker: RLS decides which requests the caller sees.
create or replace function private.service_request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'service_request', 'id', r.id, 'service', r.service, 'message', r.message,
      'status', private.service_request_status(r), 'activityAt', r.created_at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, r.created_at,
    r.created_at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.service_requests r
  join public.clients c on c.id = r.client_id
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_service_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;

create or replace function private.all_staff_activity()
returns table (item jsonb, id uuid, activity_at timestamptz, unread boolean, kind text)
language sql stable set search_path = ''
as $$
  select private.activity_item(s.a) || jsonb_build_object('activityAt', s.client_activity_at, 'clientId', s.client_id, 'clientName', s.client_name, 'unread', s.unread),
    s.id, s.client_activity_at, s.unread, private.activity_kind(s.a) from private.staff_activity() s
  union all
  select n.item || jsonb_build_object('clientId', n.client_id, 'clientName', n.client_name, 'unread', n.unread), n.id, n.activity_at, n.unread, 'nutrition'
    from private.nutrition_activity(null) n
  union all
  select q.item || jsonb_build_object('clientId', q.client_id, 'clientName', q.client_name, 'unread', q.unread), q.id, q.activity_at, q.unread, 'request'
    from private.request_activity() q
  union all
  select q.item || jsonb_build_object('clientId', q.client_id, 'clientName', q.client_name, 'unread', q.unread), q.id, q.activity_at, q.unread, 'service_request'
    from private.service_request_activity() q;
$$;

-- Focused: service requests and meeting requests only. A new parameter needs a new signature.
drop function public.get_staff_activity(timestamptz, uuid, integer, boolean);
create function public.get_staff_activity(p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 25,
  p_unread_only boolean default false, p_focused boolean default false)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode = '22023'; end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'the cursor needs both a time and an id' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.activity_at desc, x.id desc), '[]'::jsonb) from (
    select * from private.all_staff_activity() a
    where (not coalesce(p_unread_only, false) or a.unread)
      and (not coalesce(p_focused, false) or a.kind in ('request', 'service_request'))
      and (p_before_at is null or (a.activity_at, a.id) < (p_before_at, p_before_id))
    order by a.activity_at desc, a.id desc limit p_limit
  ) x);
end;
$$;

create or replace function public.get_review_summary()
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return (select jsonb_build_object('unread', count(*), 'completed', count(*) filter (where kind = 'completed'),
    'logged', count(*) filter (where kind = 'logged'), 'skipped', count(*) filter (where kind = 'skipped'), 'started', count(*) filter (where kind = 'started'))
    || case when count(*) filter (where kind = 'nutrition') > 0 then jsonb_build_object('nutrition', count(*) filter (where kind = 'nutrition')) else '{}'::jsonb end
    || case when count(*) filter (where kind in ('request', 'service_request')) > 0 then jsonb_build_object('requests', count(*) filter (where kind in ('request', 'service_request'))) else '{}'::jsonb end
    from private.all_staff_activity() where unread);
end;
$$;

create or replace function public.mark_service_request_read(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select client_id into owner from public.service_requests where id = p_request_id;
  if owner is null or not private.staff_can_access_client(owner) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  insert into public.staff_service_request_seen values ((select auth.uid()), p_request_id, clock_timestamp())
  on conflict (staff_id, request_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- Same as migration 00031; "mark all" now also covers service requests.
create or replace function public.mark_activity_read(p_session_id uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); owner uuid; at timestamptz := clock_timestamp();
begin
  if me is null or not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_session_id is null then
    insert into public.staff_activity_reads values (me, at) on conflict (staff_id) do update set read_through = excluded.read_through;
    delete from public.staff_activity_seen where staff_id = me and seen_at <= at;
    delete from public.staff_nutrition_activity_seen where staff_id = me and seen_at <= at;
    delete from public.staff_request_seen where staff_id = me and seen_at <= at;
    delete from public.staff_service_request_seen where staff_id = me and seen_at <= at;
    return;
  end if;
  select client_id into owner from public.training_sessions where id = p_session_id;
  if owner is null or not private.staff_can_access_client(owner) then raise exception 'session not found' using errcode = '42501'; end if;
  insert into public.staff_activity_seen values (me, p_session_id, at) on conflict (staff_id, session_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
alter table public.service_requests enable row level security;
alter table public.staff_service_request_seen enable row level security;
revoke all on public.service_requests, public.staff_service_request_seen from anon, authenticated;
grant select on public.service_requests, public.staff_service_request_seen to authenticated;
create policy service_requests_select on public.service_requests for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy staff_service_request_seen_select on public.staff_service_request_seen for select to authenticated
  using (staff_id = (select auth.uid()));

revoke all on function private.service_request_status(public.service_requests), private.service_request_document(public.service_requests),
  private.service_request_activity() from public, anon, authenticated;
grant execute on function private.service_request_status(public.service_requests), private.service_request_document(public.service_requests),
  private.service_request_activity() to authenticated;
-- Replaced functions keep their grants; these are new or re-created.
revoke all on function public.request_service(uuid, text, text), public.list_my_service_requests(), public.mark_service_request_read(uuid),
  public.get_staff_activity(timestamptz, uuid, integer, boolean, boolean) from public, anon, authenticated;
grant execute on function public.request_service(uuid, text, text), public.list_my_service_requests(), public.mark_service_request_read(uuid),
  public.get_staff_activity(timestamptz, uuid, integer, boolean, boolean) to authenticated;
