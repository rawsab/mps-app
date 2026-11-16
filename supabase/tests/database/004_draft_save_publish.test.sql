-- Draft save and publish functions (FR-04, FR-05, FR-06, NFR-01; roadmap §8 "Save draft" and
-- "Publish revision"; decisions 0004, 0005). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(50);

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
\set client_a    '''10000000-0000-4000-b000-000000000001'''
\set client_b    '''10000000-0000-4000-b000-000000000002'''

-- Documents (as the owner). "valid" exercises every load mode, a duration effort, per-set
-- targets, RIR 1-2 and RIR 0, an alternative, a shared warm-up and a resource.
create table pg_temp.drafts (name text primary key, doc jsonb not null);
grant select on pg_temp.drafts to anon, authenticated;
insert into pg_temp.drafts values ('valid', $json$
{
  "schemaVersion": 1, "service": "mesocycle", "title": "Block 2", "coachNotes": "Push the last set.",
  "sharedSections": [{
    "id": "30000000-0000-4000-d000-000000000001", "kind": "preparation", "title": "Warm-up", "instructions": "5 min bike",
    "exercises": [{
      "id": "31000000-0000-4000-d000-000000000001", "logicalKey": "hip-90-90", "name": "90/90 hip switch",
      "alternatives": [], "groupId": null, "demoUrl": null, "notes": "",
      "prescription": {"setCount": {"min": 1, "max": 1}, "targets": [
        {"effort": {"kind": "duration", "seconds": {"min": 45, "max": 45}, "perSide": true},
         "load": {"mode": "not_applicable"}, "rir": null, "rpe": null, "annotations": []}]}
    }]
  }],
  "weeks": [{
    "id": "32000000-0000-4000-d000-000000000001", "index": 1, "label": "Week 1", "startDate": "2026-11-23",
    "days": [{
      "id": "33000000-0000-4000-d000-000000000001", "label": "Upper A", "scheduledDate": null,
      "sections": [{
        "id": "30000000-0000-4000-d000-000000000002", "kind": "main", "title": "", "instructions": "",
        "exercises": [
          {"id": "31000000-0000-4000-d000-000000000002", "logicalKey": "incline-db-press", "name": "Incline DB Press",
           "alternatives": [{"id": "alt-1", "name": "Incline machine press"}], "groupId": "A",
           "demoUrl": "https://example.test/incline", "notes": "Pause at the bottom",
           "prescription": {"setCount": {"min": 2, "max": 2}, "targets": [
             {"effort": {"kind": "reps", "reps": {"min": 8, "max": 12}, "perSide": false},
              "load": {"mode": "external", "value": {"min": 50, "max": 55}, "unit": "lb"},
              "rir": {"min": 1, "max": 2}, "rpe": null, "annotations": []},
             {"effort": {"kind": "reps", "reps": {"min": 8.5, "max": 8.5}, "perSide": false},
              "load": {"mode": "external", "value": {"min": 45, "max": 45}, "unit": null},
              "rir": {"min": 0, "max": 0}, "rpe": null, "annotations": ["drop set"]}]}},
          {"id": "31000000-0000-4000-d000-000000000003", "logicalKey": "band-pull-apart", "name": "Band pull-apart",
           "alternatives": [], "groupId": "A", "demoUrl": null, "notes": "",
           "prescription": {"setCount": {"min": 2, "max": 3}, "targets": [
             {"effort": {"kind": "reps", "reps": {"min": 15, "max": 20}, "perSide": false},
              "load": {"mode": "band", "label": "light"}, "rir": null, "rpe": {"min": 7, "max": 8}, "annotations": []}]}},
          {"id": "31000000-0000-4000-d000-000000000004", "logicalKey": "pull-up", "name": "Pull-up",
           "alternatives": [], "groupId": null, "demoUrl": null, "notes": "",
           "prescription": {"setCount": {"min": 3, "max": 3}, "targets": [
             {"effort": {"kind": "reps", "reps": {"min": 6, "max": 8}, "perSide": false},
              "load": {"mode": "bodyweight", "added": {"value": 10, "unit": "kg"}},
              "rir": {"min": 2, "max": 2}, "rpe": null, "annotations": []}]}}
        ]
      }]
    }]
  }],
  "resources": [{"id": "34000000-0000-4000-d000-000000000001", "title": "Tempo guide", "body": "3-1-1", "url": null}]
}
$json$);

