-- FR-05: sections are an explicit per-week presentation choice, off by default.
alter table public.program_weeks add column use_sections boolean not null default false;

create or replace function private.write_draft_content(rev uuid, draft jsonb)
returns void language plpgsql set search_path = ''
as $$
declare
  week jsonb;
  day jsonb;
  item jsonb;
  w bigint;
  d bigint;
  idx bigint;
  at text;
  week_id uuid;
  day_id uuid;
  week_index numeric;
  prev_index numeric := 0;
begin
  for item, idx in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(draft, 'sharedSections', '')) with ordinality loop
    perform private.insert_draft_section(rev, null, idx::integer,
      private.draft_expect_object(item, 'sharedSections.' || idx), 'sharedSections.' || idx);
  end loop;

  for week, w in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(draft, 'weeks', '')) with ordinality loop
    at := 'weeks.' || w;
    perform private.draft_expect_object(week, at);
    week_id := private.draft_uuid(week, 'id', at);
    week_index := private.draft_number(week, 'index', at);
    -- Ascending order keeps the document order identical after a reload.
    if week_index <> trunc(week_index) or week_index <= prev_index then
      perform private.draft_fail(at || '.index', 'must be a positive integer greater than the previous week');
    end if;
    prev_index := week_index;
    insert into public.program_weeks (id, revision_id, week_index, label, start_date, use_sections)
    values (week_id, rev, week_index::integer, private.draft_text(week, 'label', at), private.draft_date(week, 'startDate', at), coalesce((week->>'useSections')::boolean, false));

    for day, d in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(week, 'days', at)) with ordinality loop
      at := 'weeks.' || w || '.days.' || d;
      perform private.draft_expect_object(day, at);
      day_id := private.draft_uuid(day, 'id', at);
      insert into public.workout_days (id, revision_id, week_id, position, label, scheduled_date)
      values (day_id, rev, week_id, d::integer, private.draft_text(day, 'label', at), private.draft_date(day, 'scheduledDate', at));

      for item, idx in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(day, 'sections', at)) with ordinality loop
        perform private.insert_draft_section(rev, day_id, idx::integer,
          private.draft_expect_object(item, at || '.sections.' || idx), at || '.sections.' || idx);
      end loop;
    end loop;
  end loop;

  for item, idx in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(draft, 'resources', '')) with ordinality loop
    at := 'resources.' || idx;
    perform private.draft_expect_object(item, at);
    insert into public.program_resources (id, revision_id, position, title, body, url)
    values (private.draft_uuid(item, 'id', at), rev, idx::integer, private.draft_text(item, 'title', at),
      private.draft_text(item, 'body', at), private.draft_text(item, 'url', at, true));
  end loop;
end;
$$;

create or replace function private.revision_document(target uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'schemaVersion', r.schema_version,
    'service', p.service,
    'title', r.title,
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
