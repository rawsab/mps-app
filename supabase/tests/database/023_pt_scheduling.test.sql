-- Personal training scheduling (decision 0037). Run with: pnpm test:db
-- Dates are relative to today so the suite never ages.
begin;
create extension if not exists pgtap with schema extensions;
select plan(80);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set maya        '''10000000-0000-4000-b000-000000000001'''
\set daniel      '''10000000-0000-4000-b000-000000000002'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set meet        '''https://meet.google.com/wdk-jmwy-nok'''
\set wed_only    '''[{"cycleWeek":1,"weekday":3,"startTime":"07:00","durationMinutes":60}]'''
\set tue_evening '''[{"cycleWeek":1,"weekday":2,"startTime":"18:00","durationMinutes":45}]'''

truncate public.meeting_schedules, public.meetings cascade;
-- Local data may give Maya a PT service; this suite needs a client without one.
update public.service_enrollments set status = 'ended', ends_on = current_date
  where client_id = :maya and service = 'personal_training' and status <> 'ended';
-- A Monday 8–14 days away: every date below is in the future whatever the time of day.
select current_date + (8 - extract(isodow from current_date)::integer) + 7 as mon \gset

-- ---------------------------------------------------------------------------
-- Structure
-- ---------------------------------------------------------------------------
select is((select count(*)::int from pg_class where relnamespace = 'public'::regnamespace and relrowsecurity
  and relname in ('meeting_schedules', 'meeting_schedule_slots', 'meetings', 'meeting_requests')), 4, 'RLS on every scheduling table');
