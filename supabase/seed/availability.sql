-- LOCAL DEVELOPMENT DATA ONLY. Coach working hours, time off and extra hours (decision 0050),
-- anchored on the same demo day as the meetings seed.
begin;

insert into public.coach_working_hours (coach_id, weekday, start_time, end_time)
select coach::uuid, weekday, start_time, end_time from (values
  -- Matt: Monday to Thursday 9–5, Friday 10–4.
  ('00000000-0000-4000-a000-000000000001', 1, time '09:00', time '17:00'),
  ('00000000-0000-4000-a000-000000000001', 2, time '09:00', time '17:00'),
  ('00000000-0000-4000-a000-000000000001', 3, time '09:00', time '17:00'),
  ('00000000-0000-4000-a000-000000000001', 4, time '09:00', time '17:00'),
  ('00000000-0000-4000-a000-000000000001', 5, time '10:00', time '16:00'),
  -- Priya: weekday mornings, with a lunch break.
  ('00000000-0000-4000-a000-000000000002', 1, time '08:00', time '12:00'),
  ('00000000-0000-4000-a000-000000000002', 1, time '13:00', time '16:00'),
  ('00000000-0000-4000-a000-000000000002', 3, time '08:00', time '12:00'),
  ('00000000-0000-4000-a000-000000000002', 3, time '13:00', time '16:00'),
  ('00000000-0000-4000-a000-000000000002', 4, time '08:00', time '12:00')
) as v(coach, weekday, start_time, end_time)
on conflict do nothing;

with demo as (
  select (created_at at time zone 'America/Toronto')::date + 140 as today
  from public.clients where id = '10000000-0000-4000-b000-000000000001'
), weeks as (
  select date_trunc('week', today)::date as monday from demo
)
insert into public.coach_availability_exceptions (id, coach_id, kind, starts_at, ends_at, all_day, note, created_by)
select md5('mps-demo/availability/' || key)::uuid, '00000000-0000-4000-a000-000000000001', kind::public.availability_exception_kind,
  starts_at, ends_at, all_day, note, '00000000-0000-4000-a000-000000000001'
from weeks cross join lateral (values
  -- Vacation: the whole week three weeks out.
  ('matt-vacation', 'time_off', (monday + 21 + time '00:00') at time zone 'America/Toronto',
    (monday + 28 + time '00:00') at time zone 'America/Toronto', true, 'Family trip'),
  -- A Saturday morning next week.
  ('matt-saturday', 'extra_hours', (monday + 12 + time '10:00') at time zone 'America/Toronto',
    (monday + 12 + time '13:00') at time zone 'America/Toronto', false, ''),
  -- A long lunch this Thursday.
  ('matt-lunch', 'time_off', (monday + 3 + time '12:00') at time zone 'America/Toronto',
    (monday + 3 + time '14:00') at time zone 'America/Toronto', false, 'Physio')
) as v(key, kind, starts_at, ends_at, all_day, note)
on conflict (id) do nothing;

commit;
