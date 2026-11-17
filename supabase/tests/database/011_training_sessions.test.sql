-- Mesocycle set logging (FR-04, FR-07, NFR-01, NFR-03; decision 0021). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(30);

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
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''

\set program  '''90000000-0000-4000-a000-000000000001'''
\set rev1     '''91000000-0000-4000-a000-000000000001'''
\set rev2     '''91000000-0000-4000-a000-000000000002'''
\set day1     '''93000000-0000-4000-a000-000000000001'''
\set day2     '''93000000-0000-4000-a000-000000000002'''
\set press    '''95000000-0000-4000-a000-000000000001'''
\set row_ex   '''95000000-0000-4000-a000-000000000002'''

truncate public.programs cascade;

-- Client A's mesocycle: revision 1 published (day 1: press 3 sets; day 2: row 2 sets).
insert into public.programs (id, client_id, enrollment_id, service)
select :program, e.client_id, e.id, e.service from public.service_enrollments e
where e.client_id = :client_a and e.service = 'mesocycle';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev1, :program, :client_a, 1, 1, 'Block');
insert into public.program_weeks (id, revision_id, week_index) values ('92000000-0000-4000-a000-000000000001', :rev1, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values
  (:day1, :rev1, '92000000-0000-4000-a000-000000000001', 0, 'Push'),
  (:day2, :rev1, '92000000-0000-4000-a000-000000000001', 1, 'Pull');
insert into public.program_sections (id, revision_id, day_id, position, title) values
  ('94000000-0000-4000-a000-000000000001', :rev1, :day1, 0, 'Main'),
  ('94000000-0000-4000-a000-000000000002', :rev1, :day2, 0, 'Main');
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, set_count_min, set_count_max, muscles) values
  (:press, :rev1, '94000000-0000-4000-a000-000000000001', 0, 'press', 'Press', 2, 3, '{Chest,Triceps}'),
  (:row_ex, :rev1, '94000000-0000-4000-a000-000000000002', 0, 'row', 'Row', 2, 2, '{Back}');
update public.program_revisions set status = 'published', published_at = now() where id = :rev1;
update public.programs set current_revision_id = :rev1 where id = :program;

-- Access ------------------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok(format('select public.start_session(%L, %L)', :program, :day1), '42501', null, 'anon cannot start a session');
select pg_temp.act_as(:user_b);
select throws_ok(format('select public.start_session(%L, %L)', :program, :day1), '42501', null, 'another client cannot start a session');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.start_session(%L, %L)', :program, :day1), '42501', null, 'an unassigned coach cannot start a session');

-- Client A logs day 1 ------------------------------------------------------------------
select pg_temp.act_as(:user_a);
select public.start_session(:program, :day1) ->> 'id' as session \gset
select is(public.start_session(:program, :day1) ->> 'id', :'session', 'starting again returns the same session');
select is((select revision_id::text from public.training_sessions where id = :'session'), :rev1, 'the session is pinned to the current revision');
select throws_ok(format('select public.start_session(%L, gen_random_uuid())', :program), '22023', null, 'unknown days are refused');

select lives_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000001', %L, %L, 1, 'external', 80, 'lb', 10)$$, :'session', :press), 'client logs set 1');
select lives_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000001', %L, %L, 1, 'external', 85, 'lb', 9)$$, :'session', :press), 'a retried save updates the same set');
select is((select count(*)::integer from public.logged_sets where session_id = :'session'), 1, 'retries never duplicate a set');
select is((select load_value from public.logged_sets where id = '96000000-0000-4000-a000-000000000001'), 85::numeric, 'the latest values are kept');
select lives_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000002', %L, %L, 2, 'bodyweight', null, null, 8.5)$$, :'session', :press), 'bodyweight and decimal reps log');
select lives_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000003', %L, %L, 3, null, null, null, null)$$, :'session', :press), 'an empty set keeps nulls');
select is((select reps from public.logged_sets where id = '96000000-0000-4000-a000-000000000003'), null, 'unentered reps stay null, not zero');
select throws_ok(format($$select public.save_logged_set(gen_random_uuid(), %L, %L, 4, 'external', 80, 'lb', 10)$$, :'session', :press), '22023', null, 'sets beyond the prescribed maximum are refused');
select throws_ok(format($$select public.save_logged_set(gen_random_uuid(), %L, %L, 1, 'external', 80, 'lb', 10)$$, :'session', :row_ex), '22023', null, 'exercises from another day are refused');
select throws_ok(format($$select public.save_logged_set(gen_random_uuid(), %L, %L, 2, 'external', 80, 'lb', 10)$$, :'session', :press), 'PT409', null, 'a second row for the same set number conflicts');
select throws_ok(format($$select public.save_logged_set(gen_random_uuid(), %L, %L, 1, 'external', 80, null, 10)$$, :'session', :press), '22023', null, 'a weight without a unit is refused');
select throws_ok($$select public.delete_logged_set('96000000-0000-4000-a000-000000000002')$$, '22023', null, 'only the last set can be removed');
select lives_ok($$select public.delete_logged_set('96000000-0000-4000-a000-000000000003')$$, 'the last set can be removed');
select throws_ok($$insert into public.logged_sets (id, session_id, client_id, revision_id, exercise_id, set_number) values (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 1)$$, '42501', null, 'direct table writes stay denied');
select is(jsonb_array_length(public.get_training_log(:program) -> 0 -> 'sets'), 2, 'client reads their log');
select is(public.get_training_log(:program) #> '{0,sets,0,muscles}', '["Chest", "Triceps"]'::jsonb, 'sets carry their exercise muscles');

-- Another client sees nothing; the assigned coach reads and corrects ---------------------------
select pg_temp.act_as(:user_b);
select is(public.get_training_log(:program), '[]'::jsonb, 'another client reads no sessions');
select throws_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000001', %L, %L, 1, 'external', 1, 'lb', 1)$$, :'session', :press), '42501', null, 'another client cannot edit the log');
select pg_temp.act_as(:coach);
select lives_ok(format($$select public.save_logged_set('96000000-0000-4000-a000-000000000001', %L, %L, 1, 'external', 90, 'lb', 9)$$, :'session', :press), 'the assigned coach corrects a set');
select is((public.get_training_log(:program) #>> '{0,sets,0,updatedByStaff}')::boolean, true, 'the correction is attributed to staff');
select lives_ok(format($$select public.update_session(%L, 'completed', '2026-11-16', 'Felt strong')$$, :'session'), 'the coach completes the session');
select pg_temp.reset_role();
select isnt((select completed_at from public.training_sessions where id = :'session'), null, 'completion is timestamped');

-- A later publish leaves the session on its revision ------------------------------------------
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev2, :program, :client_a, 2, 1, 'Block v2');
insert into public.program_weeks (id, revision_id, week_index) values ('92000000-0000-4000-a000-000000000001', :rev2, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values (:day1, :rev2, '92000000-0000-4000-a000-000000000001', 0, 'Push');
update public.program_revisions set status = 'published', published_at = now() where id = :rev2;
update public.programs set current_revision_id = :rev2 where id = :program;
select is((select revision_id::text from public.training_sessions where id = :'session'), :rev1, 'publishing a new revision does not move the session');
select throws_ok(format($$update public.training_sessions set revision_id = %L where id = %L$$, :rev2, :'session'), '55000', null, 'a session cannot change revision');

select * from finish();
rollback;
