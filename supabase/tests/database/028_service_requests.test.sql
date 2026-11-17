-- Service requests and the Reviews Focused filter (decision 0042). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

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

-- Maya (client A): mesocycle and nutrition, coach Priya assigned. Daniel (client B): PT only, not Priya's.
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''
\set req1        '''e0000000-0000-4000-a000-000000000001'''
\set req2        '''e0000000-0000-4000-a000-000000000002'''
\set req3        '''e0000000-0000-4000-a000-000000000003'''

-- ---------------------------------------------------------------------------
-- Access
-- ---------------------------------------------------------------------------
select ok((select relrowsecurity from pg_class where oid = 'public.service_requests'::regclass), 'service_requests has RLS');
select ok((select relrowsecurity from pg_class where oid = 'public.staff_service_request_seen'::regclass), 'staff_service_request_seen has RLS');
select ok(not has_table_privilege('authenticated', 'public.service_requests', 'insert'), 'browsers cannot insert requests directly');
select ok(not has_function_privilege('anon', 'public.request_service(uuid, text, text)', 'execute'), 'anon cannot request a service');

-- ---------------------------------------------------------------------------
-- Requesting
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_a);
select throws_ok(format('select public.request_service(%L, ''mesocycle'')', :req1), '55000', null, 'a service the client already has is refused');
select throws_ok(format('select public.request_service(%L, ''yoga'')', :req1), '22023', null, 'unknown services are refused');
select is(public.request_service(:req1, 'personal_training', 'Mornings suit me')->>'status', 'pending', 'a new request is pending');
select is(public.request_service(:req1, 'personal_training', 'Mornings suit me')->>'id', :req1, 'retrying with the same id returns the same request');
select throws_ok(format('select public.request_service(%L, ''personal_training'')', :req2), '55000', null, 'one pending request per service');
select is(jsonb_array_length(public.list_my_service_requests()), 1, 'the client lists their own request');

select pg_temp.act_as(:user_b);
select is(jsonb_array_length(public.list_my_service_requests()), 0, 'another client does not see it');
select is((select count(*)::integer from public.service_requests), 0, 'another client reads no rows');
select throws_ok(format('select public.request_service(%L, ''personal_training'')', :req1), '22023', null, 'another client cannot reuse the id');

select pg_temp.act_as(:coach);
select throws_ok(format('select public.request_service(%L, ''nutrition'')', :req3), '42501', null, 'staff cannot request services');

-- ---------------------------------------------------------------------------
-- Reviews
-- ---------------------------------------------------------------------------
select is((select e->>'kind' from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'id' = :req1), 'service_request',
  'the assigned coach sees the request under Focused');
select ok(not exists (select 1 from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'kind' not in ('request', 'service_request')),
  'Focused holds only service and meeting requests');
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), true, 'it starts unread');
select public.mark_service_request_read(:req1);
select is((select (e->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) e where e->>'id' = :req1), false, 'opening it marks it read');

select pg_temp.act_as(:coach_other);
select is((select count(*)::integer from jsonb_array_elements(public.get_staff_activity(p_focused => true)) e where e->>'id' = :req1), 0,
  'an unassigned coach does not see the request');
select throws_ok(format('select public.mark_service_request_read(%L)', :req1), '42501', null, 'nor mark it read');

-- Enrolling answers the request, and the client can then ask again only after it ends.
select pg_temp.reset_role();
insert into public.service_enrollments (client_id, service) values (:client_a, 'personal_training');
select pg_temp.act_as(:user_a);
select is(public.list_my_service_requests()->0->>'status', 'enrolled', 'enrolling the client answers the request');
select throws_ok(format('select public.request_service(%L, ''personal_training'')', :req2), '55000', null, 'an enrolled service cannot be requested');

select * from finish();
rollback;
