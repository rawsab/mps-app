-- FR-05/06: mesocycle titles are Program Style; Theme is revision-owned subtitle metadata.
-- Existing revisions retain their style and receive an empty theme. Existing revision RLS,
-- column grants and the published-revision guard apply to this field as well.
alter table public.program_revisions add column program_theme text not null default ''
  check (char_length(program_theme) <= 240);

create or replace function private.revision_document(target uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', r.schema_version,
    'service', p.service,
    'title', r.title,
    'programTheme', r.program_theme,
    'sharedSections', coalesce((
      select jsonb_agg(private.section_document(s) order by s.position)
      from public.program_sections s where s.revision_id = r.id and s.day_id is null), '[]'::jsonb),
    'weeks', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id, 'index', w.week_index, 'label', w.label, 'startDate', w.start_date,
        'days', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', d.id, 'label', d.label, 'scheduledDate', d.scheduled_date,
            'sections', coalesce((
              select jsonb_agg(private.section_document(s) order by s.position)
              from public.program_sections s where s.revision_id = r.id and s.day_id = d.id), '[]'::jsonb))
            order by d.position)
          from public.workout_days d where d.revision_id = r.id and d.week_id = w.id), '[]'::jsonb))
        order by w.week_index)
      from public.program_weeks w where w.revision_id = r.id), '[]'::jsonb),
    'resources', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'title', x.title, 'body', x.body, 'url', x.url) order by x.position)
      from public.program_resources x where x.revision_id = r.id), '[]'::jsonb),
    'coachNotes', r.coach_notes)
  from public.program_revisions r
  join public.programs p on p.id = r.program_id
  where r.id = target;
$$;

create or replace function public.save_draft(p_program_id uuid, p_expected_version integer, p_draft jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
  rev public.program_revisions;
begin
  select * into program from public.programs where id = p_program_id;
  if not found or not private.staff_can_access_client(program.client_id) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  -- Serializes saves and publishes for this program, so the version check below can't race.
  select * into program from public.programs where id = p_program_id for update;
  if program.archived_at is not null then
    raise exception 'program is archived' using errcode = '55000';
  end if;

  perform private.draft_expect_object(p_draft, '');
  if private.draft_number(p_draft, 'schemaVersion', '') <> 1 then
    perform private.draft_fail('schemaVersion', 'unsupported schema version');
  end if;
  if private.draft_enum(p_draft, 'service', '', array['personal_training', 'mesocycle', 'nutrition']) <> program.service::text then
    perform private.draft_fail('service', 'must match the program service');
  end if;

  select * into rev from public.program_revisions
  where program_id = p_program_id and status = 'draft' for update;

  if p_expected_version is null then
    if found then
      raise exception 'a draft already exists' using errcode = 'PT409',
        detail = jsonb_build_object('currentVersion', rev.lock_version)::text;
    end if;
    insert into public.program_revisions (program_id, client_id, revision_number, schema_version, created_by)
    values (p_program_id, program.client_id,
      coalesce((select max(revision_number) from public.program_revisions where program_id = p_program_id), 0) + 1,
      1, (select auth.uid()))
    returning * into rev;
  else
    if not found or rev.lock_version <> p_expected_version then
      raise exception 'draft has changed since version %', p_expected_version using errcode = 'PT409',
        detail = jsonb_build_object('currentVersion', rev.lock_version)::text;
    end if;
    -- Weeks cascade to days, day sections, exercises and sets.
    delete from public.program_weeks where revision_id = rev.id;
    delete from public.program_sections where revision_id = rev.id;
    delete from public.program_resources where revision_id = rev.id;
  end if;

  update public.program_revisions set
    title = private.draft_text(p_draft, 'title', ''),
    program_theme = case when p_draft ? 'programTheme' then private.draft_text(p_draft, 'programTheme', '') else '' end,
    coach_notes = private.draft_text(p_draft, 'coachNotes', ''),
    schema_version = 1,
    lock_version = lock_version + (p_expected_version is not null)::integer
  where id = rev.id
  returning * into rev;

  perform private.write_draft_content(rev.id, p_draft);

  return jsonb_build_object('revisionId', rev.id, 'revisionNumber', rev.revision_number, 'lockVersion', rev.lock_version);
end;
$$;

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
    select array[0,0] as ord, jsonb_build_object('path','title','message',case when p.service = 'mesocycle' then 'Program needs a style' else 'Program needs a title' end) as problem
    from public.program_revisions r join public.programs p on p.id = r.program_id where r.id = target and r.title ~ '^\s*$'
    union all
    select array[0,1], jsonb_build_object('path','weeks','message','Program needs at least one week') where not exists(select 1 from weeks)
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

revoke all on function private.revision_document(uuid) from public, anon, authenticated;
-- get_program_draft runs as the caller; this invoker helper retains revision RLS.
grant execute on function private.revision_document(uuid) to authenticated;
revoke all on function public.save_draft(uuid, integer, jsonb) from public, anon;
grant execute on function public.save_draft(uuid, integer, jsonb) to authenticated;
