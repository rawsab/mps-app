-- Staff accept or decline service requests (decision 0044). Accepting adds the service; declining
-- lets the client ask again. Any staff member with access to the client can answer, so the
-- functions add the enrollment themselves (adding a service by hand stays admin-only).

alter table public.service_requests
  add column outcome text check (outcome in ('accepted', 'declined')),
  add column response text not null default '' check (char_length(response) <= 1000),
  add column resolved_at timestamptz,
  add column resolved_by uuid references auth.users (id) on delete set null,
  add constraint service_requests_resolved check ((outcome is null) = (resolved_at is null));

-- Declined wins; otherwise a request is answered once the client has the service, or has had it
-- since sending the request (migration 00037), whether or not it was accepted here.
create or replace function private.service_request_status(r public.service_requests)
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when r.outcome = 'declined' then 'declined'
    when exists (select 1 from public.service_enrollments e
      where e.client_id = r.client_id and e.service = r.service and (e.status <> 'ended' or e.created_at >= r.created_at)) then 'enrolled'
    else 'pending' end;
$$;

create or replace function private.service_request_document(r public.service_requests)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', r.id, 'service', r.service, 'message', r.message, 'createdAt', r.created_at,
    'status', private.service_request_status(r), 'response', r.response, 'resolvedAt', r.resolved_at);
$$;

-- The request, locked, after checking the caller can answer it. Locks the client too, so
-- answering serialises with request_service and with a second staff member answering.
create or replace function private.staff_service_request(p_request_id uuid)
returns public.service_requests language plpgsql security definer set search_path = ''
as $$
declare
  r public.service_requests;
begin
  select * into r from public.service_requests where id = p_request_id;
  if r.id is null or not private.is_staff() or not private.staff_can_access_client(r.client_id) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  perform 1 from public.clients where id = r.client_id for update;
  select * into r from public.service_requests where id = p_request_id for update;
  return r;
end;
$$;

-- Adds the service from today in the client's time zone. Answering again returns the same request.
create or replace function public.accept_service_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.service_requests := private.staff_service_request(p_request_id);
  answer text := private.service_request_status(r);
begin
  if answer = 'declined' then
    raise exception 'this request was declined' using errcode = '55000';
  end if;
  if answer = 'pending' then
    if exists (select 1 from public.clients where id = r.client_id and clients.status = 'disabled') then
      raise exception 'reactivate the client before adding services' using errcode = '55000';
    end if;
    insert into public.service_enrollments (client_id, service, starts_on)
    select r.client_id, r.service, (now() at time zone c.timezone)::date from public.clients c where c.id = r.client_id;
  end if;
  -- Already enrolled (added by hand) still records who answered, once.
  update public.service_requests set outcome = 'accepted', resolved_at = clock_timestamp(), resolved_by = (select auth.uid())
  where id = r.id and outcome is null;
  return private.service_request_document((select q from public.service_requests q where q.id = p_request_id));
end;
$$;

create or replace function public.decline_service_request(p_request_id uuid, p_response text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.service_requests := private.staff_service_request(p_request_id);
  answer text := private.service_request_status(r);
begin
  if answer = 'declined' then return private.service_request_document(r); end if;
  if answer <> 'pending' then
    raise exception 'the client already has this service' using errcode = '55000';
  end if;
  if char_length(coalesce(p_response, '')) > 1000 then
    raise exception 'keep the reply under 1000 characters' using errcode = '22023';
  end if;
  update public.service_requests set outcome = 'declined', response = btrim(coalesce(p_response, '')),
    resolved_at = clock_timestamp(), resolved_by = (select auth.uid())
  where id = r.id returning * into r;
  return private.service_request_document(r);
end;
$$;

-- Pending requests across the caller's clients, or one client's, oldest first.
-- Security invoker: RLS limits the rows to clients the caller can access.
create or replace function public.list_pending_service_requests(p_client_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(private.service_request_document(r) || jsonb_build_object('clientId', r.client_id, 'clientName', c.full_name)
      order by r.created_at, r.id), '[]'::jsonb)
    from public.service_requests r
    join public.clients c on c.id = r.client_id
    where (p_client_id is null or r.client_id = p_client_id)
      and private.service_request_status(r) = 'pending');
end;
$$;

-- Same as migration 00040, with the reply in the item.
create or replace function private.service_request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'service_request', 'id', r.id, 'service', r.service, 'message', r.message,
      'status', d.status, 'response', r.response, 'activityAt', r.created_at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, r.created_at,
    d.status = 'pending'
      and r.created_at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.service_requests r
  join public.clients c on c.id = r.client_id
  cross join lateral (select private.service_request_status(r) as status) d
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_service_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;

revoke all on function private.staff_service_request(uuid) from public, anon, authenticated;
grant execute on function private.staff_service_request(uuid) to authenticated;
revoke all on function public.accept_service_request(uuid), public.decline_service_request(uuid, text),
  public.list_pending_service_requests(uuid) from public, anon, authenticated;
grant execute on function public.accept_service_request(uuid), public.decline_service_request(uuid, text),
  public.list_pending_service_requests(uuid) to authenticated;
