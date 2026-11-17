-- Meetings tagged with services, programs, current programs and notes (decision 0039). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(38);

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
\set p1          '''c1000000-0000-4000-a000-000000000001'''
\set p2          '''c1000000-0000-4000-a000-000000000002'''
\set wed         '''[{"cycleWeek":1,"weekday":3,"startTime":"07:00","durationMinutes":60}]'''

truncate public.meeting_schedules, public.meetings cascade;
update public.profiles set timezone = 'America/Toronto' where auth_user_id = :coach;
update public.service_enrollments set current_program_id = null, current_nutrition_program_id = null where client_id = :grace;
-- Grace's existing programs would make the "only program" rule ambiguous here.
update public.programs set archived_at = now() where client_id = :grace and archived_at is null;
select id as meso from public.service_enrollments where client_id = :grace and service = 'mesocycle' and status <> 'ended' \gset
select id as pt from public.service_enrollments where client_id = :grace and service = 'personal_training' and status <> 'ended' \gset
insert into public.programs (id, client_id, enrollment_id, service) values
  (:p1, :grace, :'meso', 'mesocycle'), (:p2, :grace, :'meso', 'mesocycle');
insert into public.program_revisions (program_id, client_id, revision_number, schema_version, title) values
  (:p1, :grace, 1, 1, 'Block A'), (:p2, :grace, 1, 1, 'Block B');
select current_date + (8 - extract(isodow from current_date)::integer) as mon \gset

-- ---------------------------------------------------------------------------
-- Services and billing
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select throws_ok(format('select public.add_meeting(%L, ''{}'', now() + interval ''1 day'', 30)', :grace), '22023', null, 'a meeting needs a service');
select throws_ok(format('select public.add_meeting(%L, ''{yoga}'', now() + interval ''1 day'', 30)', :grace), '22023', null, 'unknown services rejected');
select throws_ok(format('select public.add_meeting(%L, ''{nutrition}'', now() + interval ''1 day'', 30)', :grace), '55000', null, 'only the client''s current services');
select public.add_meeting(:grace, '{mesocycle}', now() + interval '2 hours', 30) as check_in \gset
select is((:'check_in'::jsonb)->>'billable', 'false', 'a mesocycle check-in is not billable');
select is((:'check_in'::jsonb)->'services', '["mesocycle"]'::jsonb, 'tags are returned');
select is((public.add_meeting(:grace, '{mesocycle,personal_training}', now() + interval '3 days', 60))->>'billable', 'true', 'tagged Personal Training is billable');
select pg_temp.act_as(:user_grace);
select is(public.request_meeting_change('d0000000-0000-4000-a000-000000000001', ((:'check_in'::jsonb)->>'id')::uuid, 'cancel', '')->>'late', 'false',
  'a non-billable meeting is never a late cancellation');
select pg_temp.reset_role();
select throws_ok(format('update public.meetings set status = ''late_cancelled'', cancelled_at = now() where id = %L', (:'check_in'::jsonb)->>'id'),
  '23514', null, 'the database refuses a late cancellation on a non-billable meeting');

-- ---------------------------------------------------------------------------
-- Current programs
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select is((select e->>'currentProgramId' from jsonb_array_elements(public.get_client_meetings(:grace)->'services') e where e->>'service' = 'mesocycle'),
  null, 'two programs and no choice: no current program');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.set_current_program(%L, %L)', :'meso', :p2), '42501', null, 'unassigned coach cannot choose');
select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.set_current_program(%L, %L)', :'meso', :p2), '42501', null, 'clients cannot choose');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.set_current_program(%L, %L)', :'pt', :p2), '22023', null, 'a program of another service is refused');
select is(public.set_current_program(:'meso', :p2), :p2::uuid, 'coach chooses the current program');
select pg_temp.act_as(:user_grace);
select is((select current_program_id from public.service_enrollments where id = :'meso'), :p2::uuid, 'clients can see which program is current');
select throws_ok(format('update public.service_enrollments set current_program_id = %L where id = %L', :p1, :'meso'), '42501', null,
  'the pointer cannot be written directly');

-- ---------------------------------------------------------------------------
-- Programs on meetings
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{mesocycle}', now() + interval '4 days', 30) as follows \gset
select is((:'follows'::jsonb)->'programs'->0->>'programId', :p2, 'by default a meeting follows the current program');
select is((:'follows'::jsonb)->'programs'->0->>'title', 'Block B', 'with its title');
select is((:'follows'::jsonb)->'programs'->0->>'pinned', 'false', 'and is not pinned');
select public.add_meeting(:grace, '{mesocycle}', now() + interval '5 days', 30, jsonb_build_object('mesocycle', :p1)) as pinned \gset
select is((:'pinned'::jsonb)->'programs'->0->>'programId', :p1, 'coach can choose another program');
select throws_ok(format('select public.add_meeting(%L, ''{mesocycle}'', now() + interval ''6 days'', 30, %L)', :grace, jsonb_build_object('personal_training', :p1)),
  '22023', null, 'a program for a service the meeting isn''t about is refused');
select is((public.update_meeting(((:'pinned'::jsonb)->>'id')::uuid, now() + interval '5 days', 30, null, '{}'))->'programs'->0->>'programId', :p2,
  'clearing the choice follows the current program again');

