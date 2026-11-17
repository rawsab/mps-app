-- Stimulus & Fatigue Tracking (FR-08, NFR-01, NFR-03; decision 0021). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

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
\set day1     '''93000000-0000-4000-a000-000000000001'''
\set day2     '''93000000-0000-4000-a000-000000000002'''
\set day3     '''93000000-0000-4000-a000-000000000003'''

truncate public.programs cascade;

-- Client A's mesocycle: day 1 trains Chest and Triceps, day 2 Back, day 3 Chest again.
insert into public.programs (id, client_id, enrollment_id, service)
select :program, e.client_id, e.id, e.service from public.service_enrollments e
where e.client_id = :client_a and e.service = 'mesocycle';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev1, :program, :client_a, 1, 1, 'Block');
insert into public.program_weeks (id, revision_id, week_index) values ('92000000-0000-4000-a000-000000000001', :rev1, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values
  (:day1, :rev1, '92000000-0000-4000-a000-000000000001', 0, 'Push'),
  (:day2, :rev1, '92000000-0000-4000-a000-000000000001', 1, 'Pull'),
  (:day3, :rev1, '92000000-0000-4000-a000-000000000001', 2, 'Push 2');
insert into public.program_sections (id, revision_id, day_id, position, title) values
  ('94000000-0000-4000-a000-000000000001', :rev1, :day1, 0, 'Main'),
  ('94000000-0000-4000-a000-000000000002', :rev1, :day2, 0, 'Main'),
  ('94000000-0000-4000-a000-000000000003', :rev1, :day3, 0, 'Main');
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, set_count_min, set_count_max, muscles) values
  ('95000000-0000-4000-a000-000000000001', :rev1, '94000000-0000-4000-a000-000000000001', 0, 'press', 'Press', 3, 3, '{Chest,Triceps}'),
  ('95000000-0000-4000-a000-000000000002', :rev1, '94000000-0000-4000-a000-000000000002', 0, 'row', 'Row', 2, 2, '{Back}'),
  ('95000000-0000-4000-a000-000000000003', :rev1, '94000000-0000-4000-a000-000000000003', 0, 'fly', 'Fly', 3, 3, '{Chest}');
update public.program_revisions set status = 'published', published_at = now() where id = :rev1;
update public.programs set current_revision_id = :rev1 where id = :program;

select pg_temp.act_as(:user_a);
select public.start_session(:program, :day1) ->> 'id' as s1 \gset
select public.start_session(:program, :day2) ->> 'id' as s2 \gset
select public.start_session(:program, :day3) ->> 'id' as s3 \gset

-- Client answers ----------------------------------------------------------------------
select lives_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 2, 1, null, null, null, null)$$, :'s1'), 'client saves partial stimulus answers');
select is((select disruption from public.muscle_feedback where session_id = :'s1'), null, 'an unanswered question stays null');
select lives_ok(format($$select public.save_muscle_feedback(%L, ' chest ', 2, 0, 3, null, null, null)$$, :'s1'), 'a second save replaces the answers');
select is((select count(*)::integer from public.muscle_feedback where session_id = :'s1'), 1, 'one row per session and muscle, matched case-insensitively');
select is((select pump from public.muscle_feedback where session_id = :'s1'), 0::smallint, 'zero is kept as an answer');
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 4, null, null, null, null, null)$$, :'s1'), '22023', null, 'scores above 3 are refused');
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Back', 1, null, null, null, null, null)$$, :'s1'), '22023', null, 'muscles not trained that day are refused');
select lives_ok(format($$select public.save_muscle_feedback(%L, 'Chest', null, null, null, 1, 2, %L)$$, :'s3', :'s1'), 'progression answers refer to the earlier chest day');
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', null, null, null, 1, 2, %L)$$, :'s3', :'s2'), '22023', null, 'the compared day must have trained the muscle');
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', null, null, null, 1, 2, %L)$$, :'s3', :'s3'), '22023', null, 'a session cannot compare with itself');
select throws_ok($$insert into public.muscle_feedback (session_id, client_id, muscle_key, muscle_name) values (gen_random_uuid(), gen_random_uuid(), 'x', 'x')$$, '42501', null, 'direct table writes stay denied');
select is((public.get_training_log(:program) #> '{0,feedback,0}') - 'updatedAt',
  jsonb_build_object('muscleKey', 'chest', 'muscleName', 'chest', 'challenge', 2, 'pump', 0, 'disruption', 3,
    'soreness', null, 'performance', null, 'comparedSessionId', null, 'updatedByStaff', false),
  'the log carries feedback');

-- Isolation and coach edits -------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 1, 1, 1, null, null, null)$$, :'s1'), '42501', null, 'anon cannot save feedback');
select pg_temp.act_as(:user_b);
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 1, 1, 1, null, null, null)$$, :'s1'), '42501', null, 'another client cannot save feedback');
select is((select count(*)::integer from public.muscle_feedback), 0, 'another client reads no feedback');
select pg_temp.act_as(:coach_other);
select throws_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 1, 1, 1, null, null, null)$$, :'s1'), '42501', null, 'an unassigned coach cannot save feedback');
select pg_temp.act_as(:coach);
select lives_ok(format($$select public.save_muscle_feedback(%L, 'Chest', 1, 1, 1, null, null, null)$$, :'s1'), 'the assigned coach corrects feedback');
select is((public.get_training_log(:program) #>> '{0,feedback,0,updatedByStaff}')::boolean, true, 'the correction is attributed to staff');

select * from finish();
rollback;
