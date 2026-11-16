-- Non-disabled client status is derived, never chosen by the browser (FR-01, FR-02). Run with: pnpm test:db
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

\set admin    '''00000000-0000-4000-a000-000000000001'''
\set user_inv '''00000000-0000-4000-a000-000000000015'''
\set client_a '''10000000-0000-4000-b000-000000000001'''
\set pending  '''10000000-0000-4000-b000-000000000004'''
\set invited  '''10000000-0000-4000-b000-000000000006'''

select pg_temp.act_as(:admin);

-- Invited (account bound by the invite, never signed in): disable, then reactivate as "active".
update public.clients set status = 'disabled' where id = :invited;
update public.clients set status = 'active' where id = :invited;
select is((select status::text from public.clients where id = :invited), 'invited', 'reactivating an unaccepted invite returns to invited, not active');

update public.clients set status = 'disabled' where id = :pending;
update public.clients set status = 'active' where id = :pending;
select is((select status::text from public.clients where id = :pending), 'pending', 'reactivating a client with no account returns to pending');

update public.clients set status = 'disabled' where id = :client_a;
update public.clients set status = 'pending' where id = :client_a;
select is((select status::text from public.clients where id = :client_a), 'active', 'reactivating an activated client returns to active');

update public.clients set status = 'active' where id = :invited;
select is((select status::text from public.clients where id = :invited), 'invited', 'staff cannot mark an invited client active');

update public.clients set status = 'disabled' where id = :invited;
select is((select status::text from public.clients where id = :invited), 'disabled', 'staff can still disable');
update public.clients set status = 'invited' where id = :invited;

select throws_ok(format('update public.clients set activated_at = now() where id = %L', :invited),
  '42501', null, 'staff cannot set activated_at directly');
select pg_temp.reset_role();

-- The invited client signs in for the first time.
select pg_temp.act_as(:user_inv);
select lives_ok('select public.mark_client_active()', 'client marks themselves active on first sign-in');
select pg_temp.reset_role();
select is((select status::text from public.clients where id = :invited), 'active', 'first sign-in makes the client active');
select isnt((select activated_at from public.clients where id = :invited), null, 'first sign-in records activated_at');

select * from finish();
rollback;
