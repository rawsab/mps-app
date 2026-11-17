-- FR-04/05/06: clearing cells saves incomplete names; only publish enforces completeness.
alter table public.workout_days drop constraint workout_days_label_check;
alter table public.workout_days add constraint workout_days_label_check check (char_length(label) <= 120);
alter table public.program_exercises drop constraint program_exercises_name_check;
alter table public.program_exercises add constraint program_exercises_name_check check (char_length(name) <= 200);

-- No changes to RLS, grants, write paths or published-revision immutability.
create or replace function private.publish_problems(target uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with weeks as (
    select id, (row_number() over (order by week_index) - 1)::integer as w
    from public.program_weeks where revision_id = target
  ), days as (
    select d.id, d.label, array[2,w.w,d.position] as ord,
      format('weeks.%s.days.%s',w.w,d.position) as path
    from weeks w join public.workout_days d on d.revision_id = target and d.week_id = w.id
  ), sections as (
    select s.id, s.title,
      case when s.day_id is null then array[1,s.position] else d.ord || s.position end as ord,
      case when s.day_id is null then format('sharedSections.%s',s.position) else d.path || format('.sections.%s',s.position) end as path
    from public.program_sections s left join days d on d.id = s.day_id
    where s.revision_id = target
  ), exercises as (
    select e.id, e.name, s.ord || e.position as ord, s.path || format('.exercises.%s',e.position) as path,
      e.set_count_min is null as no_count,
      not exists(select 1 from public.prescribed_sets ps where ps.revision_id = target and ps.exercise_id = e.id) as no_target
    from sections s join public.program_exercises e on e.revision_id = target and e.section_id = s.id
  )
  select coalesce(jsonb_agg(problem order by ord),'[]'::jsonb) from (
    select array[0,0] as ord, jsonb_build_object('path','title','message','Program needs a title') as problem
    from public.program_revisions where id = target and title ~ '^\s*$'
    union all
    select array[0,1], jsonb_build_object('path','weeks','message','Program needs at least one week') where not exists(select 1 from weeks)
    union all
    select ord || -1, jsonb_build_object('path',path || '.label','message','Day needs a name') from days where label ~ '^\s*$'
    union all
    select ord || -1, jsonb_build_object('path',path || '.title','message','Section needs a name') from sections where title ~ '^\s*$'
    union all
    select ord || 0, jsonb_build_object('path',path || '.name','message','Exercise needs a name') from exercises where name ~ '^\s*$'
    union all
    select ord || 1, jsonb_build_object('path',path,'message',coalesce(nullif(btrim(name),''),'Unnamed exercise') || ': set count is missing') from exercises where no_count
    union all
    select ord || 2, jsonb_build_object('path',path,'message',coalesce(nullif(btrim(name),''),'Unnamed exercise') || ': no target') from exercises where no_target
  ) problems;
$$;
revoke all on function private.publish_problems(uuid) from public, anon, authenticated;
