-- Policy and integrity tests for templates and programs (FR-04, FR-05, FR-06, NFR-01;
-- roadmap §6 invariants 1, 2, 4, 5). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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
\set client_b    '''10000000-0000-4000-b000-000000000002'''
\set prog_a      '''20000000-0000-4000-c000-000000000001'''
\set prog_b      '''20000000-0000-4000-c000-000000000002'''
\set rev_a1      '''21000000-0000-4000-c000-000000000001'''
\set rev_a2      '''21000000-0000-4000-c000-000000000002'''
\set rev_b1      '''21000000-0000-4000-c000-000000000003'''
\set week_a1     '''22000000-0000-4000-c000-000000000001'''
\set week_a2     '''22000000-0000-4000-c000-000000000002'''
\set day_a1      '''23000000-0000-4000-c000-000000000001'''
\set day_a2      '''23000000-0000-4000-c000-000000000002'''
\set sec_a1      '''24000000-0000-4000-c000-000000000001'''
\set sec_a2      '''24000000-0000-4000-c000-000000000002'''
\set ex_a1       '''25000000-0000-4000-c000-000000000001'''
\set ex_a2       '''25000000-0000-4000-c000-000000000002'''
\set set_a1      '''26000000-0000-4000-c000-000000000001'''
\set tpl         '''27000000-0000-4000-c000-000000000001'''
\set tpl_v1      '''27100000-0000-4000-c000-000000000001'''

-- Fixtures (as the table owner) --------------------------------------------------
insert into public.templates (id, service, title) values (:tpl, 'mesocycle', 'Synthetic hypertrophy block');
insert into public.template_versions (id, template_id, version_number, schema_version, content)
  values (:tpl_v1, :tpl, 1, 1, '{"weeks": []}');
update public.template_versions set status = 'published', published_at = now() where id = :tpl_v1;

insert into public.programs (id, client_id, enrollment_id, service)
  select :prog_a, :client_a, id, 'mesocycle' from public.service_enrollments
  where client_id = :client_a and service = 'mesocycle';
insert into public.programs (id, client_id, enrollment_id, service)
  select :prog_b, :client_b, id, 'personal_training' from public.service_enrollments
  where client_id = :client_b and service = 'personal_training';

-- Client A: revision 1 published, revision 2 a working draft.
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title, source_kind, source_template_version_id)
  values (:rev_a1, :prog_a, :client_a, 1, 1, 'Block 1', 'template', :tpl_v1);
insert into public.program_weeks (id, revision_id, week_index) values (:week_a1, :rev_a1, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values (:day_a1, :rev_a1, :week_a1, 0, 'Upper A');
insert into public.program_sections (id, revision_id, day_id, position) values (:sec_a1, :rev_a1, :day_a1, 0);
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, set_count_min, set_count_max)
  values (:ex_a1, :rev_a1, :sec_a1, 0, 'incline-db-press', 'Incline DB Press', 3, 3);
insert into public.prescribed_sets (id, revision_id, exercise_id, position, effort_kind, effort_min, effort_max, per_side, rir_min, rir_max)
  values (:set_a1, :rev_a1, :ex_a1, 0, 'reps', 8, 12, false, 1, 2);
update public.program_revisions set status = 'published', published_at = now() where id = :rev_a1;
update public.programs set current_revision_id = :rev_a1 where id = :prog_a;

insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
  values (:rev_a2, :prog_a, :client_a, 2, 1, 'Block 1 (draft rename)');
insert into public.program_weeks (id, revision_id, week_index) values (:week_a2, :rev_a2, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values (:day_a2, :rev_a2, :week_a2, 0, 'Upper A');
insert into public.program_sections (id, revision_id, day_id, position) values (:sec_a2, :rev_a2, :day_a2, 0);
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name)
  values (:ex_a2, :rev_a2, :sec_a2, 0, 'incline-db-press', 'Incline DB Press (draft change)');

-- Client B: draft only, nothing published yet.
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
  values (:rev_b1, :prog_b, :client_b, 1, 1, 'PT draft');

-- Anonymous ---------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok('select count(*) from public.programs', '42501', null, 'anon cannot read programs');
select throws_ok('select count(*) from public.program_exercises', '42501', null, 'anon cannot read program content');
select pg_temp.reset_role();

-- Client A ------------------------------------------------------------------------
select pg_temp.act_as(:user_a);
select results_eq('select id from public.programs', array[:prog_a::uuid], 'client A sees only their own program');
select results_eq('select id from public.program_revisions', array[:rev_a1::uuid], 'client A sees only the published revision');
select is_empty(format('select 1 from public.program_revisions where id = %L', :rev_a2), 'client A cannot fetch the draft by id');
select is_empty(format('select 1 from public.program_exercises where revision_id = %L', :rev_a2), 'client A cannot read draft content');
select results_eq('select name from public.program_exercises', array['Incline DB Press'], 'client A reads published content only');
select results_eq('select rir_min, rir_max from public.prescribed_sets', $$values (1::numeric, 2::numeric)$$,
  'RIR 1-2 is stored as a numeric range');
select is_empty(format('select 1 from public.program_revisions where client_id = %L', :client_b), 'client A cannot read client B revisions');
select is_empty('select 1 from public.templates', 'client A cannot read templates');
select throws_ok(format('insert into public.program_revisions (program_id, client_id, revision_number, schema_version) values (%L, %L, 3, 1)', :prog_a, :client_a),
  '42501', null, 'client A cannot create revisions');
