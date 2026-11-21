-- Billing (decision 0053). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(74);

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
-- Records attendance on a PT meeting that started `ago` before now.
create function pg_temp.attended(p_client uuid, p_minutes integer, p_ago interval, p_status text) returns uuid language plpgsql as $$
declare
  mid uuid;
begin
  perform pg_temp.act_as('00000000-0000-4000-a000-000000000002');
  mid := (public.add_meeting(p_client, '{personal_training}', now() + interval '3 days', p_minutes)->>'id')::uuid;
  perform pg_temp.reset_role();
  update public.meetings set starts_at = now() - p_ago where id = mid;
  perform pg_temp.act_as('00000000-0000-4000-a000-000000000002');
  perform public.record_attendance(mid, p_status);
  return mid;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_maya   '''00000000-0000-4000-a000-000000000011'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set maya        '''10000000-0000-4000-b000-000000000001'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set daily       '''[{"cycleWeek":1,"weekday":1,"startTime":"07:00","durationMinutes":60},{"cycleWeek":1,"weekday":3,"startTime":"07:00","durationMinutes":60}]'''

truncate public.meeting_schedules, public.meetings, public.billing_charges, public.billing_payments, public.billing_events,
  public.client_service_rates, public.client_session_rates cascade;
-- Grace starts with Mesocycle and PT (seed); Nutrition is added below.
delete from public.service_enrollments where client_id = :grace and service = 'nutrition';
delete from public.service_enrollments where client_id = :maya and service = 'personal_training';
select current_date + (8 - extract(isodow from current_date)::integer) as mon \gset
select private.billing_month() as this_month, private.billing_today() as today,
  (private.billing_month() - interval '1 month')::date as last_month, (private.billing_month() + interval '1 month')::date as next_month \gset

-- ---------------------------------------------------------------------------
-- Defaults and settings
-- ---------------------------------------------------------------------------
select is((select jsonb_object_agg(key, amount_cents) from public.billing_rates),
  '{"pt_solo_60":10000,"pt_solo_40":7000,"pt_partner_60":12000,"pt_partner_40":8500,"mesocycle_month":20000,"nutrition_month":20000,"bundle_discount_month":10000}'::jsonb,
  'default prices are seeded in cents');
select pg_temp.act_as(:coach);
select throws_ok('select public.save_billing_settings(''America/Toronto'', ''{"pt_solo_60":11000}'')', '42501', null,
  'coaches cannot change default prices');
select pg_temp.act_as(:admin);
select throws_ok('select public.save_billing_settings(''Mars/Base'', ''{}'')', '22023', null, 'the time zone must exist');
select throws_ok('select public.save_billing_settings(''America/Toronto'', ''{"pt_solo_60":110.5}'')', '22023', null, 'rates are whole cents');
select is((public.save_billing_settings('America/Toronto', '{"pt_solo_40":7500}')->'rates'->>'pt_solo_40')::int, 7500, 'admins change default prices');
select public.save_billing_settings('America/Toronto', '{"pt_solo_40":7000}') is not null as ok \gset

-- ---------------------------------------------------------------------------
-- Monthly programming
-- ---------------------------------------------------------------------------
select pg_temp.reset_role();
select private.charge_programming_months();
select id as p1 from public.billing_charges where client_id = :grace and kind = 'programming' \gset
select is((select amount_cents from public.billing_charges where id = :'p1'), 20000, 'an active Mesocycle service is charged this month');
select is((select period from public.billing_charges where id = :'p1'), :'this_month'::date, 'for the current month');
select private.charge_programming_months();
select is((select count(*)::int from public.billing_charges where client_id = :grace and kind = 'programming'), 1, 'the monthly job is idempotent');

insert into public.service_enrollments (client_id, service, status, starts_on) values (:grace, 'nutrition', 'active', :'today');
select is((select amount_cents from public.billing_charges where id = :'p1'), 30000, 'a service added mid-month joins the unpaid charge with the bundle discount');
select is((select jsonb_agg(jsonb_build_array(kind, amount_cents) order by position) from public.billing_charge_lines where charge_id = :'p1'),
  '[["service",20000],["service",20000],["bundle_discount",-10000]]'::jsonb, 'itemized as Mesocycle, Nutrition and the discount');
update public.service_enrollments set starts_on = starts_on where client_id = :grace and service = 'nutrition';
select is((select count(*)::int from public.billing_charge_lines where client_id = :grace and kind = 'bundle_discount'), 1, 'the discount is applied once');

insert into public.service_enrollments (client_id, service, status, starts_on) values (:maya, 'personal_training', 'paused', :'today');
select is((select count(*)::int from public.billing_charge_lines where client_id = :maya and kind = 'session'), 0, 'PT has no monthly charge');

-- ---------------------------------------------------------------------------
-- Isolation
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:user_grace);
select is((public.get_client_billing(:grace)->'summary'->>'balanceCents')::int, 30000, 'the client reads their own balance');
select throws_ok(format('select public.get_client_billing(%L)', :maya), '42501', null, 'but not another client''s');
select is((select count(*)::int from public.billing_charges where client_id = :maya), 0, 'nor their charges');
select throws_ok(format('insert into public.billing_charges (client_id, kind, period, occurred_on, label) values (%L, ''adjustment'', %L, %L, ''x'')',
  :grace, :'this_month', :'today'), '42501', null, 'clients cannot write charges');
select throws_ok('select note from public.billing_payments', '42501', null, 'payment notes are not readable directly');
select throws_ok(format('select public.record_payment(gen_random_uuid(), %L, 100, current_date - 1, ''e_transfer'', '''')', :grace), '42501', null,
  'clients cannot record payments');