select ok(not has_table_privilege('authenticated', 'public.meetings', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.meeting_schedules', 'INSERT, UPDATE, DELETE')
  and not has_table_privilege('authenticated', 'public.meeting_requests', 'INSERT, UPDATE, DELETE'), 'browsers cannot write scheduling tables');
select is((select count(*)::int from cron.job where jobname = 'meetings-top-up'), 1, 'hourly top-up is scheduled');

-- ---------------------------------------------------------------------------
-- Settings and time zones
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select throws_ok($$select public.save_scheduling_settings('http://meet.example.test/abc', 24)$$, '22023', null, 'meeting link must be https');
select throws_ok($$select public.save_scheduling_settings('https://meet.example.test/abc', 200)$$, '22023', null, 'late-cancel window is capped');
select is(public.save_scheduling_settings(:meet, 24)->>'meetingUrl', :meet, 'coach saves meeting link');
select is(public.set_my_timezone('America/Toronto'), 'America/Toronto', 'coach sets own time zone');
select throws_ok($$select public.set_my_timezone('Mars/Olympus')$$, '22023', null, 'unknown time zone rejected');
select pg_temp.act_as(:user_grace);
select throws_ok($$select public.save_scheduling_settings('https://meet.example.test/abc', 24)$$, '42501', null, 'clients have no scheduling settings');
select lives_ok($$select public.set_my_timezone('America/Vancouver')$$, 'client sets own time zone');
select pg_temp.reset_role();
select is((select timezone from public.clients where id = :grace), 'America/Vancouver', 'client time zone lands on the client record');
select is((select timezone from public.profiles where auth_user_id = :user_grace), 'America/Vancouver', 'profile copy kept in step');

-- ---------------------------------------------------------------------------
-- Recurrence preview (coach time zone, wall-clock times)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select is((select count(*)::int from jsonb_array_elements(public.preview_meeting_schedule(:grace, 1, null, :'mon',
    null, '[{"cycleWeek":1,"weekday":2,"startTime":"07:00","durationMinutes":60}]')) e
  where extract(isodow from (e->>'occurrenceOn')::date) = 2
    and to_char((e->>'startsAt')::timestamptz at time zone 'America/Toronto', 'HH24:MI') = '07:00'), 6, 'weekly Tuesday preview: six Tuesdays at 07:00 coach time');
select is((select array_agg(to_char((e->>'startsAt')::timestamptz at time zone 'UTC', 'HH24') order by e->>'startsAt')
  from jsonb_array_elements(public.preview_meeting_schedule(:grace, 1, null, '2027-03-01', null,
    '[{"cycleWeek":1,"weekday":2,"startTime":"07:00","durationMinutes":60}]', 3)) e), array['12', '12', '11'], '07:00 stays 07:00 across daylight saving');
select is((select array_agg((e->>'occurrenceOn')::date - :'mon'::date order by e->>'startsAt')
  from jsonb_array_elements(public.preview_meeting_schedule(:grace, 2, null, :'mon', null, :wed_only, 3)) e),
  array[2, 16, 30], 'every other Wednesday; week 2 has none');
select is((select array_agg((e->>'occurrenceOn')::date - :'mon'::date order by e->>'startsAt')
  from jsonb_array_elements(public.preview_meeting_schedule(:grace, 2, null, :'mon', null,
    '[{"cycleWeek":1,"weekday":1,"startTime":"07:00","durationMinutes":60},{"cycleWeek":2,"weekday":5,"startTime":"07:00","durationMinutes":60}]', 4)) e),
  array[0, 11, 14, 25], 'Monday in week 1, Friday in week 2');
select is((select array_agg((e->>'occurrenceOn')::date - :'mon'::date order by e->>'startsAt')
  from jsonb_array_elements(public.preview_meeting_schedule(:grace, 4, (:'mon'::date - 7), :'mon', null,
    '[{"cycleWeek":1,"weekday":1,"startTime":"07:00","durationMinutes":60}]', 2)) e),
  array[21, 49], 'a shifted anchor moves which week counts as week 1');
select throws_ok(format('select public.preview_meeting_schedule(%L, 5, null, %L, null, %L)', :grace, :'mon', :wed_only), '22023', null, 'cycles longer than 4 weeks rejected');
select throws_ok(format('select public.preview_meeting_schedule(%L, 1, null, %L, null, %L)', :grace, :'mon',
  '[{"cycleWeek":2,"weekday":3,"startTime":"07:00","durationMinutes":60}]'), '22023', null, 'slot outside the cycle rejected');
select throws_ok(format('select public.preview_meeting_schedule(%L, 1, null, %L, null, %L)', :grace, :'mon',
  '[{"weekday":3,"startTime":"07:00","durationMinutes":60}]'), '22023', null, 'slot missing its week rejected');
select throws_ok(format('select public.preview_meeting_schedule(%L, 1, null, %L, null, %L)', :grace, :'mon', '[]'), '22023', null, 'empty pattern rejected');

-- ---------------------------------------------------------------------------
-- Creating a pattern
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.create_meeting_schedule(%L, ''{personal_training}'', 1, null, %L, null, %L)', :grace, :'mon', :wed_only), '42501', null, 'unassigned coach cannot schedule');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.create_meeting_schedule(%L, ''{personal_training}'', 1, null, %L, null, %L)', :daniel, :'mon', :wed_only), '42501', null, 'coach cannot schedule another coach''s client');
select throws_ok(format('select public.create_meeting_schedule(%L, ''{personal_training}'', 1, null, %L, null, %L)', :grace, current_date - 1, :wed_only), '22023', null, 'pattern cannot start in the past');
select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.create_meeting_schedule(%L, ''{personal_training}'', 1, null, %L, null, %L)', :grace, :'mon', :wed_only), '42501', null, 'clients cannot schedule');
select pg_temp.act_as(:admin);
select throws_ok(format('select public.create_meeting_schedule(%L, ''{personal_training}'', 1, null, %L, null, %L)', :maya, :'mon', :wed_only), '55000', null, 'needs an active personal training service');

select pg_temp.act_as(:coach);
select public.create_meeting_schedule(:grace, '{personal_training}', 2, null, :'mon', null, :wed_only)->>'id' as sched \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.meetings where schedule_id = :'sched'),
  (select count(*)::int from generate_series(:'mon'::date + 2, (now() at time zone 'America/Toronto')::date + 84, interval '14 days')),
  'sessions generated every other Wednesday for 84 days');