select throws_ok(format('update public.prescribed_sets set rir_min = 4, rir_max = 4 where id = %L', :set_a1),
  '42501', null, 'client A cannot change prescribed targets');
select pg_temp.reset_role();

-- Client B: has only a draft, so sees nothing ---------------------------------------
select pg_temp.act_as(:user_b);
select is_empty('select 1 from public.programs', 'client B cannot see a program with nothing published');
select is_empty('select 1 from public.program_revisions', 'client B cannot see their own draft');
select pg_temp.reset_role();

-- Disabled client loses access immediately ------------------------------------------
update public.clients set status = 'disabled' where id = :client_a;
select pg_temp.act_as(:user_a);
select is_empty('select 1 from public.program_exercises', 'disabled client cannot read published content');
select pg_temp.reset_role();
update public.clients set status = 'active' where id = :client_a;

-- Assigned coach --------------------------------------------------------------------
select pg_temp.act_as(:coach);
select results_eq('select id from public.programs', array[:prog_a::uuid], 'assigned coach sees only assigned client programs');
select results_eq('select revision_number from public.program_revisions order by 1', array[1, 2], 'assigned coach reads drafts');
select is((select count(*)::int from public.program_exercises), 2, 'assigned coach reads draft and published content');
select is((select count(*)::int from public.templates), 1, 'coach can read templates');
select throws_ok(format('update public.program_exercises set name = ''x'' where id = %L', :ex_a2),
  '42501', null, 'coach cannot write content directly; writes go through functions');
select pg_temp.reset_role();

-- Unassigned coach ------------------------------------------------------------------
select pg_temp.act_as(:coach_other);
select is_empty('select 1 from public.programs', 'unassigned coach sees no programs');
select is_empty('select 1 from public.program_weeks', 'unassigned coach sees no program content');
select pg_temp.reset_role();

-- Admin -----------------------------------------------------------------------------
select pg_temp.act_as(:admin);
select is((select count(*)::int from public.program_revisions), 3, 'admin reads every revision');
select throws_ok(format('insert into public.program_weeks (revision_id, week_index) values (%L, 2)', :rev_a2),
  '42501', null, 'admin cannot write content directly either');
select pg_temp.reset_role();

-- Immutability (enforced for every role, including the owner) -----------------------
select throws_ok(format('update public.program_revisions set title = ''changed'' where id = %L', :rev_a1),
  '55000', null, 'published revision cannot be edited');
select throws_ok(format('update public.program_revisions set status = ''draft'', published_at = null where id = %L', :rev_a1),
  '55000', null, 'published revision cannot be unpublished');
select throws_ok(format('delete from public.program_revisions where id = %L', :rev_a1),
  '55000', null, 'published revision cannot be deleted');
select throws_ok(format('update public.prescribed_sets set rir_min = 0 where id = %L', :set_a1),
  '55000', null, 'published targets cannot be edited');
select throws_ok(format('insert into public.program_weeks (revision_id, week_index) values (%L, 2)', :rev_a1),
  '55000', null, 'content cannot be added to a published revision');
select throws_ok(format('delete from public.program_exercises where id = %L', :ex_a1),
  '55000', null, 'published content cannot be removed');
select throws_ok(format('update public.template_versions set content = ''{}'' where id = %L', :tpl_v1),
  '55000', null, 'published template version cannot be edited');
select lives_ok(format('update public.program_exercises set name = ''Incline DB Press (edited)'' where id = %L', :ex_a2),
  'draft content is editable');

-- Lifecycle and parent-chain constraints --------------------------------------------
select throws_ok(format('insert into public.program_revisions (program_id, client_id, revision_number, schema_version) values (%L, %L, 3, 1)', :prog_a, :client_a),
  '23505', null, 'a program has at most one working draft');
select throws_ok(format('update public.programs set current_revision_id = %L where id = %L', :rev_a2, :prog_a),
  '55000', null, 'current revision must be published');
select throws_ok(format('update public.programs set current_revision_id = %L where id = %L', :rev_a1, :prog_b),
  '23503', null, 'current revision must belong to the same program');
select throws_ok(format('insert into public.program_revisions (program_id, client_id, revision_number, schema_version, status, published_at) values (%L, %L, 2, 1, ''published'', now())', :prog_b, :client_a),
  '23503', null, 'a revision cannot claim a different client than its program');
select throws_ok(format($$insert into public.programs (client_id, enrollment_id, service)
    select %L, id, 'personal_training' from public.service_enrollments where client_id = %L$$, :client_a, :client_b),
  '23503', null, 'a program cannot use another client''s enrollment');
select throws_ok(format('insert into public.workout_days (revision_id, week_id, position, label) values (%L, %L, 1, ''x'')', :rev_b1, :week_a2),
  '23503', null, 'a day cannot attach to a week in another revision');
select throws_ok(format('insert into public.prescribed_sets (revision_id, exercise_id, position, rir_min, rir_max) values (%L, %L, 1, 2, 1)', :rev_a2, :ex_a2),
  '23514', null, 'inverted RIR range is rejected');
select throws_ok(format($$insert into public.prescribed_sets (revision_id, exercise_id, position, load_mode, load_min, load_max) values (%L, %L, 1, 'band', 10, 10)$$, :rev_a2, :ex_a2),
  '23514', null, 'a band load cannot carry a weight');

select * from finish();
rollback;
