-- FR-04/05/06, NFR-01: draft clearing survives save; the server refuses publication.
begin;
create extension if not exists pgtap with schema extensions;
select plan(20);
create table pg_temp.documents (kind text primary key, doc jsonb);
grant select on pg_temp.documents to authenticated;
insert into pg_temp.documents values ('blank', $json$
{"schemaVersion":1,"service":"mesocycle","title":"Draft name validation","programTheme":"","coachNotes":"","resources":[],
"sharedSections":[{"id":"70000000-0000-4000-a000-000000000001","kind":"preparation","title":"","instructions":"",
"exercises":[{"id":"71000000-0000-4000-a000-000000000001","logicalKey":"warmup","name":"","groupId":null,"demoUrl":null,"notes":"","alternatives":[],"muscles":[],
"prescription":{"setCount":{"min":1,"max":1},"targets":[{"effort":{"kind":"duration","seconds":{"min":30,"max":30},"perSide":false},"load":null,"rir":null,"rpe":null,"annotations":[]}]}}]}],
"weeks":[{"id":"72000000-0000-4000-a000-000000000001","index":1,"label":"Week 1","startDate":null,"useSections":false,
"days":[{"id":"73000000-0000-4000-a000-000000000001","label":"   ","scheduledDate":null,
"sections":[{"id":"70000000-0000-4000-a000-000000000002","kind":"main","title":"","instructions":"",
"exercises":[{"id":"71000000-0000-4000-a000-000000000002","logicalKey":"squat","name":"","groupId":null,"demoUrl":null,"notes":"","alternatives":[],"muscles":[],
"prescription":{"setCount":{"min":3,"max":3},"targets":[{"effort":{"kind":"reps","reps":{"min":8,"max":10},"perSide":false},"load":null,"rir":null,"rpe":null,"annotations":[]}]}}]}]}]}]}
$json$);
insert into pg_temp.documents select 'filled',
 jsonb_set(jsonb_set(jsonb_set(jsonb_set(jsonb_set(doc,
 '{sharedSections,0,title}','"Preparation"'),
 '{sharedSections,0,exercises,0,name}','"Stretch"'),
 '{weeks,0,days,0,label}','""'),
 '{weeks,0,days,0,sections,0,title}','"Main"'),
 '{weeks,0,days,0,sections,0,exercises,0,name}','"Squat"')
from pg_temp.documents where kind='blank';

set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select public.create_program((select id from public.service_enrollments where client_id='10000000-0000-4000-b000-000000000001' and service='mesocycle' limit 1)) as prog \gset
select is(public.save_draft(:'prog',null,(select doc from pg_temp.documents where kind='blank'))->>'lockVersion','1','blank draft saves normally');
select is(public.get_program_draft(:'prog')->'draft',(select doc from pg_temp.documents where kind='blank'),'blank names and labels survive round trip');
select throws_ok(format('select public.publish_revision(%L,1)',:'prog'),'PT422',null,'complete targets cannot bypass missing names');
reset role;
select (id) as rev from public.program_revisions where program_id=:'prog' and status='draft' \gset
select is(jsonb_array_length(private.publish_problems(:'rev')),4,'server flags missing section and exercise names including shared preparation');
select ok(not private.publish_problems(:'rev') @> '[{"path":"weeks.0.days.0.label","message":"Day needs a name"}]'::jsonb,'whitespace focus is optional');
select ok(private.publish_problems(:'rev') @> '[{"path":"weeks.0.days.0.sections.0.title","message":"Section needs a name"}]'::jsonb,'blank section kind does not stand in for a name');
select ok(private.publish_problems(:'rev') @> '[{"path":"weeks.0.days.0.sections.0.exercises.0.name","message":"Exercise needs a name"}]'::jsonb,'missing exercise name has an actionable path');
select ok(private.publish_problems(:'rev') @> '[{"path":"sharedSections.0.exercises.0.name","message":"Exercise needs a name"}]'::jsonb,'shared exercise name is required');
select is((select current_revision_id from public.programs where id=:'prog'),null::uuid,'refused publish has no current revision');
set local role anon;
select throws_ok(format('select private.publish_problems(%L)',:'rev'),'42501',null,'anonymous cannot invoke the private validator');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}',true);
select throws_ok(format('select public.save_draft(%L,1,%L::jsonb)',:'prog',(select doc from pg_temp.documents where kind='filled')),'42501',null,'client cannot fill staff draft');
select throws_ok(format('select public.publish_revision(%L,1)',:'prog'),'42501',null,'client cannot publish cleared draft');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}',true);
select throws_ok(format('select public.save_draft(%L,1,%L::jsonb)',:'prog',(select doc from pg_temp.documents where kind='filled')),'42501',null,'unassigned coach cannot write incomplete drafts');
select set_config('request.jwt.claims','{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}',true);
select is(public.save_draft(:'prog',1,(select doc from pg_temp.documents where kind='filled'))->>'lockVersion','2','Matt can fill names and save');
select is(public.publish_revision(:'prog',2)->>'revisionNumber','1','filled program publishes');
select is(public.save_draft(:'prog',null,(select doc from pg_temp.documents where kind='blank'))->>'lockVersion','1','clearing a new draft leaves published names intact');
select throws_ok(format('select public.publish_revision(%L,1)',:'prog'),'PT422',null,'cleared follow-up draft cannot replace live program');
reset role;
select is((select current_revision_id from public.programs where id=:'prog'),:'rev'::uuid,'live revision remains the filled version');
select is((select name from public.program_exercises where revision_id=:'rev' and logical_key='squat'),'Squat','published name remains immutable');
select throws_ok(format('update public.program_exercises set name=%L where revision_id=%L','',:'rev'),'55000',null,'published content still cannot be edited');
select * from finish();
rollback;