\set ex_press '''{weeks,0,days,0,sections,0,exercises,0}'''
insert into pg_temp.drafts
select 'renamed', jsonb_set(doc, '{title}', '"Block 2 (v2)"') from pg_temp.drafts where name = 'valid'
union all
select 'rir_text', jsonb_set(doc, (:ex_press::text[] || '{prescription,targets,0,rir}'::text[]), '"1-2"') from pg_temp.drafts where name = 'valid'
union all
select 'rir_inverted', jsonb_set(doc, (:ex_press::text[] || '{prescription,targets,0,rir}'::text[]), '{"min": 2, "max": 1}') from pg_temp.drafts where name = 'valid'
union all
select 'bad_id', jsonb_set(doc, (:ex_press::text[] || '{id}'::text[]), '"ex-1"') from pg_temp.drafts where name = 'valid'
union all
select 'wrong_service', jsonb_set(doc, '{service}', '"personal_training"') from pg_temp.drafts where name = 'valid'
union all
select 'target_count', jsonb_set(doc, (:ex_press::text[] || '{prescription,setCount}'::text[]), '{"min": 3, "max": 3}') from pg_temp.drafts where name = 'valid'
union all
select 'bad_date', jsonb_set(doc, '{weeks,0,startDate}', '"2026-02-30"') from pg_temp.drafts where name = 'valid'
union all
select 'bad_load', jsonb_set(doc, (:ex_press::text[] || '{prescription,targets,0,load}'::text[]), '{"mode": "kettlebell"}') from pg_temp.drafts where name = 'valid'
union all
select 'missing_notes', doc #- (:ex_press::text[] || '{notes}'::text[]) from pg_temp.drafts where name = 'valid'
union all
select 'rpe_high', jsonb_set(doc, '{weeks,0,days,0,sections,0,exercises,1,prescription,targets,0,rpe}',
  '{"min": 7, "max": 11}') from pg_temp.drafts where name = 'valid'
union all
select 'negative_load', jsonb_set(doc, (:ex_press::text[] || '{prescription,targets,0,load,value}'::text[]), '{"min": -5, "max": 10}') from pg_temp.drafts where name = 'valid'
union all
select 'negative_added', jsonb_set(doc, '{weeks,0,days,0,sections,0,exercises,2,prescription,targets,0,load,added,value}', '-10') from pg_temp.drafts where name = 'valid'
union all
select 'no_set_count', jsonb_set(doc, (:ex_press::text[] || '{prescription}'::text[]), '{"setCount": null, "targets": []}') from pg_temp.drafts where name = 'valid';

create function pg_temp.doc(n text) returns jsonb language sql as $$ select doc from pg_temp.drafts where name = n $$;
grant execute on function pg_temp.doc(text) to anon, authenticated;

select id as enr_a from public.service_enrollments where client_id = :client_a and service = 'mesocycle' \gset
select id as enr_a_nutrition from public.service_enrollments where client_id = :client_a and service = 'nutrition' \gset
select id as enr_b from public.service_enrollments where client_id = :client_b and service = 'personal_training' \gset

-- Creating programs -----------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok(format('select public.create_program(%L)', :'enr_a'), '42501', null, 'anon cannot create programs');
select throws_ok(format('select public.save_draft(gen_random_uuid(), null, %L)', '{}'), '42501', null, 'anon cannot save drafts');
select pg_temp.reset_role();

select pg_temp.act_as(:user_a);
select throws_ok(format('select public.create_program(%L)', :'enr_a'), '42501', null, 'a client cannot create a program');
select pg_temp.reset_role();

select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.create_program(%L)', :'enr_a'), '42501', null, 'an unassigned coach cannot create a program');
select pg_temp.reset_role();

select pg_temp.act_as(:coach);
select throws_ok(format('select public.create_program(%L)', :'enr_b'), '42501', null, 'a coach cannot create a program for an unassigned client');
select throws_ok(format('select public.create_program(%L)', :'enr_a_nutrition'), '22023', null, 'nutrition does not get a workout program');
select public.create_program(:'enr_a') as prog \gset
select isnt(:'prog'::uuid, null::uuid, 'the assigned coach creates a program');

-- Saving drafts ---------------------------------------------------------------------
select is(public.save_draft(:'prog', null, pg_temp.doc('valid')) ->> 'lockVersion', '1', 'expected version null creates the draft at version 1');
select is(public.get_program_draft(:'prog') -> 'draft', pg_temp.doc('valid'), 'the saved document reads back identically');
select is(public.get_program_draft(:'prog') ->> 'status', 'draft', 'the editor gets the working draft');
select results_eq(
  format($$select rir_min, rir_max from public.prescribed_sets ps join public.program_revisions r on r.id = ps.revision_id
           where r.program_id = %L and ps.rir_min is not null order by ps.rir_min desc, ps.position$$, :'prog'),
  $$values (2::numeric, 2::numeric), (1::numeric, 2::numeric), (0::numeric, 0::numeric)$$,
  'RIR 1-2 is a numeric range and RIR 0 stays zero');
select is(public.save_draft(:'prog', 1, pg_temp.doc('renamed')) ->> 'lockVersion', '2', 'a save at the current version moves to version 2');
select throws_ok(format('select public.save_draft(%L, 1, pg_temp.doc(%L))', :'prog', 'valid'),
  'PT409', null, 'a stale editor gets a conflict');
select throws_ok(format('select public.save_draft(%L, null, pg_temp.doc(%L))', :'prog', 'valid'),
  'PT409', null, 'a second draft cannot be started over an existing one');