select pg_temp.act_as(:coach_other);
select throws_ok(format('select public.get_client_billing(%L)', :grace), '42501', null, 'an unassigned coach cannot read billing');
select is(jsonb_array_length(public.billing_overview()->'clients'), 0, 'and sees no one in the overview');
select pg_temp.act_as(:user_maya);
select throws_ok('select public.billing_overview()', '42501', null, 'clients cannot read the overview');

-- ---------------------------------------------------------------------------
-- Session charges
-- ---------------------------------------------------------------------------
select pg_temp.attended(:grace, 60, interval '3 hours', 'completed') as m1 \gset
select pg_temp.reset_role();
select id as s1 from public.billing_charges where meeting_id = :'m1' \gset
select is((select array[label, amount_cents::text] from public.billing_charges where id = :'s1'), array['Personal training · 60 min', '10000'],
  'an attended session is charged the default price');

select pg_temp.act_as(:coach);
select is((public.set_meeting_billing(:'m1', 'solo', 9000)->'charge'->>'amountCents')::int, 9000, 'a new price updates the open charge');
select is((select amount_cents from public.client_session_rates where client_id = :grace and session_type = 'solo_60'), 9000,
  'and becomes the client''s rate');
select pg_temp.attended(:grace, 60, interval '2 hours', 'completed') as m2 \gset
select pg_temp.reset_role();
select id as s2 from public.billing_charges where meeting_id = :'m2' \gset
select is((select amount_cents from public.billing_charges where id = :'s2'), 9000, 'the next session uses the last price');

select pg_temp.attended(:grace, 60, interval '90 minutes', 'no_show') as m3 \gset
select pg_temp.reset_role();
select is((select label from public.billing_charges where meeting_id = :'m3' and voided_at is null), 'Personal training · 60 min · No-show',
  'a no-show is charged and labelled');
select pg_temp.act_as(:coach);
select public.correct_attendance(:'m3', 'scheduled', 'Recorded the wrong meeting') is not null as ok \gset
select pg_temp.reset_role();
select is((select void_reason from public.billing_charges where meeting_id = :'m3'), 'Attendance changed', 'undoing attendance voids the charge');
select pg_temp.act_as(:coach);
select public.record_attendance(:'m3', 'no_show') is not null as ok \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.billing_charges where meeting_id = :'m3' and voided_at is null), 1, 'recording it again charges again');

select pg_temp.attended(:grace, 30, interval '1 hour', 'completed') as m4 \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.billing_charges where meeting_id = :'m4'), 0, 'a length without a price is not charged');
select pg_temp.act_as(:coach);
select ok(exists (select 1 from jsonb_array_elements(public.list_sessions_needing_price()) e where e->>'meetingId' = :'m4'),
  'it waits on "Needs a price"');
select is(public.get_meeting_billing(:'m4')->>'resolvedPriceCents', null, 'its price is missing, not zero');
select is((public.set_meeting_billing(:'m4', 'solo', 5000)->'charge'->>'amountCents')::int, 5000, 'setting a price charges it');
select ok(not exists (select 1 from jsonb_array_elements(public.list_sessions_needing_price()) e where e->>'meetingId' = :'m4'),
  'and it leaves the list');
select pg_temp.reset_role();
select id as s4 from public.billing_charges where meeting_id = :'m4' \gset

