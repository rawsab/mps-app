-- "Mark all completed" records every meeting or none (decision 0048). Run with: pnpm test:db
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

\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''

truncate public.meeting_schedules, public.meetings cascade;

select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{personal_training}', now() + interval '3 days', 60)->>'id' as m1 \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '4 days', 60)->>'id' as m2 \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '5 days', 60)->>'id' as future \gset
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '2 days' where id = :'m1';
update public.meetings set starts_at = now() - interval '1 day' where id = :'m2';

select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.record_attendance_many(array[%L]::uuid[])', :'m1'), '42501', null, 'clients cannot record attendance');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.record_attendance_many(array[%L]::uuid[])', :'m1'), '42501', null, 'unassigned coach cannot record attendance');

select pg_temp.act_as(:coach);
select throws_ok('select public.record_attendance_many(array[]::uuid[])', '22023', null, 'an empty list is refused');
select throws_ok(format('select public.record_attendance_many(array[%L, %L]::uuid[], ''cancelled'')', :'m1', :'m2'), '22023', null,
  'only completed or no-show');
select throws_ok(format('select public.record_attendance_many(array[%L, %L, %L]::uuid[])', :'m1', :'m2', :'future'), '55000', null,
  'a future meeting in the list refuses the whole batch');
select is((select count(*)::int from public.meetings where id in (:'m1', :'m2') and status = 'scheduled'), 2, 'and records none of it');

select is(public.record_attendance_many(array[:'m1', :'m2', :'m1']::uuid[])->>'recorded', '2', 'coach marks every meeting completed once');
select is((select count(*)::int from public.meetings where id in (:'m1', :'m2') and status = 'completed'), 2, 'both are completed');
select is((select count(*)::int from public.meeting_attendance_changes where meeting_id in (:'m1', :'m2') and to_status = 'completed'), 2,
  'and each is audited');

select * from finish();
rollback;
