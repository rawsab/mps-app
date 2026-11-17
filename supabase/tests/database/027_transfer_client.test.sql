-- Transferring a client to another coach (decision 0041). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

-- Maya (client A): primary coach Matt (admin), Priya assigned. Grace: primary coach Priya, with publish rights.
update public.coach_clients set can_publish = true
where coach_id = '00000000-0000-4000-a000-000000000002' and client_id = '10000000-0000-4000-b000-000000000009';
update public.clients set primary_coach_id = '00000000-0000-4000-a000-000000000002' where id = '10000000-0000-4000-b000-000000000009';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select throws_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002')$$,
  '42501', null, 'an assigned coach cannot transfer a client');
select throws_ok($$select * from public.transfer_coach_options()$$, '42501', null, 'a coach cannot list transfer targets');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000002')$$,
  '42501', null, 'a client cannot transfer themselves');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from public.transfer_coach_options()), 3, 'admin lists every staff member');
select is((select name from public.transfer_coach_options() where id = '00000000-0000-4000-a000-000000000003'), 'Liam O''Connor', 'staff are named');
select throws_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000011')$$,
  '22023', null, 'a client account is not a coach');
select throws_ok($$select public.transfer_client('10000000-0000-4000-b000-0000000000ff', '00000000-0000-4000-a000-000000000002')$$,
  'P0002', null, 'unknown client');

-- Grace: Priya -> Liam. Liam takes over Priya's assignment and publish rights.
select lives_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000003')$$,
  'admin transfers a client between coaches');
select lives_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000003')$$,
  'a retried transfer succeeds');
reset role;
select is((select primary_coach_id from public.clients where id = '10000000-0000-4000-b000-000000000009'),
  '00000000-0000-4000-a000-000000000003'::uuid, 'the new coach is primary');
select is((select can_publish from public.coach_clients where coach_id = '00000000-0000-4000-a000-000000000003' and client_id = '10000000-0000-4000-b000-000000000009'),
  true, 'the new coach inherits the assignment and its publish permission');
select is((select count(*)::int from public.coach_clients where coach_id = '00000000-0000-4000-a000-000000000002' and client_id = '10000000-0000-4000-b000-000000000009'),
  0, 'the outgoing coach loses access');

-- Maya: Matt (admin) -> Liam. Priya stays assigned as a supporting coach.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select lives_ok($$select public.transfer_client('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000003')$$,
  'admin transfers their own client to a coach');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from public.clients where id = '10000000-0000-4000-b000-000000000001'), 1, 'the new coach can read the client');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.clients where id = '10000000-0000-4000-b000-000000000001'), 1, 'other assigned coaches keep access');

select * from finish();
rollback;
