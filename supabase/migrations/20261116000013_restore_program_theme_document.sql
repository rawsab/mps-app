-- FR-05/06: migration 00012 redefined revision_document from the 00004 version and dropped
-- programTheme (added in 00010). Editors then loaded drafts without a theme, and the next autosave
-- cleared it. This restores the theme alongside useSections. Grants are unchanged.
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
        'id', w.id, 'index', w.week_index, 'label', w.label, 'startDate', w.start_date, 'useSections', w.use_sections,
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

revoke all on function private.revision_document(uuid) from public, anon, authenticated;
-- get_program_draft runs as the caller; this invoker helper retains revision RLS.
grant execute on function private.revision_document(uuid) to authenticated;
