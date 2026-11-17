-- Meetings (decision 0039, extending 0037): PT sessions become meetings tagged with one or more of
-- the client's services, so Matt can also schedule mesocycle and nutrition check-ins. Nothing is in
-- production, so the pt_* names are replaced now rather than carried forever.
--
-- - Tables: pt_schedules → meeting_schedules, pt_schedule_slots → meeting_schedule_slots,
--   pt_appointments → meetings, pt_appointment_requests → meeting_requests. Every function that
--   named them is replaced; recurrence (private.schedule_occurrences) is unchanged.
-- - services: at least one, distinct, each a live (not ended) service of the client. Patterns no
--   longer belong to one enrollment: they generate while any tagged service is active.
-- - billable: only meetings tagged Personal Training are charged, so only they can be late
--   cancellations.
-- - Programs: each tagged service can name a program. Without one, the meeting follows that
--   service's current program; the hourly job records it once the meeting starts so history stays
--   accurate.
-- - Current program: service_enrollments points at its current program. With no choice made, a
--   service with exactly one non-archived program uses that one.
-- - Notes: staff only, in their own table like private_coach_notes.

-- ---------------------------------------------------------------------------
-- Drop the pt_* functions (recreated below under meeting names)
-- ---------------------------------------------------------------------------
select cron.unschedule('pt-appointments-top-up');

drop function public.preview_pt_schedule(uuid, integer, date, date, date, jsonb, integer);
drop function public.create_pt_schedule(uuid, integer, date, date, date, jsonb);
drop function public.change_pt_schedule(uuid, date, integer, date, date, jsonb);
drop function public.end_pt_schedule(uuid, date);
drop function public.get_pt_schedules(uuid);
drop function public.get_pt_scheduling(uuid);
drop function public.get_pt_appointment(uuid);
drop function public.stop_pt_scheduling(uuid);
drop function public.add_pt_appointment(uuid, timestamptz, integer);
drop function public.update_pt_appointment(uuid, timestamptz, integer);
drop function public.cancel_pt_appointment(uuid, text);
drop function public.reinstate_pt_appointment(uuid);
drop function public.list_pt_appointments(timestamptz, timestamptz, uuid);
drop function public.request_pt_appointment_change(uuid, uuid, text, text, timestamptz);
drop function public.withdraw_pt_appointment_request(uuid);
drop function public.respond_to_pt_appointment_request(uuid, boolean, timestamptz, integer, text);
drop function private.generate_pt_appointments(uuid, date);
drop function private.top_up_pt_appointments();
drop function private.pt_booking_context(uuid);
drop function private.staff_pt_appointment(uuid);
drop function private.appointment_meeting_url(uuid);
drop function private.appointment_document(public.pt_appointments);
drop function private.appointment_request_document(public.pt_appointment_requests, public.pt_appointments);
drop function private.insert_pt_schedule(uuid, uuid, text, integer, date, date, date, jsonb, uuid);
drop function private.end_pt_schedule_from(uuid, date);
drop function private.coach_overlaps(uuid, timestamptz, integer, uuid);
drop function private.require_no_pending_request(uuid);

-- ---------------------------------------------------------------------------
-- Renames and new columns
-- ---------------------------------------------------------------------------
alter type public.appointment_status rename to meeting_status;
alter type public.appointment_request_kind rename to meeting_request_kind;
alter type public.appointment_request_status rename to meeting_request_status;
alter table public.pt_schedules rename to meeting_schedules;
alter table public.pt_schedule_slots rename to meeting_schedule_slots;
alter table public.pt_appointments rename to meetings;
alter table public.pt_appointment_requests rename to meeting_requests;
alter table public.meeting_requests rename column appointment_id to meeting_id;
alter trigger pt_schedules_touch on public.meeting_schedules rename to meeting_schedules_touch;
alter trigger pt_schedules_guard on public.meeting_schedules rename to meeting_schedules_guard;
alter trigger pt_appointments_touch on public.meetings rename to meetings_touch;
alter trigger pt_appointments_guard on public.meetings rename to meetings_guard;
alter policy pt_schedules_select on public.meeting_schedules rename to meeting_schedules_select;
alter policy pt_schedule_slots_select on public.meeting_schedule_slots rename to meeting_schedule_slots_select;
alter policy pt_appointments_select on public.meetings rename to meetings_select;
alter policy pt_appointment_requests_select on public.meeting_requests rename to meeting_requests_select;

create or replace function private.distinct_services(services public.service_kind[])
returns boolean language sql immutable set search_path = ''
as $$ select count(distinct s) = cardinality(services) from unnest(services) s $$;

alter table public.meeting_schedules drop column enrollment_id;
alter table public.service_enrollments drop constraint service_enrollments_id_client;
alter table public.meeting_schedules add column services public.service_kind[] not null default '{personal_training}'
  check (cardinality(services) between 1 and 3 and private.distinct_services(services));
alter table public.meeting_schedules alter column services drop default;
alter table public.meetings add column services public.service_kind[] not null default '{personal_training}'
  check (cardinality(services) between 1 and 3 and private.distinct_services(services));
alter table public.meetings alter column services drop default;
alter table public.meetings add column billable boolean generated always as ('personal_training' = any (services)) stored;
-- Only billable meetings can be late cancellations.
alter table public.meetings add constraint meetings_late_billable check (status <> 'late_cancelled' or billable);
create index meetings_services on public.meetings using gin (services);

-- A meeting's or pattern's chosen program for one of its services. No row = the current program.
create table public.meeting_programs (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  service public.service_kind not null,
  program_id uuid references public.programs (id) on delete cascade,
  nutrition_program_id uuid references public.nutrition_programs (id) on delete cascade,
  primary key (meeting_id, service),
  constraint meeting_programs_one check ((service = 'nutrition') = (nutrition_program_id is not null) and (program_id is null) = (nutrition_program_id is not null))
);
create table public.meeting_schedule_programs (
  schedule_id uuid not null references public.meeting_schedules (id) on delete cascade,
  service public.service_kind not null,
  program_id uuid references public.programs (id) on delete cascade,
  nutrition_program_id uuid references public.nutrition_programs (id) on delete cascade,
  primary key (schedule_id, service),
  constraint meeting_schedule_programs_one check ((service = 'nutrition') = (nutrition_program_id is not null) and (program_id is null) = (nutrition_program_id is not null))
);