select pg_temp.act_as(:coach);
select public.add_meeting(:grace, '{nutrition}', now() + interval '3 days', 60)->>'id' as nm \gset
select pg_temp.reset_role();
update public.meetings set starts_at = now() - interval '4 hours' where id = :'nm';
select pg_temp.act_as(:coach);
select public.record_attendance(:'nm', 'completed') is not null as ok \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.billing_charges where meeting_id = :'nm'), 0, 'meetings without PT are never charged');

-- Billing starts with the service, never before the day it was added.
select pg_temp.reset_role();
update public.service_enrollments set status = 'active' where client_id = :maya and service = 'personal_training';
select pg_temp.attended(:maya, 60, interval '2 days', 'completed') as before_start \gset
select pg_temp.attended(:maya, 60, interval '1 minute', 'completed') as after_start \gset
select pg_temp.reset_role();
select is((select count(*)::int from public.billing_charges where meeting_id = :'before_start'), 0, 'sessions before the service was added are not charged');
select is((select count(*)::int from public.billing_charges where meeting_id = :'after_start'), 1, 'sessions after it are');

-- ---------------------------------------------------------------------------
-- Payments
-- ---------------------------------------------------------------------------
-- Grace now owes P1 30000 + S1 9000 + S2 9000 + S3 9000 (no-show) + S4 5000 = 62000.
select id as s3 from public.billing_charges where meeting_id = :'m3' and voided_at is null \gset
select pg_temp.act_as(:coach);
select is((public.get_client_billing(:grace)->'summary'->>'balanceCents')::int, 62000, 'the balance sums open charges');

select gen_random_uuid() as pay1 \gset
select gen_random_uuid() as pay2 \gset
select gen_random_uuid() as pay3 \gset
select throws_ok(format('select public.record_payment(%L, %L, 0, current_date - 1, ''e_transfer'', '''')', :'pay1', :grace), '22023', null,
  'a payment is more than $0');
select throws_ok(format('select public.record_payment(%L, %L, 100, current_date + 5, ''e_transfer'', '''')', :'pay1', :grace), '22023', null,
  'and not received in the future');
select public.record_payment(:'pay1', :grace, 5000, (:'today'::date - 1), 'e_transfer', 'Ref 1234', array[:'s2'::uuid]) as doc \gset
select is((select e->>'status' from jsonb_array_elements(:'doc'::jsonb->'charges') e where e->>'id' = :'s2'), 'part_paid',
  'a partial payment leaves the chosen charge part paid');
select is((:'doc'::jsonb->'summary'->>'balanceCents')::int, 57000, 'and lowers the balance');
select is((:'doc'::jsonb->'payments'->0->>'note'), 'Ref 1234', 'staff see the payment note');

select is((public.mark_charges_paid(:'pay2', array[:'p1'::uuid], :'today', 'e_transfer', '')->'summary'->>'balanceCents')::int, 27000,
  'marking the month paid pays exactly what is left');
select is((public.mark_charges_paid(:'pay2', array[:'p1'::uuid], :'today', 'e_transfer', '')->'summary'->>'balanceCents')::int, 27000,
  'a retried mark-paid is recorded once');
