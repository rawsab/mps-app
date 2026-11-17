-- Deleting archived services (decision 0038). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(17);

insert into public.service_enrollments (id, client_id, service, status, starts_on, ends_on, archived_at) values
 ('83000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', 'mesocycle', 'ended', '2026-01-01', '2026-02-01', now()),
 ('83000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000001', 'mesocycle', 'ended', '2026-02-02', '2026-03-01', now()),
 ('83000000-0000-4000-a000-000000000003', '10000000-0000-4000-b000-000000000001', 'mesocycle', 'ended', '2026-03-02', '2026-04-01', null);
insert into public.programs (id, client_id, enrollment_id, service) values
 ('84000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', '83000000-0000-4000-a000-000000000002', 'mesocycle');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000001')$$, '42501', null, 'assigned coach cannot delete a service');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000001')$$, '42501', null, 'client cannot delete a service');
select throws_ok($$delete from public.service_enrollments where id = '83000000-0000-4000-a000-000000000001'$$, '42501', null, 'browsers cannot delete enrollments directly');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000003')$$, '55000', null, 'an ended service must be archived first');
select throws_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000002')$$, 'PT409',
  'this service still has 1 program linked: delete them first, or keep the service archived', 'a service with programs is kept');
select lives_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000001')$$, 'admin deletes an empty archived service');
select lives_ok($$select public.delete_archived_service('83000000-0000-4000-a000-000000000001')$$, 'a retried delete succeeds');
reset role;
select is((select count(*)::int from public.service_enrollments where id = '83000000-0000-4000-a000-000000000001'), 0, 'the service is gone');
select is((select count(*)::int from public.programs where id = '84000000-0000-4000-a000-000000000001'), 1, 'linked program untouched');

-- With its programs: a published program with a logged workout goes too (owner decision).
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values ('85000000-0000-4000-a000-000000000001', '84000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', 1, 1, 'Old block');
insert into public.program_weeks (id, revision_id, week_index) values ('86000000-0000-4000-a000-000000000001', '85000000-0000-4000-a000-000000000001', 1);
insert into public.workout_days (id, revision_id, week_id, position, label)
values ('87000000-0000-4000-a000-000000000001', '85000000-0000-4000-a000-000000000001', '86000000-0000-4000-a000-000000000001', 0, 'Push');
update public.program_revisions set status = 'published', published_at = now() where id = '85000000-0000-4000-a000-000000000001';
update public.programs set current_revision_id = '85000000-0000-4000-a000-000000000001' where id = '84000000-0000-4000-a000-000000000001';
insert into public.training_sessions (client_id, program_id, revision_id, day_id)
values ('10000000-0000-4000-b000-000000000001', '84000000-0000-4000-a000-000000000001', '85000000-0000-4000-a000-000000000001', '87000000-0000-4000-a000-000000000001');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.archived_service_contents('83000000-0000-4000-a000-000000000002')$$, '42501', null, 'only an admin sees what would be deleted');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is(public.archived_service_contents('83000000-0000-4000-a000-000000000002'), '{"programs": 1, "published": 1, "loggedWorkouts": 1}'::jsonb,
  'the confirmation counts programs, published ones and logged workouts');
select is(public.delete_archived_service('83000000-0000-4000-a000-000000000002', true), '{"deletedPrograms": 1, "deletedWorkouts": 1}'::jsonb,
  'admin deletes the service with its programs');
reset role;
select is((select count(*)::int from public.programs where id = '84000000-0000-4000-a000-000000000001'), 0, 'the program is gone');
select is((select count(*)::int from public.program_revisions where program_id = '84000000-0000-4000-a000-000000000001'), 0, 'its published revision is gone');
select is((select count(*)::int from public.workout_days where id = '87000000-0000-4000-a000-000000000001'), 0, 'its content is gone');
select is((select count(*)::int from public.service_enrollments where id = '83000000-0000-4000-a000-000000000002'), 0, 'the service is gone');
select throws_ok($$delete from public.program_revisions where status = 'published'$$, '55000', null,
  'published revisions are immutable again once the purge ends');
select * from finish();
rollback;
