-- Coach availability (decision 0050): weekly working hours, time off and extra hours, booking
-- rules, and the open times a client picks from when asking to reschedule. A pending reschedule
-- holds its chosen time. Window and slot math lives only here, like recurrence (00030).

-- ---------------------------------------------------------------------------
-- Booking rules
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column booking_notice_hours integer not null default 12 check (booking_notice_hours between 0 and 168),
  add column booking_horizon_days integer not null default 28 check (booking_horizon_days between 1 and 90),
  add column booking_buffer_minutes integer not null default 0 check (booking_buffer_minutes between 0 and 120);
-- No column grants: staff save these through save_booking_rules.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
-- Wall-clock ranges in the coach's current profile time zone. Unlike meetings, hours follow a
-- time zone change. Saved whole by save_working_hours, which merges overlapping ranges.
create table public.coach_working_hours (
  coach_id uuid not null references auth.users (id) on delete cascade,
  weekday smallint not null check (weekday between 1 and 7),
  start_time time not null,
  end_time time not null,
  primary key (coach_id, weekday, start_time),
  constraint coach_working_hours_range check (start_time < end_time)
);

create type public.availability_exception_kind as enum ('time_off', 'extra_hours');

create table public.coach_availability_exceptions (
  -- Chosen by the browser, so a retried save updates the same row.
  id uuid primary key,
  coach_id uuid not null references auth.users (id) on delete cascade,
  kind public.availability_exception_kind not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  -- Display only: the editor shows whole days. The instants are the truth.
  all_day boolean not null default false,
  -- Staff only (clients never read this table).
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint coach_availability_exceptions_range check (ends_at > starts_at and ends_at - starts_at <= interval '366 days')
);
create index coach_availability_exceptions_coach on public.coach_availability_exceptions (coach_id, ends_at);

-- ---------------------------------------------------------------------------
-- Requests: a reschedule may be just a picked time, and records short notice
-- ---------------------------------------------------------------------------
-- `late` on a reschedule is informational (sent inside the late-cancel window); accepting one never
-- records a late cancellation. Older reschedules keep `late` null.
alter table public.meeting_requests drop constraint pt_appointment_requests_kind;
alter table public.meeting_requests add constraint meeting_requests_kind check (case kind
  when 'cancel' then late is not null and preferred_starts_at is null
  when 'reschedule' then btrim(message) <> '' or preferred_starts_at is not null end);

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create or replace function private.working_hours_json(p_coach_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object('weekday', weekday, 'startTime', to_char(start_time, 'HH24:MI'),
      'endTime', to_char(end_time, 'HH24:MI')) order by weekday, start_time), '[]'::jsonb)
  from public.coach_working_hours where coach_id = p_coach_id;
$$;

create or replace function private.availability_exception_json(x public.coach_availability_exceptions)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', x.id, 'kind', x.kind, 'startsAt', x.starts_at, 'endsAt', x.ends_at,
    'allDay', x.all_day, 'note', x.note);
$$;

create or replace function private.booking_rules_json(p public.profiles)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('bookingNoticeHours', p.booking_notice_hours, 'bookingHorizonDays', p.booking_horizon_days,
    'bookingBufferMinutes', p.booking_buffer_minutes);
$$;

-- ---------------------------------------------------------------------------
-- Windows and open times
-- ---------------------------------------------------------------------------
-- The coach's available time inside [p_from, p_to): weekly hours on each local date, plus extra
-- hours, minus time off, merged. `(date + time) at time zone` keeps wall-clock hours across DST.
create or replace function private.availability_windows(p_coach_id uuid, p_from timestamptz, p_to timestamptz)
returns table (starts_at timestamptz, ends_at timestamptz)
language sql stable set search_path = ''
as $$
  with zone as (
    select coalesce((select p.timezone from public.profiles p where p.auth_user_id = p_coach_id), 'UTC') as tz
  ), open as (
    -- A day either side of the range covers any zone offset.
    select tstzrange((d::date + h.start_time) at time zone z.tz, (d::date + h.end_time) at time zone z.tz) as r
    from zone z
    cross join generate_series(((p_from at time zone z.tz)::date - 1)::timestamp, ((p_to at time zone z.tz)::date + 1)::timestamp,
      interval '1 day') d
    join public.coach_working_hours h on h.coach_id = p_coach_id and h.weekday = extract(isodow from d)::integer
    union all
    select tstzrange(x.starts_at, x.ends_at) from public.coach_availability_exceptions x
    where x.coach_id = p_coach_id and x.kind = 'extra_hours' and x.starts_at < p_to and x.ends_at > p_from
  ), closed as (
    select coalesce(range_agg(tstzrange(x.starts_at, x.ends_at)), '{}'::tstzmultirange) as m
    from public.coach_availability_exceptions x
    where x.coach_id = p_coach_id and x.kind = 'time_off' and x.starts_at < p_to and x.ends_at > p_from
  )
  select lower(w), upper(w)
  from unnest(((select range_agg(r) from open) - (select m from closed)) * tstzmultirange(tstzrange(p_from, p_to))) w
  where not isempty(w)
  order by 1;
