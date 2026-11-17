-- Integration coverage for the local demo seed. Existing policy tests cover the RPCs in isolation.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

create temporary view demo_day as
select (created_at at time zone 'America/Toronto')::date + 140 as today
from public.clients where id = '10000000-0000-4000-b000-000000000001';

select results_eq(
  $$select status::text, count(*)::integer from public.clients group by status order by status::text$$,
  $$values ('active', 3), ('disabled', 2), ('invited', 1), ('pending', 1)$$,
  'the demo contains seven clients across the requested statuses');

select results_eq(
  $$select e.service::text, count(*)::integer from public.service_enrollments e join public.clients c on c.id = e.client_id
    where c.status = 'active' and e.status = 'active' group by e.service order by e.service::text$$,
  $$values ('mesocycle', 2), ('nutrition', 2), ('personal_training', 2)$$,
  'every service has exactly two active client enrollments');

select is_empty(
  $$select 1 from public.clients c
    where c.status in ('pending', 'invited') and (
      exists (select 1 from public.programs p where p.client_id = c.id)
      or exists (select 1 from public.nutrition_programs p where p.client_id = c.id))$$,
  'the onboarding examples have no program data');

select is_empty(
  $$select 1 from public.service_enrollments e join public.clients c on c.id = e.client_id
    where c.status = 'active' and e.status = 'active' and not (exists (
      select 1 from public.programs p where p.id = e.current_program_id and p.enrollment_id = e.id
        and p.archived_at is null and p.current_revision_id is not null
    ) or exists (
      select 1 from public.nutrition_programs p where p.id = e.current_nutrition_program_id and p.enrollment_id = e.id
        and p.archived_at is null and p.current_revision_id is not null
    ))$$,
  'each active enrollment has a linked published current program');

select is_empty(
  $$select 1 from public.training_sessions s join public.workout_days d on d.id = s.day_id and d.revision_id = s.revision_id
    where d.scheduled_date >= (select today from demo_day)
      or (s.status = 'completed' and not exists (select 1 from public.logged_sets l where l.session_id = s.id))$$,
  'workouts are logged only for past days and completed workouts have actual sets');

select is(
  (select count(*)::int from public.training_sessions where status = 'in_progress'),
  1, 'an unfinished workout feeds the Client Home to-do');

select is_empty(
  $$select 1 from public.nutrition_daily_activity a
    left join public.nutrition_program_revisions r on r.program_id = a.program_id and r.status = 'published'
    where r.id is null or a.logged_on < r.start_date or a.logged_on >= r.start_date + r.week_count * 7
      or a.logged_on >= (select today from demo_day)$$,
  'nutrition activity belongs to a published program and leaves the new check-in due');

select is_empty(
  $$select 1 from public.meeting_schedules s where starts_on >= (select today - interval '1 month' from demo_day)
    or not exists (select 1 from public.meetings m where m.schedule_id = s.id and m.status = 'completed')$$,
  'recurring schedules reach back more than a month and contain completed meetings');

select ok(exists (
  select 1 from public.meeting_requests r join public.meetings m on m.id = r.meeting_id and m.client_id = r.client_id
  where r.kind = 'cancel' and r.status = 'accepted' and m.status = 'cancelled' and r.created_by = m.cancelled_by
) and exists (
  select 1 from public.meeting_requests r join public.meetings m on m.id = r.meeting_id
  where r.kind = 'reschedule' and r.status = 'accepted' and m.modified and m.starts_at = r.preferred_starts_at
    and (m.starts_at at time zone m.timezone)::date <> m.occurrence_on
) and exists (
  select 1 from public.meeting_requests r join public.meetings m on m.id = r.meeting_id
  where r.kind = 'reschedule' and r.status = 'pending' and m.status = 'scheduled' and r.preferred_starts_at <> m.starts_at
), 'cancellations and pending and accepted reschedules agree with the calendar');

select ok(exists (
  select 1 from public.service_requests r where private.service_request_status(r) = 'pending'
), 'a new service request remains available in Reviews');

select * from finish();
rollback;
