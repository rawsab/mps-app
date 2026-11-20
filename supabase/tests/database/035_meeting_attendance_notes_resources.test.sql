-- Attendance, shared notes and resources on meetings (decision 0047). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(51);

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
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set daily       '''[{"cycleWeek":1,"weekday":1,"startTime":"07:00","durationMinutes":60},{"cycleWeek":1,"weekday":3,"startTime":"07:00","durationMinutes":60}]'''

truncate public.meeting_schedules, public.meetings cascade;
select current_date + (8 - extract(isodow from current_date)::integer) as mon \gset

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{personal_training}', now() + interval '3 days', 60)->>'id' as future \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '4 days', 60)->>'id' as past \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '5 days', 60)->>'id' as older \gset
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '2 hours' where id = :'past';
update public.meetings set starts_at = now() - interval '9 days' where id = :'older';

select pg_temp.act_as(:coach);
select throws_ok(format('select public.record_attendance(%L, ''completed'')', :'future'), '55000', null, 'attendance waits until the meeting starts');
select throws_ok(format('select public.record_attendance(%L, ''cancelled'')', :'past'), '22023', null, 'attendance is completed or no-show only');
select ok(exists (select 1 from jsonb_array_elements(public.list_meetings_needing_attendance()) e where e->>'id' = :'past'),
  'an ended meeting without attendance is a to-do');
select ok(not exists (select 1 from jsonb_array_elements(public.list_meetings_needing_attendance()) e where e->>'id' = :'future'),
  'a future meeting is not');

select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.record_attendance(%L, ''completed'')', :'past'), '42501', null, 'clients cannot record attendance');
select throws_ok('select public.list_meetings_needing_attendance()', '42501', null, 'clients cannot list attendance to-dos');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.record_attendance(%L, ''completed'')', :'past'), '42501', null, 'unassigned coach cannot record attendance');

select pg_temp.act_as(:coach);
select is(public.record_attendance(:'past', 'completed')->>'status', 'completed', 'coach records the meeting as completed');
select ok(not exists (select 1 from jsonb_array_elements(public.list_meetings_needing_attendance()) e where e->>'id' = :'past'),
  'a recorded meeting leaves the to-dos');
select throws_ok(format('select public.record_attendance(%L, ''no_show'')', :'past'), '55000', null, 'recording again is refused');
select is((select count(*)::int from public.meeting_attendance_changes where meeting_id = :'past' and from_status = 'scheduled' and to_status = 'completed'),
  1, 'recording is audited');

select pg_temp.reset_role();
select throws_ok(format('update public.meetings set status = ''no_show'' where id = %L', :'past'), '55000', null,
  'recorded attendance cannot change without an audit row');

select pg_temp.act_as(:coach);
select is(public.correct_attendance(:'past', 'no_show', '  ')->>'status', 'no_show', 'a correction can leave out the reason');
select throws_ok(format('select public.correct_attendance(%L, ''no_show'', ''Same'')', :'past'), '22023', null, 'a correction must change the status');
select throws_ok(format('select public.correct_attendance(%L, ''completed'', ''Wrong'')', :'future'), '55000', null,
  'only recorded attendance can be corrected');
select is(public.correct_attendance(:'past', 'completed', 'Client joined late')->>'status', 'completed', 'coach corrects back to completed');
select is(public.correct_attendance(:'past', 'scheduled', 'Not sure yet')->>'status', 'scheduled', 'coach sets it back to not recorded');
select is((public.get_meeting(:'past')->'attendanceChanges'->3->>'reason'), 'Not sure yet', 'staff see the audit with reasons');
select is((public.get_meeting(:'past')->'attendanceChanges'->0->>'changedByName'), 'Priya Nair', 'and who made each change');
select is(public.record_attendance(:'past', 'completed')->>'status', 'completed', 'a meeting set back can be recorded again');

select pg_temp.act_as(:user_grace);
select is(jsonb_array_length(public.get_meeting(:'past')->'attendanceChanges'), 0, 'clients do not see the attendance audit');
select is((select count(*)::int from public.meeting_attendance_changes), 0, 'clients cannot read the audit table');

-- ---------------------------------------------------------------------------
-- Shared notes
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.save_meeting_notes(:'past', 'Knee still sore; keep an eye on it.') is not null as ok \gset
select is(public.save_meeting_shared_notes(:'past', '  Great session. Keep the tempo at 3-1-1.  ')->>'sharedNotes',
  'Great session. Keep the tempo at 3-1-1.', 'coach saves trimmed shared notes');
select pg_temp.act_as(:user_grace);
select is(public.get_meeting(:'past')->>'sharedNotes', 'Great session. Keep the tempo at 3-1-1.', 'the client reads the shared notes');
select is(public.get_meeting(:'past')->>'notes', null, 'but not the private notes');
select throws_ok(format('select public.save_meeting_shared_notes(%L, ''Mine'')', :'past'), '42501', null, 'clients cannot write shared notes');
select pg_temp.act_as(:user_a);
select is((select count(*)::int from public.meeting_shared_notes where meeting_id = :'past'), 0, 'another client cannot read them');
select pg_temp.act_as(:coach_other);
select is((select count(*)::int from public.meeting_shared_notes where meeting_id = :'past'), 0, 'nor can an unassigned coach');
select pg_temp.act_as(:coach);
select is(public.save_meeting_shared_notes(:'past', '')->>'sharedNotes', null, 'blank shared notes are removed');
select public.save_meeting_shared_notes(:'past', 'Great session.') is not null as ok \gset

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
select format('%s/%s/%s.pdf', :grace, :'past', gen_random_uuid()) as file \gset
select format('%s/%s/%s.png', :grace, :'past', gen_random_uuid()) as orphan \gset

