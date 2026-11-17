-- Reviews: cross-client activity and read state (FR-07, FR-08, NFR-01; decision 0024). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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
\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''

\set program  '''90000000-0000-4000-a000-000000000001'''
\set rev1     '''91000000-0000-4000-a000-000000000001'''
\set rev2     '''91000000-0000-4000-a000-000000000002'''
\set week1    '''92000000-0000-4000-a000-000000000001'''
\set day1     '''93000000-0000-4000-a000-000000000001'''
\set day2     '''93000000-0000-4000-a000-000000000002'''
\set day3     '''93000000-0000-4000-a000-000000000003'''
\set press    '''95000000-0000-4000-a000-000000000001'''

-- Isolate the training-only fixture from nutrition activity created during local use.
-- This transaction is rolled back; development records are preserved.
-- Isolate the feed from the demo's other notification types.
truncate public.meeting_requests, public.service_requests cascade;
truncate public.nutrition_daily_activity cascade;
truncate public.programs cascade;
-- Read state from local use would otherwise hide unread items.
truncate public.staff_activity_reads, public.staff_activity_seen;

-- Client A's mesocycle, one week: Push, Pull, Legs.
insert into public.programs (id, client_id, enrollment_id, service)
select :program, e.client_id, e.id, e.service from public.service_enrollments e
where e.client_id = :client_a and e.service = 'mesocycle';
insert into public.program_revisions (id, program_id, client_id, revision_number, schema_version, title)
values (:rev1, :program, :client_a, 1, 1, 'Block one');
insert into public.program_weeks (id, revision_id, week_index) values (:week1, :rev1, 1);
insert into public.workout_days (id, revision_id, week_id, position, label) values
  (:day1, :rev1, :week1, 0, 'Push'), (:day2, :rev1, :week1, 1, 'Pull'), (:day3, :rev1, :week1, 2, 'Legs');
insert into public.program_sections (id, revision_id, day_id, position, title) values
  ('94000000-0000-4000-a000-000000000001', :rev1, :day1, 0, 'Main'),
  ('94000000-0000-4000-a000-000000000002', :rev1, :day2, 0, 'Main');
insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, set_count_min, set_count_max, muscles) values
  (:press, :rev1, '94000000-0000-4000-a000-000000000001', 0, 'press', 'Press', 3, 3, '{Chest}'),
  ('95000000-0000-4000-a000-000000000002', :rev1, '94000000-0000-4000-a000-000000000002', 0, 'row', 'Row', 2, 2, '{Back}');
update public.program_revisions set status = 'published', published_at = now() where id = :rev1;
update public.programs set current_revision_id = :rev1 where id = :program;

-- The client logs day 1 and skips day 2; the coach opens day 3 alone.
select pg_temp.act_as(:user_a);
select public.start_session(:program, :day1) ->> 'id' as s1 \gset
select public.start_session(:program, :day2) ->> 'id' as s2 \gset
select public.save_logged_set('96000000-0000-4000-a000-000000000001', :'s1', :press, 1, 'external', 80, 'lb', 10);
select public.update_session(:'s2', 'skipped', null, '');
select pg_temp.act_as(:coach);
select public.start_session(:program, :day3) ->> 'id' as s3 \gset

select pg_temp.reset_role();
alter table public.training_sessions disable trigger training_sessions_touch;
alter table public.logged_sets disable trigger user;
update public.training_sessions set updated_at = now() - interval '3 days' where id = :'s1';
update public.logged_sets set updated_at = now() - interval '1 day' where session_id = :'s1';
update public.training_sessions set updated_at = now() - interval '2 days' where id = :'s2';
alter table public.training_sessions enable trigger training_sessions_touch;
alter table public.logged_sets enable trigger user;

-- Access ------------------------------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok($$select public.get_staff_activity()$$, '42501', null, 'anon cannot read reviews');
select pg_temp.act_as(:user_a);
select throws_ok($$select public.get_staff_activity()$$, '42501', null, 'a client cannot read reviews');
select throws_ok($$select public.count_unread_activity()$$, '42501', null, 'a client cannot count unread items');
select throws_ok(format($$select public.mark_activity_read(%L)$$, :'s1'), '42501', null, 'a client cannot mark items read');
select pg_temp.act_as(:coach_other);
select is(public.get_staff_activity(), '[]'::jsonb, 'an unassigned coach sees none of the client''s activity');
select throws_ok(format($$select public.mark_activity_read(%L)$$, :'s1'), '42501', null, 'an unassigned coach cannot mark the client''s session');
select throws_ok($$insert into public.staff_activity_reads values ((select auth.uid()), now())$$, '42501', null, 'direct read-state writes are denied');

