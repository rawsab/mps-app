-- Personal training scheduling, phase 1 (decision 0037; a recorded scope addition to PRD §3, see
-- decision 0026). Recurring patterns, one-off sessions, per-session overrides, client cancel and
-- reschedule requests, and the coach settings they depend on (time zone, meeting link, late-cancel
-- window).
--
-- Model:
-- - pt_schedules / pt_schedule_slots: a pattern repeating every 1–4 weeks. Slots hold local wall
--   time in the schedule's time zone (the primary coach's when created), so 07:00 stays 07:00
--   across daylight-saving changes. A pattern is never rewritten: "this and following" ends it the
--   day before and starts a replacement, so past sessions still point at the pattern that made them.
-- - pt_appointments: one row per session, generated ahead (84 days) and topped up hourly by
--   pg_cron. A row is what billing will charge, so cancelled sessions are kept, never deleted.
--   (slot_id, occurrence_on) is unique, so generation is idempotent and a moved or cancelled
--   occurrence is never regenerated.
-- - pt_appointment_requests: client cancel/reschedule requests. Whether a cancellation is late is
--   fixed when the client sends it; a reschedule is free if accepted before the session starts and
--   expires otherwise.
--
-- Write path: browsers get SELECT only; every write goes through the security-definer functions
-- below. Nothing here bills anyone.

-- ---------------------------------------------------------------------------
-- Coach settings and time zones
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column meeting_url text check (meeting_url is null or (char_length(meeting_url) <= 500 and meeting_url ~ '^https://[^\s/?#]+\.[^\s]*$')),
  add column late_cancel_hours integer not null default 24 check (late_cancel_hours between 0 and 168);
-- No column grants: staff save these through save_scheduling_settings.

create or replace function private.is_timezone(tz text)
returns boolean language sql stable set search_path = ''
as $$
  select tz is not null and exists (select 1 from pg_catalog.pg_timezone_names where name = tz);
$$;

-- A client's time zone lives on clients.timezone (nutrition and training already read "today" from
-- it); the profile copy is kept in step. Staff have only the profile.
create or replace function public.set_my_timezone(p_timezone text)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  client uuid := private.current_client_id();
begin
  if me is null then
    raise exception 'sign in first' using errcode = '42501';
  end if;
  if not private.is_timezone(p_timezone) then
    raise exception 'unknown time zone %', p_timezone using errcode = '22023';
  end if;
  update public.profiles set timezone = p_timezone where auth_user_id = me;
  if client is not null then
    update public.clients set timezone = p_timezone where id = client;
  end if;
  return p_timezone;
end;
$$;