create table public.meeting_notes (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- No foreign keys: the pointer only counts while it matches a live program of the enrollment
-- (private.current_program_id), so a deleted program leaves a harmless stale id, and existing
-- `truncate programs cascade` fixtures don't reach enrollments.
alter table public.service_enrollments
  add column current_program_id uuid,
  add column current_nutrition_program_id uuid,
  add constraint service_enrollments_current_kind check (
    (current_program_id is null or service <> 'nutrition') and (current_nutrition_program_id is null or service = 'nutrition'));

-- Same rule as migration 00030 without the dropped enrollment: a pattern only ever ends earlier.
create or replace function private.guard_pt_schedule()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.client_id, new.services, new.cycle_weeks, new.anchor_on, new.starts_on, new.timezone, new.replaces_id)
      is distinct from (old.client_id, old.services, old.cycle_weeks, old.anchor_on, old.starts_on, old.timezone, old.replaces_id)
    or (old.ends_on is not null and (new.ends_on is null or new.ends_on > old.ends_on)) then
    raise exception 'a schedule can only be ended; change it by starting a new one' using errcode = '55000';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Current programs
-- ---------------------------------------------------------------------------
-- The chosen program when it is still live, else the only non-archived program, else null.
create or replace function private.current_program_id(p_enrollment_id uuid)
returns uuid language sql stable security definer set search_path = ''
as $$
  with e as (select * from public.service_enrollments where id = p_enrollment_id),
  candidates as (
    select p.id from public.programs p join e on p.enrollment_id = e.id where e.service <> 'nutrition' and p.archived_at is null
    union all
    select n.id from public.nutrition_programs n join e on n.enrollment_id = e.id where e.service = 'nutrition' and n.archived_at is null)
  select coalesce(
    (select c.id from candidates c, e where c.id = coalesce(e.current_program_id, e.current_nutrition_program_id)),
    (select (array_agg(c.id))[1] from candidates c having count(*) = 1));
$$;