$$;

-- Start times (every 15 minutes) a meeting of this length fits in the coach's windows, inside the
-- booking notice and horizon, clear of the coach's scheduled meetings and of times held by other
-- pending reschedule requests (each with the buffer either side). `p_except_meeting` is the
-- meeting being moved: its own time and request don't block it.
create or replace function private.open_slots(p_coach_id uuid, p_duration_minutes integer, p_except_meeting uuid)
returns setof timestamptz
language sql stable set search_path = ''
as $$
  with rules as (
    select now() + make_interval(hours => p.booking_notice_hours) as earliest,
      now() + make_interval(days => p.booking_horizon_days) as latest,
      make_interval(mins => p.booking_buffer_minutes) as buffer,
      make_interval(mins => p_duration_minutes) as dur
    from public.profiles p where p.auth_user_id = p_coach_id
  ), candidates as (
    select s
    from rules b
    cross join private.availability_windows(p_coach_id, b.earliest, b.latest + b.dur) w
    -- From the first quarter hour at or after the window opens (UTC quarters are local quarters
    -- in every zone whose offset is a multiple of 15 minutes).
    cross join lateral (select date_bin('15 minutes', w.starts_at, timestamptz '2000-01-01 00:00+00') as q) f
    cross join lateral generate_series(case when f.q = w.starts_at then f.q else f.q + interval '15 minutes' end,
      w.ends_at - b.dur, interval '15 minutes') s
  )
  select distinct c.s
  from candidates c cross join rules b
  where c.s >= b.earliest and c.s <= b.latest
    and not exists (
      select 1 from public.meetings m
      where m.coach_id = p_coach_id and m.status = 'scheduled' and m.id is distinct from p_except_meeting
        and m.starts_at - b.buffer < c.s + b.dur and c.s < m.starts_at + make_interval(mins => m.duration_minutes) + b.buffer)
    and not exists (
      select 1 from public.meeting_requests q join public.meetings m on m.id = q.meeting_id
      where m.coach_id = p_coach_id and q.status = 'pending' and q.kind = 'reschedule' and q.preferred_starts_at is not null
        and m.status = 'scheduled' and m.starts_at > now() and m.id is distinct from p_except_meeting
        and q.preferred_starts_at - b.buffer < c.s + b.dur
        and c.s < q.preferred_starts_at + make_interval(mins => m.duration_minutes) + b.buffer)
  order by 1;
$$;

create or replace function private.has_availability(p_coach_id uuid)
returns boolean language sql stable set search_path = ''
as $$
  select exists (select 1 from public.coach_working_hours where coach_id = p_coach_id)
    or exists (select 1 from public.coach_availability_exceptions
      where coach_id = p_coach_id and kind = 'extra_hours' and ends_at > now());
$$;

-- ---------------------------------------------------------------------------
-- Staff functions
-- ---------------------------------------------------------------------------
create or replace function public.get_my_availability()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  p public.profiles;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  select * into p from public.profiles where auth_user_id = me;
  return jsonb_build_object('timezone', coalesce(p.timezone, 'UTC'), 'hours', private.working_hours_json(me),
    'exceptions', coalesce((select jsonb_agg(private.availability_exception_json(x) order by x.starts_at)
      from public.coach_availability_exceptions x where x.coach_id = me and x.ends_at > now() - interval '30 days'), '[]'::jsonb))
    || private.booking_rules_json(p);
end;
$$;

