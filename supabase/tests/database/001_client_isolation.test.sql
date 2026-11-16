-- Policy tests for M2 (NFR-01, FR-01, FR-02, PRD §4 access matrix).
-- Run with: pnpm test:db   (requires the local stack and seed data)
begin;
create extension if not exists pgtap with schema extensions;
select plan(33);

-- Impersonate a user exactly as PostgREST does: role + JWT claims for the transaction.
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

-- Fixed ids from seed.sql (client A = Maya Chen, client B = Daniel Okafor, Grace Liu is also assigned to the coach)
\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_b      '''00000000-0000-4000-a000-000000000012'''
\set user_off    '''00000000-0000-4000-a000-000000000013'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''
\set client_b    '''10000000-0000-4000-b000-000000000002'''
\set client_g    '''10000000-0000-4000-b000-000000000009'''

-- Anonymous ---------------------------------------------------------------
select pg_temp.act_as(null);
select throws_ok('select count(*) from public.clients', '42501', null, 'anon cannot read clients');
select throws_ok('select count(*) from public.service_enrollments', '42501', null, 'anon cannot read enrollments');
select throws_ok('select count(*) from public.staff_roles', '42501', null, 'anon cannot read staff roles');
select pg_temp.reset_role();

-- Client A --------------------------------------------------------------------
select pg_temp.act_as(:user_a);
select results_eq('select id from public.clients', array[:client_a::uuid], 'client A sees only their own client record');
select is_empty(format('select 1 from public.clients where id = %L', :client_b), 'client A cannot fetch client B by id');
select results_eq(
  'select service::text from public.service_enrollments order by service',
  array['mesocycle', 'nutrition'],
  'client A sees only their own enrollments');
select is_empty(format('select 1 from public.service_enrollments where client_id = %L', :client_b),
  'client A cannot read client B enrollments');
select is_empty('select 1 from public.staff_roles', 'client A has no staff role rows');
select is_empty('select 1 from public.coach_clients', 'client A cannot read coach assignments');
select results_eq('select auth_user_id from public.profiles', array[:user_a::uuid], 'client A sees only own profile');

select throws_ok(format('insert into public.staff_roles (auth_user_id, role) values (%L, ''admin'')', :user_a),
  '42501', null, 'client A cannot promote themselves');
select throws_ok(format('update public.clients set auth_user_id = %L where id = %L', :user_a, :client_b),
  '42501', null, 'client A cannot rebind a client record to their account');
select throws_ok('insert into public.clients (email, full_name) values (''x@example.test'', ''X'')',
  '42501', null, 'client A cannot create clients');
select throws_ok(format('insert into public.service_enrollments (client_id, service) values (%L, ''nutrition'')', :client_a),
  '42501', null, 'client A cannot enroll themselves in services');

-- Column-level grant allows the statement, RLS makes it a no-op on other rows.
update public.clients set full_name = 'hijacked' where id = :client_b;
update public.clients set status = 'active' where id = :client_a;
update public.profiles set display_name = 'hijacked' where auth_user_id = :user_b;
select lives_ok($$update public.profiles set display_name = 'Client A renamed' where auth_user_id = '00000000-0000-4000-a000-000000000011'$$,
  'client A can edit their own display name');
select pg_temp.reset_role();

select is((select full_name from public.clients where id = :client_b), 'Daniel Okafor', 'client B name unchanged by client A');
select is((select status::text from public.clients where id = :client_a), 'active', 'client A could not change own status');
select is((select display_name from public.profiles where auth_user_id = :user_b), 'Daniel Okafor', 'client B profile unchanged');
select is((select display_name from public.profiles where auth_user_id = :user_a), 'Client A renamed', 'client A profile update applied');

-- Client B --------------------------------------------------------------------
select pg_temp.act_as(:user_b);
select results_eq('select id from public.clients', array[:client_b::uuid], 'client B sees only their own client record');
select results_eq('select service::text from public.service_enrollments', array['personal_training'],
  'client B sees only personal training');
select pg_temp.reset_role();

-- Disabled client -------------------------------------------------------------
select pg_temp.act_as(:user_off);
select is_empty('select 1 from public.clients', 'disabled client cannot read their client record');
select is_empty('select 1 from public.service_enrollments', 'disabled client cannot read enrollments');
select pg_temp.reset_role();

-- Unassigned coach: a staff account alone grants no client access -------------
select pg_temp.act_as(:coach_other);
select is_empty('select 1 from public.clients', 'unassigned coach sees no clients');
select is_empty('select 1 from public.service_enrollments', 'unassigned coach sees no enrollments');
select throws_ok('insert into public.clients (email, full_name) values (''y@example.test'', ''Y'')',
  '42501', null, 'coach cannot create clients (admin only)');
select pg_temp.reset_role();

-- Assigned coach --------------------------------------------------------------
select pg_temp.act_as(:coach);
select results_eq('select id from public.clients order by id', array[:client_a::uuid, :client_g::uuid], 'assigned coach sees only their two assigned clients');
select is((select count(*)::int from public.service_enrollments), 4, 'assigned coach sees only their clients'' enrollments');
select throws_ok(format('insert into public.coach_clients (coach_id, client_id) values (%L, %L)', :coach, :client_b),
  '42501', null, 'coach cannot self-assign another client');
select pg_temp.reset_role();

-- Admin -----------------------------------------------------------------------
select pg_temp.act_as(:admin);
select is((select count(*)::int from public.clients), 12, 'admin sees every client');
select lives_ok($$insert into public.clients (email, full_name) values ('new.client@example.test', 'New Client (synthetic)')$$,
  'admin can create a client before invitation');
select throws_ok($$insert into public.service_enrollments (client_id, service) values ('10000000-0000-4000-b000-000000000001', 'mesocycle')$$,
  '23505', null, 'a client cannot hold two live enrollments for the same service');
select throws_ok($$update public.clients set auth_user_id = '00000000-0000-4000-a000-000000000003' where id = '10000000-0000-4000-b000-000000000004'$$,
  '42501', null, 'even admin cannot bind auth users from the browser; binding is server-side');
select pg_temp.reset_role();

select * from finish();
rollback;