create or replace function public.save_scheduling_settings(p_meeting_url text, p_late_cancel_hours integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  saved public.profiles;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.profiles set
    meeting_url = nullif(btrim(p_meeting_url), ''),
    late_cancel_hours = p_late_cancel_hours
  where auth_user_id = (select auth.uid())
  returning * into saved;
  return jsonb_build_object('meetingUrl', saved.meeting_url, 'lateCancelHours', saved.late_cancel_hours);
exception
  when check_violation or not_null_violation then
    raise exception 'invalid scheduling settings: %', sqlerrm using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create type public.appointment_status as enum ('scheduled', 'completed', 'cancelled', 'late_cancelled', 'no_show');
create type public.appointment_request_kind as enum ('cancel', 'reschedule');
create type public.appointment_request_status as enum ('pending', 'accepted', 'declined', 'withdrawn', 'expired');

alter table public.service_enrollments add constraint service_enrollments_id_client unique (id, client_id);

create table public.pt_schedules (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  enrollment_id uuid not null,
  cycle_weeks smallint not null default 1 check (cycle_weeks between 1 and 4),
  -- The Monday that counts as Week 1; earlier and later weeks follow the cycle from it.
  anchor_on date not null check (extract(isodow from anchor_on) = 1),
  starts_on date not null,
  ends_on date,
  timezone text not null check (char_length(timezone) between 1 and 64),
  -- The pattern this one continued after a "this and following" change.
  replaces_id uuid references public.pt_schedules (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  foreign key (enrollment_id, client_id) references public.service_enrollments (id, client_id) on delete cascade,
  -- ends_on = starts_on - 1: replaced before its first day.
  constraint pt_schedules_dates check (ends_on is null or ends_on >= starts_on - 1)
);
create index pt_schedules_client on public.pt_schedules (client_id);

create table public.pt_schedule_slots (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.pt_schedules (id) on delete cascade,
  cycle_week smallint not null check (cycle_week between 1 and 4),
  -- ISO weekday: 1 = Monday … 7 = Sunday.
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  unique (schedule_id, cycle_week, weekday, start_time),
  unique (id, schedule_id)
);

create table public.pt_appointments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- The client's primary coach; future scheduled sessions follow a change of primary coach.
  coach_id uuid references auth.users (id) on delete set null,
  -- All three null for a one-off session.
  schedule_id uuid,
  slot_id uuid,
  occurrence_on date,
  starts_at timestamptz not null,
  duration_minutes integer not null check (duration_minutes between 5 and 600),
  timezone text not null check (char_length(timezone) between 1 and 64),
  status public.appointment_status not null default 'scheduled',
  -- A coach changed this occurrence; pattern changes leave it alone.
  modified boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users (id) on delete set null,
  cancellation_reason text not null default '' check (char_length(cancellation_reason) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (slot_id, occurrence_on),
  unique (id, client_id),
  foreign key (schedule_id, client_id) references public.pt_schedules (id, client_id) on delete cascade,
  foreign key (slot_id, schedule_id) references public.pt_schedule_slots (id, schedule_id) on delete cascade,
  constraint pt_appointments_source check (
    (schedule_id is null and slot_id is null and occurrence_on is null)
    or (schedule_id is not null and slot_id is not null and occurrence_on is not null)),
  constraint pt_appointments_cancelled check ((status in ('cancelled', 'late_cancelled')) = (cancelled_at is not null))
);
create index pt_appointments_client_time on public.pt_appointments (client_id, starts_at);
create index pt_appointments_coach_time on public.pt_appointments (coach_id, starts_at);
create index pt_appointments_schedule on public.pt_appointments (schedule_id, occurrence_on);

create table public.pt_appointment_requests (
  -- Chosen by the browser, so a retried send returns the same request.
  id uuid primary key,
  appointment_id uuid not null,
  client_id uuid not null,
  kind public.appointment_request_kind not null,
  message text not null default '' check (char_length(message) <= 1000),
  preferred_starts_at timestamptz,
  -- Cancellations only: sent inside the coach's late-cancel window. Fixed when sent.
  late boolean,
  status public.appointment_request_status not null default 'pending',
  response text not null default '' check (char_length(response) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  foreign key (appointment_id, client_id) references public.pt_appointments (id, client_id) on delete cascade,
  constraint pt_appointment_requests_kind check (case kind
    when 'cancel' then late is not null and preferred_starts_at is null
    when 'reschedule' then late is null and btrim(message) <> '' end),
  constraint pt_appointment_requests_resolved check ((status = 'pending') = (resolved_at is null))
);
create unique index pt_appointment_requests_one_pending on public.pt_appointment_requests (appointment_id) where status = 'pending';
create index pt_appointment_requests_client on public.pt_appointment_requests (client_id, created_at desc);

create trigger pt_schedules_touch before update on public.pt_schedules
  for each row execute function private.touch_updated_at();
create trigger pt_appointments_touch before update on public.pt_appointments
  for each row execute function private.touch_updated_at();

-- A pattern only ever ends earlier; everything else about it is fixed.
create or replace function private.guard_pt_schedule()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.client_id, new.enrollment_id, new.cycle_weeks, new.anchor_on, new.starts_on, new.timezone, new.replaces_id)
      is distinct from (old.client_id, old.enrollment_id, old.cycle_weeks, old.anchor_on, old.starts_on, old.timezone, old.replaces_id)
    or (old.ends_on is not null and (new.ends_on is null or new.ends_on > old.ends_on)) then
    raise exception 'a schedule can only be ended; change it by starting a new one' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger pt_schedules_guard before update on public.pt_schedules
  for each row execute function private.guard_pt_schedule();

-- An occurrence keeps its origin. Attended and no-show sessions are frozen for billing; corrections
-- will get their own audited function.
create or replace function private.guard_pt_appointment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.client_id, new.schedule_id, new.slot_id, new.occurrence_on)
      is distinct from (old.client_id, old.schedule_id, old.slot_id, old.occurrence_on) then
    raise exception 'a session keeps its client and pattern' using errcode = '55000';
  end if;
  if old.status in ('completed', 'no_show') and (new.status, new.starts_at, new.duration_minutes, new.coach_id)
      is distinct from (old.status, old.starts_at, old.duration_minutes, old.coach_id) then
    raise exception 'attended and no-show sessions cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger pt_appointments_guard before update on public.pt_appointments
  for each row execute function private.guard_pt_appointment();

-- Future scheduled sessions follow the client's primary coach.
create or replace function private.follow_primary_coach()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  update public.pt_appointments set coach_id = new.primary_coach_id
  where client_id = new.id and status = 'scheduled' and starts_at > now();
  return new;
end;
$$;
create trigger clients_primary_coach_appointments after update of primary_coach_id on public.clients
  for each row when (old.primary_coach_id is distinct from new.primary_coach_id)
  execute function private.follow_primary_coach();

-- ---------------------------------------------------------------------------
-- Recurrence
-- ---------------------------------------------------------------------------
create or replace function private.pt_horizon_days()
returns integer language sql immutable set search_path = ''
as $$ select 84 $$;

-- Raises 22023 unless p_slots is a non-empty array of distinct
-- {cycleWeek 1..p_cycle_weeks, weekday 1..7, startTime "HH:MM", durationMinutes 5..600}.
create or replace function private.validate_pt_slots(p_slots jsonb, p_cycle_weeks integer)
returns void language plpgsql immutable set search_path = ''
as $$
declare
  slot jsonb;
begin
  if p_cycle_weeks is null or p_cycle_weeks not between 1 and 4 then
    raise exception 'a pattern repeats every 1 to 4 weeks' using errcode = '22023';
  end if;
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'choose at least one day' using errcode = '22023';
  end if;
  if jsonb_array_length(p_slots) > 28 then
    raise exception 'too many sessions in one pattern' using errcode = '22023';
  end if;
  for slot in select value from jsonb_array_elements(p_slots) loop
    if jsonb_typeof(slot) is distinct from 'object'
      or jsonb_typeof(slot->'cycleWeek') is distinct from 'number' or (slot->>'cycleWeek') !~ '^[1-4]$' or (slot->>'cycleWeek')::integer > p_cycle_weeks
      or jsonb_typeof(slot->'weekday') is distinct from 'number' or (slot->>'weekday') !~ '^[1-7]$'
      or jsonb_typeof(slot->'startTime') is distinct from 'string' or (slot->>'startTime') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
      or jsonb_typeof(slot->'durationMinutes') is distinct from 'number' or (slot->>'durationMinutes') !~ '^[0-9]{1,3}$'
      or (slot->>'durationMinutes')::integer not between 5 and 600 then
      raise exception 'invalid session in pattern: %', slot using errcode = '22023';
    end if;
  end loop;
  if (select count(distinct concat_ws('|', s->>'cycleWeek', s->>'weekday', s->>'startTime')) from jsonb_array_elements(p_slots) s) <> jsonb_array_length(p_slots) then
    raise exception 'the same session appears twice in the pattern' using errcode = '22023';
  end if;
end;
$$;

-- The one place a pattern turns into dates. Each returned row carries its slot object.
create or replace function private.schedule_occurrences(p_cycle_weeks integer, p_anchor_on date, p_starts_on date, p_ends_on date,
  p_timezone text, p_slots jsonb, p_from date, p_through date)
returns table (slot jsonb, occurrence_on date, cycle_week integer, starts_at timestamptz)
language sql stable set search_path = ''
as $$
  select s.value, d.day, w.cycle_week, ((d.day + (s.value->>'startTime')::time) at time zone p_timezone)
  from generate_series(greatest(p_starts_on, p_from)::timestamp, least(coalesce(p_ends_on, p_through), p_through)::timestamp, interval '1 day') g
  cross join lateral (select g::date as day) d
  -- Weeks since the anchor Monday (exact: both are Mondays), wrapped onto 1..cycle length.
  cross join lateral (select (((d.day - (extract(isodow from d.day)::integer - 1) - p_anchor_on) / 7) % p_cycle_weeks
    + p_cycle_weeks) % p_cycle_weeks + 1 as cycle_week) w
  join lateral jsonb_array_elements(p_slots) s
    on (s.value->>'weekday')::integer = extract(isodow from d.day)::integer and (s.value->>'cycleWeek')::integer = w.cycle_week
  order by 4, 2;
$$;

create or replace function private.schedule_slots_json(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'cycleWeek', cycle_week, 'weekday', weekday,
      'startTime', to_char(start_time, 'HH24:MI'), 'durationMinutes', duration_minutes)
    order by cycle_week, weekday, start_time), '[]'::jsonb)
  from public.pt_schedule_slots where schedule_id = p_schedule_id;