select is(public.get_program_draft(:'prog') -> 'draft' ->> 'title', 'Block 2 (v2)', 'the conflicting save changed nothing');

-- Contract validation: each document is rejected and the draft is unchanged ------------
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'rir_text'), '22023', null, 'RIR as text is rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'rir_inverted'), '22023', null, 'an inverted RIR range is rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'bad_id'), '22023', null, 'non-uuid node ids are rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'wrong_service'), '22023', null, 'the service must match the program');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'target_count'), '22023', null, 'per-set targets must match the set count');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'bad_date'), '22023', null, 'impossible dates are rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'bad_load'), '22023', null, 'unknown load modes are rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'missing_notes'), '22023', null, 'missing required keys are rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'rpe_high'), '23514', null, 'RPE above 10 fails the table constraint');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'negative_load'), '23514', null, 'a negative external load is rejected');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'negative_added'), '23514', null, 'negative added bodyweight load is rejected');
select throws_ok(format('select public.save_draft(%L, 2, %L)', :'prog', '[]'), '22023', null, 'a non-object document is rejected');
select is(public.get_program_draft(:'prog') ->> 'lockVersion', '2', 'rejected saves leave the version unchanged');
select is(public.get_program_draft(:'prog') -> 'draft', pg_temp.doc('renamed'), 'rejected saves leave the content unchanged');

-- Publishing ------------------------------------------------------------------------
select throws_ok(format('select public.publish_revision(%L, 2)', :'prog'), '42501', null, 'a coach without can_publish cannot publish');
select pg_temp.reset_role();

select pg_temp.act_as(:user_a);
select throws_ok(format('select public.get_program_draft(%L)', :'prog'), '42501', null, 'the client cannot open the draft');
select throws_ok(format('select public.save_draft(%L, 2, pg_temp.doc(%L))', :'prog', 'valid'), '42501', null, 'the client cannot save the draft');
select throws_ok(format('select public.publish_revision(%L, 2)', :'prog'), '42501', null, 'the client cannot publish');
select is_empty('select 1 from public.programs', 'the client sees no program before publishing');
select pg_temp.reset_role();

select pg_temp.act_as(:admin);
select throws_ok(format('select public.publish_revision(%L, 1)', :'prog'), 'PT409', null, 'publishing a stale version is refused');
select is(public.save_draft(:'prog', 2, pg_temp.doc('no_set_count')) ->> 'lockVersion', '3', 'an incomplete draft can still be saved');
select throws_ok(format('select public.publish_revision(%L, 3)', :'prog'), 'PT422', null, 'an incomplete draft cannot be published');
select is((select current_revision_id from public.programs where id = :'prog'), null::uuid, 'a failed publish leaves no current revision');
select is(public.save_draft(:'prog', 3, pg_temp.doc('valid')) ->> 'lockVersion', '4', 'the draft is completed');
select pg_temp.reset_role();

update public.coach_clients set can_publish = true where coach_id = :coach and client_id = :client_a;
select pg_temp.act_as(:coach);
select is(public.publish_revision(:'prog', 4) ->> 'revisionNumber', '1', 'a coach granted can_publish publishes revision 1');
select throws_ok(format('select public.save_draft(%L, 4, pg_temp.doc(%L))', :'prog', 'valid'), 'PT409', null, 'the published revision is no longer a draft');
select is(public.get_program_draft(:'prog') ->> 'status', 'published', 'with no draft the editor gets the published revision');
select is(public.get_program_draft(:'prog') ->> 'lockVersion', null::text, 'the published revision has no lock version');
-- A new draft from the published document keeps the same node ids (decision 0005).
select is(public.save_draft(:'prog', null, public.get_program_draft(:'prog') -> 'draft') ->> 'revisionNumber', '2',
  'a draft started from the published revision reuses its node ids');
select is(public.save_draft(:'prog', 1, pg_temp.doc('renamed')) ->> 'lockVersion', '2', 'the new draft is editable');
select pg_temp.reset_role();

select pg_temp.act_as(:user_a);
select results_eq('select title from public.program_revisions', array['Block 2'], 'the client sees only the published revision');
select is((select count(*)::int from public.prescribed_sets), 5, 'the client reads the published targets');
select pg_temp.reset_role();

select pg_temp.act_as(:coach);
select is(public.publish_revision(:'prog', 2) ->> 'revisionNumber', '2', 'revision 2 is published');
select pg_temp.reset_role();
select is((select r.title from public.programs p join public.program_revisions r on r.id = p.current_revision_id where p.id = :'prog'),
  'Block 2 (v2)', 'the current pointer moves to revision 2');

update public.programs set archived_at = now() where id = :'prog';
select pg_temp.act_as(:coach);
select throws_ok(format('select public.save_draft(%L, null, pg_temp.doc(%L))', :'prog', 'valid'), '55000', null, 'an archived program accepts no drafts');
select pg_temp.reset_role();

select * from finish();
rollback;
