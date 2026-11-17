begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
end $$;
create function pg_temp.cell(day date,kind text,val jsonb,version integer,request uuid) returns jsonb language sql as $$
  select jsonb_build_object('row_date',day,'kind',kind,'value',val,'expected_version',version,'request_id',request);
$$;
grant execute on all functions in schema pg_temp to authenticated;
\set a '''10000000-0000-4000-b000-000000000001'''
\set ua '''00000000-0000-4000-a000-000000000011'''
\set ub '''00000000-0000-4000-a000-000000000012'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set admin '''00000000-0000-4000-a000-000000000001'''
\set p '''8c000000-0000-4000-a000-000000000001'''
delete from public.nutrition_daily_activity where client_id=:a;
delete from public.nutrition_entry_changes where client_id=:a;
delete from public.bodyweight_logs where client_id=:a;
delete from public.nutrition_logs where client_id=:a;
update public.clients set status='active',timezone='UTC' where id=:a;
update public.service_enrollments set status='active',starts_on=date '2020-01-01',ends_on=null,archived_at=null where client_id=:a and service='nutrition' and status<>'ended';
select id as enrollment from public.service_enrollments where client_id=:a and service='nutrition' and status='active' \gset
select pg_temp.act_as(:admin);
select public.create_nutrition_program(:'enrollment',:p);
select public.save_nutrition_program_draft(:p,1,jsonb_build_object('program_style','Clear checks','start_date',current_date-2,'week_count',4,'maintenance',2500,'calorie_goal',2700,'notes',''));
select public.publish_nutrition_program(:p,2);
select public.get_nutrition_program(:p)#>>'{revision,id}' as revision \gset
select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0,gen_random_uuid()),pg_temp.cell(current_date,'nutrition','{"intake":0,"output":2500,"notes":""}',0,gen_random_uuid())));
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":null,"unit":"lb"}',1,'8d000000-0000-4000-a000-000000000001')))$$,:p,:'revision'),'Delete clears a saved weight');
select is((select weight from public.bodyweight_logs where client_id=:a),null::numeric,'cleared weight is missing rather than zero');
select is((select version from public.bodyweight_logs where client_id=:a),2,'clearing keeps version lineage');
select is((select count(*)::integer from public.bodyweight_logs where client_id=:a),1,'clearing does not physically delete the versioned record');
select is((select before_value->>'weight' from public.nutrition_entry_changes where request_id='8d000000-0000-4000-a000-000000000001'),'200','clear retains previous value in audit');
select is((select after_value->'weight' from public.nutrition_entry_changes where request_id='8d000000-0000-4000-a000-000000000001'),'null'::jsonb,'clear audit retains explicit null');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":null,"unit":"lb"}',1,'8d000000-0000-4000-a000-000000000001')))$$,:p,:'revision'),'clear retry is idempotent');
select is((select version from public.bodyweight_logs where client_id=:a),2,'clear retry does not advance version');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',1,gen_random_uuid())))$$,:p,:'revision'),'PT409',null,'a stale pre-clear tab cannot overwrite');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',2,gen_random_uuid())))$$,:p,:'revision'),'Undo restores cleared value at the current version');
select is((select weight from public.bodyweight_logs where client_id=:a),200::numeric,'restored weight persists');
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":null,"unit":"lb"}',3,gen_random_uuid())));
select is((select version from public.bodyweight_logs where client_id=:a),4,'Redo clears while preserving version');
select pg_temp.act_as(:coach);
select id as activity from public.nutrition_daily_activity where client_id=:a and logged_on=current_date \gset
select public.mark_nutrition_activity_read(:'activity');
select pg_temp.act_as(:ua);
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":null,"output":null,"notes":""}',1,gen_random_uuid())))$$,:p,:'revision'),'Delete clears calorie fields together');
select is((select intake from public.nutrition_logs where client_id=:a),null::integer,'cleared intake is not zero');
select is((select output from public.nutrition_logs where client_id=:a),null::integer,'cleared output is not zero');
select pg_temp.act_as(:coach);
select is((select (item->>'unread')::boolean from jsonb_array_elements(public.get_staff_activity()) item where item->>'id'=:'activity'),true,'clearing previously logged calories makes the daily item unread');
select is((select item->>'status' from jsonb_array_elements(public.get_staff_activity()) item where item->>'id'=:'activity'),'in_progress','clearing inputs removes daily completion');
select pg_temp.act_as(:ua);
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2200,"output":2500,"notes":"","balance":999}',2,gen_random_uuid())))$$,:p,:'revision'),'22023',null,'computed fields cannot be written through the API');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date-1,'weight','{"weight":null,"unit":"lb"}',0,gen_random_uuid()),pg_temp.cell(current_date-1,'nutrition','{"intake":-1,"output":2500,"notes":""}',0,gen_random_uuid())))$$,:p,:'revision'),'23514',null,'a bad member rolls back an entire clear/paste batch');
select is((select count(*)::integer from public.bodyweight_logs where client_id=:a and measured_on=current_date-1),0,'earlier batch writes are rolled back');
select throws_ok('update public.bodyweight_logs set weight=null','42501',null,'clearing still cannot bypass the checked write path');
select pg_temp.act_as(:ub);
select throws_ok(format($$select public.save_nutrition_entry(%L,'weight',current_date,'{"weight":null,"unit":"lb"}',4,gen_random_uuid())$$,:a),'42501',null,'another client cannot clear a weight');
reset role;
select * from finish();
rollback;
