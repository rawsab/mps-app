begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.cell(day date,kind text,val jsonb,version integer) returns jsonb language sql as $$
  select jsonb_build_object('row_date',day,'kind',kind,'value',val,'expected_version',version,'request_id',gen_random_uuid());
$$;
grant execute on all functions in schema pg_temp to authenticated;
\set a '''10000000-0000-4000-b000-000000000001'''
\set ua '''00000000-0000-4000-a000-000000000011'''
\set ub '''00000000-0000-4000-a000-000000000012'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set other '''00000000-0000-4000-a000-000000000003'''
\set admin '''00000000-0000-4000-a000-000000000001'''
\set p '''8e000000-0000-4000-a000-000000000001'''
\set p2 '''8e000000-0000-4000-a000-000000000002'''
delete from public.nutrition_daily_activity where client_id=:a;
delete from public.nutrition_entry_changes where client_id=:a;
delete from public.bodyweight_logs where client_id=:a;
delete from public.nutrition_logs where client_id=:a;
update public.clients set status='active',timezone='UTC' where id=:a;
update public.service_enrollments set status='active',starts_on=date '2020-01-01',ends_on=null,archived_at=null where client_id=:a and service='nutrition' and status<>'ended';
select id as enrollment from public.service_enrollments where client_id=:a and service='nutrition' and status='active' \gset
select pg_temp.act_as(:coach);
select public.create_nutrition_program(:'enrollment',:p);
select public.save_nutrition_program_draft(:p,1,jsonb_build_object('program_style','Coach corrections','start_date',current_date-2,'week_count',4,'maintenance',2500,'calorie_goal',2700,'notes',''));
select public.get_nutrition_program(:p)#>>'{revision,id}' as rev1 \gset
select is((public.get_nutrition_program(:p)->>'can_log')::boolean,true,'assigned coach can edit the working sheet before publication');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date-1,'weight','{"weight":199,"unit":"lb"}',0),pg_temp.cell(current_date-1,'nutrition','{"intake":2000,"output":null,"notes":""}',0)))$$,:p,:'rev1'),'coach records actuals from an unpublished working sheet');
select is((select intake_updated_by_staff from public.nutrition_logs where client_id=:a),true,'coach-entered intake is attributed');
select is((select output_updated_by_staff from public.nutrition_logs where client_id=:a),false,'unfilled output is not attributed');
select is((select count(*)::integer from public.nutrition_daily_activity where client_id=:a),0,'coach edits do not create client notifications');
select pg_temp.act_as(:ua);
select throws_ok(format('select public.get_nutrition_program(%L)',:p),'42501',null,'clients still cannot read a draft program');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0)))$$,:p,:'rev1'),'42501',null,'clients cannot write through an unpublished program');
select pg_temp.act_as(:admin);
select public.publish_nutrition_program(:p,2);
select pg_temp.act_as(:ua);
select is((select (e->>'weight')::numeric from jsonb_array_elements(public.get_nutrition_program(:p)->'weights') e where e->>'measured_on'=(current_date-1)::text),199::numeric,'client sees previously recorded coach actuals when the program is published');
select public.save_nutrition_program_entries(:p,:'rev1',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0),pg_temp.cell(current_date,'nutrition','{"intake":2400,"output":2600,"notes":""}',0)));
select pg_temp.act_as(:coach);
select public.save_nutrition_program_draft(:p,null,jsonb_build_object('program_style','Private revision','start_date',current_date-2,'week_count',4,'maintenance',2500,'calorie_goal',2700,'notes',''));
select public.get_nutrition_program(:p)#>>'{revision,id}' as rev2 \gset
select is((public.get_nutrition_program(:p)->>'can_log')::boolean,true,'working draft remains editable after an earlier publication');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2300,"output":2600,"notes":""}',1)))$$,:p,:'rev2'),'coach corrects intake directly in the working draft sheet');
select pg_temp.act_as(:ua);
select is(public.get_nutrition_program(:p)#>>'{revision,program_style}','Coach corrections','client still sees published program details');
select is((select (e->>'intake')::integer from jsonb_array_elements(public.get_nutrition_program(:p)->'entries') e where e->>'activity_on'=(current_date-1)::text),2300,'coach correction reaches the client without republishing');
select is((select (e->>'intake_updated_by_staff')::boolean from jsonb_array_elements(public.get_nutrition_program(:p)->'entries') e where e->>'activity_on'=(current_date-1)::text),true,'client response carries the coach cell marker');
select is((select output_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),false,'unchanged client output is not marked as coach-edited');
select public.save_nutrition_program_entries(:p,:'rev1',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2300,"output":2700,"notes":""}',2)));
select is((select intake_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),true,'client changing output preserves coach intake attribution');
select is((select output_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),false,'client output retains client attribution');
select public.save_nutrition_program_entries(:p,:'rev1',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2200,"output":2700,"notes":""}',3)));
select is((select intake_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),false,'client changing intake clears only its coach marker');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',1)))$$,:p,:'rev2'),'PT409',null,'client cannot write through the private working revision');
select pg_temp.act_as(:coach);
select public.save_nutrition_program_entries(:p,:'rev2',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2200,"output":2800,"notes":""}',4),pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',1)));
select is((select intake_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),false,'coach output edit does not mark unchanged intake');
select is((select output_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),true,'changed output is marked');
select public.save_nutrition_program_entries(:p,:'rev2',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2200,"output":null,"notes":""}',5)));
select is((select output_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),true,'coach-cleared cells retain attribution');
select public.save_nutrition_program_entries(:p,:'rev2',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2200,"output":null,"notes":"Coach note"}',6)));
select is((select intake_updated_by_staff from public.nutrition_logs where client_id=:a and activity_on=current_date-1),false,'notes-only changes do not attribute untouched cells');
select pg_temp.act_as(:ua);
select is((select (e->>'weight')::numeric from jsonb_array_elements(public.get_nutrition_program(:p)->'weights') e where e->>'measured_on'=current_date::text),201::numeric,'coach weight correction reaches the published client sheet');
select is((select (e->>'updated_by_staff')::boolean from jsonb_array_elements(public.get_nutrition_program(:p)->'weights') e where e->>'measured_on'=current_date::text),true,'client weight response identifies coach correction');
select throws_ok('update public.nutrition_logs set intake_updated_by_staff=true','42501',null,'client cannot forge cell attribution');
select pg_temp.act_as(:other);
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',2)))$$,:p,:'rev2'),'42501',null,'unassigned coach cannot edit the working sheet');
select pg_temp.act_as(:admin);
select public.create_nutrition_program(:'enrollment',:p2);
select public.get_nutrition_program(:p2)#>>'{revision,id}' as other_rev \gset
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',2)))$$,:p,:'other_rev'),'PT409',null,'revision from another program cannot authorize a write');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date+1,'weight','{"weight":202,"unit":"lb"}',0)))$$,:p,:'rev2'),'22023',null,'actual values for future dates remain protected');
select public.remove_nutrition_program(:p,1,true);
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',2)))$$,:p,:'rev2'),'55000',null,'archive remains read-only for staff');
reset role;
select * from finish();
rollback;