-- Replaces the caller's whole week. Overlapping or touching ranges on a day merge into one, so a
-- meeting can run across a split like 9–12 and 12–5.
create or replace function public.save_working_hours(p_hours jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_hours is null or jsonb_typeof(p_hours) <> 'array' or jsonb_array_length(p_hours) > 70 then
    raise exception 'working hours must be a list of up to 70 ranges' using errcode = '22023';
  end if;

  delete from public.coach_working_hours where coach_id = me;
  insert into public.coach_working_hours (coach_id, weekday, start_time, end_time)
  select me, weekday, min(s), max(e)
  from (
    select weekday, s, e, count(*) filter (where prev_end is null or s > prev_end) over (partition by weekday order by s, e) as island
    from (
      select weekday, s, e, max(e) over (partition by weekday order by s, e rows between unbounded preceding and 1 preceding) as prev_end
      from (
        select (h->>'weekday')::smallint as weekday, (h->>'startTime')::time as s, (h->>'endTime')::time as e
        from jsonb_array_elements(p_hours) h
      ) ranges
    ) ordered
  ) islands
  group by weekday, island;
  return private.working_hours_json(me);
exception
  when check_violation or not_null_violation or invalid_datetime_format or datetime_field_overflow
    or invalid_text_representation or numeric_value_out_of_range then
    raise exception 'invalid working hours: each range needs a weekday and must end after it starts' using errcode = '22023';
end;
$$;

create or replace function public.save_booking_rules(p_notice_hours integer, p_horizon_days integer, p_buffer_minutes integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  saved public.profiles;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.profiles set booking_notice_hours = p_notice_hours, booking_horizon_days = p_horizon_days,
    booking_buffer_minutes = p_buffer_minutes
  where auth_user_id = (select auth.uid())
  returning * into saved;
  return private.booking_rules_json(saved);
exception
  when check_violation or not_null_violation then
    raise exception 'invalid booking rules: %', sqlerrm using errcode = '22023';
end;
$$;

-- Adds or updates one of the caller's exceptions (the id is the browser's, so retries are safe).
-- Time off returns the scheduled meetings inside it as a warning; nothing is cancelled.
create or replace function public.save_availability_exception(p_id uuid, p_kind text, p_starts_at timestamptz,
  p_ends_at timestamptz, p_all_day boolean default false, p_note text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  x public.coach_availability_exceptions;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_id is null or p_kind is null or p_kind not in ('time_off', 'extra_hours') then
    raise exception 'choose time off or extra hours' using errcode = '22023';
  end if;
  if p_starts_at is null or p_ends_at is null or p_starts_at < now() - interval '1 year' or p_ends_at > now() + interval '2 years' then
    raise exception 'choose times within the next two years' using errcode = '22023';
  end if;
  if exists (select 1 from public.coach_availability_exceptions e where e.id = p_id and e.coach_id <> me) then
    raise exception 'not found' using errcode = '42501';
  end if;

  insert into public.coach_availability_exceptions (id, coach_id, kind, starts_at, ends_at, all_day, note, created_by)
  values (p_id, me, p_kind::public.availability_exception_kind, p_starts_at, p_ends_at, coalesce(p_all_day, false),
    coalesce(btrim(p_note), ''), me)
  on conflict (id) do update set kind = excluded.kind, starts_at = excluded.starts_at, ends_at = excluded.ends_at,
    all_day = excluded.all_day, note = excluded.note, updated_at = now()
  returning * into x;

  return jsonb_build_object('exception', private.availability_exception_json(x),
    'overlaps', case when x.kind = 'time_off' then private.coach_overlaps(me, x.starts_at,
      ceil(extract(epoch from x.ends_at - x.starts_at) / 60)::integer, null) else '[]'::jsonb end);
exception
  when check_violation then
    raise exception 'invalid time off or extra hours: %', sqlerrm using errcode = '22023';
end;
$$;

create or replace function public.remove_availability_exception(p_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  delete from public.coach_availability_exceptions where id = p_id and coach_id = (select auth.uid());
  get diagnostics removed = row_count;
  return jsonb_build_object('removed', removed > 0);
end;
$$;

-- The caller's own windows, for shading the Meetings calendar.
create or replace function public.list_availability_windows(p_from timestamptz, p_to timestamptz)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '62 days' then
    raise exception 'choose a range of up to 62 days' using errcode = '22023';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('startsAt', w.starts_at, 'endsAt', w.ends_at) order by w.starts_at)
    from private.availability_windows((select auth.uid()), p_from, p_to) w), '[]'::jsonb);