select throws_ok(format('select public.mark_charges_paid(gen_random_uuid(), array[%L::uuid], %L, ''e_transfer'', '''')', :'p1', :'today'),
  '55000', null, 'a paid charge cannot be marked paid again');

select public.record_payment(:'pay3', :grace, 30000, :'today', 'cash', '') as doc \gset
select is((:'doc'::jsonb->'summary'->>'creditCents')::int, 3000, 'an overpayment pays the oldest charges and leaves credit');
select is((:'doc'::jsonb->'summary'->>'balanceCents')::int, -3000, 'so the balance is negative');
select ok((select bool_and(e->>'status' = 'paid') from jsonb_array_elements(:'doc'::jsonb->'charges') e where e->>'status' <> 'void'),
  'every open charge is paid');

select public.add_adjustment(gen_random_uuid(), :grace, :'last_month', 'Opening balance', 10000) as doc \gset
select is((:'doc'::jsonb->'summary'->>'creditCents')::int, 0, 'credit is applied to a new charge');
select is((:'doc'::jsonb->'summary'->>'carriedOverCents')::int, 7000, 'an opening balance counts as carried over');
select throws_ok(format('select public.add_adjustment(gen_random_uuid(), %L, %L, ''Next'', 100)', :grace,
  :'next_month'), '22023', null, 'adjustments cannot be in a future month');

select throws_ok(format('select public.void_payment(%L, '' '')', :'pay3'), '22023', null, 'voiding needs a reason');
select is((public.void_payment(:'pay3', 'Bounced')->'summary'->>'balanceCents')::int, 37000, 'a voided payment reopens its charges');

select is((public.void_charge(:'p1', 'Comped this month')->'summary'->>'balanceCents')::int, 7000,
  'voiding a paid charge turns its payment into credit for the other charges');
select throws_ok(format('select public.edit_charge_line(%L, ''Personal training · 60 min'', 1000)',
  (select id from public.billing_charge_lines where charge_id = :'s1')), '55000', null, 'a charge cannot drop below what is paid');

select pg_temp.reset_role();
select throws_ok(format('insert into public.billing_allocations (payment_id, charge_id, client_id, amount_cents) values (%L, %L, %L, 9999999)',
  :'pay1', :'s4', :grace), '23514', null, 'the database refuses over-allocation');

-- Waived sessions stay waived.
select pg_temp.act_as(:coach);
select public.void_charge(:'s4', 'Waived') is not null as ok \gset
select public.set_meeting_billing(:'m4', 'solo', 6000) is not null as ok \gset
select is((select count(*)::int from public.billing_charges where meeting_id = :'m4' and voided_at is null), 0,
  'changing a waived session''s price does not charge it again');

-- What the client sees.
select pg_temp.act_as(:user_grace);
select ok(not exists (select 1 from jsonb_array_elements(public.get_client_billing(:grace)->'charges') e where e->>'status' = 'void'),
  'clients do not see void charges');
select ok(not exists (select 1 from jsonb_array_elements(public.get_client_billing(:grace)->'payments') e where e->>'note' is not null),
  'or payment notes');
select is(jsonb_array_length(public.get_client_billing(:grace)->'payments'), 2, 'or void payments');
select is((select count(*)::int from public.billing_events), 0, 'clients cannot read the billing audit');
select pg_temp.act_as(:coach);
select ok((select count(*) from public.billing_events where client_id = :grace and action = 'payment_voided') = 1, 'staff can');

-- ---------------------------------------------------------------------------
-- Client rates and the overview
-- ---------------------------------------------------------------------------
select throws_ok(format('select public.set_client_service_rate(%L, ''pt_solo_60'', 100)', :grace), '22023', null, 'only monthly rates are service rates');
select public.set_client_service_rate(:grace, 'mesocycle_month', 15000) as doc \gset
select is((:'doc'::jsonb->>'planCents')::int, 25000, 'a custom rate changes the monthly plan');
select is((select amount_cents from public.billing_charge_lines where charge_id = :'p1' and service = 'mesocycle'), 20000,
  'but never an existing charge');
select is((public.set_client_service_rate(:grace, 'mesocycle_month', null)->>'planCents')::int, 30000, 'null resets to the default');
select ok(exists (select 1 from jsonb_array_elements(public.billing_overview()->'clients') e
  where e->>'clientId' = :grace and (e->'summary'->>'balanceCents')::int = 2000), 'the overview lists the client''s balance');

-- ---------------------------------------------------------------------------
-- Patterns and the e-transfer email
-- ---------------------------------------------------------------------------
select public.create_meeting_schedule(:grace, '{personal_training}', 1, null, :'mon', null, :daily)->>'id' as sched \gset
select public.set_meeting_schedule_format(:'sched', 'partner') is not null as ok \gset
select is((select count(*)::int from public.meetings where schedule_id = :'sched' and format <> 'partner'), 0,
  'a pattern''s format applies to its future meetings');
select is((select e->>'format' from jsonb_array_elements(public.get_client_meetings(:grace)->'schedules') e where e->>'id' = :'sched'), 'partner',
  'the pattern document carries its format');
select is((public.get_meeting_billing((select id from public.meetings where schedule_id = :'sched' limit 1))->>'resolvedPriceCents')::int, 12000,
  'and a partner hour uses the partner price');

select throws_ok('select public.save_etransfer_email(''not an email'')', '22023', null, 'the e-transfer email must be valid');
select is(public.save_etransfer_email('  priya.pay@example.test ')->>'etransferEmail', 'priya.pay@example.test', 'coaches save an e-transfer email');
select pg_temp.act_as(:user_grace);
select is(public.billing_payment_details()->>'etransferEmail', 'priya.pay@example.test', 'the client sees their primary coach''s email');
select throws_ok('select public.save_etransfer_email(''me@example.test'')', '42501', null, 'clients cannot set one');

select * from finish();
rollback;