select pg_temp.reset_role();
select is((select public from storage.buckets where id = 'meeting-resources'), false, 'resources bucket is private');
select is((select file_size_limit from storage.buckets where id = 'meeting-resources'), 52428800::bigint, 'and caps files at 50 MB');

select pg_temp.act_as(:coach_other);
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''meeting-resources'', %L)', :'file'), '42501', null,
  'unassigned coach cannot upload');
select pg_temp.act_as(:coach);
select throws_ok(format('insert into storage.objects (bucket_id, name) values (''meeting-resources'', %L)',
  format('%s/%s/%s.pdf', '10000000-0000-4000-b000-000000000001', :'past', gen_random_uuid())), '42501', null,
  'a meeting can''t be filed under another client');
select throws_ok(format('select public.add_meeting_resource(%L, %L, ''Plan'')', :'past', :'file'), '22023', null, 'a file must be uploaded first');
select lives_ok(format('insert into storage.objects (bucket_id, name, metadata) values (''meeting-resources'', %L, ''{"mimetype":"application/pdf","size":1200}'')', :'file'),
  'coach uploads into the meeting folder');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (''meeting-resources'', %L)', :'orphan'), 'an upload that is never recorded');
select throws_ok(format('select public.add_meeting_resource(%L, %L, ''Plan'')', :'future', :'file'), '22023', null,
  'a file is only recorded on its own meeting');
select is(public.add_meeting_resource(:'past', :'file', ' Week 3 plan ')->'resources'->0->>'title', 'Week 3 plan', 'coach records the file');
select is((public.get_meeting(:'past')->'resources'->0->>'sizeBytes')::int, 1200, 'with its size from storage');
select throws_ok(format('select public.add_meeting_link(%L, ''http://video.example.test/a'', ''Video'')', :'past'), '22023', null, 'links must be https');
select is(public.add_meeting_link(:'past', 'https://video.example.test/a', '')->'resources'->1->>'title', 'https://video.example.test/a',
  'a link without a title uses its address');

select pg_temp.act_as(:user_grace);
select is(jsonb_array_length(public.get_meeting(:'past')->'resources'), 2, 'the client sees the resources');
select is((select count(*)::int from storage.objects where bucket_id = 'meeting-resources' and name in (:'file', :'orphan')), 1,
  'and can read recorded files only');
select throws_ok(format('select public.remove_meeting_resource(%L)', (public.get_meeting(:'past')->'resources'->0->>'id')), '42501', null,
  'clients cannot remove resources');
select pg_temp.act_as(:user_a);
select is((select count(*)::int from storage.objects where bucket_id = 'meeting-resources'), 0, 'another client reads no files');

select pg_temp.act_as(:coach);
select is(public.remove_meeting_resource((public.get_meeting(:'past')->'resources'->0->>'id')::uuid)->>'storagePath', :'file',
  'removing returns the file path to delete from storage');
select is(jsonb_array_length(public.get_meeting(:'past')->'resources'), 1, 'and the row is gone');

-- ---------------------------------------------------------------------------
-- Past meetings
-- ---------------------------------------------------------------------------
select is((select jsonb_agg(e->>'id') from jsonb_array_elements(public.list_past_meetings(:grace)) e), jsonb_build_array(:'past', :'older'),
  'past meetings come newest first, without future ones');
select is((select jsonb_agg(e->>'id') from jsonb_array_elements(public.list_past_meetings(:grace,
  (public.get_meeting(:'past')->>'startsAt')::timestamptz, :'past'::uuid, 1)) e), jsonb_build_array(:'older'), 'and page by the last one shown');

-- ---------------------------------------------------------------------------
-- Ending a pattern keeps meetings with shared notes or resources
-- ---------------------------------------------------------------------------
select public.create_meeting_schedule(:grace, '{personal_training}', 1, null, :'mon', null, :daily)->>'id' as sched \gset
select id as first from public.meetings where schedule_id = :'sched' order by starts_at limit 1 \gset
select id as second from public.meetings where schedule_id = :'sched' order by starts_at offset 1 limit 1 \gset
select public.save_meeting_shared_notes(:'first', 'Bring a band.') is not null as ok \gset
select public.add_meeting_link(:'second', 'https://video.example.test/warmup', 'Warm-up') is not null as ok \gset
select is(public.end_meeting_schedule(:'sched', :'mon')->>'keptMeetings', '2', 'ending the pattern reports the meetings it kept');
select is((select count(*)::int from public.meetings where schedule_id = :'sched'), 2, 'only those meetings remain');

select * from finish();
rollback;
