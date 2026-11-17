begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.act_as(uuid) to authenticated;
\set a '''10000000-0000-4000-b000-000000000001'''
\set ua '''00000000-0000-4000-a000-000000000011'''
\set ub '''00000000-0000-4000-a000-000000000012'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set other_coach '''00000000-0000-4000-a000-000000000003'''
delete from public.nutrition_entry_changes where client_id = :a;
delete from public.nutrition_logs where client_id = :a;
delete from public.bodyweight_logs where client_id = :a;
delete from public.nutrition_targets where client_id = :a;
update public.clients set status = 'active', timezone = 'Pacific/Kiritimati' where id = :a;
update public.service_enrollments set status = 'active', starts_on = date '2020-01-01', ends_on = null, archived_at = null where client_id = :a and service = 'nutrition' and status <> 'ended';
select (now() at time zone 'Pacific/Kiritimati')::date::text as today \gset
create function pg_temp.target_value(d date, goal integer default 2200) returns jsonb language sql as $$
  select jsonb_build_object('style','Maintenance','starts_on', d, 'ends_on', null, 'calorie_goal', goal,
    'maintenance', 2300, 'baseline_weight', null, 'weight_unit','lb','notes','Client instructions');
$$;
grant execute on function pg_temp.target_value(date,integer) to authenticated;

select pg_temp.act_as(:coach);
select lives_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date - 10), '81000000-0000-4000-a000-000000000001')$$, :a, :'today'), 'assigned coach assigns first historical target');
select lives_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date - 10), '81000000-0000-4000-a000-000000000001')$$, :a, :'today'), 'lost-response retry returns same target');
select is((select count(*)::integer from public.nutrition_targets where client_id = :a), 1, 'retry creates one target');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date - 10, 2500), '81000000-0000-4000-a000-000000000001')$$, :a, :'today'), '22023', null, 'retry cannot change target payload');
select lives_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date, 2500), gen_random_uuid())$$, :a, :'today'), 'coach assigns a new effective target');
select is((select calorie_goal from public.nutrition_targets where client_id = :a and starts_on = :'today'::date - 10), 2200, 'earlier target is unchanged');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date - 1), gen_random_uuid())$$, :a, :'today'), '22023', null, 'cannot insert backdated replacement');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date), gen_random_uuid())$$, :a, :'today'), '22023', null, 'cannot replace same-day target');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date + 1) || '{"calorie_goal":1.5}'::jsonb, gen_random_uuid())$$, :a, :'today'), '22023', null, 'fractional calories refused');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date + 1) || '{"calorie_goal":-1}'::jsonb, gen_random_uuid())$$, :a, :'today'), '23514', null, 'negative calories refused');
select throws_ok($$update public.nutrition_targets set calorie_goal = 1$$, '42501', null, 'targets cannot be mutated directly');

select pg_temp.act_as(:ua);
select is(public.get_nutrition(:a)->>'today', :'today', 'dates use client timezone, not browser or server calendar');
select is((public.get_nutrition(:a)->>'can_assign')::boolean, false, 'client cannot assign');
select throws_ok(format($$select public.assign_nutrition_target(%L, pg_temp.target_value(%L::date + 1), gen_random_uuid())$$, :a, :'today'), '42501', null, 'client cannot assign via RPC');
select lives_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":150.5,"unit":"lb"}',0,'82000000-0000-4000-a000-000000000001')$$, :a, :'today'), 'client saves today weight');
select lives_ok(format($$select public.save_nutrition_entry(%L,'nutrition',%L::date - 1,'{"intake":0,"output":null,"notes":"Yesterday"}',0,'82000000-0000-4000-a000-000000000002')$$, :a, :'today'), 'client saves yesterday calories separately');
select is((select measured_on::text from public.bodyweight_logs where client_id = :a), :'today', 'weight date retained');
select is((select activity_on from public.nutrition_logs where client_id = :a), :'today'::date - 1, 'calorie activity date retained');
select is((select intake from public.nutrition_logs where client_id = :a), 0, 'actual zero retained');
select is((select output from public.nutrition_logs where client_id = :a), null::integer, 'unknown output stays null');
select lives_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":150.5,"unit":"lb"}',0,'82000000-0000-4000-a000-000000000001')$$, :a, :'today'), 'lost response can be retried with original version');
select is((select count(*)::integer from public.bodyweight_logs where client_id = :a), 1, 'retry does not duplicate weigh-in');
select is((select count(*)::integer from public.nutrition_entry_changes where client_id = :a), 2, 'retry does not duplicate history');
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":151,"unit":"lb"}',0,gen_random_uuid())$$, :a, :'today'), 'PT409', null, 'stale tab cannot overwrite');
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',%L::date + 1,'{"weight":151,"unit":"lb"}',0,gen_random_uuid())$$, :a, :'today'), '22023', null, 'future measurement refused');
select throws_ok(format($$select public.save_nutrition_entry(%L,'nutrition',%L,'{"intake":1.2,"output":null,"notes":""}',0,gen_random_uuid())$$, :a, :'today'), '22023', null, 'fractional calorie entry refused');
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":0,"unit":"kg"}',1,gen_random_uuid())$$, :a, :'today'), '23514', null, 'zero weight refused');
select throws_ok($$delete from public.nutrition_logs$$, '42501', null, 'direct writes denied');

select pg_temp.act_as(:ub);
select is((select count(*)::integer from public.nutrition_logs where client_id = :a), 0, 'other client cannot read table');
select throws_ok(format('select public.get_nutrition(%L)', :a), '42501', null, 'other client cannot read RPC');
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":1,"unit":"lb"}',1,gen_random_uuid())$$, :a, :'today'), '42501', null, 'other client cannot correct');
select pg_temp.act_as(:other_coach);
select is((select count(*)::integer from public.nutrition_targets where client_id = :a), 0, 'unassigned coach cannot read targets');
select throws_ok(format('select public.get_nutrition(%L)', :a), '42501', null, 'unassigned coach denied');

select pg_temp.act_as(:coach);
select lives_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":68,"unit":"kg"}',1,'82000000-0000-4000-a000-000000000003')$$, :a, :'today'), 'coach corrects weight and unit');
select is((select version from public.bodyweight_logs where client_id = :a), 2, 'correction increments version');
select is((select updated_by_staff from public.bodyweight_logs where client_id = :a), true, 'coach attribution stored');
select is((select before_value->>'weight' from public.nutrition_entry_changes where request_id = '82000000-0000-4000-a000-000000000003'), '150.5', 'before value retained');
select is((select after_value->>'weight' from public.nutrition_entry_changes where request_id = '82000000-0000-4000-a000-000000000003'), '68', 'after value retained');
select is(jsonb_array_length(public.get_nutrition(:a)->'changes'), 3, 'reader includes attributed history');

reset role;
update public.service_enrollments set status = 'paused' where client_id = :a and service = 'nutrition' and status <> 'ended';
select pg_temp.act_as(:ua);
select is((public.get_nutrition(:a)->>'can_log')::boolean, false, 'paused service remains read only');
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',%L,'{"weight":69,"unit":"kg"}',2,gen_random_uuid())$$, :a, :'today'), '42501', null, 'paused client cannot write');
reset role;
update public.clients set status = 'disabled' where id = :a;
select pg_temp.act_as(:ua);
select is((select count(*)::integer from public.bodyweight_logs), 0, 'disabled client loses table access');
select throws_ok(format('select public.get_nutrition(%L)', :a), '42501', null, 'disabled client loses RPC access');
reset role;
set local role anon;
select throws_ok(format('select public.get_nutrition(%L)', :a), '42501', null, 'anonymous RPC access denied');
select throws_ok('select * from public.nutrition_targets', '42501', null, 'anonymous table access denied');
reset role;
select * from finish();
rollback;
