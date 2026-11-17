-- PT scheduling, phase 2 (decision 0037): what the coach screens need.
-- - get_pt_scheduling: the client's scheduling context (service state, primary coach, the coach's
--   time zone and meeting link, open patterns) in one staff read.
-- - get_pt_appointment: one session, for links from Reviews.
-- - stop_pt_scheduling: the confirmed "stop" after a service is paused or ended.
-- - Client requests join Reviews with the same per-staff read state as workouts and nutrition.

create or replace function public.get_pt_scheduling(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.clients;
  e public.service_enrollments;
  p public.profiles;
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  select * into c from public.clients where id = p_client_id;
  select * into e from public.service_enrollments
  where client_id = p_client_id and service = 'personal_training' and status <> 'ended' and archived_at is null;
  select * into p from public.profiles where auth_user_id = c.primary_coach_id;
  return jsonb_build_object(
    -- null = no live PT service.
    'service', e.status,
    'coachId', c.primary_coach_id,
    'coachName', nullif(btrim(p.display_name), ''),
    'timezone', coalesce(p.timezone, 'UTC'),
    'meetingUrl', p.meeting_url,
    'lateCancelHours', coalesce(p.late_cancel_hours, 24),
    'futureSessions', (select count(*) from public.pt_appointments
      where client_id = p_client_id and status = 'scheduled' and starts_at > now()),
    'schedules', (select coalesce(jsonb_agg(private.schedule_document(s.id) order by s.starts_on, s.created_at), '[]'::jsonb)
      from public.pt_schedules s
      where s.client_id = p_client_id and s.ends_on is distinct from s.starts_on - 1
        and (s.ends_on is null or s.ends_on >= (now() at time zone s.timezone)::date)));
end;
$$;

-- Security invoker: null when RLS hides the session.
create or replace function public.get_pt_appointment(p_appointment_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select private.appointment_document(a) from public.pt_appointments a where a.id = p_appointment_id;
$$;

-- Ends every open pattern from today and cancels the client's remaining future sessions (a coach
-- cancellation, never late). Open client requests must be answered first.
create or replace function public.stop_pt_scheduling(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  sch public.pt_schedules;
  cancelled integer;
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.pt_appointment_requests r join public.pt_appointments a on a.id = r.appointment_id
      where r.client_id = p_client_id and r.status = 'pending' and a.status = 'scheduled' and a.starts_at > now()) then
    raise exception 'respond to the client''s open requests first' using errcode = 'PT409';
  end if;
  for sch in select * from public.pt_schedules s
    where s.client_id = p_client_id and s.ends_on is distinct from s.starts_on - 1
      and (s.ends_on is null or s.ends_on >= (now() at time zone s.timezone)::date)
  loop
    perform private.end_pt_schedule_from(sch.id, greatest(sch.starts_on, (now() at time zone sch.timezone)::date));
  end loop;
  update public.pt_appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
    cancellation_reason = 'Personal training stopped', modified = true, updated_by = (select auth.uid())
  where client_id = p_client_id and status = 'scheduled' and starts_at > now();
  get diagnostics cancelled = row_count;
  return jsonb_build_object('cancelledSessions', cancelled);
end;
$$;

-- Same as migration 00030, but a session with any request history counts as changed and is kept,
-- so ending a pattern never deletes a client's request record.
create or replace function private.end_pt_schedule_from(p_schedule_id uuid, p_from date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  sch public.pt_schedules;
  kept integer;
begin
  select * into sch from public.pt_schedules where id = p_schedule_id for update;
  if not found or not private.staff_can_access_client(sch.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  if p_from is null or p_from < sch.starts_on or p_from < (now() at time zone sch.timezone)::date then
    raise exception 'choose a date from today and within the pattern' using errcode = '22023';
  end if;
  if sch.ends_on is not null and sch.ends_on < p_from then
    raise exception 'this pattern has already ended' using errcode = '55000';
  end if;
  if exists (select 1 from public.pt_appointments a
      join public.pt_appointment_requests r on r.appointment_id = a.id and r.status = 'pending'
      where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and a.starts_at > now()) then
    raise exception 'respond to the client''s requests for the affected sessions first' using errcode = 'PT409';
  end if;
  delete from public.pt_appointments a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and not a.modified and a.starts_at > now()
    and not exists (select 1 from public.pt_appointment_requests r where r.appointment_id = a.id);
  select count(*) into kept from public.pt_appointments a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from
    and (a.modified or exists (select 1 from public.pt_appointment_requests r where r.appointment_id = a.id));
  update public.pt_schedules set ends_on = p_from - 1, updated_by = (select auth.uid()) where id = sch.id;
  return kept;
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests in Reviews
-- ---------------------------------------------------------------------------
create table public.staff_request_seen (
  staff_id uuid not null references auth.users (id) on delete cascade,
  request_id uuid not null references public.pt_appointment_requests (id) on delete cascade,
  seen_at timestamptz not null,
  primary key (staff_id, request_id)
);
create index staff_request_seen_request on public.staff_request_seen (request_id);
alter table public.staff_request_seen enable row level security;
revoke all on public.staff_request_seen from anon, authenticated;
grant select on public.staff_request_seen to authenticated;
create policy staff_request_seen_select on public.staff_request_seen for select to authenticated
  using (staff_id = (select auth.uid()));

-- Request times order Reviews against read marks, which use clock time (as nutrition activity does).
alter table public.pt_appointment_requests alter column created_at set default clock_timestamp();

create or replace function public.withdraw_pt_appointment_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.pt_appointment_requests;
  a public.pt_appointments;
begin
  select * into r from public.pt_appointment_requests where id = p_request_id for update;
  if not found or r.client_id is distinct from private.current_client_id() then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if r.status = 'pending' then
    update public.pt_appointment_requests set status = 'withdrawn', resolved_by = (select auth.uid()), resolved_at = clock_timestamp()
    where id = r.id returning * into r;
  elsif r.status <> 'withdrawn' then
    raise exception 'this request has already been answered' using errcode = '55000';
  end if;
  select * into a from public.pt_appointments where id = r.appointment_id;
  return private.appointment_request_document(r, a);
end;
$$;

-- Security invoker: RLS decides which requests the caller sees. A request is timed by the client's
-- latest action on it (sending or withdrawing), so a withdrawal comes back as unread.
create or replace function private.request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'request', 'id', r.id, 'service', 'personal_training',
      'requestKind', r.kind, 'status', private.appointment_request_document(r, a)->>'status',
      'message', r.message, 'preferredStartsAt', r.preferred_starts_at, 'late', r.late, 'response', r.response,
      'appointmentId', a.id, 'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes,
      'activityAt', t.at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, t.at,
    t.at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.pt_appointment_requests r
  join public.pt_appointments a on a.id = r.appointment_id
  join public.clients c on c.id = r.client_id
  cross join lateral (select case when r.status = 'withdrawn' then r.resolved_at else r.created_at end as at) t
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
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
    from private.request_activity() q;
$$;

create or replace function public.get_review_summary()
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return (select jsonb_build_object('unread', count(*), 'completed', count(*) filter (where kind = 'completed'),
    'logged', count(*) filter (where kind = 'logged'), 'skipped', count(*) filter (where kind = 'skipped'), 'started', count(*) filter (where kind = 'started'))
    || case when count(*) filter (where kind = 'nutrition') > 0 then jsonb_build_object('nutrition', count(*) filter (where kind = 'nutrition')) else '{}'::jsonb end
    || case when count(*) filter (where kind = 'request') > 0 then jsonb_build_object('requests', count(*) filter (where kind = 'request')) else '{}'::jsonb end
    from private.all_staff_activity() where unread);
end;
$$;

create or replace function public.mark_request_read(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select client_id into owner from public.pt_appointment_requests where id = p_request_id;
  if owner is null or not private.staff_can_access_client(owner) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  insert into public.staff_request_seen values ((select auth.uid()), p_request_id, clock_timestamp())
  on conflict (staff_id, request_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- Same as migration 00026, and "mark all" now also covers requests.
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
    return;
  end if;
  select client_id into owner from public.training_sessions where id = p_session_id;
  if owner is null or not private.staff_can_access_client(owner) then raise exception 'session not found' using errcode = '42501'; end if;
  insert into public.staff_activity_seen values (me, p_session_id, at) on conflict (staff_id, session_id) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function private.request_activity() from public, anon, authenticated;
grant execute on function private.request_activity() to authenticated;
-- Replaced functions keep their grants; these are new.
revoke all on function public.get_pt_scheduling(uuid), public.get_pt_appointment(uuid), public.stop_pt_scheduling(uuid),
  public.mark_request_read(uuid) from public, anon, authenticated;
grant execute on function public.get_pt_scheduling(uuid), public.get_pt_appointment(uuid), public.stop_pt_scheduling(uuid),
  public.mark_request_read(uuid) to authenticated;
