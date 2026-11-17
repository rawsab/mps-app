begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',json_build_object('sub',uid,'role','authenticated')::text,true);
  execute 'set local role authenticated';
end;
$$;
create function pg_temp.value() returns jsonb language sql as $$
  select jsonb_build_object('program_style','Four week bulk','start_date',current_date-3,'week_count',4,'maintenance',2600,'calorie_goal',2800,'notes','Client instructions');
$$;
create function pg_temp.cell(row_date date, kind text, val jsonb, version integer, request_id uuid) returns jsonb language sql as $$
  select jsonb_build_object('row_date',row_date,'kind',kind,'value',val,'expected_version',version,'request_id',request_id);
$$;
grant execute on all functions in schema pg_temp to authenticated;
\set a '''10000000-0000-4000-b000-000000000001'''
\set b '''10000000-0000-4000-b000-000000000002'''
\set ua '''00000000-0000-4000-a000-000000000011'''
\set ub '''00000000-0000-4000-a000-000000000012'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set admin '''00000000-0000-4000-a000-000000000001'''
\set other '''00000000-0000-4000-a000-000000000003'''
\set p '''88000000-0000-4000-a000-000000000001'''
\set p2 '''88000000-0000-4000-a000-000000000002'''
\set p3 '''88000000-0000-4000-a000-000000000003'''
update public.clients set status = 'active', timezone = 'UTC' where id = :a;
update public.service_enrollments set status='active',starts_on=date '2020-01-01',ends_on=null,archived_at=null where client_id=:a and service='nutrition' and status<>'ended';
delete from public.nutrition_entry_changes where client_id=:a;
delete from public.bodyweight_logs where client_id=:a;
delete from public.nutrition_logs where client_id=:a;
update public.coach_clients set can_publish=false where coach_id=:coach and client_id=:a;
select id as enrollment from public.service_enrollments where client_id=:a and service='nutrition' and status='active' \gset

select pg_temp.act_as(:coach);
select lives_ok(format('select public.create_nutrition_program(%L,%L)',:'enrollment',:p),'assigned coach creates a nutritional draft');
select lives_ok(format('select public.create_nutrition_program(%L,%L)',:'enrollment',:p),'creation retry returns same program');
select is((public.get_nutrition_program(:p)#>>'{revision,week_count}')::integer,4,'default is four weeks');
select is((public.get_nutrition_program(:p)#>>'{revision,status}'),'draft','new program is draft');
select is((public.get_nutrition_program(:p)->>'can_log')::boolean,true,'assigned coach can edit daily entries from the working sheet');
select throws_ok(format('select public.publish_nutrition_program(%L,1)',:p),'42501',null,'coach without publishing permission cannot publish');
select lives_ok(format('select public.save_nutrition_program_draft(%L,1,pg_temp.value())',:p),'coach saves Program Style and baseline');
select throws_ok(format('select public.save_nutrition_program_draft(%L,1,pg_temp.value())',:p),'PT409',null,'stale draft save refused');
select throws_ok(format($$select public.save_nutrition_program_draft(%L,2,pg_temp.value()||' {"week_count":1.5}'::jsonb)$$,:p),'22023',null,'fractional week count refused');
select throws_ok(format($$select public.save_nutrition_program_draft(%L,2,pg_temp.value()||' {"maintenance":-1}'::jsonb)$$,:p),'23514',null,'negative baseline refused');
select throws_ok('update public.nutrition_program_revisions set maintenance=1','42501',null,'direct revision writes refused');
select public.get_nutrition_program(:p)#>>'{revision,id}' as rev1 \gset

select pg_temp.act_as(:ua);
select is((select count(*)::integer from public.nutrition_programs where id=:p),0,'draft program hidden from client table reads');
select is((select count(*)::integer from public.nutrition_program_revisions where id=:'rev1'),0,'draft baseline hidden from client table reads');
select throws_ok(format('select public.get_nutrition_program(%L)',:p),'42501',null,'draft hidden from client RPC');
select throws_ok(format('select public.create_nutrition_program(%L,%L)',:'enrollment',:p2),'42501',null,'client cannot create programs');

select pg_temp.act_as(:admin);
select throws_ok(format('select public.publish_nutrition_program(%L,1)',:p),'PT409',null,'stale publish refused');
select lives_ok(format('select public.publish_nutrition_program(%L,2)',:p),'admin publishes validated nutritional program');
select is((public.get_nutrition_program(:p)->>'current_revision_id'),:'rev1','publish moves current pointer');
select lives_ok(format('select public.save_nutrition_program_draft(%L,null,pg_temp.value()||''{"program_style":"New draft title"}''::jsonb)',:p),'published program can start a new draft');
select is((public.get_nutrition_program(:p)#>>'{revision,program_style}'),'New draft title','coach sees working draft');
select is((public.get_nutrition_program(:p,true)#>>'{revision,program_style}'),'Four week bulk','published spreadsheet retains published title');

select pg_temp.act_as(:ua);
select is((public.get_nutrition_program(:p)#>>'{revision,id}'),:'rev1','client reader always selects current published revision');
select is((public.get_nutrition_program(:p)#>>'{revision,program_style}'),'Four week bulk','new draft never reaches client');
select is((select count(*)::integer from public.nutrition_program_revisions where program_id=:p),1,'only current revision is client-readable');
select ok(exists(select 1 from jsonb_array_elements(public.list_nutrition_programs(:a)) v where v->>'id'=:p),'published program appears in client list');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0,'89000000-0000-4000-a000-000000000001'),pg_temp.cell(current_date,'nutrition','{"intake":0,"output":2500,"notes":"Yesterday"}',0,'89000000-0000-4000-a000-000000000002')))$$,:p,:'rev1'),'client saves today weight and yesterday calories atomically');
select is((select measured_on from public.bodyweight_logs where client_id=:a),current_date,'weight maps to displayed row date');
select is((select activity_on from public.nutrition_logs where client_id=:a),current_date-1,'Day Before calories map to previous date');
select is((select intake from public.nutrition_logs where client_id=:a),0,'zero intake retained');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":200,"unit":"lb"}',0,'89000000-0000-4000-a000-000000000001'),pg_temp.cell(current_date,'nutrition','{"intake":0,"output":2500,"notes":"Yesterday"}',0,'89000000-0000-4000-a000-000000000002')))$$,:p,:'rev1'),'lost-response batch retry is idempotent');
select is((select count(*)::integer from public.nutrition_entry_changes where client_id=:a),2,'retry does not duplicate audit records');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',0,gen_random_uuid())))$$,:p,:'rev1'),'PT409',null,'stale client tab cannot overwrite entry');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',1,gen_random_uuid()),pg_temp.cell(current_date-1,'nutrition','{"intake":-1,"output":2500,"notes":""}',0,gen_random_uuid())))$$,:p,:'rev1'),'23514',null,'invalid paste rejects whole transaction');
select is((select weight from public.bodyweight_logs where client_id=:a),200::numeric,'valid first cell rolled back when later cell is invalid');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date+1,'weight','{"weight":200,"unit":"lb"}',0,gen_random_uuid())))$$,:p,:'rev1'),'22023',null,'future row refused');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date-4,'weight','{"weight":200,"unit":"lb"}',0,gen_random_uuid())))$$,:p,:'rev1'),'22023',null,'row before program start refused');

select pg_temp.act_as(:ub);
select throws_ok(format('select public.get_nutrition_program(%L)',:p),'42501',null,'another client cannot fetch program');
select is((select count(*)::integer from public.nutrition_programs where id=:p),0,'another client cannot read program table');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,'[]')$$,:p,:'rev1'),'42501',null,'another client cannot save program entries');
select pg_temp.act_as(:other);
select throws_ok(format('select public.get_nutrition_program(%L)',:p),'42501',null,'unassigned coach cannot fetch program');

select pg_temp.act_as(:admin);
select lives_ok(format('select public.create_nutrition_program(%L,%L)',:'enrollment',:p2),'second nutritional program can be created');
select public.save_nutrition_program_draft(:p2,1,pg_temp.value());
select lives_ok(format('select public.publish_nutrition_program(%L,2)',:p2),'overlap does not block publishing');
select ok(exists(select 1 from jsonb_array_elements(public.get_nutrition_program(:p2)->'overlaps') v where v->>'id'=:p),'overlap appears in warning data');
select lives_ok(format($$select public.save_nutrition_program_entries(%L,(select current_revision_id from public.nutrition_programs where id=%L),jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":201,"unit":"lb"}',1,gen_random_uuid())))$$,:p2,:p2),'coach can correct entry through overlapping program');
select is((public.get_nutrition_program(:p,true)#>>'{weights,0,weight}')::numeric,201::numeric,'overlapping program shows same actual record');
select is((select updated_by_staff from public.bodyweight_logs where client_id=:a),true,'correction attributed to staff');
select ok(jsonb_array_length(public.get_nutrition_program(:p2)->'changes')>=3,'spreadsheet retains before/after history');
select lives_ok(format('select public.publish_nutrition_program(%L,1)',:p),'a new nutrition revision publishes without altering actuals');
select is((public.get_nutrition_program(:p,true)#>>'{revision,program_style}'),'New draft title','new publication selects the revised baseline');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',2,gen_random_uuid())))$$,:p,:'rev1'),'PT409',null,'a sheet opened before republication cannot silently save against the new revision');
select is((select weight from public.bodyweight_logs where client_id=:a),201::numeric,'republication preserves earlier saved actuals');
select throws_ok(format('select public.remove_nutrition_program(%L,null,false)',:p),'55000',null,'published program cannot be deleted');
select lives_ok(format('select public.remove_nutrition_program(%L,null,true)',:p),'published program archives with draft version protection');
select throws_ok(format($$select public.save_nutrition_program_entries(%L,%L,jsonb_build_array(pg_temp.cell(current_date,'weight','{"weight":202,"unit":"lb"}',2,gen_random_uuid())))$$,:p,:'rev1'),'55000',null,'archived program is read only');
select is((select count(*)::integer from public.bodyweight_logs where client_id=:a),1,'archive preserves actuals');
select public.create_nutrition_program(:'enrollment',:p3);
select throws_ok(format('select public.publish_nutrition_program(%L,1)',:p3),'22023',null,'incomplete baseline cannot publish');
select lives_ok(format('select public.remove_nutrition_program(%L,1,false)',:p3),'unpublished program deletes');

reset role;
select throws_ok(format('update public.nutrition_program_revisions set maintenance=1 where id=%L',:'rev1'),'55000',null,'published baseline immutable even for operator SQL');
update public.clients set status='disabled' where id=:a;
select pg_temp.act_as(:ua);
select throws_ok(format('select public.get_nutrition_program(%L)',:p2),'42501',null,'disabled client denied immediately');
reset role;
set local role anon;
select throws_ok(format('select public.get_nutrition_program(%L)',:p2),'42501',null,'anonymous reader denied');
select throws_ok('select * from public.nutrition_program_revisions','42501',null,'anonymous table reader denied');
reset role;
select * from finish();
rollback;
