-- Clients list their archived training programs (decision 0060, PRD §4: drafts are staff-only).
-- Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

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
select throws_ok($$select public.list_archived_programs()$$, '42501', null, 'anon cannot list archived programs');

-- Client A sees the archived program only, with when it was archived.
select pg_temp.act_as(:user_a);
select is(jsonb_array_length(public.list_archived_programs()), 1, 'archived list hides current and draft-only programs');
select is(public.list_archived_programs() -> 0 ->> 'title', 'Archived', 'archived list shows the published title');
select isnt(public.list_archived_programs() -> 0 ->> 'archivedAt', null, 'archived list includes the archive date');
select is((public.list_archived_programs() -> 0 ->> 'isCurrent')::boolean, false, 'an archived program is never current');

-- Another client and staff callers get nothing: the list is the caller's own.
select pg_temp.act_as(:user_b);
select is(jsonb_array_length(public.list_archived_programs()), 0, 'client B lists none of client A''s archived programs');
select pg_temp.act_as(:coach);
select is(jsonb_array_length(public.list_archived_programs()), 0, 'a coach has no client archive of their own');

select pg_temp.reset_role();
select * from finish();
rollback;
