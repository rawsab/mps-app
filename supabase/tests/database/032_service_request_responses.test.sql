-- Accepting and declining service requests (decision 0044). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(26);

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

-- Maya (client A) has coach Priya assigned; coach_other has no access to her.
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set maya        '''10000000-0000-4000-b000-000000000001'''
\set pt_req      '''e2000000-0000-4000-a000-000000000001'''
\set nut_req     '''e2000000-0000-4000-a000-000000000002'''
\set nut_again   '''e2000000-0000-4000-a000-000000000003'''

-- Maya starts without PT or nutrition, and with no earlier requests.
update public.service_enrollments set status = 'ended', ends_on = current_date
  where client_id = :maya and service in ('personal_training', 'nutrition') and status <> 'ended';
delete from public.service_requests where client_id = :maya;

select ok(not has_function_privilege('anon', 'public.accept_service_request(uuid)', 'execute'), 'anon cannot accept requests');
select ok(not has_table_privilege('authenticated', 'public.service_requests', 'update'), 'browsers cannot update requests directly');

select pg_temp.act_as(:user_a);
select public.request_service(:pt_req, 'personal_training', 'Mornings');
select public.request_service(:nut_req, 'nutrition', '');
select throws_ok(format('select public.accept_service_request(%L)', :pt_req), '42501', null, 'a client cannot accept their own request');

-- ---------------------------------------------------------------------------
-- Pending lists
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.accept_service_request(%L)', :pt_req), '42501', null, 'a coach without access cannot accept');
select is(jsonb_array_length(public.list_pending_service_requests(:maya)), 0, 'a coach without access lists nothing');

select pg_temp.act_as(:coach);
select is((select array_agg(e->>'id' order by n) from jsonb_array_elements(public.list_pending_service_requests(:maya)) with ordinality as x(e, n)),
  array[:nut_req, :pt_req], 'the assigned coach lists both pending requests, newest first');
select is((select e->>'clientName' from jsonb_array_elements(public.list_pending_service_requests()) e where e->>'id' = :pt_req), 'Maya Chen',
  'the cross-client list names the client');
select ok(not exists (select 1 from jsonb_array_elements(public.list_pending_service_requests(:maya)) e where e ? 'unread'),
  'the list leaves read state to Activity');

-- ---------------------------------------------------------------------------
-- Accepting
-- ---------------------------------------------------------------------------
select is(public.accept_service_request(:pt_req)->>'status', 'enrolled', 'an assigned coach (not an admin) accepts');
select is((select count(*)::integer from public.service_enrollments where client_id = :maya and service = 'personal_training' and status = 'active'), 1,
  'accepting adds an active enrollment');
select is(public.accept_service_request(:pt_req)->>'status', 'enrolled', 'accepting again returns the same answer');
select is((select count(*)::integer from public.service_enrollments where client_id = :maya and service = 'personal_training' and status <> 'ended'), 1,
  'accepting again adds nothing');
select throws_ok(format('select public.decline_service_request(%L)', :pt_req), '55000', null, 'an accepted request cannot be declined');

-- ---------------------------------------------------------------------------
-- Declining
-- ---------------------------------------------------------------------------
select is(public.decline_service_request(:nut_req, '  Full this month  ')->>'response', 'Full this month', 'declining keeps the trimmed reply');
select throws_ok(format('select public.accept_service_request(%L)', :nut_req), '55000', null, 'a declined request cannot be accepted');
select is(jsonb_array_length(public.list_pending_service_requests(:maya)), 0, 'answered requests leave the pending list');

select pg_temp.act_as(:user_a);
select is((select e->>'status' from jsonb_array_elements(public.list_my_service_requests()) e where e->>'id' = :nut_req), 'declined',
  'the client sees the decline');
select is(public.request_service(:nut_again, 'nutrition', 'Next month?')->>'status', 'pending', 'the client can ask again after a decline');
select is((select count(*)::integer from public.service_enrollments where client_id = :maya and service = 'nutrition' and status <> 'ended'), 0,
  'declining adds no service');

-- ---------------------------------------------------------------------------
-- Editing the message
-- ---------------------------------------------------------------------------
select throws_ok(format('select public.update_service_request(%L, ''Later'')', :nut_req), '55000', null, 'an answered request cannot be edited');
select is(public.update_service_request(:nut_again, '  Next month, mornings  ')->>'message', 'Next month, mornings', 'the client edits a pending message');
select pg_temp.act_as(:user_b);
select throws_ok(format('select public.update_service_request(%L, ''Mine now'')', :nut_again), '42501', null, 'another client cannot edit it');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.update_service_request(%L, ''Staff'')', :nut_again), '42501', null, 'staff cannot edit a client''s request');
select public.mark_service_request_read(:nut_again);
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'id' = :nut_again), false,
  'the coach has read the request');

select pg_temp.act_as(:user_a);
select public.update_service_request(:nut_again, 'Next month, mornings');
select pg_temp.act_as(:coach);
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'id' = :nut_again), false,
  'saving the same message again does not bring it back');
select pg_temp.act_as(:user_a);
select public.update_service_request(:nut_again, 'Next month, evenings now');
select pg_temp.act_as(:coach);
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'id' = :nut_again), true,
  'a changed message brings the request back as unread');

select * from finish();
rollback;
