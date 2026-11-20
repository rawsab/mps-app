-- Coach availability, open times and held reschedule times (decision 0050).
-- Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
-- A wall-clock time in Matt's zone.
create function pg_temp.at(d date, t time) returns timestamptz language sql as $$ select (d + t) at time zone 'America/Toronto' $$;
-- How many of a meeting's open times fall on a local date, and the first one.
create function pg_temp.slots_on(meeting uuid, d date) returns integer language sql as $$
  select count(*)::integer from jsonb_array_elements_text(public.list_open_times(meeting)->'times') t
  where (t::timestamptz at time zone 'America/Toronto')::date = d $$;
create function pg_temp.first_on(meeting uuid, d date) returns time language sql as $$
  select min((t::timestamptz at time zone 'America/Toronto')::time) from jsonb_array_elements_text(public.list_open_times(meeting)->'times') t
  where (t::timestamptz at time zone 'America/Toronto')::date = d $$;
create function pg_temp.has_slot(meeting uuid, at timestamptz) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements_text(public.list_open_times(meeting)->'times') t where t::timestamptz = at) $$;
grant execute on all functions in schema pg_temp to authenticated;

\set matt        '''00000000-0000-4000-a000-000000000001'''
\set priya       '''00000000-0000-4000-a000-000000000002'''
\set user_maya   '''00000000-0000-4000-a000-000000000011'''
\set user_daniel '''00000000-0000-4000-a000-000000000012'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set maya        '''10000000-0000-4000-b000-000000000001'''
\set daniel      '''10000000-0000-4000-b000-000000000002'''
\set grace       '''10000000-0000-4000-b000-000000000009'''

truncate public.meeting_schedules, public.meetings cascade;
delete from public.coach_working_hours;
delete from public.coach_availability_exceptions;
update public.profiles set timezone = 'America/Toronto' where auth_user_id = :matt;
-- A Monday two to three weeks out; now() is fixed for the whole transaction.
select date_trunc('week', (now() at time zone 'America/Toronto')::date + 14)::date as d \gset
select (:'d'::date + 4) as fri, (:'d'::date + 5) as sat \gset

-- ---------------------------------------------------------------------------
-- Working hours and booking rules
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_maya);
select throws_ok($$select public.save_working_hours('[]')$$, '42501', null, 'clients have no working hours');
select pg_temp.act_as(null);
select throws_ok($$select public.get_my_availability()$$, '42501', null, 'anonymous cannot read availability');

select pg_temp.act_as(:matt);
select is(public.save_working_hours('[
    {"weekday":1,"startTime":"09:00","endTime":"12:00"}, {"weekday":1,"startTime":"11:00","endTime":"13:00"},
    {"weekday":1,"startTime":"13:00","endTime":"17:00"}, {"weekday":5,"startTime":"10:00","endTime":"16:00"}]'),
  '[{"weekday":1,"startTime":"09:00","endTime":"17:00"},{"weekday":5,"startTime":"10:00","endTime":"16:00"}]'::jsonb,
  'overlapping and touching ranges merge per day');
select throws_ok($$select public.save_working_hours('[{"weekday":2,"startTime":"17:00","endTime":"09:00"}]')$$, '22023', null,
  'a range must end after it starts');
select throws_ok($$select public.save_working_hours('[{"weekday":8,"startTime":"09:00","endTime":"10:00"}]')$$, '22023', null,
  'weekdays are 1 to 7');
select is(jsonb_array_length(public.get_my_availability()->'hours'), 2, 'a refused save keeps the saved week');
select throws_ok($$select public.save_booking_rules(200, 28, 0)$$, '22023', null, 'notice is capped at a week');
select is(public.save_booking_rules(0, 90, 0)->>'bookingHorizonDays', '90', 'coach saves booking rules');

select pg_temp.act_as(:priya);
select is((select count(*)::int from public.coach_working_hours), 0, 'another coach cannot read Matt''s hours');
select pg_temp.act_as(:user_maya);
select is((select count(*)::int from public.coach_working_hours), 0, 'clients cannot read working hours');
select throws_ok(format('select public.list_availability_windows(%L, %L)', now(), now() + interval '1 day'), '42501', null,
  'clients cannot list windows');

-- ---------------------------------------------------------------------------
-- Windows, time off and extra hours
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:matt);
select public.add_meeting(:maya, '{mesocycle}', pg_temp.at(:'d', '15:00'), 60)->>'id' as m1 \gset
select public.add_meeting(:daniel, '{personal_training}', pg_temp.at(:'fri', '10:00'), 60)->>'id' as m2 \gset
select public.add_meeting(:daniel, '{personal_training}', pg_temp.at(:'d', '12:15'), 30)->>'id' as m3 \gset

select is(public.list_availability_windows(pg_temp.at(:'d', '00:00'), pg_temp.at(:'d', '24:00')),
  jsonb_build_array(jsonb_build_object('startsAt', pg_temp.at(:'d', '09:00'), 'endsAt', pg_temp.at(:'d', '17:00'))),
  'weekly hours make one window on Monday');
select is(public.save_availability_exception('c0000000-0000-4000-a000-000000000001', 'time_off', pg_temp.at(:'d', '12:00'),
    pg_temp.at(:'d', '13:00'), false, 'Dentist')->'overlaps'->0->>'id', :'m3', 'time off warns about the meeting inside it');
select is((select status::text from public.meetings where id = :'m3'), 'scheduled', 'and leaves that meeting alone');
select is(jsonb_array_length(public.list_availability_windows(pg_temp.at(:'d', '00:00'), pg_temp.at(:'d', '24:00'))), 2,
  'time off splits the window');
select public.save_availability_exception('c0000000-0000-4000-a000-000000000002', 'extra_hours', pg_temp.at(:'sat', '10:00'),
  pg_temp.at(:'sat', '12:00')) is not null as ok \gset
select is(jsonb_array_length(public.list_availability_windows(pg_temp.at(:'sat', '00:00'), pg_temp.at(:'sat', '24:00'))), 1,
  'extra hours open a Saturday');

select pg_temp.reset_role();
select is((select starts_at from private.availability_windows(:matt, '2027-03-15 00:00-04', '2027-03-16 00:00-04')),
  '2027-03-15 13:00+00'::timestamptz, 'after the spring change, 9:00 is 9:00 daylight time');
select is((select starts_at from private.availability_windows(:matt, '2027-03-01 00:00-05', '2027-03-02 00:00-05')),
  '2027-03-01 14:00+00'::timestamptz, 'and before it, 9:00 standard time');

select pg_temp.act_as(:priya);
select is(public.remove_availability_exception('c0000000-0000-4000-a000-000000000001')->>'removed', 'false',
  'another coach cannot remove Matt''s time off');
select throws_ok(format('select public.save_availability_exception(%L, ''time_off'', %L, %L)', 'c0000000-0000-4000-a000-000000000001',
  pg_temp.at(:'d', '09:00'), pg_temp.at(:'d', '10:00')), '42501', null, 'or overwrite it');
select pg_temp.act_as(:user_maya);
select is((select count(*)::int from public.coach_availability_exceptions), 0, 'clients cannot read time off or its note');

-- ---------------------------------------------------------------------------
-- Open times
-- ---------------------------------------------------------------------------
select is(pg_temp.slots_on(:'m1', :'d'), 22, 'Monday: 9:00–11:00 and 13:00–16:00 every 15 minutes, around the time off');
select is(pg_temp.has_slot(:'m1', pg_temp.at(:'d', '15:00')), true, 'the meeting''s own time does not block it');
select is(pg_temp.first_on(:'m1', :'fri'), '11:00'::time, 'Friday starts after Daniel''s meeting');
select is(pg_temp.slots_on(:'m1', :'sat'), 5, 'Saturday''s extra hours fit five starts');
select pg_temp.act_as(:user_daniel);
select throws_ok(format('select public.list_open_times(%L)', :'m1'), '42501', null, 'another client cannot see a meeting''s open times');

select pg_temp.act_as(:matt);
select public.save_booking_rules(0, 90, 15) is not null as ok \gset
select pg_temp.act_as(:user_maya);
select is(pg_temp.first_on(:'m1', :'fri'), '11:15'::time, 'the buffer keeps a gap after meetings');
select pg_temp.act_as(:matt);
select public.save_booking_rules(0, 1, 0) is not null as ok \gset
select pg_temp.act_as(:user_maya);
select is(public.list_open_times(:'m1')->'times', '[]'::jsonb, 'nothing past the booking horizon');
select pg_temp.act_as(:matt);
select public.save_booking_rules(0, 90, 0) is not null as ok \gset

-- ---------------------------------------------------------------------------
-- Requests hold their time
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_maya);
select is(public.request_meeting_change('d0000000-0000-4000-a000-000000000001', :'m1', 'reschedule', '',
  pg_temp.at(:'fri', '13:00'))->>'late', 'false', 'a picked time needs no message, and days ahead is not short notice');
select is(pg_temp.has_slot(:'m1', pg_temp.at(:'fri', '13:00')), true, 'the client still sees the time they hold');

select pg_temp.act_as(:user_daniel);
select is(pg_temp.has_slot(:'m2', pg_temp.at(:'fri', '13:00')), false, 'a held time is hidden from other clients');
select is(pg_temp.has_slot(:'m2', pg_temp.at(:'fri', '12:00')), true, 'times clear of it stay open');
select throws_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', '''', %L)', 'd0000000-0000-4000-a000-000000000002',
  :'m2', pg_temp.at(:'fri', '12:30')), '55000', null, 'a time overlapping a hold is refused');
