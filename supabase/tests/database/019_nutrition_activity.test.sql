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
\set other '''00000000-0000-4000-a000-000000000003'''
\set p '''8a000000-0000-4000-a000-000000000001'''
-- Isolate the feed from the demo's other notification types.
truncate public.meeting_requests, public.service_requests cascade;
truncate public.nutrition_daily_activity cascade;
truncate public.training_sessions cascade;
delete from public.staff_activity_reads;
delete from public.nutrition_entry_changes where client_id=:a;
delete from public.bodyweight_logs where client_id=:a;
delete from public.nutrition_logs where client_id=:a;
update public.clients set status='active',timezone='UTC' where id=:a;
-- Isolate the chosen notification destination from existing overlapping development programs.
-- This archive change is rolled back with every other fixture change below.
update public.nutrition_programs set archived_at=now() where client_id=:a;
update public.service_enrollments set status='active',starts_on=date '2020-01-01',ends_on=null,archived_at=null where client_id=:a and service='nutrition' and status<>'ended';
select id as enrollment from public.service_enrollments where client_id=:a and service='nutrition' and status='active' \gset
select pg_temp.act_as(:admin);
select public.create_nutrition_program(:'enrollment',:p);
select public.save_nutrition_program_draft(:p,1,jsonb_build_object('program_style','Daily nutrition','start_date',current_date-2,'week_count',4,'maintenance',2600,'calorie_goal',2800,'notes',''));
select public.publish_nutrition_program(:p,2);
select public.get_nutrition_program(:p)#>>'{revision,id}' as revision \gset

select pg_temp.act_as(:ua);
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0,'8b000000-0000-4000-a000-000000000001')))$$,:p,:'revision'),'client saves weight');
select is((select count(*)::integer from public.nutrition_daily_activity),0,'clients cannot read staff-only activity rows');
select throws_ok('select public.get_staff_activity()','42501',null,'clients cannot read Reviews');
select pg_temp.act_as(:coach);
select is(public.count_unread_activity(),1,'weight creates an unread coach notification');
select public.get_staff_activity()->0->>'id' as activity \gset
select public.get_staff_activity()->0->>'activityAt' as first_at \gset
select is(public.get_staff_activity()->0->>'kind','nutrition','notification is a nutrition item');
select is(public.get_staff_activity()->0->>'status','in_progress','weight alone is a partial daily entry');
select is(public.get_staff_activity()->0->>'programId',:p,'notification links to the published nutrition program');
select is(public.get_staff_activity()->0->>'loggedOn',current_date::text,'notification uses weigh-in date');

select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0,'8b000000-0000-4000-a000-000000000001')));
select pg_temp.act_as(:coach);
select is(public.get_staff_activity()->0->>'activityAt',:'first_at','lost-response retry does not update notification time');
select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',1,gen_random_uuid())));
select pg_temp.act_as(:coach);
select is(public.get_staff_activity()->0->>'activityAt',:'first_at','saving identical data does not notify again');
select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":0,"output":2500,"notes":""}',0,'8b000000-0000-4000-a000-000000000002')));
select pg_temp.act_as(:coach);
select is(public.count_unread_activity(),1,'same-day calories merge into one notification');
select is(public.get_staff_activity()->0->>'id',:'activity','daily activity id stays stable');
select is(public.get_staff_activity()->0->>'status','completed','all three saved values complete the daily entry');
select is((public.get_staff_activity()->0->>'intake')::integer,0,'actual zero calorie intake appears in notification');
select is((public.get_client_activity(:a)->0->>'kind'),'nutrition','Recent updates includes nutrition');
select is((public.get_review_summary()->>'nutrition')::integer,1,'nutrition counted in review summary');
select lives_ok(format('select public.mark_nutrition_activity_read(%L)',:'activity'),'coach opens nutrition notification');
select is(public.count_unread_activity(),0,'opening marks nutrition seen');
select pg_temp.act_as(:admin);
select is(public.count_unread_activity(),1,'read state is per staff member');
select pg_temp.act_as(:coach);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',2,gen_random_uuid())));
select is(public.count_unread_activity(),0,'coach correction does not make it unread');
select is((public.get_staff_activity()->0->>'staffEdited')::boolean,true,'coach correction remains attributed');
select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',3,gen_random_uuid())));
select pg_temp.act_as(:coach);
select is(public.count_unread_activity(),1,'later client edit makes existing daily notification unread');
select public.mark_activity_read();
select is(public.count_unread_activity(),0,'mark all includes nutrition within the same transaction');
select is((select count(*)::integer from public.staff_nutrition_activity_seen),0,'mark all clears earlier individual nutrition markers');
select pg_temp.act_as(:ua);
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date,'nutrition','{"intake":2400,"output":2500,"notes":""}',1,gen_random_uuid())));
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date-1,'weight','{"weight":199,"unit":"lb"}',0,gen_random_uuid())));
select pg_temp.act_as(:coach);
select is(public.count_unread_activity(),2,'new day and client edit are unread after watermark');
select public.get_staff_activity(null,null,1)->0 as first \gset
select is(jsonb_array_length(public.get_staff_activity((:'first'::jsonb->>'activityAt')::timestamptz,(:'first'::jsonb->>'id')::uuid)),1,'mixed feed cursor continues without duplicates');
select throws_ok('insert into public.staff_nutrition_activity_seen values(auth.uid(),gen_random_uuid(),now())','42501',null,'read state cannot be forged directly');
select pg_temp.act_as(:other);
select is(public.count_unread_activity(),0,'unassigned coach cannot see nutrition notifications');
select throws_ok(format('select public.mark_nutrition_activity_read(%L)',:'activity'),'42501',null,'unassigned coach cannot mark item read');
select pg_temp.act_as(:ub);
select throws_ok(format('select public.mark_nutrition_activity_read(%L)',:'activity'),'42501',null,'another client cannot mark item read');
select is((select count(*)::integer from public.nutrition_daily_activity),0,'another client cannot read activity table');
select pg_temp.act_as(:ua);
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date-2,'weight','{"weight":198,"unit":"lb"}',0,gen_random_uuid()),pg_temp.cell(current_date-2,'nutrition','{"intake":-1,"output":2500,"notes":""}',0,gen_random_uuid())))$$,:p,:'revision'),'23514',null,'failed daily batch rolls back all values and alerts');
select pg_temp.act_as(:coach);
select is((select count(*)::integer from public.nutrition_daily_activity),2,'failed save adds no phantom notification');
select public.save_nutrition_program_entries(:p,:'revision',jsonb_build_array(pg_temp.cell(current_date-2,'weight','{"weight":198,"unit":"lb"}',0,gen_random_uuid())));
select is((select count(*)::integer from public.nutrition_daily_activity),2,'coach-only entry does not create a client notification');
select pg_temp.act_as(:ua);
select public.save_nutrition_entry(:a,'nutrition',current_date-4,'{"intake":null,"output":null,"notes":""}',0,gen_random_uuid());
select pg_temp.act_as(:coach);
select is((select count(*)::integer from public.nutrition_daily_activity),2,'empty calorie entry does not create notification');
reset role;
set local role anon;
select throws_ok('select public.get_staff_activity()','42501',null,'anonymous cannot read Reviews');
select throws_ok('select * from public.nutrition_daily_activity','42501',null,'anonymous cannot read nutrition activity');
reset role;
select * from finish();
rollback;