select is((select count(*)::int from public.meetings where schedule_id = :'sched'
    and (extract(isodow from starts_at at time zone 'America/Toronto') <> 3 or to_char(starts_at at time zone 'America/Toronto', 'HH24:MI') <> '07:00'
      or coach_id <> :coach or timezone <> 'America/Toronto')), 0, 'each is Wednesday 07:00 coach time, with the primary coach');
select is(private.generate_meetings(:'sched', (now() at time zone 'America/Toronto')::date + 84), 0, 'generation is idempotent');

select id as o1 from public.meetings where schedule_id = :'sched' order by starts_at limit 1 offset 0 \gset
select id as o2 from public.meetings where schedule_id = :'sched' order by starts_at limit 1 offset 1 \gset
select id as o3, occurrence_on as o3_on from public.meetings where schedule_id = :'sched' order by starts_at limit 1 offset 2 \gset
select id as o4 from public.meetings where schedule_id = :'sched' order by starts_at limit 1 offset 3 \gset

-- ---------------------------------------------------------------------------
-- This session only
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select is((public.update_meeting(:'o1', (select starts_at + interval '1 day' from public.meetings where id = :'o1'), 60))->>'modified',
  'true', 'moving one occurrence marks it modified');
select is((select occurrence_on - :'mon'::date from public.meetings where id = :'o1'), 2, 'a moved occurrence keeps its original date');
select is(jsonb_array_length(public.add_meeting(:grace, '{personal_training}', (select starts_at + interval '30 minutes' from public.meetings where id = :'o2'), 60)->'overlaps'),
  1, 'one-off session reports the overlapping session');
select is(public.cancel_meeting(:'o2', 'Travel')->>'status', 'cancelled', 'coach cancels one occurrence');
select throws_ok(format('select public.update_meeting(%L, now() + interval ''20 days'', 60)', :'o2'), '55000', null, 'cancelled session cannot be moved');
select is(public.reinstate_meeting(:'o2')->>'status', 'scheduled', 'coach reinstates a cancelled session');
select lives_ok(format('select public.update_meeting(%L, %L::timestamptz + interval ''1 hour'', 60)', :'o3',
  (select starts_at from public.meetings where id = :'o3')), 'coach moves the third occurrence by an hour');

-- ---------------------------------------------------------------------------
-- This and following
-- ---------------------------------------------------------------------------
select public.change_meeting_schedule(:'sched', :'o3_on', '{personal_training}', 1, null, null, :tue_evening) as changed \gset
select is((:'changed'::jsonb)->>'keptMeetings', '1', 'moved occurrence after the change is kept');
select pg_temp.reset_role();
select (:'changed'::jsonb)->>'id' as sched2 \gset
select is((select ends_on from public.meeting_schedules where id = :'sched'), :'o3_on'::date - 1, 'old pattern ends the day before');
select is((select replaces_id from public.meeting_schedules where id = :'sched2'), :'sched'::uuid, 'new pattern records what it replaced');
select is((select count(*)::int from public.meetings where id in (:'o1', :'o2', :'o3')), 3, 'earlier and modified occurrences stay');
select is((select count(*)::int from public.meetings where id = :'o4'), 0, 'untouched later occurrences are removed');
select is((select count(*)::int from public.meetings where schedule_id = :'sched2'
  and (extract(isodow from starts_at at time zone 'America/Toronto') <> 2 or occurrence_on < :'o3_on'::date)), 0, 'new sessions are Tuesdays from the change date');
select throws_ok(format('update public.meeting_schedules set starts_on = starts_on - 7 where id = %L', :'sched'), '55000', null, 'patterns cannot be rewritten');

-- ---------------------------------------------------------------------------
-- Reading
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_grace);
select is(jsonb_array_length(public.list_meetings(now(), now() + interval '100 days')),
  (select count(*)::int from public.meetings where starts_at + make_interval(mins => duration_minutes) > now()), 'client lists own sessions');
