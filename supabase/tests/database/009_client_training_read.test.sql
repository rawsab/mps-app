-- Client Training readers (FR-03, FR-04, NFR-01, PRD §4: drafts are staff-only).
-- Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

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

-- Anonymous callers have no execute grant.
select pg_temp.act_as(null);
select throws_ok($$select public.list_published_programs()$$, '42501', null, 'anon cannot list published programs');
select throws_ok($$select public.get_published_program('70000000-0000-4000-a000-000000000001')$$, '42501', null, 'anon cannot read a published program');

-- Client A sees the live program only, as its published revision.
select pg_temp.act_as(:user_a);
select is(jsonb_array_length(public.list_published_programs()), 1, 'client list hides drafts-only and archived programs');
select is(public.list_published_programs() -> 0 ->> 'title', 'Published title', 'client list shows the published title, not the draft');
select is((public.list_published_programs() -> 0 ->> 'weekCount')::integer, 2, 'client list counts published weeks');
select is(public.get_published_program('70000000-0000-4000-a000-000000000001') ->> 'revisionNumber', '1', 'client reads the current revision');
select is(public.get_published_program('70000000-0000-4000-a000-000000000001') #>> '{document,title}', 'Published title', 'client reads published content, not the draft');
select is(jsonb_array_length(public.get_published_program('70000000-0000-4000-a000-000000000001') #> '{document,weeks}'), 2, 'client reads published weeks only');
select throws_ok($$select public.get_published_program('70000000-0000-4000-a000-000000000002')$$, '42501', null, 'client cannot read a never-published program');
select isnt(public.get_published_program('70000000-0000-4000-a000-000000000003') ->> 'archivedAt', null, 'archived program stays readable as history');

-- Another client and an unassigned coach see nothing.
select pg_temp.act_as(:user_b);
select is(jsonb_array_length(public.list_published_programs()), 0, 'client B lists none of client A''s programs');
select throws_ok($$select public.get_published_program('70000000-0000-4000-a000-000000000001')$$, '42501', null, 'client B cannot read client A''s program');
select pg_temp.act_as(:coach_other);
select throws_ok($$select public.get_published_program('70000000-0000-4000-a000-000000000001')$$, '42501', null, 'unassigned coach cannot read the program');

-- An assigned coach gets the client's published view, never the draft.
select pg_temp.act_as(:coach);
select is(public.get_published_program('70000000-0000-4000-a000-000000000001') #>> '{document,title}', 'Published title', 'assigned coach reads the published view, not the draft');

select pg_temp.reset_role();
select * from finish();
rollback;