end;
$$;

-- ---------------------------------------------------------------------------
-- Open times for one meeting (its client, or staff with access)
-- ---------------------------------------------------------------------------
-- Clients only ever see start times: never the coach's hours, time off, notes or other meetings.
create or replace function public.list_open_times(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  a public.meetings;
  coach public.profiles;
  me_client uuid := private.current_client_id();
begin
  select * into a from public.meetings where id = p_meeting_id;
  if not found or not ((me_client is not null and a.client_id = me_client) or private.staff_can_access_client(a.client_id)) then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  select * into coach from public.profiles where auth_user_id = a.coach_id;
  return jsonb_build_object(
    'meetingId', a.id, 'coachTimezone', coalesce(coach.timezone, 'UTC'), 'durationMinutes', a.duration_minutes,
    'lateCancelHours', coalesce(coach.late_cancel_hours, 24), 'billable', a.billable,
    'hasAvailability', a.coach_id is not null and private.has_availability(a.coach_id),
    'times', case when a.coach_id is not null and a.status = 'scheduled' and a.starts_at > now()
      then coalesce((select jsonb_agg(s order by s) from private.open_slots(a.coach_id, a.duration_minutes, a.id) s), '[]'::jsonb)
      else '[]'::jsonb end);
end;
$$;

-- ---------------------------------------------------------------------------
-- request_meeting_change (00033): a picked time must be open and is then held
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
  if p_preferred_starts_at is not null then
    -- One request at a time per coach, so two clients can't both hold the same time.
    perform pg_advisory_xact_lock(hashtextextended('meeting-slots:' || a.coach_id::text, 0));
    if a.coach_id is null or not exists (
        select 1 from private.open_slots(a.coach_id, a.duration_minutes, a.id) s where s = p_preferred_starts_at) then
      raise exception 'that time is no longer available' using errcode = '55000';
    end if;
  end if;
  select late_cancel_hours into window_hours from public.profiles where auth_user_id = a.coach_id;

  insert into public.meeting_requests (id, meeting_id, client_id, kind, message, preferred_starts_at, late, created_by)
  values (p_request_id, a.id, a.client_id, p_kind::public.meeting_request_kind, coalesce(btrim(p_message), ''),
    p_preferred_starts_at,
    -- Only billable (Personal Training) meetings can be late. On a reschedule it only flags short notice.
    a.billable and a.starts_at - now() < make_interval(hours => coalesce(window_hours, 24)),
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

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.coach_working_hours enable row level security;
alter table public.coach_availability_exceptions enable row level security;

create policy coach_working_hours_select on public.coach_working_hours for select to authenticated
  using (coach_id = (select auth.uid()) or (select private.is_admin()));
create policy coach_availability_exceptions_select on public.coach_availability_exceptions for select to authenticated
  using (coach_id = (select auth.uid()) or (select private.is_admin()));

revoke all on public.coach_working_hours, public.coach_availability_exceptions from anon, authenticated;
grant select on public.coach_working_hours, public.coach_availability_exceptions to authenticated;

revoke all on function private.working_hours_json(uuid), private.availability_exception_json(public.coach_availability_exceptions),
  private.booking_rules_json(public.profiles), private.availability_windows(uuid, timestamptz, timestamptz),
  private.open_slots(uuid, integer, uuid), private.has_availability(uuid)
from public, anon, authenticated;

revoke all on function public.get_my_availability(), public.save_working_hours(jsonb),
  public.save_booking_rules(integer, integer, integer),
  public.save_availability_exception(uuid, text, timestamptz, timestamptz, boolean, text),
  public.remove_availability_exception(uuid), public.list_availability_windows(timestamptz, timestamptz),
  public.list_open_times(uuid)
from public, anon, authenticated;
grant execute on function public.get_my_availability(), public.save_working_hours(jsonb),
  public.save_booking_rules(integer, integer, integer),
  public.save_availability_exception(uuid, text, timestamptz, timestamptz, boolean, text),
  public.remove_availability_exception(uuid), public.list_availability_windows(timestamptz, timestamptz),
  public.list_open_times(uuid)
to authenticated;
