-- FR-04/NFR-01: archived ended services retain history and existing admin-only management.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into public.service_enrollments (id, client_id, service, status, starts_on, ends_on) values
 ('81000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', 'mesocycle', 'ended', '2026-01-01', '2026-02-01');
insert into public.programs (id, client_id, enrollment_id, service) values
 ('82000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', '81000000-0000-4000-a000-000000000001', 'mesocycle');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.service_enrollments set archived_at = now() where id = '81000000-0000-4000-a000-000000000001'$$, 'admin can archive an ended service');
select ok((select archived_at is not null from public.service_enrollments where id = '81000000-0000-4000-a000-000000000001'), 'archive state persists');
select is((select count(*)::integer from public.programs where id = '82000000-0000-4000-a000-000000000001'), 1, 'linked program remains intact');
select throws_ok($$update public.service_enrollments set status = 'active', ends_on = null where id = '81000000-0000-4000-a000-000000000001'$$, '23514', null, 'archived service must stay ended');
select throws_ok($$update public.service_enrollments set status = 'paused' where id = '81000000-0000-4000-a000-000000000001'$$, '23514', null, 'paused services cannot be archived');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is_empty($$update public.service_enrollments set archived_at = null where id = '81000000-0000-4000-a000-000000000001' returning id$$, 'assigned coach cannot change enrollment archive state');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select is_empty($$update public.service_enrollments set archived_at = null where id = '81000000-0000-4000-a000-000000000001' returning id$$, 'client cannot change enrollment archive state');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$update public.service_enrollments set archived_at = null where id = '81000000-0000-4000-a000-000000000001'$$, 'archive state is reversible without deleting history');
reset role;
select * from finish();
rollback;
