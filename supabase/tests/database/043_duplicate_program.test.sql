-- Duplicating a training program, optionally replacing the original (decision 0061, FR-04, FR-06).
-- Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

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

-- Only this file's fixtures exist inside the rolled-back transaction.
truncate public.programs cascade;

-- Client A: "live" has published revision 1 plus a newer draft 2; "hidden" has only a draft;
-- "old" is published and archived.
insert into public.programs (id, client_id, enrollment_id, service)
select p.id, e.client_id, e.id, e.service
from public.service_enrollments e
cross join (values ('70000000-0000-4000-a000-000000000001'::uuid),
  ('70000000-0000-4000-a000-000000000002'::uuid), ('70000000-0000-4000-a000-000000000003'::uuid)) p(id)
where e.client_id = :client_a and e.service = 'mesocycle';

insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title, program_theme) values
  ('71000000-0000-4000-a000-000000000001', '70000000-0000-4000-a000-000000000001', :client_a, 1, 1, 'Published title', 'Size'),
  ('71000000-0000-4000-a000-000000000003', '70000000-0000-4000-a000-000000000002', :client_a, 1, 1, 'Draft only', ''),
  ('71000000-0000-4000-a000-000000000004', '70000000-0000-4000-a000-000000000003', :client_a, 1, 1, 'Archived', '');
insert into public.program_weeks (id, revision_id, week_index, label) values
  ('72000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000001', 1, 'Week 1'),
  ('72000000-0000-4000-a000-000000000002', '71000000-0000-4000-a000-000000000001', 2, 'Week 2');
update public.program_revisions set status = 'published', published_at = now()
where id in ('71000000-0000-4000-a000-000000000001', '71000000-0000-4000-a000-000000000004');
update public.programs set current_revision_id = '71000000-0000-4000-a000-000000000001' where id = '70000000-0000-4000-a000-000000000001';
update public.programs set current_revision_id = '71000000-0000-4000-a000-000000000004', archived_at = now() where id = '70000000-0000-4000-a000-000000000003';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title) values
  ('71000000-0000-4000-a000-000000000002', '70000000-0000-4000-a000-000000000001', :client_a, 2, 1, 'Draft title');
insert into public.program_weeks (id, revision_id, week_index, label) values
  ('72000000-0000-4000-a000-000000000003', '71000000-0000-4000-a000-000000000002', 1, 'Week 1');

\set live   '''70000000-0000-4000-a000-000000000001'''
\set hidden '''70000000-0000-4000-a000-000000000002'''
\set old    '''70000000-0000-4000-a000-000000000003'''
create temp table copies (name text primary key, id uuid);
grant all on copies to authenticated, anon;
create function pg_temp.doc(title text) returns jsonb language sql as $$
  select jsonb_build_object('schemaVersion', 1, 'service', 'mesocycle', 'title', title, 'programTheme', '',
    'sharedSections', '[]'::jsonb, 'weeks', '[]'::jsonb, 'resources', '[]'::jsonb, 'coachNotes', '')
$$;
grant execute on all functions in schema pg_temp to anon, authenticated;

-- Callers without access to the client can't duplicate.
select pg_temp.act_as(null);
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L))', :live, 'x'), '42501', null, 'anon cannot duplicate');
select pg_temp.act_as(:user_a);
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L))', :live, 'x'), '42501', null, 'a client cannot duplicate their own program');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L))', :live, 'x'), '42501', null, 'an unassigned coach cannot duplicate');

select pg_temp.act_as(:coach);
-- A plain copy: a new draft program beside the original, which is unchanged.
insert into copies values ('plain', public.duplicate_program(:live, pg_temp.doc('Plain copy')));
select isnt((select id from copies where name = 'plain'), :live::uuid, 'the copy is a new program');
select is((select title from public.program_revisions where program_id = (select id from copies where name = 'plain') and status = 'draft'), 'Plain copy', 'the copy is saved as a draft with the sent document');
select is((select count(*)::integer from public.program_revisions where program_id = (select id from copies where name = 'plain') and status = 'published'), 0, 'the copy is not published');
select is((select archived_at from public.programs where id = :live), null, 'a plain copy leaves the original live');
select is((select enrollment_id from public.programs where id = (select id from copies where name = 'plain')), (select enrollment_id from public.programs where id = :live), 'the copy belongs to the same service');

-- The document must be valid and for the same service.
select throws_ok(format('select public.duplicate_program(%L, %L::jsonb)', :live, (pg_temp.doc('x') || '{"service":"personal_training"}')::text), null, null, 'a copy for another service is refused');

-- Replace needs a live, published original.
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L), true)', :hidden, 'x'), '55000', null, 'replace refuses a never-published program');
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L), true)', :old, 'x'), '55000', null, 'replace refuses an archived program');
select lives_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L))', :old, 'From archive'), 'an archived program can still be copied');

-- Replace archives, so it needs publish rights; this coach has none for client A.
select throws_ok(format('select public.duplicate_program(%L, pg_temp.doc(%L), true)', :live, 'x'), '42501', null, 'replace needs publish rights');

-- Replace: the original is archived and the copy becomes current, together.
select pg_temp.act_as('00000000-0000-4000-a000-000000000001');
insert into copies values ('replace', public.duplicate_program(:live, pg_temp.doc('Next session'), true));
select isnt((select archived_at from public.programs where id = :live), null, 'replace archives the original');
select is((select current_program_id from public.service_enrollments where id = (select enrollment_id from public.programs where id = :live)), (select id from copies where name = 'replace'), 'replace makes the copy current');
select is((select archived_at from public.programs where id = (select id from copies where name = 'replace')), null, 'the replacing copy is live');

-- An invalid document is refused.
select throws_ok(format('select public.duplicate_program(%L, %L::jsonb, true)', (select id from copies where name = 'replace'), '{"schemaVersion":2}'), null, null, 'an invalid document is refused');

select pg_temp.reset_role();
select * from finish();
rollback;
