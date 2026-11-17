-- FR-05/06/10: muscle groups per exercise, so mesocycle set totals can count logged sets per
-- muscle (decision 0021). An exercise may list several muscles; each logged set counts once for
-- every listed muscle. Older documents without the key save as no muscles.
--
-- Published immutability is unchanged: the existing content guard covers the new column. Browsers
-- still have SELECT only; the column is written by save_draft.

create or replace function private.valid_muscles(muscles text[])
returns boolean language sql immutable set search_path = ''
as $$
  select cardinality(muscles) <= 8
    and not exists (select 1 from unnest(muscles) m where m is null or m <> btrim(m) or char_length(m) not between 1 and 60);
$$;
revoke all on function private.valid_muscles(text[]) from public, anon, authenticated;

alter table public.program_exercises
  add column muscles text[] not null default '{}' constraint program_exercises_muscles check (private.valid_muscles(muscles));

create or replace function private.insert_draft_exercise(rev uuid, section uuid, pos integer, e jsonb, at text)
returns void language plpgsql set search_path = ''
as $$
declare
  id uuid := private.draft_uuid(e, 'id', at);
  prescription jsonb := private.draft_value(e, 'prescription', at, 'object');
  set_count numeric[] := private.draft_range(prescription, 'setCount', at || '.prescription', true);
  targets jsonb := private.draft_array(prescription, 'targets', at || '.prescription');
  alternatives jsonb := private.draft_array(e, 'alternatives', at);
  muscle_items jsonb := case when e ? 'muscles' then private.draft_array(e, 'muscles', at) else '[]'::jsonb end;
  muscles text[] := '{}';
  item jsonb;
  idx bigint;
  normalized jsonb := '[]';
begin
  for item, idx in select value, ordinality - 1 from jsonb_array_elements(alternatives) with ordinality loop
    perform private.draft_expect_object(item, at || '.alternatives.' || idx);
    if private.draft_text(item, 'id', at || '.alternatives.' || idx) = ''
       or private.draft_text(item, 'name', at || '.alternatives.' || idx) = '' then
      perform private.draft_fail(at || '.alternatives.' || idx, 'needs an id and a name');
    end if;
    normalized := normalized || jsonb_build_array(jsonb_build_object('id', item -> 'id', 'name', item -> 'name'));
  end loop;

  for item, idx in select value, ordinality - 1 from jsonb_array_elements(muscle_items) with ordinality loop
    if jsonb_typeof(item) <> 'string' then
      perform private.draft_fail(at || '.muscles.' || idx, 'must be a string');
    end if;
    muscles := muscles || (item #>> '{}');
  end loop;
  if not private.valid_muscles(muscles) then
    perform private.draft_fail(at || '.muscles', 'needs up to 8 trimmed names of 1-60 characters');
  end if;

  -- One target applies to every set; otherwise one per set up to setCount.max (contract rule).
  if jsonb_array_length(targets) > 1 and set_count is not null and jsonb_array_length(targets) <> set_count[2] then
    perform private.draft_fail(at || '.prescription.targets', 'per-set targets must match the maximum set count');
  end if;

  insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, alternatives,
    group_id, demo_url, notes, set_count_min, set_count_max, muscles)
  values (id, rev, section, pos, private.draft_text(e, 'logicalKey', at), private.draft_text(e, 'name', at), normalized,
    private.draft_text(e, 'groupId', at, true), private.draft_text(e, 'demoUrl', at, true),
    private.draft_text(e, 'notes', at), set_count[1], set_count[2], muscles);

  for item, idx in select value, ordinality - 1 from jsonb_array_elements(targets) with ordinality loop
    perform private.insert_draft_target(rev, id, idx::integer,
      private.draft_expect_object(item, at || '.prescription.targets.' || idx), at || '.prescription.targets.' || idx);
  end loop;
end;
$$;

create or replace function private.section_document(s public.program_sections)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'title', s.title, 'instructions', s.instructions,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'logicalKey', e.logical_key, 'name', e.name, 'alternatives', e.alternatives,
        'groupId', e.group_id, 'demoUrl', e.demo_url, 'notes', e.notes, 'muscles', to_jsonb(e.muscles),
        'prescription', jsonb_build_object(
          'setCount', private.range_document(e.set_count_min, e.set_count_max),
          'targets', coalesce((
            select jsonb_agg(private.set_target_document(ps) order by ps.position)
            from public.prescribed_sets ps
            where ps.revision_id = e.revision_id and ps.exercise_id = e.id), '[]'::jsonb)))
        order by e.position)
      from public.program_exercises e
      where e.revision_id = s.revision_id and e.section_id = s.id), '[]'::jsonb));
$$;

-- Grants as in 00004: the writer runs only inside security-definer save_draft; the reader is an
-- invoker helper used by get_program_draft and get_published_program.
revoke all on function private.insert_draft_exercise(uuid, uuid, integer, jsonb, text),
  private.section_document(public.program_sections) from public, anon, authenticated;
grant execute on function private.section_document(public.program_sections) to authenticated;
