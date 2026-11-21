-- LOCAL DEVELOPMENT DATA ONLY. Backfill history through the same recurrence function
-- the scheduler uses, then keep the usual slot/date conflict key for hourly generation.
begin;

do $$
declare
  pattern record;
  demo_on date := (select (created_at at time zone 'America/Toronto')::date + 140 from public.clients
    where id = '10000000-0000-4000-b000-000000000001');
  client public.clients;
  schedule_id uuid;
  slot_id uuid;
  starts_on date;
  slot_on date;
  coach_tz constant text := 'America/Toronto';
  occurrence record;
  meeting_id uuid;
  moved_at timestamptz;
  cancelled_at timestamptz := (demo_on - 1 + time '19:10') at time zone coach_tz;
  maya uuid := '10000000-0000-4000-b000-000000000001';
  daniel uuid := '10000000-0000-4000-b000-000000000002';
  grace uuid := '10000000-0000-4000-b000-000000000009';
  request_id uuid;
  starts_at timestamptz;
  actor uuid;
  coach uuid;
begin
  -- PT sessions are 60 or 40 minutes, the lengths with default prices (decision 0053).
  for pattern in
    select * from (values
      ('maya-check-in', maya, '{mesocycle,nutrition}'::public.service_kind[], 2, 45, 6, time '18:00', 25,
        'Pull up the last two weekly averages and ask how the higher training volume is feeling.'),
      ('daniel-pt', daniel, '{personal_training}', 1, 44, 1, time '17:30', 60,
        'Gym floor, near the dumbbell racks. Ask about his office schedule before planning the second lift.'),
      ('grace-pt', grace, '{personal_training}', 1, 43, 4, time '11:00', 40,
        'Technique session. Film the second box squat set from the side if Grace is comfortable.')
    ) as v(key, client_id, services, cycle_weeks, days_ago, next_slot, at_time, duration, notes)
  loop
    select * into strict client from public.clients where id = pattern.client_id;
    schedule_id := md5('mps-demo/schedule/' || pattern.key)::uuid;
    slot_id := md5('mps-demo/slot/' || pattern.key)::uuid;
    if exists (select 1 from public.meeting_schedules s where s.id = schedule_id) then continue; end if;
    starts_on := demo_on - pattern.days_ago;
    slot_on := demo_on + pattern.next_slot;
    insert into public.meeting_schedules (id, client_id, services, cycle_weeks, anchor_on, starts_on, timezone,
      created_by, updated_by, created_at, updated_at)
    values (schedule_id, client.id, pattern.services, pattern.cycle_weeks, date_trunc('week', slot_on)::date,
      starts_on, coach_tz, client.primary_coach_id, client.primary_coach_id,
      (starts_on - 1 + time '15:30') at time zone coach_tz, (starts_on - 1 + time '15:30') at time zone coach_tz);

    insert into public.meeting_schedule_slots (id, schedule_id, cycle_week, weekday, start_time, duration_minutes)
    values (slot_id, schedule_id, 1, extract(isodow from slot_on), pattern.at_time, pattern.duration);
    insert into public.meeting_schedule_notes (schedule_id, client_id, body, updated_by, updated_at)
    values (schedule_id, client.id, pattern.notes, client.primary_coach_id, (starts_on + time '09:00') at time zone coach_tz);

    for occurrence in
      select * from private.schedule_occurrences(pattern.cycle_weeks, date_trunc('week', slot_on)::date,
        starts_on, null, coach_tz, private.schedule_slots_json(schedule_id), starts_on, demo_on + private.pt_horizon_days())
    loop
      -- Maya's earlier check-in moved by one day, retaining its original recurring slot.
      moved_at := case when pattern.key = 'maya-check-in' and occurrence.occurrence_on = demo_on - 8
        then (occurrence.occurrence_on + 1 + time '18:30') at time zone coach_tz end;
      meeting_id := md5('mps-demo/meeting/' || pattern.key || '/' || (occurrence.occurrence_on - demo_on))::uuid;
      insert into public.meetings (id, client_id, coach_id, schedule_id, slot_id, occurrence_on, starts_at,
        duration_minutes, timezone, services, status, modified, created_by, updated_by, created_at, updated_at)
      values (meeting_id, client.id, client.primary_coach_id, schedule_id, slot_id, occurrence.occurrence_on,
        coalesce(moved_at, occurrence.starts_at), pattern.duration, coach_tz, pattern.services,
        case when occurrence.occurrence_on < demo_on then 'completed' else 'scheduled' end::public.meeting_status,
        moved_at is not null, client.primary_coach_id, client.primary_coach_id,
        (starts_on - 1 + time '15:30') at time zone coach_tz,
        case when occurrence.occurrence_on < demo_on then coalesce(moved_at, occurrence.starts_at) + make_interval(mins => pattern.duration)
          else least(now(), (occurrence.occurrence_on - 1 + time '09:00') at time zone coach_tz) end)
      on conflict do nothing;

      if moved_at is not null then
        insert into public.meeting_requests (id, meeting_id, client_id, kind, message, preferred_starts_at, status,
          response, created_by, created_at, resolved_by, resolved_at)
        values (md5('mps-demo/request/maya-move')::uuid, meeting_id, client.id, 'reschedule',
          'My shift was moved to the evening. Could we do the same check-in the following day?', moved_at, 'accepted',
          'Moved us to the following day at 6:30. Bring the notes from your push session.', client.auth_user_id,
          occurrence.starts_at - interval '3 days', client.primary_coach_id, occurrence.starts_at - interval '2 days');
        insert into public.meeting_notes (meeting_id, client_id, body, updated_by, updated_at)
        values (meeting_id, client.id, 'Elbow was touchy after skullcrushers. Review the machine option and keep the small calorie surplus.',
          client.primary_coach_id, moved_at + interval '30 minutes');
        insert into public.staff_request_seen (staff_id, request_id, seen_at)
        values (client.primary_coach_id, md5('mps-demo/request/maya-move')::uuid, occurrence.starts_at - interval '2 days');
      elsif pattern.key = 'grace-pt' and occurrence.occurrence_on = demo_on + 4 then
        insert into public.meeting_requests (id, meeting_id, client_id, kind, message, preferred_starts_at, created_by, created_at)
        values (md5('mps-demo/request/grace-move')::uuid, meeting_id, client.id, 'reschedule',
          'I have to cover a morning shift. Could we do early afternoon the same day?', occurrence.starts_at + interval '2 hours',
          client.auth_user_id, (demo_on - 1 + time '17:05') at time zone coach_tz);
      end if;
    end loop;
  end loop;

  -- A cancelled one-off stays visible in the calendar and carries the same request in Reviews.
  select auth_user_id, primary_coach_id into actor, coach from public.clients where id = daniel;
  meeting_id := md5('mps-demo/meeting/daniel-extra')::uuid;
  starts_at := (demo_on + 4 + time '09:00') at time zone coach_tz;
  insert into public.meetings (id, client_id, coach_id, starts_at, duration_minutes, timezone, services,
    status, modified, cancelled_at, cancelled_by, cancellation_reason, created_by, updated_by, created_at, updated_at)
  values (meeting_id, daniel, coach, starts_at, 60, coach_tz, '{personal_training}',
    'cancelled', true, cancelled_at, actor, 'Out of town for a family weekend. I’ll train at the hotel instead.',
    coach, coach, (demo_on - 5 + time '11:00') at time zone coach_tz, cancelled_at)
  on conflict (id) do nothing;
  insert into public.meeting_requests (id, meeting_id, client_id, kind, message, late, status, response,
    created_by, created_at, resolved_by, resolved_at)
  values (md5('mps-demo/request/daniel-cancel')::uuid, meeting_id, daniel, 'cancel',
    'Out of town for a family weekend. I’ll train at the hotel instead.', false, 'accepted',
    'All set. Keep the hotel workout easy and pick up the plan next week.', actor,
    cancelled_at - interval '35 minutes', coach, cancelled_at)
  on conflict (id) do nothing;

  -- A quick form review shows in Upcoming today if the coach opens the demo before 8:30 pm.
  select primary_coach_id into coach from public.clients where id = maya;
  starts_at := (demo_on + time '20:30') at time zone coach_tz;
  insert into public.meetings (id, client_id, coach_id, starts_at, duration_minutes, timezone, services,
    status, created_by, updated_by, created_at, updated_at)
  values (md5('mps-demo/meeting/maya-form-review')::uuid, maya, coach, starts_at, 20, coach_tz, '{mesocycle}',
    case when starts_at <= now() then 'completed' else 'scheduled' end::public.meeting_status,
    coach, coach, (demo_on - 2 + time '14:00') at time zone coach_tz, least(now(), starts_at))
  on conflict (id) do nothing;
  insert into public.meeting_notes (meeting_id, client_id, body, updated_by, updated_at)
  values (md5('mps-demo/meeting/maya-form-review')::uuid, maya,
    'Review the cable row video and check grip and elbow position before the next pull day.', coach,
    (demo_on - 2 + time '14:05') at time zone coach_tz)
  on conflict do nothing;

  -- Service requests use the real client write path so existing enrollments govern eligibility.
  select auth_user_id into actor from public.clients where id = grace;
  request_id := md5('mps-demo/request/grace-nutrition')::uuid;
  if not exists (select 1 from public.service_requests r where r.id = request_id) then
    perform set_config('request.jwt.claims', jsonb_build_object('sub', actor, 'role', 'authenticated')::text, true);
    perform public.request_service(request_id, 'nutrition',
      'Could we add nutrition coaching? I’m on rotating shifts and would like help planning meals around training.');
    update public.service_requests r set created_at = (demo_on - 1 + time '20:45') at time zone coach_tz where r.id = request_id;
  end if;
