-- FR-04, FR-06, NFR-01: removal authorization, optimistic locking, immutable history.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into public.programs (id, client_id, enrollment_id, service)
select p.id, e.client_id, e.id, e.service
from public.service_enrollments e
cross join (values ('60000000-0000-4000-a000-000000000001'::uuid),
 ('60000000-0000-4000-a000-000000000002'::uuid)) p(id)
where e.client_id = '10000000-0000-4000-b000-000000000001' and e.service = 'mesocycle';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values ('61000000-0000-4000-a000-000000000001','60000000-0000-4000-a000-000000000001','10000000-0000-4000-b000-000000000001',1,1,'Draft to delete');
insert into public.program_weeks (id, revision_id, week_index, label)
values ('62000000-0000-4000-a000-000000000001','61000000-0000-4000-a000-000000000001',1,'Week');
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title, status, published_at)
values ('61000000-0000-4000-a000-000000000002','60000000-0000-4000-a000-000000000002','10000000-0000-4000-b000-000000000001',1,1,'Published history','published',now());
update public.programs set current_revision_id = '61000000-0000-4000-a000-000000000002'
where id = '60000000-0000-4000-a000-000000000002';

set local role anon;
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000001',1)$$, '42501', null, 'anonymous cannot remove programs');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}',true);
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000001',1)$$, '42501', null, 'client cannot delete own draft');
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000002',null,true)$$, '42501', null, 'client cannot archive own program');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}',true);
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000001',1)$$, '42501', null, 'unassigned coach cannot delete');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}',true);
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000002',null,true)$$, '42501', null, 'assigned coach without publish permission cannot archive');
select throws_ok($$delete from public.programs where id = '60000000-0000-4000-a000-000000000001'$$, '42501', null, 'direct table deletion stays denied');
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000001',null)$$, 'PT409', null, 'missing expected draft version conflicts');
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000001',2)$$, 'PT409', null, 'stale expected version conflicts');
select is(public.remove_program('60000000-0000-4000-a000-000000000001',1), 'deleted', 'assigned coach can delete unpublished program');
reset role;
select is((select count(*)::integer from public.programs where id = '60000000-0000-4000-a000-000000000001'),0,'program deleted');
select is((select count(*)::integer from public.program_weeks where revision_id = '61000000-0000-4000-a000-000000000001'),0,'draft content cascades');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select throws_ok($$select public.remove_program('60000000-0000-4000-a000-000000000002',null)$$, '55000', null, 'published program cannot be deleted even by admin');
select is(public.remove_program('60000000-0000-4000-a000-000000000002',null,true),'archived','admin archives published program');
select ok((select archived_at is not null and current_revision_id = '61000000-0000-4000-a000-000000000002' from public.programs where id = '60000000-0000-4000-a000-000000000002'),'archive preserves current revision');
select is((select title from public.program_revisions where id = '61000000-0000-4000-a000-000000000002'),'Published history','published content kept');
select throws_ok($$select public.save_draft('60000000-0000-4000-a000-000000000002',null,'{}')$$,'55000',null,'archived program rejects further edits');
select * from finish();
rollback;