select throws_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', '''', %L)', 'd0000000-0000-4000-a000-000000000003',
  :'m2', pg_temp.at(:'fri', '17:00')), '55000', null, 'a time outside the coach''s hours is refused');

select pg_temp.act_as(:user_maya);
select public.withdraw_meeting_request('d0000000-0000-4000-a000-000000000001') is not null as ok \gset
select pg_temp.act_as(:user_daniel);
select is(pg_temp.has_slot(:'m2', pg_temp.at(:'fri', '13:00')), true, 'withdrawing releases the time');

select pg_temp.act_as(:user_maya);
select public.request_meeting_change('d0000000-0000-4000-a000-000000000004', :'m1', 'reschedule', '', pg_temp.at(:'fri', '13:00'))
  is not null as ok \gset
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '1 minute' where id = :'m1';
select pg_temp.act_as(:user_daniel);
select is(pg_temp.has_slot(:'m2', pg_temp.at(:'fri', '13:00')), true, 'an expired request releases the time');

select lives_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', ''None of these work'')',
  'd0000000-0000-4000-a000-000000000005', :'m2'), 'a message-only reschedule is still allowed');

-- Short notice: flagged when sent, never a late cancellation when accepted.
select pg_temp.act_as(:matt);
select public.add_meeting(:daniel, '{personal_training}', now() + interval '2 hours', 60)->>'id' as m4 \gset
select pg_temp.act_as(:user_daniel);
select is(public.request_meeting_change('d0000000-0000-4000-a000-000000000006', :'m4', 'reschedule', 'Stuck at work')->>'late', 'true',
  'a reschedule inside the late window is flagged short notice');
select pg_temp.act_as(:matt);
select is(public.respond_to_meeting_request('d0000000-0000-4000-a000-000000000006', true, pg_temp.at(:'fri', '15:00'), 60)->>'status',
  'scheduled', 'accepting it moves the meeting without a late status');

-- A coach with no availability: message only.
select pg_temp.act_as(:priya);
select public.add_meeting(:grace, '{personal_training}', now() + interval '5 days', 45)->>'id' as g1 \gset
select pg_temp.act_as(:user_grace);
select is(public.list_open_times(:'g1') - 'meetingId' - 'coachTimezone' - 'lateCancelHours',
  '{"billable":true,"durationMinutes":45,"hasAvailability":false,"times":[]}'::jsonb, 'no hours set: no open times');

select * from finish();
rollback;
