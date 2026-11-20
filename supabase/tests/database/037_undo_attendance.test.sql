-- Undo takes back the caller's latest attendance change without leaving an audit trail (decision 0048).
-- Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(9);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''

truncate public.meeting_schedules, public.meetings cascade;

select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{personal_training}', now() + interval '3 days', 60)->>'id' as m1 \gset
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '2 hours' where id = :'m1';

select pg_temp.act_as(:coach);
select public.record_attendance(:'m1', 'no_show') is not null as ok \gset

select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.undo_attendance(%L)', :'m1'), '42501', null, 'clients cannot undo');
select pg_temp.act_as(:admin);
select throws_ok(format('select public.undo_attendance(%L)', :'m1'), '55000', null, 'another staff member cannot undo someone else''s change');

select pg_temp.act_as(:coach);
select is(public.undo_attendance(:'m1')->>'status', 'scheduled', 'the coach undoes their recording');
select is((select count(*)::int from public.meeting_attendance_changes where meeting_id = :'m1'), 0, 'and neither the change nor the undo is logged');
select throws_ok(format('select public.undo_attendance(%L)', :'m1'), '55000', null, 'there is nothing left to undo');

-- A correction can be undone too, back to the recorded status, leaving the first recording logged.
select public.record_attendance(:'m1', 'completed') is not null as ok \gset
select public.correct_attendance(:'m1', 'no_show', '') is not null as ok \gset
select is(public.undo_attendance(:'m1')->>'status', 'completed', 'undoing a correction restores the recorded status');
select is((select jsonb_agg(to_status) from public.meeting_attendance_changes where meeting_id = :'m1'), '["completed"]'::jsonb,
  'only the recording stays logged');

-- Too old to undo: correct it instead.
select pg_temp.reset_role();
update public.meeting_attendance_changes set changed_at = now() - interval '20 minutes' where meeting_id = :'m1';
select pg_temp.act_as(:coach);
select throws_ok(format('select public.undo_attendance(%L)', :'m1'), '55000', null, 'changes older than 15 minutes cannot be undone');

select pg_temp.reset_role();
select throws_ok(format('update public.meetings set status = ''scheduled'' where id = %L', :'m1'), '55000', null,
  'the undo flag is not left set for later updates');

select * from finish();
rollback;
