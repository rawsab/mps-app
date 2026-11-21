-- "I've sent it" / "I've paid this" payment notices and their Activity items (decision 0055). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(34);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_maya   '''00000000-0000-4000-a000-000000000011'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''

truncate public.billing_charges, public.billing_payments, public.billing_events, public.billing_payment_notices cascade;
select private.billing_month() as this_month, private.billing_today() as today \gset
select gen_random_uuid() as n1, gen_random_uuid() as n2, gen_random_uuid() as n3, gen_random_uuid() as n4, gen_random_uuid() as n5,
  gen_random_uuid() as pay \gset

select pg_temp.act_as(:coach);
select public.add_adjustment(gen_random_uuid(), :grace, :'this_month', 'Pack A', 30000);
select public.add_adjustment(gen_random_uuid(), :grace, :'this_month', 'Pack B', 20000);
select (select id from public.billing_charges where label = 'Pack A') as ca, (select id from public.billing_charges where label = 'Pack B') as cb \gset
select public.mark_activity_read();

-- Client reports
select pg_temp.act_as(:user_grace);
select is(public.billing_payment_details()->'pendingNotices', '[]'::jsonb, 'no notices at first');
select throws_ok(format('select public.report_payment_sent(%L, 0, %L, '''')', :'n1', :'today'), '22023', null, 'the amount is more than $0');
select throws_ok(format('select public.report_payment_sent(%L, 30000, %L, '''')', :'n1', (:'today'::date + 5)), '22023', null,
  'it can''t be sent in the future');
select throws_ok(format('select public.report_payment_sent(%L, 100, %L, '''', array[gen_random_uuid()])', :'n1', :'today'), '22023', null,
  'charges must be the client''s own');
select public.report_payment_sent(:'n1', 50000, :'today', 'Sent from my chequing account') as doc \gset
select is((:'doc'::jsonb->'pendingNotices'->0->>'amountCents')::int, 50000, 'the client sees their pending notice');
select is((:'doc'::jsonb->>'balanceCents')::int, 50000, 'a notice never changes the balance');
select is(public.report_payment_sent(:'n1', 50000, :'today', '')->'pendingNotices'->0->>'message', 'Sent from my chequing account',
  'retrying the same id is a no-op');
select is((public.report_payment_sent(:'n2', 45000, :'today', '')->'pendingNotices'->0->>'amountCents')::int, 45000,
  'reporting the whole balance again updates that notice');
select is(jsonb_array_length(public.report_payment_sent(:'n3', 10000, :'today', 'Half of B', array[:'cb']::uuid[])->'pendingNotices'), 2,
  'a notice for one charge sits beside the whole-balance one');
select is((select e->'chargeLabels' from jsonb_array_elements(public.billing_payment_details()->'pendingNotices') e where e->>'id' = :'n3'),
  '["Pack B"]'::jsonb, 'with the charge it names');
select throws_ok('update public.billing_payment_notices set status = ''confirmed''', '42501', null, 'clients cannot write notices directly');
select throws_ok('select dismiss_reason from public.billing_payment_notices', '42501', null, 'clients cannot read dismiss reasons');
select throws_ok('select public.list_payment_notices()', '42501', null, 'clients cannot list notices');
select throws_ok(format('select public.dismiss_payment_notice(%L, ''No'')', :'n1'), '42501', null, 'clients cannot dismiss');
select throws_ok(format('select public.mark_payment_notice_read(%L)', :'n1'), '42501', null, 'clients cannot mark notices read');

-- Other people
select pg_temp.act_as(:user_maya);
select is((select count(*)::int from public.billing_payment_notices), 0, 'another client sees no notices');
select pg_temp.act_as(:coach_other);
select is(jsonb_array_length(public.list_payment_notices()), 0, 'a coach without access sees none');
select is((select count(*)::int from private.all_staff_activity() where kind = 'payment_notice'), 0, 'nor any in Activity');
select throws_ok(format('select public.record_reported_payment(%L, %L, 10000, %L, ''e_transfer'', '''')', :'n3', :'pay', :'today'),
  '42501', null, 'and cannot confirm one');

-- Activity
select pg_temp.act_as(:coach);
select is((select count(*)::int from private.all_staff_activity() where kind = 'payment_notice' and unread), 2, 'pending notices are unread in Activity');
select is((public.get_staff_activity(p_focused => true)->0->>'kind'), 'payment_notice', 'and listed under Focused');
select public.mark_payment_notice_read(:'n3');
select ok(not (select unread from private.all_staff_activity() where id = :'n3'), 'opening one marks it read');
select is(public.count_unread_activity(), 1, 'the unread count follows');

-- Staff confirm, applied to the named charge first
select is(public.list_payment_notices()->0->>'clientName', 'Grace Liu', 'the coach sees the pending notices with the client');
select public.record_reported_payment(:'n3', :'pay', 10000, :'today', 'e_transfer', '') as doc \gset
select is((select (e->>'paidCents')::int from jsonb_array_elements(:'doc'::jsonb->'charges') e where e->>'id' = :'cb'), 10000,
  'confirming pays the charge the client named, not the oldest');
select is((select status from public.billing_payment_notices where id = :'n3'), 'confirmed', 'and confirms the notice');
select throws_ok(format('select public.record_reported_payment(%L, gen_random_uuid(), 100, %L, ''e_transfer'', '''')', :'n3', :'today'),
  '55000', null, 'a confirmed notice cannot record a second payment');
select ok(not (select unread from private.all_staff_activity() where id = :'n3'), 'a handled notice is no longer unread');

-- Settled by other payments
select pg_temp.act_as(:user_grace);
select public.report_payment_sent(:'n4', 10000, :'today', '', array[:'cb']::uuid[]);
select pg_temp.act_as(:coach);
select public.mark_charges_paid(gen_random_uuid(), array[:'cb']::uuid[], :'today', 'cash', '');
select is((select status from public.billing_payment_notices where id = :'n4'), 'settled', 'a charge notice settles once its charge is paid');
select is((select status from public.billing_payment_notices where id = :'n1'), 'pending', 'the whole-balance notice waits while money is owed');
select public.mark_charges_paid(gen_random_uuid(), array[:'ca']::uuid[], :'today', 'cash', '');
select is((select status from public.billing_payment_notices where id = :'n1'), 'settled', 'and settles once nothing is owed');
select is(jsonb_array_length(public.list_payment_notices()), 0, 'settled notices leave the Billing to-do');

-- Dismiss
select public.add_adjustment(gen_random_uuid(), :grace, :'this_month', 'Pack C', 5000);
select pg_temp.act_as(:user_grace);
select public.report_payment_sent(:'n5', 5000, :'today', '');
select pg_temp.act_as(:coach);
select throws_ok(format('select public.dismiss_payment_notice(%L, '' '')', :'n5'), '22023', null, 'dismissing needs a reason');
select is(jsonb_array_length(public.dismiss_payment_notice(:'n5', 'Not received yet')), 0, 'a dismissed notice leaves the list');

select * from finish();
rollback;
