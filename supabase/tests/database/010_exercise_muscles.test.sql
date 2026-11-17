-- Exercise muscle groups (FR-05, FR-06, FR-10; decision 0021). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set admin    '''00000000-0000-4000-a000-000000000001'''
\set client_a '''10000000-0000-4000-b000-000000000001'''

create function pg_temp.doc(muscles jsonb) returns jsonb language plpgsql as $$
declare
  exercise jsonb := jsonb_build_object('id', '85000000-0000-4000-a000-000000000001', 'logicalKey', 'squat', 'name', 'Squat',
    'alternatives', '[]'::jsonb, 'groupId', null, 'demoUrl', null, 'notes', '',
    'prescription', jsonb_build_object('setCount', jsonb_build_object('min', 3, 'max', 3), 'targets', jsonb_build_array(jsonb_build_object(
      'effort', jsonb_build_object('kind', 'reps', 'reps', jsonb_build_object('min', 8, 'max', 12), 'perSide', false),
      'load', null, 'rir', jsonb_build_object('min', 1, 'max', 2), 'rpe', null, 'annotations', '[]'::jsonb))));
  section jsonb;
  day jsonb;
  week jsonb;
begin
  if muscles is not null then exercise := exercise || jsonb_build_object('muscles', muscles); end if;
  section := jsonb_build_object('id', '84000000-0000-4000-a000-000000000001', 'kind', 'main', 'title', 'Main', 'instructions', '', 'exercises', jsonb_build_array(exercise));
  day := jsonb_build_object('id', '83000000-0000-4000-a000-000000000001', 'label', 'Legs', 'scheduledDate', null, 'sections', jsonb_build_array(section));
  week := jsonb_build_object('id', '82000000-0000-4000-a000-000000000001', 'index', 1, 'label', '', 'startDate', null, 'useSections', false, 'days', jsonb_build_array(day));
  return jsonb_build_object('schemaVersion', 1, 'service', 'mesocycle', 'title', 'Block', 'programTheme', '', 'coachNotes', '',
    'sharedSections', '[]'::jsonb, 'resources', '[]'::jsonb, 'weeks', jsonb_build_array(week));
end $$;
grant execute on function pg_temp.doc(jsonb) to authenticated;

select id as enr from public.service_enrollments where client_id = :client_a and service = 'mesocycle' \gset

select pg_temp.act_as(:admin);
select public.create_program(:'enr') as program \gset
select lives_ok(format('select public.save_draft(%L, null, %L)', :'program', pg_temp.doc('["Quads", "Glutes"]')), 'muscles save with the draft');
select is((public.get_program_draft(:'program') #> '{draft,weeks,0,days,0,sections,0,exercises,0,muscles}'), '["Quads", "Glutes"]'::jsonb, 'muscles round-trip in order');
select lives_ok(format('select public.save_draft(%L, 1, %L)', :'program', pg_temp.doc(null)), 'an older document without muscles still saves');
select is((public.get_program_draft(:'program') #> '{draft,weeks,0,days,0,sections,0,exercises,0,muscles}'), '[]'::jsonb, 'missing muscles read back as none');
select throws_ok(format('select public.save_draft(%L, 2, %L)', :'program', pg_temp.doc('["Quads", ""]')), '22023', null, 'blank muscle names are refused');
select throws_ok(format('select public.save_draft(%L, 2, %L)', :'program', pg_temp.doc('["a","b","c","d","e","f","g","h","i"]')), '22023', null, 'more than 8 muscles are refused');
select throws_ok(format('select public.save_draft(%L, 2, %L)', :'program', pg_temp.doc('[3]')), '22023', null, 'non-text muscles are refused');

-- Published muscles are frozen like the rest of the revision.
select public.save_draft(:'program', 2, pg_temp.doc('["Quads"]'));
select public.publish_revision(:'program', 3);
reset role;
select throws_ok(format($$update public.program_exercises set muscles = '{Hamstrings}' where revision_id = (select current_revision_id from public.programs where id = %L)$$, :'program'),
  '55000', null, 'published muscles are immutable');

select * from finish();
rollback;