end $$;

-- Preserve the plan that was active on a past meeting’s date, including archived plans.
insert into public.meeting_programs (meeting_id, service, program_id, nutrition_program_id)
select m.id, service, workout.id, nutrition.id
from public.meetings m
cross join lateral unnest(m.services) as tags(service)
left join lateral (
  select p.id from public.programs p join public.program_revisions r on r.id = p.current_revision_id
  join public.program_weeks w on w.revision_id = r.id and w.week_index = 1
  where p.client_id = m.client_id and p.service = tags.service and r.published_at <= m.starts_at
    and w.start_date <= (m.starts_at at time zone m.timezone)::date
  order by w.start_date desc, p.id limit 1
) workout on service <> 'nutrition'
left join lateral (
  select p.id from public.nutrition_programs p join public.nutrition_program_revisions r on r.id = p.current_revision_id
  where p.client_id = m.client_id and r.start_date <= (m.starts_at at time zone m.timezone)::date and r.published_at <= m.starts_at
  order by r.start_date desc, p.id limit 1
) nutrition on service = 'nutrition'
where m.status = 'completed' and (workout.id is not null or nutrition.id is not null)
  and (m.id = md5('mps-demo/meeting/maya-form-review')::uuid or m.schedule_id = any(array[
    md5('mps-demo/schedule/maya-check-in')::uuid, md5('mps-demo/schedule/daniel-pt')::uuid, md5('mps-demo/schedule/grace-pt')::uuid
  ]))
on conflict (meeting_id, service) do nothing;

commit;
