begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema pg_temp to authenticated;
\set a '''10000000-0000-4000-b000-000000000001'''
\set ua '''00000000-0000-4000-a000-000000000011'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set admin '''00000000-0000-4000-a000-000000000001'''
\set p '''8f000000-0000-4000-a000-000000000001'''
update public.clients set status='active',timezone='UTC' where id=:a;
update public.service_enrollments set status='active',starts_on=date '2020-01-01',ends_on=null,archived_at=null where client_id=:a and service='nutrition' and status<>'ended';
select id as enrollment from public.service_enrollments where client_id=:a and service='nutrition' and status='active' \gset
select pg_temp.act_as(:coach);
select public.create_nutrition_program(:'enrollment',:p);
select is(public.get_nutrition_program(:p)#>>'{revision,weight_unit}','lb','new programs default to pounds');
select public.save_nutrition_program_draft(:p,1,jsonb_build_object('program_style','Unit test','start_date',current_date-2,'week_count',4,'maintenance',2500,'calorie_goal',2700,'notes','','weight_unit','kg'));
select is(public.get_nutrition_program(:p)#>>'{revision,weight_unit}','kg','coach unit choice survives draft reload');
select throws_ok(format($$select public.save_nutrition_program_draft(%L,2,'{"program_style":"Invalid","start_date":null,"week_count":4,"maintenance":null,"calorie_goal":null,"notes":"","weight_unit":"oz"}')$$,:p),'22P02',null,'database rejects unsupported units');
select pg_temp.act_as(:admin);
select public.publish_nutrition_program(:p,2);
select public.get_nutrition_program(:p)#>>'{revision,id}' as published \gset
select pg_temp.act_as(:ua);
select is(public.get_nutrition_program(:p)#>>'{revision,weight_unit}','kg','client receives the published unit');
select throws_ok(format($$select public.save_nutrition_program_draft(%L,null,'{}')$$,:p),'42501',null,'client cannot change the program unit');
select pg_temp.act_as(:coach);
select public.save_nutrition_program_draft(:p,null,jsonb_build_object('program_style','Unit test','start_date',current_date-2,'week_count',4,'maintenance',2500,'calorie_goal',2700,'notes','','weight_unit','lb'));
select is(public.get_nutrition_program(:p)#>>'{revision,weight_unit}','lb','coach can switch back to pounds');
select is(public.get_nutrition_program(:p,true)#>>'{revision,weight_unit}','kg','unpublished unit changes stay private');
select pg_temp.act_as(:admin);
select public.publish_nutrition_program(:p,1);
select pg_temp.act_as(:ua);
select is(public.get_nutrition_program(:p)#>>'{revision,weight_unit}','lb','client receives switched unit after publishing');
reset role;
select throws_ok(format($$update public.nutrition_program_revisions set weight_unit='lb' where id=%L$$,:'published'),'55000',null,'published unit is immutable');
select * from finish();
rollback;