select is((select count(*)::int from jsonb_array_elements(public.list_meetings(now(), now() + interval '100 days')) e
  where e->>'meetingUrl' = :meet), (select count(*)::int from public.meetings where starts_at > now()), 'client sees the coach meeting link');
select is(jsonb_array_length(public.get_meeting_schedules(:grace)), 2, 'client sees the ending and the new pattern');
select pg_temp.act_as(:user_b);
select is(jsonb_array_length(public.list_meetings(now(), now() + interval '100 days', :grace)), 0, 'another client sees nothing');
select pg_temp.act_as(:coach_other);
select is((select count(*)::int from public.meetings), 0, 'unassigned coach sees no sessions');
select pg_temp.act_as(null);
select throws_ok($$select public.list_meetings(now(), now() + interval '1 day')$$, '42501', null, 'anonymous cannot list sessions');

-- ---------------------------------------------------------------------------
-- Client requests
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{personal_training}', now() + interval '2 hours', 60)->>'id' as soon \gset
select pg_temp.reset_role();
select id as far1 from public.meetings where schedule_id = :'sched2' order by starts_at limit 1 offset 0 \gset
select id as far2 from public.meetings where schedule_id = :'sched2' order by starts_at limit 1 offset 1 \gset
select id as far3 from public.meetings where schedule_id = :'sched2' order by starts_at limit 1 offset 2 \gset
select id as far4 from public.meetings where schedule_id = :'sched2' order by starts_at limit 1 offset 3 \gset
select id as far5, occurrence_on as far5_on from public.meetings where schedule_id = :'sched2' order by starts_at limit 1 offset 4 \gset

select pg_temp.act_as(:user_grace);
select is(public.request_meeting_change('a0000000-0000-4000-a000-000000000001', :'soon', 'cancel', 'Sick')->>'late', 'true',
  'cancelling inside 24 hours is late');
select lives_ok(format('select public.request_meeting_change(%L, %L, ''cancel'', ''Sick'')', 'a0000000-0000-4000-a000-000000000001', :'soon'),
  'a retried request succeeds');
select throws_ok(format('select public.request_meeting_change(%L, %L, ''cancel'', ''Again'')', 'a0000000-0000-4000-a000-000000000002', :'soon'),
  'PT409', null, 'one open request per session');
select throws_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', ''  '')', 'a0000000-0000-4000-a000-000000000003', :'far2'),
  '22023', null, 'a reschedule needs a message');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.cancel_meeting(%L)', :'soon'), 'PT409', null, 'coach answers the request before changing the session');
select is(public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000001', true)->>'status', 'late_cancelled',
  'accepting a late cancellation marks it late');
select is((select cancelled_by from public.meetings where id = :'soon'), :user_grace::uuid, 'the client is recorded as cancelling');

select pg_temp.act_as(:user_grace);
select is(public.request_meeting_change('a0000000-0000-4000-a000-000000000004', :'far1', 'cancel', '')->>'late', 'false',
  'cancelling days ahead is not late');
select public.request_meeting_change('a0000000-0000-4000-a000-000000000005', :'far2', 'reschedule', 'Thursday instead?',
  (select starts_at + interval '2 days' from public.meetings where id = :'far2')) is not null as ok \gset
select pg_temp.act_as(:coach);
select is(public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000004', true)->>'status', 'cancelled', 'an early cancellation is free');
select is((public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000005', true))->>'status', 'scheduled',
  'accepting a reschedule keeps the session scheduled');
select pg_temp.reset_role();
select is((select (starts_at at time zone 'America/Toronto')::date - occurrence_on from public.meetings where id = :'far2'), 2,
  'the session moves to the client''s preferred time');

select pg_temp.act_as(:user_grace);
select lives_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', ''Later?'')', 'a0000000-0000-4000-a000-000000000006', :'far3'),
  'client asks to reschedule without a time');
select pg_temp.act_as(:coach);
select is((select e->'request'->>'status' from jsonb_array_elements(public.list_meetings(now(), now() + interval '100 days', :grace)) e
  where e->>'id' = :'far3'), 'pending', 'coach sees the open request on the session');
