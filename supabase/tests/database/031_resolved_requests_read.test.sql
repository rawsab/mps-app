-- Answered requests leave the unread list but stay in history (decision 0043). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

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
-- Whether the caller sees this item as unread in Reviews, or null when it isn't listed at all.
create function pg_temp.unread(item_id text) returns boolean language sql as $$
  select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity(p_limit => 100, p_focused => true)) e where e->>'id' = item_id;
$$;
create function pg_temp.in_unread(item_id text) returns boolean language sql as $$
  select exists (select 1 from jsonb_array_elements(public.get_staff_activity(p_limit => 100, p_unread_only => true)) e where e->>'id' = item_id);
$$;
grant execute on all functions in schema pg_temp to authenticated;

\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set maya        '''10000000-0000-4000-b000-000000000001'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set cancel_req  '''a1000000-0000-4000-a000-000000000001'''
\set resched_req '''a1000000-0000-4000-a000-000000000002'''
\set decline_req '''a1000000-0000-4000-a000-000000000003'''
\set withdraw_req '''a1000000-0000-4000-a000-000000000004'''
\set service_req '''e1000000-0000-4000-a000-000000000001'''

truncate public.meeting_schedules, public.meetings cascade;
update public.service_enrollments set status = 'ended', ends_on = current_date
  where client_id = :maya and service = 'personal_training' and status <> 'ended';
delete from public.service_requests where client_id = :maya;
delete from public.staff_activity_reads;

-- ---------------------------------------------------------------------------
-- Meeting requests
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach);
select public.save_scheduling_settings('https://meet.example.test/abc', 24);
select public.add_meeting(:grace, '{personal_training}', now() + interval '3 days', 60)->>'id' as m1 \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '4 days', 60)->>'id' as m2 \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '5 days', 60)->>'id' as m3 \gset
select public.add_meeting(:grace, '{personal_training}', now() + interval '6 days', 60)->>'id' as m4 \gset

select pg_temp.act_as(:user_grace);
select public.request_meeting_change(:cancel_req, :'m1', 'cancel', 'Away');
select public.request_meeting_change(:resched_req, :'m2', 'reschedule', 'Later that day?');
select public.request_meeting_change(:decline_req, :'m3', 'reschedule', 'Earlier?');
select public.request_meeting_change(:withdraw_req, :'m4', 'cancel', '');

select pg_temp.act_as(:coach);
select ok(pg_temp.in_unread(:cancel_req), 'a pending cancellation request is unread');
select public.respond_to_meeting_request(:cancel_req, true);
select public.respond_to_meeting_request(:resched_req, true, now() + interval '4 days 2 hours', 60);
select public.respond_to_meeting_request(:decline_req, false, null, null, 'Can''t that day');
select ok(not pg_temp.in_unread(:cancel_req), 'an accepted cancellation leaves the unread list');
select ok(not pg_temp.in_unread(:resched_req), 'an accepted reschedule leaves the unread list');
select ok(not pg_temp.in_unread(:decline_req), 'a declined request leaves the unread list');
select is(pg_temp.unread(:cancel_req), false, 'the accepted request stays in history, read');
select ok(pg_temp.in_unread(:withdraw_req), 'a still-pending request stays unread');

select pg_temp.act_as(:user_grace);
select public.withdraw_meeting_request(:withdraw_req);
select pg_temp.act_as(:coach);
select ok(pg_temp.in_unread(:withdraw_req), 'a withdrawal still comes back unread');

-- An unanswered reschedule expires once its meeting starts; it isn't waiting on anyone.
select pg_temp.reset_role();
update public.meeting_requests set status = 'pending', resolved_at = null, response = '' where id = :resched_req;
update public.meetings set starts_at = now() - interval '10 minutes', status = 'scheduled' where id = :'m2';
select pg_temp.act_as(:coach);
select ok(not pg_temp.in_unread(:resched_req), 'an expired reschedule is not unread');

-- ---------------------------------------------------------------------------
-- Service requests and counts
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_a);
select public.request_service(:service_req, 'personal_training', 'Mornings');
select pg_temp.act_as(:coach);
select ok(pg_temp.in_unread(:service_req), 'a pending service request is unread');
select public.count_unread_activity() as before_count \gset

select pg_temp.act_as(:admin);
insert into public.service_enrollments (client_id, service) values (:maya, 'personal_training');
select pg_temp.act_as(:coach);
select ok(not pg_temp.in_unread(:service_req), 'a service request leaves the unread list once the service is added');
select is(pg_temp.unread(:service_req), false, 'the answered service request stays in history');
select is(public.count_unread_activity(), :before_count - 1, 'answered requests no longer count as unread');

select * from finish();
rollback;
