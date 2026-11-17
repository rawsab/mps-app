-- Client activity feed (FR-07, FR-08, NFR-01; decision 0023). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

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

\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''

\set program  '''90000000-0000-4000-a000-000000000001'''
\set rev1     '''91000000-0000-4000-a000-000000000001'''
\set rev2     '''91000000-0000-4000-a000-000000000002'''
\set week1    '''92000000-0000-4000-a000-000000000001'''
\set day1     '''93000000-0000-4000-a000-000000000001'''
\set day2     '''93000000-0000-4000-a000-000000000002'''
\set day3     '''93000000-0000-4000-a000-000000000003'''
\set press    '''95000000-0000-4000-a000-000000000001'''

-- Isolate the training-only fixture from nutrition activity created during local use.
-- This transaction is rolled back; development records are preserved.
truncate public.nutrition_daily_activity cascade;
truncate public.programs cascade;

-- Client A's mesocycle, one week: Push, Pull, Legs.
insert into public.programs (id, client_id, enrollment_id, service)
select :program, e.client_id, e.id, e.service from public.service_enrollments e
where e.client_id = :client_a and e.service = 'mesocycle';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev1, :program, :client_a, 1, 1, 'Block one');
insert into public.program_weeks (id, revision_id, week_index) values (:week1, :rev1, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values
  (:day1, :rev1, :week1, 0, 'Push'), (:day2, :rev1, :week1, 1, 'Pull'), (:day3, :rev1, :week1, 2, 'Legs');
insert into public.program_sections (id, revision_id, day_id, position, title) values
  ('94000000-0000-4000-a000-000000000001', :rev1, :day1, 0, 'Main'),
  ('94000000-0000-4000-a000-000000000002', :rev1, :day2, 0, 'Main');
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, set_count_min, set_count_max, muscles) values
  (:press, :rev1, '94000000-0000-4000-a000-000000000001', 0, 'press', 'Press', 3, 3, '{Chest}'),
  ('95000000-0000-4000-a000-000000000002', :rev1, '94000000-0000-4000-a000-000000000002', 0, 'row', 'Row', 2, 2, '{Back}');
update public.program_revisions set status = 'published', published_at = now() where id = :rev1;
update public.programs set current_revision_id = :rev1 where id = :program;

-- The client logs three days; the coach starts nothing.
select pg_temp.act_as(:user_a);
select public.start_session(:program, :day1) ->> 'id' as s1 \gset
select public.start_session(:program, :day2) ->> 'id' as s2 \gset
select public.start_session(:program, :day3) ->> 'id' as s3 \gset
select public.save_logged_set('96000000-0000-4000-a000-000000000001', :'s1', :press, 1, 'external', 80, 'lb', 10);
select public.save_logged_set('96000000-0000-4000-a000-000000000002', :'s1', :press, 2, 'external', 80, 'lb', 9);
select public.save_muscle_feedback(:'s1', 'Chest', 2, null, null, null, null, null);
select public.update_session(:'s2', 'skipped', null, '');

-- One transaction shares now(); spread the times so order is observable.
select pg_temp.reset_role();
alter table public.training_sessions disable trigger training_sessions_touch;
alter table public.logged_sets disable trigger user;
update public.training_sessions set updated_at = now() - interval '3 days' where id = :'s1';
update public.training_sessions set updated_at = now() - interval '2 days' where id = :'s2';
update public.training_sessions set updated_at = now() - interval '5 days' where id = :'s3';
update public.logged_sets set updated_at = now() - interval '1 day' where session_id = :'s1';
alter table public.muscle_feedback disable trigger user;
update public.muscle_feedback set updated_at = now() - interval '4 days' where session_id = :'s1';
alter table public.training_sessions enable trigger training_sessions_touch;
alter table public.logged_sets enable trigger user;
alter table public.muscle_feedback enable trigger user;

-- Access ------------------------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok(format($$select public.get_client_activity(%L)$$, :client_a), '42501', null, 'anon cannot read activity');
select pg_temp.act_as(:user_a);
select throws_ok(format($$select public.get_client_activity(%L)$$, :client_a), '42501', null, 'a client cannot read the staff feed, even their own');
select pg_temp.act_as(:user_b);
select throws_ok(format($$select public.get_client_activity(%L)$$, :client_a), '42501', null, 'another client cannot read activity');
select pg_temp.act_as(:coach_other);
select throws_ok(format($$select public.get_client_activity(%L)$$, :client_a), '42501', null, 'an unassigned coach cannot read activity');
select pg_temp.act_as(:coach);
select lives_ok(format($$select public.get_client_activity(%L)$$, :client_a), 'the assigned coach reads activity');
select throws_ok(format($$select public.get_client_activity(%L, null, null, 0)$$, :client_a), '22023', null, 'the limit is bounded');
select throws_ok(format($$select public.get_client_activity(%L, now(), null, 5)$$, :client_a), '22023', null, 'a half cursor is refused');

-- Content and order ---------------------------------------------------------------------------
select is((select array_agg(e ->> 'id') from jsonb_array_elements(public.get_client_activity(:client_a)) e),
  array[:'s1', :'s2', :'s3'], 'newest change first; logged sets move their session up');
select is((public.get_client_activity(:client_a) -> 0) - 'activityAt' - 'startedAt' - 'performedOn' - 'id',
  jsonb_build_object('kind', 'session', 'programId', :program, 'service', 'mesocycle', 'programTitle', 'Block one',
    'weekId', :week1, 'weekIndex', 0, 'dayId', :day1, 'dayIndex', 0, 'dayLabel', 'Push',
    'status', 'in_progress', 'completedAt', null,
    'setCount', 2, 'feedbackCount', 1, 'staffEdited', false),
  'an item summarises its session');
select is((public.get_client_activity(:client_a) #>> '{1,status}'), 'skipped', 'a skipped session is reported as skipped');
select is((public.get_client_activity(:client_a) #>> '{2,setCount}')::integer, 0, 'an empty session counts zero sets');

-- Pagination
select public.get_client_activity(:client_a, null, null, 1) -> 0 as first \gset
select is((select array_agg(e ->> 'id') from jsonb_array_elements(
    public.get_client_activity(:client_a, (:'first'::jsonb ->> 'activityAt')::timestamptz, (:'first'::jsonb ->> 'id')::uuid, 10)) e),
  array[:'s2', :'s3'], 'the cursor continues after the last item');

-- Coach corrections and later publishes
select public.save_logged_set('96000000-0000-4000-a000-000000000001', :'s1', :press, 1, 'external', 85, 'lb', 10);
select is((public.get_client_activity(:client_a) #>> '{0,staffEdited}')::boolean, true, 'a coach correction is attributed to staff');

select pg_temp.reset_role();
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev2, :program, :client_a, 2, 1, 'Block one (renamed)');
insert into public.program_weeks (id, revision_id, week_index) values (:week1, :rev2, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values (:day1, :rev2, :week1, 0, 'Upper');
update public.program_revisions set status = 'published', published_at = now() where id = :rev2;
update public.programs set current_revision_id = :rev2 where id = :program;
select pg_temp.act_as(:coach);
select is((public.get_client_activity(:client_a) #>> '{0,programTitle}'), 'Block one (renamed)', 'the program uses its current title');
select is((public.get_client_activity(:client_a) #>> '{0,dayLabel}'), 'Push', 'the day keeps its label from the logged revision');

select * from finish();
rollback;