-- p_program_id null clears the choice (the only program, if there is one, is then current).
create or replace function public.set_current_program(p_enrollment_id uuid, p_program_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  e public.service_enrollments;
begin
  select * into e from public.service_enrollments where id = p_enrollment_id for update;
  if not found or not private.staff_can_access_client(e.client_id) then
    raise exception 'service not found' using errcode = '42501';
  end if;
  if p_program_id is not null and not exists (
      select 1 from public.programs where id = p_program_id and enrollment_id = e.id and archived_at is null and e.service <> 'nutrition'
      union all
      select 1 from public.nutrition_programs where id = p_program_id and enrollment_id = e.id and archived_at is null and e.service = 'nutrition') then
    raise exception 'choose a program of this service that isn''t archived' using errcode = '22023';
  end if;
  update public.service_enrollments set
    current_program_id = case when e.service <> 'nutrition' then p_program_id end,
    current_nutrition_program_id = case when e.service = 'nutrition' then p_program_id end
  where id = e.id;
  return private.current_program_id(e.id);
end;
$$;

-- "Untitled" handling stays in the UI. Security invoker: clients only see published titles.
create or replace function private.program_title(p_program_id uuid, p_nutrition boolean)
returns text language sql stable set search_path = ''
as $$
  select case when p_nutrition then
    (select r.program_style from public.nutrition_program_revisions r join public.nutrition_programs p on p.id = r.program_id
     where r.program_id = p_program_id order by (r.id = p.current_revision_id) desc, r.revision_number desc limit 1)
  else
    (select r.title from public.program_revisions r join public.programs p on p.id = r.program_id
     where r.program_id = p_program_id order by (r.id = p.current_revision_id) desc, r.revision_number desc limit 1)
  end;
$$;

-- The client's live enrollment for a service (one at most, by the existing unique index).
create or replace function private.live_enrollment(p_client_id uuid, p_service public.service_kind)
returns uuid language sql stable security definer set search_path = ''
as $$
  select id from public.service_enrollments
  where client_id = p_client_id and service = p_service and status <> 'ended' and archived_at is null;
$$;

-- ---------------------------------------------------------------------------
-- Shared checks
-- ---------------------------------------------------------------------------
-- The primary coach and their time zone, or 55000 without a primary coach.
create or replace function private.meeting_coach(p_client_id uuid, out coach_id uuid, out timezone text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  select c.primary_coach_id, p.timezone into coach_id, timezone
  from public.clients c left join public.profiles p on p.auth_user_id = c.primary_coach_id
  where c.id = p_client_id;
  if coach_id is null then
    raise exception 'assign a primary coach before scheduling' using errcode = '55000';
  end if;
  timezone := coalesce(timezone, 'UTC');
end;
$$;

-- Validates the tags for a new or changed meeting: distinct services the client has live, at least
-- one of them active.
create or replace function private.meeting_services(p_client_id uuid, p_services text[])
returns public.service_kind[] language plpgsql stable security definer set search_path = ''
as $$
declare
  services public.service_kind[];
begin
  if p_services is null or cardinality(p_services) = 0 then
    raise exception 'choose at least one service' using errcode = '22023';
  end if;
  if exists (select 1 from unnest(p_services) s where s is null or s not in ('personal_training', 'mesocycle', 'nutrition')) then
    raise exception 'unknown service' using errcode = '22023';
  end if;
  select array_agg(distinct s::public.service_kind order by s::public.service_kind) into services from unnest(p_services) s;
  if exists (select 1 from unnest(services) s where private.live_enrollment(p_client_id, s) is null) then
    raise exception 'a meeting can only be about the client''s current services' using errcode = '55000';
  end if;
  if not exists (select 1 from unnest(services) s join public.service_enrollments e on e.id = private.live_enrollment(p_client_id, s)
      where e.status = 'active') then
    raise exception 'at least one of the meeting''s services must be active' using errcode = '55000';
  end if;
  return services;
end;
$$;

-- {"mesocycle": "<program id>", ...}: each key one of the services, each program a non-archived
-- program of the client's live enrollment for it. Raises 22023 otherwise.
create or replace function private.check_meeting_programs(p_client_id uuid, p_services public.service_kind[], p_programs jsonb)
returns void language plpgsql stable security definer set search_path = ''
as $$
declare
  key text;
  value jsonb;
begin
  if p_programs is null or p_programs = '{}'::jsonb then
    return;
  end if;
  if jsonb_typeof(p_programs) <> 'object' then
    raise exception 'programs must be an object of service to program' using errcode = '22023';
  end if;
  for key, value in select * from jsonb_each(p_programs) loop
    if key not in ('personal_training', 'mesocycle', 'nutrition') or not (key::public.service_kind = any (p_services)) then
      raise exception 'a program was chosen for a service the meeting isn''t about' using errcode = '22023';
    end if;
    if jsonb_typeof(value) <> 'string' or (value #>> '{}') !~ '^[0-9a-f-]{36}$' or not exists (
        select 1 from public.programs p where p.id = (value #>> '{}')::uuid and key <> 'nutrition' and p.archived_at is null
          and p.enrollment_id = private.live_enrollment(p_client_id, key::public.service_kind)
        union all
        select 1 from public.nutrition_programs n where n.id = (value #>> '{}')::uuid and key = 'nutrition' and n.archived_at is null
          and n.enrollment_id = private.live_enrollment(p_client_id, key::public.service_kind)) then
      raise exception 'choose a current program of the client''s % service', replace(key, '_', ' ') using errcode = '22023';
    end if;
  end loop;
end;
$$;

-- Replaces a meeting's or pattern's chosen programs (one of the two ids).
create or replace function private.write_meeting_programs(p_meeting_id uuid, p_schedule_id uuid, p_programs jsonb)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if p_meeting_id is not null then
    delete from public.meeting_programs where meeting_id = p_meeting_id;
    insert into public.meeting_programs (meeting_id, service, program_id, nutrition_program_id)
    select p_meeting_id, key::public.service_kind, case when key <> 'nutrition' then (value #>> '{}')::uuid end,
      case when key = 'nutrition' then (value #>> '{}')::uuid end
    from jsonb_each(coalesce(p_programs, '{}'::jsonb));
  else
    delete from public.meeting_schedule_programs where schedule_id = p_schedule_id;
    insert into public.meeting_schedule_programs (schedule_id, service, program_id, nutrition_program_id)
    select p_schedule_id, key::public.service_kind, case when key <> 'nutrition' then (value #>> '{}')::uuid end,
      case when key = 'nutrition' then (value #>> '{}')::uuid end
    from jsonb_each(coalesce(p_programs, '{}'::jsonb));
  end if;
end;
$$;

create or replace function private.staff_meeting(p_meeting_id uuid)
returns public.meetings language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings;
begin
  select * into a from public.meetings where id = p_meeting_id for update;
  if not found or not private.staff_can_access_client(a.client_id) then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  return a;
end;
$$;

create or replace function private.require_no_pending_request(p_meeting_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.meeting_requests where meeting_id = p_meeting_id and status = 'pending') then
    raise exception 'respond to the client''s request for this meeting first' using errcode = 'PT409';
  end if;
end;
$$;

create or replace function private.follow_primary_coach()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.meetings set coach_id = new.primary_coach_id
  where client_id = new.id and status = 'scheduled' and starts_at > now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Generation
-- ---------------------------------------------------------------------------
create or replace function private.schedule_slots_json(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cycleWeek', cycle_week, 'weekday', weekday,
      'startTime', to_char(start_time, 'HH24:MI'), 'durationMinutes', duration_minutes)
    order by cycle_week, weekday, start_time), '[]'::jsonb)
  from public.meeting_schedule_slots where schedule_id = p_schedule_id;
$$;

-- Creates the pattern's future meetings through p_through, copying its tags and chosen programs.
-- Idempotent; only while one of its services is active and the client has a primary coach.
create or replace function private.generate_meetings(p_schedule_id uuid, p_through date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
  coach uuid;
  added integer;
begin
  select * into sch from public.meeting_schedules where id = p_schedule_id;
  select primary_coach_id into coach from public.clients where id = sch.client_id;
  if sch.id is null or coach is null or not exists (
      select 1 from public.service_enrollments e
      where e.client_id = sch.client_id and e.service = any (sch.services) and e.status = 'active' and e.archived_at is null) then
    return 0;
  end if;
  with added_rows as (
    insert into public.meetings (client_id, coach_id, schedule_id, slot_id, occurrence_on, starts_at, duration_minutes, timezone, services)
    select sch.client_id, coach, sch.id, (o.slot->>'id')::uuid, o.occurrence_on, o.starts_at, (o.slot->>'durationMinutes')::integer, sch.timezone, sch.services
    from private.schedule_occurrences(sch.cycle_weeks, sch.anchor_on, sch.starts_on, sch.ends_on,
      sch.timezone, private.schedule_slots_json(sch.id), (now() at time zone sch.timezone)::date, p_through) o
    where o.starts_at > now()
    on conflict (slot_id, occurrence_on) do nothing
    returning id
  ), pins as (
    insert into public.meeting_programs (meeting_id, service, program_id, nutrition_program_id)
    select r.id, p.service, p.program_id, p.nutrition_program_id
    from added_rows r cross join public.meeting_schedule_programs p where p.schedule_id = sch.id
    returning 1
  )
  select count(*) into added from added_rows;
  return added;
end;
$$;

-- pg_cron, hourly: generate 84 days ahead, expire reschedule requests whose meeting has started,
-- and record the program each started meeting was following.
create or replace function private.top_up_meetings()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.generate_meetings(id, (now() at time zone timezone)::date + private.pt_horizon_days())
  from public.meeting_schedules
  where ends_on is null or ends_on >= (now() at time zone timezone)::date;

  update public.meeting_requests r set status = 'expired', resolved_at = clock_timestamp()
  from public.meetings a
  where a.id = r.meeting_id and r.status = 'pending' and r.kind = 'reschedule' and a.starts_at <= now();

  insert into public.meeting_programs (meeting_id, service, program_id, nutrition_program_id)
  select a.id, s, case when s <> 'nutrition' then cur.id end, case when s = 'nutrition' then cur.id end
  from public.meetings a
  cross join lateral unnest(a.services) s
  cross join lateral (select private.current_program_id(private.live_enrollment(a.client_id, s)) as id) cur
  where a.starts_at <= now() and cur.id is not null
  on conflict (meeting_id, service) do nothing;
end;
$$;

-- ---------------------------------------------------------------------------
-- Documents (security invoker unless noted: RLS decides what the caller sees)
-- ---------------------------------------------------------------------------
create or replace function private.meeting_url_for(p_meeting_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select p.meeting_url
  from public.meetings a join public.profiles p on p.auth_user_id = a.coach_id
  where a.id = p_meeting_id and (a.client_id = private.current_client_id() or private.staff_can_access_client(a.client_id));
$$;

create or replace function private.meeting_request_document(r public.meeting_requests, a public.meetings)
returns jsonb language sql stable set search_path = ''
as $$
  select case when r.id is null then null else jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'message', r.message, 'preferredStartsAt', r.preferred_starts_at, 'late', r.late,
    'status', case when r.status = 'pending' and r.kind = 'reschedule' and a.starts_at <= now() then 'expired' else r.status::text end,
    'response', r.response, 'createdAt', r.created_at, 'resolvedAt', r.resolved_at) end;
$$;

-- One entry per service: the chosen program, else the service's current program.
create or replace function private.meeting_programs_json(a public.meetings)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('service', s, 'programId', x.id, 'pinned', mp.service is not null,
      'title', case when x.id is null then null else private.program_title(x.id, s = 'nutrition') end)
    order by s), '[]'::jsonb)
  from unnest(a.services) s
  left join public.meeting_programs mp on mp.meeting_id = a.id and mp.service = s
  cross join lateral (select coalesce(mp.program_id, mp.nutrition_program_id,
    private.current_program_id(private.live_enrollment(a.client_id, s))) as id) x;
$$;

create or replace function private.meeting_document(a public.meetings)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'clientId', a.client_id, 'clientName', c.full_name, 'coachId', a.coach_id,
    'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'timezone', a.timezone,
    'status', a.status, 'modified', a.modified, 'services', to_jsonb(a.services), 'billable', a.billable,
    'programs', private.meeting_programs_json(a),
    'scheduleId', a.schedule_id, 'occurrenceOn', a.occurrence_on, 'cycleWeeks', s.cycle_weeks,
    'cancelledAt', a.cancelled_at, 'cancellationReason', a.cancellation_reason,
    'cancelledByClient', a.cancelled_by is not null and a.cancelled_by = c.auth_user_id,
    'meetingUrl', private.meeting_url_for(a.id),
    -- RLS: staff only; clients get null.
    'notes', (select n.body from public.meeting_notes n where n.meeting_id = a.id),
    'request', (select private.meeting_request_document(r, a) from public.meeting_requests r
      where r.meeting_id = a.id order by r.created_at desc, r.id limit 1))
  from public.clients c
  left join public.meeting_schedules s on s.id = a.schedule_id
  where c.id = a.client_id;
$$;

create or replace function private.schedule_document(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'clientId', s.client_id, 'cycleWeeks', s.cycle_weeks, 'anchorOn', s.anchor_on,
    'startsOn', s.starts_on, 'endsOn', s.ends_on, 'timezone', s.timezone, 'replacesId', s.replaces_id,
    'services', to_jsonb(s.services),
    'programs', (select coalesce(jsonb_object_agg(p.service, coalesce(p.program_id, p.nutrition_program_id)), '{}'::jsonb)
      from public.meeting_schedule_programs p where p.schedule_id = s.id),
    -- Generating only while one of its services is active.
    'active', exists (select 1 from public.service_enrollments e where e.client_id = s.client_id and e.service = any (s.services)
      and e.status = 'active' and e.archived_at is null),
    'slots', private.schedule_slots_json(s.id))
  from public.meeting_schedules s where s.id = p_schedule_id;
$$;

create or replace function private.coach_overlaps(p_coach_id uuid, p_starts_at timestamptz, p_duration_minutes integer, p_except uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'clientId', a.client_id, 'clientName', c.full_name,
      'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes) order by a.starts_at), '[]'::jsonb)
  from public.meetings a
  join public.clients c on c.id = a.client_id
  where a.coach_id = p_coach_id and a.status = 'scheduled' and a.id is distinct from p_except
    and a.starts_at < p_starts_at + make_interval(mins => p_duration_minutes)
    and p_starts_at < a.starts_at + make_interval(mins => a.duration_minutes)
    and private.staff_can_access_client(a.client_id);
$$;

-- ---------------------------------------------------------------------------
-- Patterns
-- ---------------------------------------------------------------------------
create or replace function private.insert_meeting_schedule(p_client_id uuid, p_services public.service_kind[], p_timezone text,
  p_cycle_weeks integer, p_anchor_on date, p_starts_on date, p_ends_on date, p_slots jsonb, p_programs jsonb, p_replaces_id uuid)
returns public.meeting_schedules language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
begin
  perform private.validate_pt_slots(p_slots, p_cycle_weeks);
  perform private.check_meeting_programs(p_client_id, p_services, p_programs);
  if p_starts_on is null or p_starts_on < (now() at time zone p_timezone)::date then
    raise exception 'a pattern starts today or later' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  if p_anchor_on is not null and extract(isodow from p_anchor_on) <> 1 then
    raise exception 'week 1 starts on a Monday' using errcode = '22023';
  end if;
  insert into public.meeting_schedules (client_id, services, cycle_weeks, anchor_on, starts_on, ends_on, timezone, replaces_id, created_by, updated_by)
  values (p_client_id, p_services, p_cycle_weeks,
    coalesce(p_anchor_on, p_starts_on - (extract(isodow from p_starts_on)::integer - 1)),
    p_starts_on, p_ends_on, p_timezone, p_replaces_id, (select auth.uid()), (select auth.uid()))
  returning * into sch;
  insert into public.meeting_schedule_slots (schedule_id, cycle_week, weekday, start_time, duration_minutes)
  select sch.id, (s->>'cycleWeek')::smallint, (s->>'weekday')::smallint, (s->>'startTime')::time, (s->>'durationMinutes')::integer
  from jsonb_array_elements(p_slots) s;
  perform private.write_meeting_programs(null, sch.id, p_programs);
  perform private.generate_meetings(sch.id, (now() at time zone p_timezone)::date + private.pt_horizon_days());
  return sch;
end;
$$;

-- Ends a pattern before p_from. Untouched future meetings from that date go; moved, cancelled,
-- requested and past ones stay. Returns how many changed meetings from p_from on were kept.
create or replace function private.end_meeting_schedule_from(p_schedule_id uuid, p_from date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
  kept integer;
begin
  select * into sch from public.meeting_schedules where id = p_schedule_id for update;
  if not found or not private.staff_can_access_client(sch.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  if p_from is null or p_from < sch.starts_on or p_from < (now() at time zone sch.timezone)::date then
    raise exception 'choose a date from today and within the pattern' using errcode = '22023';
  end if;
  if sch.ends_on is not null and sch.ends_on < p_from then
    raise exception 'this pattern has already ended' using errcode = '55000';
  end if;
  if exists (select 1 from public.meetings a
      join public.meeting_requests r on r.meeting_id = a.id and r.status = 'pending'
      where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and a.starts_at > now()) then
    raise exception 'respond to the client''s requests for the affected meetings first' using errcode = 'PT409';
  end if;
  delete from public.meetings a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and not a.modified and a.starts_at > now()
    and not exists (select 1 from public.meeting_requests r where r.meeting_id = a.id)
    and not exists (select 1 from public.meeting_notes n where n.meeting_id = a.id);
  select count(*) into kept from public.meetings a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from
    and (a.modified or exists (select 1 from public.meeting_requests r where r.meeting_id = a.id)
      or exists (select 1 from public.meeting_notes n where n.meeting_id = a.id));
  update public.meeting_schedules set ends_on = p_from - 1, updated_by = (select auth.uid()) where id = sch.id;
  return kept;
end;
$$;

create or replace function public.preview_meeting_schedule(p_client_id uuid, p_cycle_weeks integer, p_anchor_on date, p_starts_on date,
  p_ends_on date, p_slots jsonb, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  coach record;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 50 then
    raise exception 'limit must be between 1 and 50' using errcode = '22023';
  end if;
  perform private.validate_pt_slots(p_slots, p_cycle_weeks);
  if p_starts_on is null or (p_ends_on is not null and p_ends_on < p_starts_on) then
    raise exception 'check the start and end dates' using errcode = '22023';
  end if;
  if p_anchor_on is not null and extract(isodow from p_anchor_on) <> 1 then
    raise exception 'week 1 starts on a Monday' using errcode = '22023';
  end if;
  coach := private.meeting_coach(p_client_id);
  return (
    select coalesce(jsonb_agg(jsonb_build_object('occurrenceOn', o.occurrence_on, 'startsAt', o.starts_at,
        'cycleWeek', o.cycle_week, 'weekday', (o.slot->>'weekday')::integer,
        'durationMinutes', (o.slot->>'durationMinutes')::integer, 'timezone', coach.timezone) order by o.starts_at), '[]'::jsonb)
    from (
      select * from private.schedule_occurrences(p_cycle_weeks,
        coalesce(p_anchor_on, p_starts_on - (extract(isodow from p_starts_on)::integer - 1)),
        p_starts_on, p_ends_on, coach.timezone, p_slots, p_starts_on, p_starts_on + 366)
      limit p_limit
    ) o
  );
end;
$$;

create or replace function public.create_meeting_schedule(p_client_id uuid, p_services text[], p_cycle_weeks integer, p_anchor_on date,
  p_starts_on date, p_ends_on date, p_slots jsonb, p_programs jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  coach record;
  sch public.meeting_schedules;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  coach := private.meeting_coach(p_client_id);
  sch := private.insert_meeting_schedule(p_client_id, private.meeting_services(p_client_id, p_services), coach.timezone,
    p_cycle_weeks, p_anchor_on, p_starts_on, p_ends_on, p_slots, p_programs, null);
  return private.schedule_document(sch.id);
end;
$$;

create or replace function public.change_meeting_schedule(p_schedule_id uuid, p_from date, p_services text[], p_cycle_weeks integer,
  p_anchor_on date, p_ends_on date, p_slots jsonb, p_programs jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  old public.meeting_schedules;
  coach record;
  services public.service_kind[];
  kept integer;
  sch public.meeting_schedules;
begin
  select * into old from public.meeting_schedules where id = p_schedule_id;
  if not found or not private.staff_can_access_client(old.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  coach := private.meeting_coach(old.client_id);
  services := private.meeting_services(old.client_id, p_services);
  kept := private.end_meeting_schedule_from(old.id, p_from);
  sch := private.insert_meeting_schedule(old.client_id, services, coach.timezone, p_cycle_weeks, p_anchor_on, p_from,
    p_ends_on, p_slots, p_programs, old.id);
  return private.schedule_document(sch.id) || jsonb_build_object('keptMeetings', kept);
end;
$$;

create or replace function public.end_meeting_schedule(p_schedule_id uuid, p_from date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  kept integer := private.end_meeting_schedule_from(p_schedule_id, p_from);
begin
  return private.schedule_document(p_schedule_id) || jsonb_build_object('keptMeetings', kept);
end;
$$;

create or replace function public.get_meeting_schedules(p_client_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(private.schedule_document(s.id) order by s.starts_on, s.created_at), '[]'::jsonb)
  from public.meeting_schedules s
  where s.client_id = p_client_id and s.ends_on is distinct from s.starts_on - 1
    and (s.ends_on is null or s.ends_on >= (now() at time zone s.timezone)::date);
$$;

-- The coach's scheduling context for a client: live services, primary coach settings, patterns.
create or replace function public.get_client_meetings(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  c public.clients;
  p public.profiles;
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  select * into c from public.clients where id = p_client_id;
  select * into p from public.profiles where auth_user_id = c.primary_coach_id;
  return jsonb_build_object(
    'services', (select coalesce(jsonb_agg(jsonb_build_object('service', e.service, 'status', e.status, 'enrollmentId', e.id,
        'currentProgramId', private.current_program_id(e.id)) order by e.service), '[]'::jsonb)
      from public.service_enrollments e where e.client_id = p_client_id and e.status <> 'ended' and e.archived_at is null),
    'coachId', c.primary_coach_id,
    'coachName', nullif(btrim(p.display_name), ''),
    'timezone', coalesce(p.timezone, 'UTC'),
    'meetingUrl', p.meeting_url,
    'lateCancelHours', coalesce(p.late_cancel_hours, 24),
    'futureMeetings', (select count(*) from public.meetings where client_id = p_client_id and status = 'scheduled' and starts_at > now()),
    'schedules', public.get_meeting_schedules(p_client_id));
end;
$$;

-- ---------------------------------------------------------------------------
-- Single meetings
-- ---------------------------------------------------------------------------
create or replace function public.add_meeting(p_client_id uuid, p_services text[], p_starts_at timestamptz, p_duration_minutes integer,
  p_programs jsonb default '{}', p_notes text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  coach record;
  services public.service_kind[];
  a public.meetings;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  coach := private.meeting_coach(p_client_id);
  services := private.meeting_services(p_client_id, p_services);
  perform private.check_pt_time(p_starts_at, p_duration_minutes);
  perform private.check_meeting_programs(p_client_id, services, p_programs);
  insert into public.meetings (client_id, coach_id, starts_at, duration_minutes, timezone, services, created_by, updated_by)
  values (p_client_id, coach.coach_id, p_starts_at, p_duration_minutes, coach.timezone, services, (select auth.uid()), (select auth.uid()))
  returning * into a;
  perform private.write_meeting_programs(a.id, null, p_programs);
  if nullif(btrim(p_notes), '') is not null then
    insert into public.meeting_notes (meeting_id, client_id, body, updated_by) values (a.id, a.client_id, btrim(p_notes), (select auth.uid()));
  end if;
  return private.meeting_document(a) || jsonb_build_object('overlaps', private.coach_overlaps(a.coach_id, a.starts_at, a.duration_minutes, a.id));
exception
  when check_violation then
    raise exception 'invalid meeting: %', sqlerrm using errcode = '22023';
end;
$$;

-- "This meeting only". p_services / p_programs null keep the current tags and programs.
create or replace function public.update_meeting(p_meeting_id uuid, p_starts_at timestamptz, p_duration_minutes integer,
  p_services text[] default null, p_programs jsonb default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  tags public.service_kind[];
begin
  if a.status <> 'scheduled' then
    raise exception 'only scheduled meetings can be changed' using errcode = '55000';
  end if;
  perform private.require_no_pending_request(a.id);
  perform private.check_pt_time(p_starts_at, p_duration_minutes);
  tags := case when p_services is null then a.services else private.meeting_services(a.client_id, p_services) end;
  if p_programs is not null then
    perform private.check_meeting_programs(a.client_id, tags, p_programs);
  end if;
  update public.meetings set starts_at = p_starts_at, duration_minutes = p_duration_minutes, services = tags,
    modified = true, updated_by = (select auth.uid())
  where id = a.id returning * into a;
  if p_programs is not null then
    perform private.write_meeting_programs(a.id, null, p_programs);
  else
    delete from public.meeting_programs where meeting_id = a.id and not (service = any (tags));
  end if;
  return private.meeting_document(a) || jsonb_build_object('overlaps', private.coach_overlaps(a.coach_id, a.starts_at, a.duration_minutes, a.id));
end;
$$;

-- Staff-only notes, on any meeting (before or after it happens). Blank removes them.
create or replace function public.save_meeting_notes(p_meeting_id uuid, p_notes text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
begin
  if nullif(btrim(p_notes), '') is null then
    delete from public.meeting_notes where meeting_id = a.id;
  else
    insert into public.meeting_notes (meeting_id, client_id, body, updated_by, updated_at)
    values (a.id, a.client_id, btrim(p_notes), (select auth.uid()), now())
    on conflict (meeting_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'notes are limited to 5000 characters' using errcode = '22023';
end;
$$;

create or replace function public.cancel_meeting(p_meeting_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
begin
  if a.status <> 'scheduled' then
    raise exception 'only scheduled meetings can be cancelled' using errcode = '55000';
  end if;
  perform private.require_no_pending_request(a.id);
  update public.meetings set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
    cancellation_reason = coalesce(btrim(p_reason), ''), modified = true, updated_by = (select auth.uid())
  where id = a.id returning * into a;
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'invalid cancellation: %', sqlerrm using errcode = '22023';
end;
$$;

create or replace function public.reinstate_meeting(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
begin
  if a.status not in ('cancelled', 'late_cancelled') then
    raise exception 'only cancelled meetings can be reinstated' using errcode = '55000';
  end if;
  if a.starts_at <= now() then
    raise exception 'this meeting has already started' using errcode = '55000';
  end if;
  update public.meetings set status = 'scheduled', cancelled_at = null, cancelled_by = null, cancellation_reason = '',
    updated_by = (select auth.uid())
  where id = a.id returning * into a;
  return private.meeting_document(a);
end;
$$;

create or replace function public.list_meetings(p_from timestamptz, p_to timestamptz, p_client_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'choose a range of up to 100 days' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(private.meeting_document(a) order by a.starts_at, a.id), '[]'::jsonb)
    from public.meetings a
    where (p_client_id is null or a.client_id = p_client_id)
      and a.starts_at < p_to and a.starts_at + make_interval(mins => a.duration_minutes) > p_from
  );
end;
$$;

create or replace function public.get_meeting(p_meeting_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select private.meeting_document(a) from public.meetings a where a.id = p_meeting_id;
$$;

-- Ends every open pattern from today and cancels the remaining future meetings.
create or replace function public.stop_meetings(p_client_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
  cancelled integer;
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if exists (select 1 from public.meeting_requests r join public.meetings a on a.id = r.meeting_id
      where r.client_id = p_client_id and r.status = 'pending' and a.status = 'scheduled' and a.starts_at > now()) then
    raise exception 'respond to the client''s open requests first' using errcode = 'PT409';
  end if;
  for sch in select * from public.meeting_schedules s
    where s.client_id = p_client_id and s.ends_on is distinct from s.starts_on - 1
      and (s.ends_on is null or s.ends_on >= (now() at time zone s.timezone)::date)
  loop
    perform private.end_meeting_schedule_from(sch.id, greatest(sch.starts_on, (now() at time zone sch.timezone)::date));
  end loop;
  update public.meetings set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
    cancellation_reason = 'Services stopped', modified = true, updated_by = (select auth.uid())
  where client_id = p_client_id and status = 'scheduled' and starts_at > now();
  get diagnostics cancelled = row_count;
  return jsonb_build_object('cancelledMeetings', cancelled);
end;
$$;

-- ---------------------------------------------------------------------------
-- Client requests
-- ---------------------------------------------------------------------------
create or replace function public.request_meeting_change(p_request_id uuid, p_meeting_id uuid, p_kind text,
  p_message text, p_preferred_starts_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me_client uuid := private.current_client_id();
  existing public.meeting_requests;
  a public.meetings;
  window_hours integer;
  r public.meeting_requests;
begin
  if me_client is null or p_request_id is null then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  select * into existing from public.meeting_requests where id = p_request_id;
  if found then
    if existing.client_id = me_client and existing.meeting_id = p_meeting_id then
      select * into a from public.meetings where id = existing.meeting_id;
      return private.meeting_request_document(existing, a);
    end if;
    raise exception 'request id already used' using errcode = '22023';
  end if;

  select * into a from public.meetings where id = p_meeting_id for update;
  if not found or a.client_id <> me_client then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  if a.status <> 'scheduled' or a.starts_at <= now() then
    raise exception 'this meeting can no longer be changed' using errcode = '55000';
  end if;
  if p_kind is null or p_kind not in ('cancel', 'reschedule') then
    raise exception 'unknown request %', p_kind using errcode = '22023';
  end if;
  if p_kind = 'cancel' and p_preferred_starts_at is not null then
    raise exception 'a cancellation has no new time' using errcode = '22023';
  end if;
  if p_preferred_starts_at is not null and (p_preferred_starts_at <= now() or p_preferred_starts_at > now() + interval '2 years') then
    raise exception 'choose a future time' using errcode = '22023';
  end if;
  if p_kind = 'cancel' then
    select late_cancel_hours into window_hours from public.profiles where auth_user_id = a.coach_id;
  end if;

  insert into public.meeting_requests (id, meeting_id, client_id, kind, message, preferred_starts_at, late, created_by)
  values (p_request_id, a.id, a.client_id, p_kind::public.meeting_request_kind, coalesce(btrim(p_message), ''),
    p_preferred_starts_at,
    -- Only billable (Personal Training) meetings can be cancelled late.
    case when p_kind = 'cancel' then a.billable and a.starts_at - now() < make_interval(hours => coalesce(window_hours, 24)) end,
    (select auth.uid()))
  returning * into r;
  return private.meeting_request_document(r, a);
exception
  when unique_violation then
    raise exception 'there is already an open request for this meeting' using errcode = 'PT409';
  when check_violation then
    raise exception 'invalid request: %', sqlerrm using errcode = '22023';
end;
$$;

create or replace function public.withdraw_meeting_request(p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.meeting_requests;
  a public.meetings;
begin
  select * into r from public.meeting_requests where id = p_request_id for update;
  if not found or r.client_id is distinct from private.current_client_id() then
    raise exception 'request not found' using errcode = '42501';
  end if;
  if r.status = 'pending' then
    update public.meeting_requests set status = 'withdrawn', resolved_by = (select auth.uid()), resolved_at = clock_timestamp()
    where id = r.id returning * into r;
  elsif r.status <> 'withdrawn' then
    raise exception 'this request has already been answered' using errcode = '55000';
  end if;
  select * into a from public.meetings where id = r.meeting_id;
  return private.meeting_request_document(r, a);
end;
$$;

create or replace function public.respond_to_meeting_request(p_request_id uuid, p_accept boolean,
  p_starts_at timestamptz default null, p_duration_minutes integer default null, p_response text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.meeting_requests;
  a public.meetings;
  new_start timestamptz;
  new_duration integer;
begin
  select * into r from public.meeting_requests where id = p_request_id for update;
  if not found or not private.staff_can_access_client(r.client_id) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  a := private.staff_meeting(r.meeting_id);
  if r.status <> 'pending' then
    raise exception 'this request has already been answered' using errcode = '55000';
  end if;
  if p_accept is null then
    raise exception 'accept or decline the request' using errcode = '22023';
  end if;

  if p_accept and r.kind = 'cancel' then
    update public.meetings set status = case when r.late and a.billable then 'late_cancelled' else 'cancelled' end::public.meeting_status,
      cancelled_at = now(), cancelled_by = r.created_by, cancellation_reason = r.message, modified = true,
      updated_by = (select auth.uid())
    where id = a.id returning * into a;
  elsif p_accept then
    if a.starts_at <= now() then
      raise exception 'the meeting has started; reschedule requests expire at the start time' using errcode = '55000';
    end if;
    new_start := coalesce(p_starts_at, r.preferred_starts_at);
    new_duration := coalesce(p_duration_minutes, a.duration_minutes);
    if new_start is null then
      raise exception 'choose the new time' using errcode = '22023';
    end if;
    perform private.check_pt_time(new_start, new_duration);
    update public.meetings set starts_at = new_start, duration_minutes = new_duration, modified = true,
      updated_by = (select auth.uid())
    where id = a.id returning * into a;
  end if;

  update public.meeting_requests set status = case when p_accept then 'accepted' else 'declined' end::public.meeting_request_status,
    response = coalesce(btrim(p_response), ''), resolved_by = (select auth.uid()), resolved_at = clock_timestamp()
  where id = r.id;
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'invalid response: %', sqlerrm using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Requests in Reviews
-- ---------------------------------------------------------------------------
create or replace function private.request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'request', 'id', r.id, 'services', to_jsonb(a.services),
      'requestKind', r.kind, 'status', private.meeting_request_document(r, a)->>'status',
      'message', r.message, 'preferredStartsAt', r.preferred_starts_at, 'late', r.late, 'response', r.response,
      'meetingId', a.id, 'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes,
      'activityAt', t.at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, t.at,
    t.at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.meeting_requests r
  join public.meetings a on a.id = r.meeting_id
  join public.clients c on c.id = r.client_id
  cross join lateral (select case when r.status = 'withdrawn' then r.resolved_at else r.created_at end as at) t
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;

create or replace function public.mark_request_read(p_request_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select client_id into owner from public.meeting_requests where id = p_request_id;
  if owner is null or not private.staff_can_access_client(owner) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  insert into public.staff_request_seen values ((select auth.uid()), p_request_id, clock_timestamp())
  on conflict (staff_id, request_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on public.meeting_programs, public.meeting_schedule_programs, public.meeting_notes from anon, authenticated;
grant select on public.meeting_programs, public.meeting_schedule_programs, public.meeting_notes to authenticated;
alter table public.meeting_programs enable row level security;
alter table public.meeting_schedule_programs enable row level security;
alter table public.meeting_notes enable row level security;
create policy meeting_programs_select on public.meeting_programs for select to authenticated
  using (exists (select 1 from public.meetings a where a.id = meeting_programs.meeting_id));
create policy meeting_schedule_programs_select on public.meeting_schedule_programs for select to authenticated
  using (exists (select 1 from public.meeting_schedules s where s.id = meeting_schedule_programs.schedule_id));
create policy meeting_notes_select on public.meeting_notes for select to authenticated
  using ((select private.staff_can_access_client(client_id)));

-- Enrollment pointers change only through set_current_program (the table's update grant is column-limited).

revoke all on function private.distinct_services(public.service_kind[]), private.current_program_id(uuid),
  private.program_title(uuid, boolean), private.live_enrollment(uuid, public.service_kind),
  private.meeting_programs_json(public.meetings), private.meeting_document(public.meetings),
  private.meeting_request_document(public.meeting_requests, public.meetings), private.meeting_url_for(uuid),
  private.coach_overlaps(uuid, timestamptz, integer, uuid)
from public, anon;
grant execute on function private.distinct_services(public.service_kind[]), private.current_program_id(uuid),
  private.program_title(uuid, boolean), private.live_enrollment(uuid, public.service_kind),
  private.meeting_programs_json(public.meetings), private.meeting_document(public.meetings),
  private.meeting_request_document(public.meeting_requests, public.meetings), private.meeting_url_for(uuid),
  private.coach_overlaps(uuid, timestamptz, integer, uuid)
to authenticated;
revoke all on function private.meeting_coach(uuid), private.meeting_services(uuid, text[]), private.require_no_pending_request(uuid),
  private.check_meeting_programs(uuid, public.service_kind[], jsonb), private.write_meeting_programs(uuid, uuid, jsonb),
  private.staff_meeting(uuid), private.generate_meetings(uuid, date), private.top_up_meetings(),
  private.insert_meeting_schedule(uuid, public.service_kind[], text, integer, date, date, date, jsonb, jsonb, uuid),
  private.end_meeting_schedule_from(uuid, date)
from public, anon, authenticated;

revoke all on function public.set_current_program(uuid, uuid),
  public.preview_meeting_schedule(uuid, integer, date, date, date, jsonb, integer),
  public.create_meeting_schedule(uuid, text[], integer, date, date, date, jsonb, jsonb),
  public.change_meeting_schedule(uuid, date, text[], integer, date, date, jsonb, jsonb),
  public.end_meeting_schedule(uuid, date), public.get_meeting_schedules(uuid), public.get_client_meetings(uuid),
  public.add_meeting(uuid, text[], timestamptz, integer, jsonb, text),
  public.update_meeting(uuid, timestamptz, integer, text[], jsonb),
  public.save_meeting_notes(uuid, text), public.cancel_meeting(uuid, text), public.reinstate_meeting(uuid),
  public.list_meetings(timestamptz, timestamptz, uuid), public.get_meeting(uuid), public.stop_meetings(uuid),
  public.request_meeting_change(uuid, uuid, text, text, timestamptz), public.withdraw_meeting_request(uuid),
  public.respond_to_meeting_request(uuid, boolean, timestamptz, integer, text)
from public, anon, authenticated;
grant execute on function public.set_current_program(uuid, uuid),
  public.preview_meeting_schedule(uuid, integer, date, date, date, jsonb, integer),
  public.create_meeting_schedule(uuid, text[], integer, date, date, date, jsonb, jsonb),
  public.change_meeting_schedule(uuid, date, text[], integer, date, date, jsonb, jsonb),
  public.end_meeting_schedule(uuid, date), public.get_meeting_schedules(uuid), public.get_client_meetings(uuid),
  public.add_meeting(uuid, text[], timestamptz, integer, jsonb, text),
  public.update_meeting(uuid, timestamptz, integer, text[], jsonb),
  public.save_meeting_notes(uuid, text), public.cancel_meeting(uuid, text), public.reinstate_meeting(uuid),
  public.list_meetings(timestamptz, timestamptz, uuid), public.get_meeting(uuid), public.stop_meetings(uuid),
  public.request_meeting_change(uuid, uuid, text, text, timestamptz), public.withdraw_meeting_request(uuid),
  public.respond_to_meeting_request(uuid, boolean, timestamptz, integer, text)
to authenticated;

select cron.schedule('meetings-top-up', '7 * * * *', 'select private.top_up_meetings()');

-- ---------------------------------------------------------------------------
-- Clients see which program is current (lists are otherwise unchanged)
-- ---------------------------------------------------------------------------
create or replace function public.list_published_programs()
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'programId', p.id,
      'service', p.service,
      'revisionNumber', r.revision_number,
      'publishedAt', r.published_at,
      'title', r.title,
      'programTheme', r.program_theme,
      'weekCount', (select count(*) from public.program_weeks w where w.revision_id = r.id),
      'isCurrent', p.id = private.current_program_id(p.enrollment_id))
    order by r.published_at desc), '[]'::jsonb)
  from public.programs p
  join public.program_revisions r on r.id = p.current_revision_id and r.status = 'published'
  where p.client_id = (select private.current_client_id())
    and p.archived_at is null;
$$;

create or replace function public.list_nutrition_programs(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read_nutrition(p_client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'program_style',r.program_style,'start_date',r.start_date,'week_count',r.week_count,
      'archived_at',p.archived_at,'published_at',r.published_at,'is_current',p.id is not distinct from private.current_program_id(p.enrollment_id)) order by r.start_date desc)
    from public.nutrition_programs p join public.nutrition_program_revisions r on r.id = p.current_revision_id where p.client_id = p_client_id),'[]'::jsonb);
end;
$$;

-- Patterns no longer belong to an enrollment, so only programs block deleting an archived service.
create or replace function public.delete_archived_service(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  e public.service_enrollments;
  programs integer;
  nutrition integer;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can delete services' using errcode = '42501';
  end if;
  select * into e from public.service_enrollments where id = p_enrollment_id for update;
  if not found then
    return;
  end if;
  if e.status <> 'ended' or e.archived_at is null then
    raise exception 'only ended, archived services can be deleted' using errcode = '55000';
  end if;
  select count(*) into programs from public.programs where enrollment_id = e.id;
  select count(*) into nutrition from public.nutrition_programs where enrollment_id = e.id;
  if programs + nutrition > 0 then
    raise exception 'this service still has % linked: delete them first, or keep the service archived',
      concat_ws(', ',
        case when programs > 0 then programs || case when programs = 1 then ' program' else ' programs' end end,
        case when nutrition > 0 then nutrition || case when nutrition = 1 then ' nutrition program' else ' nutrition programs' end end)
      using errcode = 'PT409';
  end if;
  delete from public.service_enrollments where id = e.id;
end;
$$;
