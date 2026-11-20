-- Restoring and permanently deleting archived programs (decision 0045). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Free the one-live-service slot so this file doesn't depend on the seed's enrollments.
update public.service_enrollments set status = 'ended', ends_on = greatest(starts_on, current_date)
  where client_id = '10000000-0000-4000-b000-000000000001' and service = 'personal_training' and status <> 'ended';

insert into public.service_enrollments (id, client_id, service, status, starts_on, ends_on, archived_at) values
 ('93000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', 'personal_training', 'active', '2026-01-01', null, null),
 ('93000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000001', 'personal_training', 'ended', '2025-01-01', '2025-06-01', null);
insert into public.programs (id, client_id, enrollment_id, service, archived_at) values
 ('94000000-0000-4000-a000-000000000001', '10000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000001', 'personal_training', now()),
 ('94000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000002', 'personal_training', now()),
 ('94000000-0000-4000-a000-000000000003', '10000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000001', 'personal_training', now()),
 ('94000000-0000-4000-a000-000000000004', '10000000-0000-4000-b000-000000000001', '93000000-0000-4000-a000-000000000001', 'personal_training', null);

-- Program 3: published, with a logged workout, and chosen as current.
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values ('95000000-0000-4000-a000-000000000001', '94000000-0000-4000-a000-000000000003', '10000000-0000-4000-b000-000000000001', 1, 1, 'Old block');
insert into public.program_weeks (id, revision_id, week_index) values ('96000000-0000-4000-a000-000000000001', '95000000-0000-4000-a000-000000000001', 1);
insert into public.workout_days (id, revision_id, week_id, position, label)
values ('97000000-0000-4000-a000-000000000001', '95000000-0000-4000-a000-000000000001', '96000000-0000-4000-a000-000000000001', 0, 'Push');
update public.program_revisions set status = 'published', published_at = now() where id = '95000000-0000-4000-a000-000000000001';
update public.programs set current_revision_id = '95000000-0000-4000-a000-000000000001' where id = '94000000-0000-4000-a000-000000000003';
insert into public.training_sessions (client_id, program_id, revision_id, day_id)
values ('10000000-0000-4000-b000-000000000001', '94000000-0000-4000-a000-000000000003', '95000000-0000-4000-a000-000000000001', '97000000-0000-4000-a000-000000000001');
update public.service_enrollments set current_program_id = '94000000-0000-4000-a000-000000000003' where id = '93000000-0000-4000-a000-000000000001';

set local role authenticated;

-- Restore
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.restore_program('94000000-0000-4000-a000-000000000001')$$, '42501', null, 'a client cannot restore a program');
select throws_ok($$update public.programs set archived_at = null where id = '94000000-0000-4000-a000-000000000001'$$, '42501', null, 'browsers cannot unarchive directly');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.restore_program('94000000-0000-4000-a000-000000000001')$$, '42501', null, 'a coach without publish rights cannot restore');
reset role;
update public.coach_clients set can_publish = true
  where coach_id = '00000000-0000-4000-a000-000000000002' and client_id = '10000000-0000-4000-b000-000000000001';
set local role authenticated;
select throws_ok($$select public.restore_program('94000000-0000-4000-a000-000000000002')$$, '55000', null, 'a program of an ended service stays archived');
select lives_ok($$select public.restore_program('94000000-0000-4000-a000-000000000001')$$, 'a coach who can publish restores a program');
select lives_ok($$select public.restore_program('94000000-0000-4000-a000-000000000001')$$, 'a retried restore succeeds');
select throws_ok($$select public.restore_program('94000000-0000-4000-a000-0000000000ff')$$, '42501', null, 'an unknown program is not found');

-- Delete
select throws_ok($$select public.delete_archived_program('94000000-0000-4000-a000-000000000003')$$, '42501', null, 'a coach cannot delete permanently');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.delete_archived_program('94000000-0000-4000-a000-000000000003')$$, '42501', null, 'a client cannot delete permanently');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.delete_archived_program('94000000-0000-4000-a000-000000000004')$$, '55000', null, 'a live program must be archived first');
select is(public.delete_archived_program('94000000-0000-4000-a000-000000000003'), '{"deletedWorkouts": 1}'::jsonb,
  'an admin deletes a published archived program with its logged workout');
select is(public.delete_archived_program('94000000-0000-4000-a000-000000000003'), '{"deletedWorkouts": 0}'::jsonb, 'a retried delete succeeds');
reset role;

select is((select archived_at from public.programs where id = '94000000-0000-4000-a000-000000000001'), null, 'the restored program is live again');
select isnt((select archived_at from public.programs where id = '94000000-0000-4000-a000-000000000002'), null, 'the refused restore changed nothing');
select is((select count(*)::int from public.programs where id = '94000000-0000-4000-a000-000000000003'), 0, 'the deleted program is gone');
select is((select count(*)::int from public.program_revisions where program_id = '94000000-0000-4000-a000-000000000003'), 0, 'its published revision is gone');
select is((select count(*)::int from public.workout_days where id = '97000000-0000-4000-a000-000000000001'), 0, 'its content is gone');
select is((select current_program_id from public.service_enrollments where id = '93000000-0000-4000-a000-000000000001'), null, 'the current-program pointer is cleared');
select throws_ok($$delete from public.program_revisions where status = 'published'$$, '55000', null,
  'published revisions are immutable again once the delete ends');
select * from finish();
rollback;