select throws_ok($$select public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000006', true)$$, '22023', null,
  'accepting a reschedule needs a new time');
select lives_ok($$select public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000006', false, null, null, 'Can''t that day')$$,
  'coach declines');

select pg_temp.act_as(:user_grace);
select lives_ok(format('select public.request_meeting_change(%L, %L, ''cancel'', '''')', 'a0000000-0000-4000-a000-000000000007', :'far3'),
  'client asks to cancel');
select pg_temp.act_as(:user_b);
select throws_ok($$select public.withdraw_meeting_request('a0000000-0000-4000-a000-000000000007')$$, '42501', null, 'another client cannot withdraw it');
select pg_temp.act_as(:user_grace);
select is(public.withdraw_meeting_request('a0000000-0000-4000-a000-000000000007')->>'status', 'withdrawn', 'client withdraws');

select lives_ok(format('select public.request_meeting_change(%L, %L, ''reschedule'', ''Earlier?'', now() + interval ''3 days'')',
  'a0000000-0000-4000-a000-000000000008', :'far4'), 'client asks to reschedule');
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '1 minute' where id = :'far4';
select pg_temp.act_as(:coach);
select throws_ok($$select public.respond_to_meeting_request('a0000000-0000-4000-a000-000000000008', true)$$, '55000', null,
  'a reschedule cannot be accepted once the session starts');
select pg_temp.reset_role();
select private.top_up_meetings();
select is((select status::text from public.meeting_requests where id = 'a0000000-0000-4000-a000-000000000008'), 'expired', 'top-up expires it');
select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.request_meeting_change(%L, %L, ''cancel'', '''')', 'a0000000-0000-4000-a000-000000000009', :'far4'),
  '55000', null, 'started sessions take no requests');
select throws_ok(format('select public.cancel_meeting(%L)', :'far5'), '42501', null, 'clients cannot cancel directly');

select lives_ok(format('select public.request_meeting_change(%L, %L, ''cancel'', '''')', 'a0000000-0000-4000-a000-00000000000a', :'far5'),
  'client asks to cancel a later session');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.change_meeting_schedule(%L, %L, ''{personal_training}'', 1, null, null, %L)', :'sched2', :'far5_on', :wed_only), 'PT409', null,
  'pattern changes wait for open requests on removed sessions');
select pg_temp.act_as(:user_grace);
select public.withdraw_meeting_request('a0000000-0000-4000-a000-00000000000a') is not null as ok \gset

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------
select pg_temp.reset_role();
update public.meetings set status = 'completed' where id = :'o1';
select throws_ok(format('update public.meetings set starts_at = starts_at + interval ''1 hour'' where id = %L', :'o1'), '55000', null,
  'attended sessions are frozen');

update public.clients set primary_coach_id = :admin where id = :grace;
select is((select count(*)::int from public.meetings where client_id = :grace and status = 'scheduled' and starts_at > now()
  and coach_id is distinct from :admin), 0, 'future sessions follow a new primary coach');
select is((select coach_id from public.meetings where id = :'far1'), :coach::uuid, 'cancelled sessions keep their coach');
update public.clients set primary_coach_id = :coach where id = :grace;

update public.service_enrollments set status = 'paused' where client_id = :grace and service = 'personal_training';
delete from public.meetings where id = :'far5';
select is(private.generate_meetings(:'sched2', (now() at time zone 'America/Toronto')::date + 84), 0, 'paused service generates nothing');
update public.service_enrollments set status = 'active' where client_id = :grace and service = 'personal_training';
select is(private.generate_meetings(:'sched2', (now() at time zone 'America/Toronto')::date + 84), 1, 'resumed service fills the gap');

update public.clients set status = 'disabled' where id = :grace;
select pg_temp.act_as(:user_grace);
select is((select count(*)::int from public.meetings), 0, 'a disabled client loses access');
select pg_temp.reset_role();

select * from finish();
rollback;