-- Content -----------------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select is((select array_agg(e ->> 'id') from jsonb_array_elements(public.get_staff_activity()) e),
  array[:'s1', :'s2'], 'client activity only, newest first; a staff-only session is left out');
select is((public.get_staff_activity() -> 0) - 'startedAt' - 'performedOn' - 'activityAt' - 'id' - 'kind' - 'weekId' - 'dayId' - 'programId',
  jsonb_build_object('service', 'mesocycle', 'programTitle', 'Block one', 'weekIndex', 0, 'dayIndex', 0, 'dayLabel', 'Push',
    'status', 'in_progress', 'completedAt', null, 'setCount', 1, 'feedbackCount', 0, 'staffEdited', false,
    'clientId', :client_a, 'clientName', (select full_name from public.clients where id = :client_a), 'unread', true),
  'an item names its client and starts unread');
select is(public.count_unread_activity(), 2, 'both items are unread');
select public.get_staff_activity(null, null, 1) -> 0 as first \gset
select is((select array_agg(e ->> 'id') from jsonb_array_elements(
    public.get_staff_activity((:'first'::jsonb ->> 'activityAt')::timestamptz, (:'first'::jsonb ->> 'id')::uuid, 25)) e),
  array[:'s2'], 'the cursor continues after the last item');

-- Summary (migration 00020) -------------------------------------------------------------------
select is(public.get_review_summary(), jsonb_build_object('unread', 2, 'completed', 0, 'logged', 1, 'skipped', 1, 'started', 0),
  'the summary counts unread items by kind');
select pg_temp.act_as(:user_a);
select throws_ok($$select public.get_review_summary()$$, '42501', null, 'a client cannot read the summary');

-- Day 3 opened by the client with nothing logged: unread and counted like any client activity (migration 00021).
select pg_temp.reset_role();
alter table public.training_sessions disable trigger training_sessions_touch;
update public.training_sessions set updated_by = :user_a, updated_at = now() - interval '4 days' where id = :'s3';
alter table public.training_sessions enable trigger training_sessions_touch;
select pg_temp.act_as(:coach);
select is((select (e ->> 'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e ->> 'id' = :'s3'), true,
  'a started session with nothing logged is unread');
select is(public.count_unread_activity(), 3, 'a started session is counted');
select is((public.get_review_summary() ->> 'unread')::integer, public.count_unread_activity(), 'the summary total matches the badge');

-- Read state --------------------------------------------------------------------------------
select lives_ok(format($$select public.mark_activity_read(%L)$$, :'s1'), 'opening an item marks it seen');
select is(public.count_unread_activity(), 2, 'two items left unread');
select is((select array_agg(e ->> 'id') from jsonb_array_elements(public.get_staff_activity(null, null, 25, true)) e),
  array[:'s2', :'s3'], 'the unread filter leaves out seen items');
select pg_temp.act_as(:admin);
select is(public.count_unread_activity(), 3, 'read state belongs to each staff member');
select pg_temp.act_as(:coach);
select lives_ok($$select public.mark_activity_read()$$, 'mark all as read');
select is(public.count_unread_activity(), 0, 'nothing unread after marking all');
select is((select count(*)::integer from public.staff_activity_seen), 0, 'the watermark replaces earlier seen marks');
select public.save_logged_set('96000000-0000-4000-a000-000000000001', :'s1', :press, 1, 'external', 85, 'lb', 10);
select is(public.count_unread_activity(), 0, 'a coach correction does not make an item unread');

-- A later change by the client brings the item back.
select pg_temp.reset_role();
alter table public.logged_sets disable trigger user;
insert into public.logged_sets (id, session_id, client_id, revision_id, exercise_id, set_number, reps, created_by, updated_by, updated_at)
values ('96000000-0000-4000-a000-000000000002', :'s1', :client_a, :rev1, :press, 2, 8, :user_a, :user_a, now() + interval '1 hour');
alter table public.logged_sets enable trigger user;
select pg_temp.act_as(:coach);
select is((select array_agg(e ->> 'id') from jsonb_array_elements(public.get_staff_activity(null, null, 25, true)) e),
  array[:'s1'], 'a new client change makes the item unread again');
select pg_temp.act_as(:coach_other);
select is((select count(*)::integer from public.staff_activity_reads), 0, 'staff read only their own read state');

select * from finish();
rollback;
