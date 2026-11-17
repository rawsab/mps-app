-- PT scheduling coach reads, stop, and requests in Reviews (decision 0037). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(25);

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
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set wed         '''[{"cycleWeek":1,"weekday":3,"startTime":"07:00","durationMinutes":60}]'''
\set req1        '''b0000000-0000-4000-a000-000000000001'''
\set req2        '''b0000000-0000-4000-a000-000000000002'''

truncate public.pt_schedules, public.pt_appointments cascade;
update public.profiles set timezone = 'America/Toronto', meeting_url = 'https://meet.example.test/abc', display_name = 'Priya' where auth_user_id = :coach;
select current_date + (8 - extract(isodow from current_date)::integer) as mon \gset

-- ---------------------------------------------------------------------------
-- Scheduling context
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.create_pt_schedule(:grace, 1, null, :'mon', null, :wed)->>'id' as sched \gset
select public.get_pt_scheduling(:grace) as ctx \gset
select is((:'ctx'::jsonb)->>'service', 'active', 'reports the live PT service');
select is((:'ctx'::jsonb)->>'timezone', 'America/Toronto', 'reports the primary coach''s time zone');
select is((:'ctx'::jsonb)->>'meetingUrl', 'https://meet.example.test/abc', 'reports the meeting link');
select is(jsonb_array_length((:'ctx'::jsonb)->'schedules'), 1, 'lists the open pattern');
select ok(((:'ctx'::jsonb)->>'futureSessions')::int > 0, 'counts future sessions');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.get_pt_scheduling(%L)', :grace), '42501', null, 'unassigned coach cannot read it');
select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.get_pt_scheduling(%L)', :grace), '42501', null, 'clients cannot read it');

select pg_temp.reset_role();
select id as a1 from public.pt_appointments where schedule_id = :'sched' order by starts_at limit 1 \gset
select id as a2 from public.pt_appointments where schedule_id = :'sched' order by starts_at limit 1 offset 1 \gset
select pg_temp.act_as(:user_grace);
select is(public.get_pt_appointment(:'a1')->>'id', :'a1', 'client reads own session');
select pg_temp.act_as(:user_b);
select is(public.get_pt_appointment(:'a1'), null, 'another client gets nothing');

-- ---------------------------------------------------------------------------
-- Requests in Reviews
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.mark_activity_read();
select pg_temp.act_as(:user_grace);
select public.request_pt_appointment_change(:req1, :'a1', 'reschedule', 'Thursday instead?') is not null as ok \gset
select pg_temp.act_as(:coach);
select is((select count(*)::int from jsonb_array_elements(public.get_staff_activity()) e where e->>'kind' = 'request' and (e->>'unread')::boolean), 1,
  'a new request is unread in Reviews');
select is((select e->>'requestKind' from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), 'reschedule', 'item carries the request kind');
select is((select e->>'appointmentId' from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), :'a1', 'item links to its session');
select ok(public.count_unread_activity() >= 1, 'requests count toward the badge');
select is((public.get_review_summary()->>'requests')::int, 1, 'summary counts requests');
select pg_temp.act_as(:coach_other);
select is((select count(*)::int from jsonb_array_elements(public.get_staff_activity()) e where e->>'kind' = 'request'), 0, 'unassigned coach sees no requests');
select throws_ok(format('select public.mark_request_read(%L)', :req1), '42501', null, 'unassigned coach cannot mark it');
select pg_temp.act_as(:coach);
select lives_ok(format('select public.mark_request_read(%L)', :req1), 'opening a request marks it seen');
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), false, 'seen request is read');
select pg_temp.act_as(:user_grace);
select public.withdraw_pt_appointment_request(:req1) is not null as ok \gset
select pg_temp.act_as(:coach);
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), true, 'a withdrawal comes back as unread');
select public.mark_activity_read();
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), false, 'mark all covers requests');

-- ---------------------------------------------------------------------------
-- Stopping
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_grace);
select public.request_pt_appointment_change(:req2, :'a2', 'cancel', '') is not null as ok \gset
select pg_temp.act_as(:coach);
select throws_ok(format('select public.stop_pt_scheduling(%L)', :grace), 'PT409', null, 'stopping waits for open requests');
select public.respond_to_pt_appointment_request(:req2, false) is not null as ok \gset
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.stop_pt_scheduling(%L)', :grace), '42501', null, 'unassigned coach cannot stop it');
select pg_temp.act_as(:coach);
select ok((public.stop_pt_scheduling(:grace)->>'cancelledSessions')::int >= 1, 'stopping cancels what remains');
select pg_temp.reset_role();
select is((select count(*)::int from public.pt_appointments where client_id = :grace and status = 'scheduled' and starts_at > now()), 0,
  'no future sessions remain scheduled');
select is(jsonb_array_length(public.get_pt_schedules(:grace)), 0, 'no open patterns remain');

select * from finish();
rollback;