select public.create_meeting_schedule(:grace, '{mesocycle}', 1, null, :'mon', null, :wed, jsonb_build_object('mesocycle', :p1))->>'id' as sched \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.meetings a join public.meeting_programs p on p.meeting_id = a.id
  where a.schedule_id = :'sched' and p.program_id = :p1), (select count(*)::int from public.meetings where schedule_id = :'sched'),
  'a pattern''s program carries to every meeting it creates');

-- A started meeting records the program it followed; changing the current program later leaves it alone.
update public.meetings set starts_at = now() - interval '1 hour' where id = ((:'follows'::jsonb)->>'id')::uuid;
select private.top_up_meetings();
select pg_temp.act_as(:coach);
select public.set_current_program(:'meso', :p1) is not null as ok \gset
select is((public.get_meeting(((:'follows'::jsonb)->>'id')::uuid))->'programs'->0->>'programId', :p2, 'a past meeting keeps the program it had');

-- With the choice cleared, the only remaining program is current.
select pg_temp.reset_role();
update public.programs set archived_at = now() where id = :p1;
select pg_temp.act_as(:coach);
select is(public.set_current_program(:'meso', null), :p2::uuid, 'the only program is current without a choice');

-- ---------------------------------------------------------------------------
-- Generation follows any active tagged service
-- ---------------------------------------------------------------------------
select public.create_meeting_schedule(:grace, '{personal_training,mesocycle}', 1, null, :'mon', null,
  '[{"cycleWeek":1,"weekday":5,"startTime":"09:00","durationMinutes":45}]')->>'id' as both \gset
select pg_temp.reset_role();
update public.service_enrollments set status = 'paused' where id = :'pt';
select pg_temp.act_as(:coach);
select is((select e->>'active' from jsonb_array_elements(public.get_meeting_schedules(:grace)) e where e->>'id' = :'both'), 'true',
  'a pattern keeps going while one of its services is active');
select pg_temp.reset_role();
update public.service_enrollments set status = 'paused' where id = :'meso';
select pg_temp.act_as(:coach);
select is((select e->>'active' from jsonb_array_elements(public.get_meeting_schedules(:grace)) e where e->>'id' = :'both'), 'false',
  'and pauses when none are');
select pg_temp.reset_role();
update public.service_enrollments set status = 'active' where id in (:'pt', :'meso');

-- ---------------------------------------------------------------------------
-- Notes (staff only)
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select is(public.save_meeting_notes(((:'pinned'::jsonb)->>'id')::uuid, '  Review squat depth  ')->>'notes', 'Review squat depth', 'coach saves notes');
select pg_temp.act_as(:user_grace);
select is(public.get_meeting(((:'pinned'::jsonb)->>'id')::uuid)->>'notes', null, 'the client never sees notes');
select is((select count(*)::int from public.meeting_notes), 0, 'or reads them directly');
select throws_ok(format('select public.save_meeting_notes(%L, ''hi'')', (:'pinned'::jsonb)->>'id'), '42501', null, 'clients cannot write notes');
select pg_temp.act_as(:coach);
select is(public.save_meeting_notes(((:'pinned'::jsonb)->>'id')::uuid, ' ')->>'notes', null, 'blank notes are removed');

-- Pattern notes
select public.create_meeting_schedule(:grace, '{mesocycle}', 1, null, :'mon', null,
  '[{"cycleWeek":1,"weekday":6,"startTime":"10:00","durationMinutes":30}]', '{}', ' Bring food log ')->>'id' as noted \gset
select is((select e->>'notes' from jsonb_array_elements(public.get_meeting_schedules(:grace)) e where e->>'id' = :'noted'), 'Bring food log', 'a pattern keeps its notes');
select is((select e->>'patternNotes' from jsonb_array_elements(public.list_meetings(now(), now() + interval '30 days', :grace)) e
  where e->>'scheduleId' = :'noted' limit 1), 'Bring food log', 'its meetings show them');
select is(public.save_meeting_schedule_notes(:'noted', 'Bring food log and scale photo')->>'notes', 'Bring food log and scale photo', 'coach edits them without changing the pattern');
select is(public.change_meeting_schedule(:'noted', :'mon'::date + 7, '{mesocycle}', 1, null, null,
  '[{"cycleWeek":1,"weekday":7,"startTime":"10:00","durationMinutes":30}]')->>'notes', 'Bring food log and scale photo', 'the continuing pattern returns the notes');
select pg_temp.act_as(:user_grace);
select is((select e->>'patternNotes' from jsonb_array_elements(public.list_meetings(now(), now() + interval '30 days')) e where e->>'patternNotes' is not null limit 1), null,
  'clients never see pattern notes');
select throws_ok(format('select public.save_meeting_schedule_notes(%L, ''hi'')', :'noted'), '42501', null, 'clients cannot write them');
select pg_temp.act_as(:coach);
select is((select e->>'notes' from jsonb_array_elements(public.get_meeting_schedules(:grace)) e where e->>'replacesId' = :'noted'), 'Bring food log and scale photo',
  'a this-and-following change carries them over');

select * from finish();
rollback;