$$;

-- Creates the schedule's sessions through p_through. Idempotent; only future sessions, and only
-- while its PT enrollment is active and the client has a primary coach. Returns rows added.
create or replace function private.generate_pt_appointments(p_schedule_id uuid, p_through date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  sch public.pt_schedules;
  enrollment public.service_enrollments;
  coach uuid;
  added integer;
begin
  select * into sch from public.pt_schedules where id = p_schedule_id;
  select * into enrollment from public.service_enrollments where id = sch.enrollment_id;
  select primary_coach_id into coach from public.clients where id = sch.client_id;
  if sch.id is null or enrollment.status <> 'active' or enrollment.archived_at is not null or coach is null then
    return 0;
  end if;
  insert into public.pt_appointments (client_id, coach_id, schedule_id, slot_id, occurrence_on, starts_at, duration_minutes, timezone)
  select sch.client_id, coach, sch.id, (o.slot->>'id')::uuid, o.occurrence_on, o.starts_at, (o.slot->>'durationMinutes')::integer, sch.timezone
  from private.schedule_occurrences(sch.cycle_weeks, sch.anchor_on, sch.starts_on, least(sch.ends_on, enrollment.ends_on),
    sch.timezone, private.schedule_slots_json(sch.id), (now() at time zone sch.timezone)::date, p_through) o
  where o.starts_at > now()
  on conflict (slot_id, occurrence_on) do nothing;
  get diagnostics added = row_count;
  return added;
end;
$$;

-- pg_cron, hourly: keep every open pattern generated 84 days ahead and expire reschedule requests
-- whose session has started.
create or replace function private.top_up_pt_appointments()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  perform private.generate_pt_appointments(id, (now() at time zone timezone)::date + private.pt_horizon_days())
  from public.pt_schedules
  where ends_on is null or ends_on >= (now() at time zone timezone)::date;

  update public.pt_appointment_requests r set status = 'expired', resolved_at = now()
  from public.pt_appointments a
  where a.id = r.appointment_id and r.status = 'pending' and r.kind = 'reschedule' and a.starts_at <= now();
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared checks and documents
-- ---------------------------------------------------------------------------
-- The active PT enrollment and the primary coach's time zone, or 55000 when either is missing.
create or replace function private.pt_booking_context(p_client_id uuid, out enrollment_id uuid, out coach_id uuid, out timezone text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  select e.id into enrollment_id from public.service_enrollments e
  where e.client_id = p_client_id and e.service = 'personal_training' and e.status = 'active' and e.archived_at is null;
  if enrollment_id is null then
    raise exception 'this client has no active personal training service' using errcode = '55000';
  end if;
  select c.primary_coach_id, p.timezone into coach_id, timezone
  from public.clients c left join public.profiles p on p.auth_user_id = c.primary_coach_id
  where c.id = p_client_id;
  if coach_id is null then
    raise exception 'assign a primary coach before scheduling' using errcode = '55000';
  end if;
  timezone := coalesce(timezone, 'UTC');
end;
$$;

create or replace function private.check_pt_time(p_starts_at timestamptz, p_duration_minutes integer)
returns void language plpgsql stable set search_path = ''
as $$
begin
  if p_starts_at is null or p_starts_at < now() - interval '1 year' or p_starts_at > now() + interval '2 years' then
    raise exception 'choose a start time within the next two years' using errcode = '22023';
  end if;
  if p_duration_minutes is null or p_duration_minutes not between 5 and 600 then
    raise exception 'a session lasts 5 to 600 minutes' using errcode = '22023';
  end if;
end;
$$;

-- Locks and returns a session the calling staff member may change, or raises 42501.
create or replace function private.staff_pt_appointment(p_appointment_id uuid)
returns public.pt_appointments language plpgsql security definer set search_path = ''
as $$
declare
  a public.pt_appointments;
begin
  select * into a from public.pt_appointments where id = p_appointment_id for update;
  if not found or not private.staff_can_access_client(a.client_id) then
    raise exception 'session not found' using errcode = '42501';
  end if;
  return a;
end;
$$;

-- Coach edits wait until the client's open request is answered, so a direct cancel can't erase a
-- late cancellation and a move can't race a reschedule.
create or replace function private.require_no_pending_request(p_appointment_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if exists (select 1 from public.pt_appointment_requests where appointment_id = p_appointment_id and status = 'pending') then
    raise exception 'respond to the client''s request for this session first' using errcode = 'PT409';
  end if;
end;
$$;

-- The session coach's meeting link, for the client and staff who can see the session.
create or replace function private.appointment_meeting_url(p_appointment_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select p.meeting_url
  from public.pt_appointments a
  join public.profiles p on p.auth_user_id = a.coach_id
  where a.id = p_appointment_id
    and (a.client_id = private.current_client_id() or private.staff_can_access_client(a.client_id));
$$;

create or replace function private.appointment_request_document(r public.pt_appointment_requests, a public.pt_appointments)
returns jsonb language sql stable set search_path = ''
as $$
  select case when r.id is null then null else jsonb_build_object(
    'id', r.id, 'kind', r.kind, 'message', r.message, 'preferredStartsAt', r.preferred_starts_at, 'late', r.late,
    -- Expiry is also stored hourly; reads don't wait for it.
    'status', case when r.status = 'pending' and r.kind = 'reschedule' and a.starts_at <= now() then 'expired' else r.status::text end,
    'response', r.response, 'createdAt', r.created_at, 'resolvedAt', r.resolved_at) end;
$$;

-- Security invoker: RLS on the tables read here decides what the caller sees.
create or replace function private.appointment_document(a public.pt_appointments)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'clientId', a.client_id, 'clientName', c.full_name, 'coachId', a.coach_id,
    'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'timezone', a.timezone,
    'status', a.status, 'modified', a.modified,
    'scheduleId', a.schedule_id, 'occurrenceOn', a.occurrence_on, 'cycleWeeks', s.cycle_weeks,
    'cancelledAt', a.cancelled_at, 'cancellationReason', a.cancellation_reason,
    'cancelledByClient', a.cancelled_by is not null and a.cancelled_by = c.auth_user_id,
    'meetingUrl', private.appointment_meeting_url(a.id),
    'request', (select private.appointment_request_document(r, a) from public.pt_appointment_requests r
      where r.appointment_id = a.id order by r.created_at desc, r.id limit 1))
  from public.clients c
  left join public.pt_schedules s on s.id = a.schedule_id
  where c.id = a.client_id;
$$;

create or replace function private.schedule_document(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'clientId', s.client_id, 'cycleWeeks', s.cycle_weeks, 'anchorOn', s.anchor_on,
    'startsOn', s.starts_on, 'endsOn', s.ends_on, 'timezone', s.timezone, 'replacesId', s.replaces_id,
    'slots', private.schedule_slots_json(s.id))
  from public.pt_schedules s where s.id = p_schedule_id;
$$;

-- Other sessions of the same coach overlapping a time, limited to clients the caller can see. The
-- editor shows them as a warning; double-booking is allowed.
create or replace function private.coach_overlaps(p_coach_id uuid, p_starts_at timestamptz, p_duration_minutes integer, p_except uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'clientId', a.client_id, 'clientName', c.full_name,
      'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes) order by a.starts_at), '[]'::jsonb)
  from public.pt_appointments a
  join public.clients c on c.id = a.client_id
  where a.coach_id = p_coach_id and a.status = 'scheduled' and a.id is distinct from p_except
    and a.starts_at < p_starts_at + make_interval(mins => p_duration_minutes)
    and p_starts_at < a.starts_at + make_interval(mins => a.duration_minutes)
    and private.staff_can_access_client(a.client_id);
$$;

-- ---------------------------------------------------------------------------
-- Patterns
-- ---------------------------------------------------------------------------
create or replace function private.insert_pt_schedule(p_client_id uuid, p_enrollment_id uuid, p_timezone text, p_cycle_weeks integer,
  p_anchor_on date, p_starts_on date, p_ends_on date, p_slots jsonb, p_replaces_id uuid)
returns public.pt_schedules language plpgsql security definer set search_path = ''
as $$
declare
  sch public.pt_schedules;
begin
  perform private.validate_pt_slots(p_slots, p_cycle_weeks);
  if p_starts_on is null or p_starts_on < (now() at time zone p_timezone)::date then
    raise exception 'a pattern starts today or later' using errcode = '22023';
  end if;
  if p_ends_on is not null and p_ends_on < p_starts_on then
    raise exception 'the end date is before the start date' using errcode = '22023';
  end if;
  if p_anchor_on is not null and extract(isodow from p_anchor_on) <> 1 then
    raise exception 'week 1 starts on a Monday' using errcode = '22023';
  end if;
  insert into public.pt_schedules (client_id, enrollment_id, cycle_weeks, anchor_on, starts_on, ends_on, timezone, replaces_id, created_by, updated_by)
  values (p_client_id, p_enrollment_id, p_cycle_weeks,
    coalesce(p_anchor_on, p_starts_on - (extract(isodow from p_starts_on)::integer - 1)),
    p_starts_on, p_ends_on, p_timezone, p_replaces_id, (select auth.uid()), (select auth.uid()))
  returning * into sch;
  insert into public.pt_schedule_slots (schedule_id, cycle_week, weekday, start_time, duration_minutes)
  select sch.id, (s->>'cycleWeek')::smallint, (s->>'weekday')::smallint, (s->>'startTime')::time, (s->>'durationMinutes')::integer
  from jsonb_array_elements(p_slots) s;
  perform private.generate_pt_appointments(sch.id, (now() at time zone p_timezone)::date + private.pt_horizon_days());
  return sch;
end;
$$;

-- Ends a pattern before p_from: removes its untouched future sessions from that date and keeps
-- moved, cancelled and past ones. Returns how many changed sessions from p_from on were kept.
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
      where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and not a.modified and a.starts_at > now()) then
    raise exception 'respond to the client''s requests for the affected sessions first' using errcode = 'PT409';
  end if;
  delete from public.pt_appointments
  where schedule_id = sch.id and occurrence_on >= p_from and status = 'scheduled' and not modified and starts_at > now();
  select count(*) into kept from public.pt_appointments where schedule_id = sch.id and occurrence_on >= p_from and modified;
  update public.pt_schedules set ends_on = p_from - 1, updated_by = (select auth.uid()) where id = sch.id;
  return kept;
end;
$$;

-- Read-only: the first p_limit sessions a pattern would create for this client, in the coach's
-- time zone, so the editor never re-implements recurrence.
create or replace function public.preview_pt_schedule(p_client_id uuid, p_cycle_weeks integer, p_anchor_on date, p_starts_on date,
  p_ends_on date, p_slots jsonb, p_limit integer default 6)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  ctx record;
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
  ctx := private.pt_booking_context(p_client_id);
  return (
    select coalesce(jsonb_agg(jsonb_build_object('occurrenceOn', o.occurrence_on, 'startsAt', o.starts_at,
        'cycleWeek', o.cycle_week, 'weekday', (o.slot->>'weekday')::integer,
        'durationMinutes', (o.slot->>'durationMinutes')::integer, 'timezone', ctx.timezone) order by o.starts_at), '[]'::jsonb)
    from (
      select * from private.schedule_occurrences(p_cycle_weeks,
        coalesce(p_anchor_on, p_starts_on - (extract(isodow from p_starts_on)::integer - 1)),
        p_starts_on, p_ends_on, ctx.timezone, p_slots, p_starts_on, p_starts_on + 366)
      limit p_limit
    ) o
  );
end;
$$;

-- p_anchor_on null = the Monday of the start week. Uses the primary coach's time zone.
create or replace function public.create_pt_schedule(p_client_id uuid, p_cycle_weeks integer, p_anchor_on date, p_starts_on date,
  p_ends_on date, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ctx record;
  sch public.pt_schedules;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  ctx := private.pt_booking_context(p_client_id);
  sch := private.insert_pt_schedule(p_client_id, ctx.enrollment_id, ctx.timezone, p_cycle_weeks, p_anchor_on, p_starts_on,
    p_ends_on, p_slots, null);
  return private.schedule_document(sch.id);
end;
$$;

-- "This and following": the old pattern ends the day before p_from and a new one starts on it.
-- The new pattern takes the coach's current time zone.
create or replace function public.change_pt_schedule(p_schedule_id uuid, p_from date, p_cycle_weeks integer, p_anchor_on date,
  p_ends_on date, p_slots jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  old public.pt_schedules;
  ctx record;
  kept integer;
  sch public.pt_schedules;
begin
  select * into old from public.pt_schedules where id = p_schedule_id;
  if not found or not private.staff_can_access_client(old.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  ctx := private.pt_booking_context(old.client_id);
  kept := private.end_pt_schedule_from(old.id, p_from);
  sch := private.insert_pt_schedule(old.client_id, ctx.enrollment_id, ctx.timezone, p_cycle_weeks, p_anchor_on, p_from,
    p_ends_on, p_slots, old.id);
  return private.schedule_document(sch.id) || jsonb_build_object('keptSessions', kept);
end;
$$;

-- Stops a pattern from p_from on.
create or replace function public.end_pt_schedule(p_schedule_id uuid, p_from date)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  kept integer := private.end_pt_schedule_from(p_schedule_id, p_from);
begin
  return private.schedule_document(p_schedule_id) || jsonb_build_object('keptSessions', kept);
end;
$$;

-- Patterns that haven't ended yet, with their slots. Security invoker: RLS decides.
create or replace function public.get_pt_schedules(p_client_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(private.schedule_document(s.id) order by s.starts_on, s.created_at), '[]'::jsonb)
  from public.pt_schedules s
  where s.client_id = p_client_id
    and (s.ends_on is null or s.ends_on >= (now() at time zone s.timezone)::date) and s.ends_on is distinct from s.starts_on - 1;
$$;

-- ---------------------------------------------------------------------------
-- Single sessions (staff)
-- ---------------------------------------------------------------------------
create or replace function public.add_pt_appointment(p_client_id uuid, p_starts_at timestamptz, p_duration_minutes integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ctx record;
  a public.pt_appointments;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  ctx := private.pt_booking_context(p_client_id);
  perform private.check_pt_time(p_starts_at, p_duration_minutes);
  insert into public.pt_appointments (client_id, coach_id, starts_at, duration_minutes, timezone, created_by, updated_by)
  values (p_client_id, ctx.coach_id, p_starts_at, p_duration_minutes, ctx.timezone, (select auth.uid()), (select auth.uid()))
  returning * into a;
  return private.appointment_document(a) || jsonb_build_object('overlaps', private.coach_overlaps(a.coach_id, a.starts_at, a.duration_minutes, a.id));
end;
$$;

-- "This session only": move or resize one session. A recurring occurrence becomes modified, so
-- pattern changes leave it where the coach put it.
create or replace function public.update_pt_appointment(p_appointment_id uuid, p_starts_at timestamptz, p_duration_minutes integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.pt_appointments := private.staff_pt_appointment(p_appointment_id);
begin
  if a.status <> 'scheduled' then
    raise exception 'only scheduled sessions can be changed' using errcode = '55000';
  end if;
  perform private.require_no_pending_request(a.id);
  perform private.check_pt_time(p_starts_at, p_duration_minutes);
  update public.pt_appointments set starts_at = p_starts_at, duration_minutes = p_duration_minutes,
    modified = true, updated_by = (select auth.uid())
  where id = a.id returning * into a;
  return private.appointment_document(a) || jsonb_build_object('overlaps', private.coach_overlaps(a.coach_id, a.starts_at, a.duration_minutes, a.id));
end;
$$;

-- A coach cancellation is never late.
create or replace function public.cancel_pt_appointment(p_appointment_id uuid, p_reason text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.pt_appointments := private.staff_pt_appointment(p_appointment_id);
begin
  if a.status <> 'scheduled' then
    raise exception 'only scheduled sessions can be cancelled' using errcode = '55000';
  end if;
  perform private.require_no_pending_request(a.id);
  update public.pt_appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = (select auth.uid()),
    cancellation_reason = coalesce(btrim(p_reason), ''), modified = true, updated_by = (select auth.uid())
  where id = a.id returning * into a;
  return private.appointment_document(a);
exception
  when check_violation then
    raise exception 'invalid cancellation: %', sqlerrm using errcode = '22023';
end;
$$;

-- Undoes a cancellation (coach or client) for a session that hasn't started.
create or replace function public.reinstate_pt_appointment(p_appointment_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.pt_appointments := private.staff_pt_appointment(p_appointment_id);
begin
  if a.status not in ('cancelled', 'late_cancelled') then
    raise exception 'only cancelled sessions can be reinstated' using errcode = '55000';
  end if;
  if a.starts_at <= now() then
    raise exception 'this session has already started' using errcode = '55000';
  end if;
  update public.pt_appointments set status = 'scheduled', cancelled_at = null, cancelled_by = null, cancellation_reason = '',
    updated_by = (select auth.uid())
  where id = a.id returning * into a;
  return private.appointment_document(a);
end;
$$;

-- Sessions overlapping [p_from, p_to), soonest first; p_client_id null = every visible client.
-- Security invoker: a client sees only their own sessions, a coach only assigned clients'.
create or replace function public.list_pt_appointments(p_from timestamptz, p_to timestamptz, p_client_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '100 days' then
    raise exception 'choose a range of up to 100 days' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(private.appointment_document(a) order by a.starts_at, a.id), '[]'::jsonb)
    from public.pt_appointments a
    where (p_client_id is null or a.client_id = p_client_id)
      and a.starts_at < p_to and a.starts_at + make_interval(mins => a.duration_minutes) > p_from
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Client requests
-- ---------------------------------------------------------------------------
create or replace function public.request_pt_appointment_change(p_request_id uuid, p_appointment_id uuid, p_kind text,
  p_message text, p_preferred_starts_at timestamptz default null)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me_client uuid := private.current_client_id();
  existing public.pt_appointment_requests;
  a public.pt_appointments;
  window_hours integer;
  r public.pt_appointment_requests;
begin
  if me_client is null or p_request_id is null then
    raise exception 'session not found' using errcode = '42501';
  end if;
  select * into existing from public.pt_appointment_requests where id = p_request_id;
  if found then
    if existing.client_id = me_client and existing.appointment_id = p_appointment_id then
      select * into a from public.pt_appointments where id = existing.appointment_id;
      return private.appointment_request_document(existing, a); -- A retried send.
    end if;
    raise exception 'request id already used' using errcode = '22023';
  end if;

  select * into a from public.pt_appointments where id = p_appointment_id for update;
  if not found or a.client_id <> me_client then
    raise exception 'session not found' using errcode = '42501';
  end if;
  if a.status <> 'scheduled' or a.starts_at <= now() then
    raise exception 'this session can no longer be changed' using errcode = '55000';
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

  insert into public.pt_appointment_requests (id, appointment_id, client_id, kind, message, preferred_starts_at, late, created_by)
  values (p_request_id, a.id, a.client_id, p_kind::public.appointment_request_kind, coalesce(btrim(p_message), ''),
    p_preferred_starts_at,
    case when p_kind = 'cancel' then a.starts_at - now() < make_interval(hours => coalesce(window_hours, 24)) end,
    (select auth.uid()))
  returning * into r;
  return private.appointment_request_document(r, a);
exception
  when unique_violation then
    raise exception 'there is already an open request for this session' using errcode = 'PT409';
  when check_violation then
    raise exception 'invalid request: %', sqlerrm using errcode = '22023';
end;
$$;

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
    update public.pt_appointment_requests set status = 'withdrawn', resolved_by = (select auth.uid()), resolved_at = now()
    where id = r.id returning * into r;
  elsif r.status <> 'withdrawn' then
    raise exception 'this request has already been answered' using errcode = '55000';
  end if;
  select * into a from public.pt_appointments where id = r.appointment_id;
  return private.appointment_request_document(r, a);
end;
$$;

-- Accepting a cancellation applies the lateness fixed when it was sent. Accepting a reschedule
-- moves the session (free) to p_starts_at, or the client's preferred time when that is null; it
-- must happen before the session starts.
create or replace function public.respond_to_pt_appointment_request(p_request_id uuid, p_accept boolean,
  p_starts_at timestamptz default null, p_duration_minutes integer default null, p_response text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.pt_appointment_requests;
  a public.pt_appointments;
  new_start timestamptz;
  new_duration integer;
begin
  select * into r from public.pt_appointment_requests where id = p_request_id for update;
  if not found or not private.staff_can_access_client(r.client_id) then
    raise exception 'request not found' using errcode = '42501';
  end if;
  a := private.staff_pt_appointment(r.appointment_id);
  if r.status <> 'pending' then
    raise exception 'this request has already been answered' using errcode = '55000';
  end if;
  if p_accept is null then
    raise exception 'accept or decline the request' using errcode = '22023';
  end if;

  if p_accept and r.kind = 'cancel' then
    update public.pt_appointments set status = case when r.late then 'late_cancelled' else 'cancelled' end::public.appointment_status,
      cancelled_at = now(), cancelled_by = r.created_by, cancellation_reason = r.message, modified = true,
      updated_by = (select auth.uid())
    where id = a.id returning * into a;
  elsif p_accept then
    if a.starts_at <= now() then
      raise exception 'the session has started; reschedule requests expire at the start time' using errcode = '55000';
    end if;
    new_start := coalesce(p_starts_at, r.preferred_starts_at);
    new_duration := coalesce(p_duration_minutes, a.duration_minutes);
    if new_start is null then
      raise exception 'choose the new time' using errcode = '22023';
    end if;
    perform private.check_pt_time(new_start, new_duration);
    update public.pt_appointments set starts_at = new_start, duration_minutes = new_duration, modified = true,
      updated_by = (select auth.uid())
    where id = a.id returning * into a;
  end if;

  update public.pt_appointment_requests set status = case when p_accept then 'accepted' else 'declined' end::public.appointment_request_status,
    response = coalesce(btrim(p_response), ''), resolved_by = (select auth.uid()), resolved_at = now()
  where id = r.id;
  return private.appointment_document(a);
exception
  when check_violation then
    raise exception 'invalid response: %', sqlerrm using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on public.pt_schedules, public.pt_schedule_slots, public.pt_appointments, public.pt_appointment_requests
  from anon, authenticated;
grant select on public.pt_schedules, public.pt_schedule_slots, public.pt_appointments, public.pt_appointment_requests
  to authenticated;

alter table public.pt_schedules enable row level security;
alter table public.pt_schedule_slots enable row level security;
alter table public.pt_appointments enable row level security;
alter table public.pt_appointment_requests enable row level security;

create policy pt_schedules_select on public.pt_schedules for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy pt_schedule_slots_select on public.pt_schedule_slots for select to authenticated
  using (exists (select 1 from public.pt_schedules s where s.id = pt_schedule_slots.schedule_id));
create policy pt_appointments_select on public.pt_appointments for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy pt_appointment_requests_select on public.pt_appointment_requests for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));

-- Internal: triggers, generation and locked lookups.
revoke all on function private.guard_pt_schedule(), private.guard_pt_appointment(), private.follow_primary_coach(),
  private.generate_pt_appointments(uuid, date), private.top_up_pt_appointments(),
  private.pt_booking_context(uuid), private.staff_pt_appointment(uuid), private.require_no_pending_request(uuid),
  private.insert_pt_schedule(uuid, uuid, text, integer, date, date, date, jsonb, uuid), private.end_pt_schedule_from(uuid, date)
from public, anon, authenticated;
-- Called from security-invoker readers.
revoke all on function private.is_timezone(text), private.pt_horizon_days(), private.validate_pt_slots(jsonb, integer),
  private.schedule_occurrences(integer, date, date, date, text, jsonb, date, date), private.schedule_slots_json(uuid),
  private.check_pt_time(timestamptz, integer), private.appointment_meeting_url(uuid),
  private.appointment_request_document(public.pt_appointment_requests, public.pt_appointments),
  private.appointment_document(public.pt_appointments), private.schedule_document(uuid),
  private.coach_overlaps(uuid, timestamptz, integer, uuid)
from public, anon;
grant execute on function private.is_timezone(text), private.pt_horizon_days(), private.validate_pt_slots(jsonb, integer),
  private.schedule_occurrences(integer, date, date, date, text, jsonb, date, date), private.schedule_slots_json(uuid),
  private.check_pt_time(timestamptz, integer), private.appointment_meeting_url(uuid),
  private.appointment_request_document(public.pt_appointment_requests, public.pt_appointments),
  private.appointment_document(public.pt_appointments), private.schedule_document(uuid),
  private.coach_overlaps(uuid, timestamptz, integer, uuid)
to authenticated;

revoke all on function public.set_my_timezone(text), public.save_scheduling_settings(text, integer),
  public.preview_pt_schedule(uuid, integer, date, date, date, jsonb, integer),
  public.create_pt_schedule(uuid, integer, date, date, date, jsonb),
  public.change_pt_schedule(uuid, date, integer, date, date, jsonb),
  public.end_pt_schedule(uuid, date), public.get_pt_schedules(uuid),
  public.add_pt_appointment(uuid, timestamptz, integer), public.update_pt_appointment(uuid, timestamptz, integer),
  public.cancel_pt_appointment(uuid, text), public.reinstate_pt_appointment(uuid),
  public.list_pt_appointments(timestamptz, timestamptz, uuid),
  public.request_pt_appointment_change(uuid, uuid, text, text, timestamptz),
  public.withdraw_pt_appointment_request(uuid),
  public.respond_to_pt_appointment_request(uuid, boolean, timestamptz, integer, text)
from public, anon, authenticated;
grant execute on function public.set_my_timezone(text), public.save_scheduling_settings(text, integer),
  public.preview_pt_schedule(uuid, integer, date, date, date, jsonb, integer),
  public.create_pt_schedule(uuid, integer, date, date, date, jsonb),
  public.change_pt_schedule(uuid, date, integer, date, date, jsonb),
  public.end_pt_schedule(uuid, date), public.get_pt_schedules(uuid),
  public.add_pt_appointment(uuid, timestamptz, integer), public.update_pt_appointment(uuid, timestamptz, integer),
  public.cancel_pt_appointment(uuid, text), public.reinstate_pt_appointment(uuid),
  public.list_pt_appointments(timestamptz, timestamptz, uuid),
  public.request_pt_appointment_change(uuid, uuid, text, text, timestamptz),
  public.withdraw_pt_appointment_request(uuid),
  public.respond_to_pt_appointment_request(uuid, boolean, timestamptz, integer, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Hourly top-up
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('pt-appointments-top-up', '7 * * * *', 'select private.top_up_pt_appointments()');
