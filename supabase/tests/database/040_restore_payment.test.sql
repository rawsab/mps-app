-- Restoring a payment that was marked unpaid (decision 0053). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''

truncate public.billing_charges, public.billing_payments, public.billing_events cascade;
select private.billing_month() as this_month, private.billing_today() as today \gset

select pg_temp.act_as(:coach);
select (public.add_adjustment(gen_random_uuid(), :grace, :'this_month', 'Session pack', 30000)->'charges'->0->>'id') as charge \gset
select gen_random_uuid() as pay \gset
select public.mark_charges_paid(:'pay', array[:'charge']::uuid[], :'today', 'e_transfer', '');
select is((public.void_payment(:'pay', 'Marked paid by mistake')->'summary'->>'balanceCents')::int, 30000, 'marking unpaid reopens the charge');

select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.restore_payment(%L)', :'pay'), '42501', null, 'a coach without access cannot restore it');
select pg_temp.act_as(:user_grace);
select throws_ok(format('select public.restore_payment(%L)', :'pay'), '42501', null, 'the client cannot restore it');

select pg_temp.act_as(:coach);
select public.restore_payment(:'pay') as doc \gset
select is((:'doc'::jsonb->'summary'->>'balanceCents')::int, 0, 'restoring pays the charge again');
select is((select e->>'status' from jsonb_array_elements(:'doc'::jsonb->'charges') e where e->>'id' = :'charge'), 'paid', 'the charge is paid');
select ok((select e->>'voidedAt' is null and e->>'voidReason' is null from jsonb_array_elements(:'doc'::jsonb->'payments') e where e->>'id' = :'pay'),
  'the payment is no longer void');
select is((public.restore_payment(:'pay')->'summary'->>'balanceCents')::int, 0, 'restoring twice is a no-op');
select is((select count(*)::int from public.billing_events where payment_id = :'pay' and action = 'payment_restored'), 1, 'the restore is audited once');

select * from finish();
rollback;
