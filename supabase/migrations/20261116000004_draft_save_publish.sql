-- M3 / step 2: transactional draft save and atomic publish (FR-04, FR-05, FR-06; roadmap §8
-- "Save draft" and "Publish revision"; decisions 0004 and 0005).
--
-- Browsers still have SELECT only on program tables. These functions are the write path:
--   create_program(enrollment)                    -> program id
--   save_draft(program, expected_version, draft)  -> {revisionId, revisionNumber, lockVersion}
--   get_program_draft(program)                    -> the working draft, or the published revision to start one from
--   publish_revision(program, expected_version)   -> {revisionId, revisionNumber, publishedAt}
--
-- Error codes (PostgREST maps PTxyz to HTTP xyz):
--   42501 not authorized or not found (the two are indistinguishable on purpose)
--   22023 the draft document fails the ProgramDraft contract; the message names the path
--   PT409 stale expected_version; detail is {"currentVersion": n | null}
--   PT422 draft is not ready to publish; detail is [{path, message}] as validateForPublish returns
--   55000 the program or enrollment no longer accepts changes

-- ---------------------------------------------------------------------------
-- Authorization: publishing needs admin, or an assigned coach explicitly granted can_publish
-- (PRD §4 access matrix). Editing needs only staff access to the client.
-- ---------------------------------------------------------------------------
create or replace function private.staff_can_publish_for_client(target_client uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select private.is_admin()
      or exists (
        select 1
        from public.coach_clients cc
        join public.staff_roles sr on sr.auth_user_id = cc.coach_id and sr.role = 'coach'
        where cc.coach_id = (select auth.uid()) and cc.client_id = target_client and cc.can_publish
      );
$$;

-- ---------------------------------------------------------------------------
-- Contract readers. They mirror src/domain/programs/contract.ts: a required key must be present
-- with the right JSON type, and JSON null is accepted only where the contract is nullable.
-- Strings never pass for numbers, so "1-2" cannot sneak in as anything but a rejected value.
-- ---------------------------------------------------------------------------
create or replace function private.draft_fail(at text, reason text)
returns void language plpgsql set search_path = ''
as $$
begin
  raise exception 'invalid draft at %: %', coalesce(nullif(at, ''), '(root)'), reason using errcode = '22023';
end;
$$;

create or replace function private.draft_path(at text, key text)
returns text language sql immutable set search_path = ''
as $$ select case when at = '' then key else at || '.' || key end; $$;

-- Returns the value, or SQL null for an allowed JSON null.
create or replace function private.draft_value(doc jsonb, key text, at text, expected text, nullable boolean default false)
returns jsonb language plpgsql immutable set search_path = ''
as $$
declare
  v jsonb := doc -> key;
  p text := private.draft_path(at, key);
begin
  if v is null then
    perform private.draft_fail(p, 'is missing');
  elsif jsonb_typeof(v) = 'null' then
    if not nullable then
      perform private.draft_fail(p, 'must not be null');
    end if;
    return null;
  elsif jsonb_typeof(v) <> expected then
    perform private.draft_fail(p, 'must be a ' || expected);
  end if;
  return v;
end;
$$;

create or replace function private.draft_expect_object(v jsonb, at text)
returns jsonb language plpgsql immutable set search_path = ''
as $$
begin
  if jsonb_typeof(v) is distinct from 'object' then
    perform private.draft_fail(at, 'must be an object');
  end if;
  return v;
end;
$$;

create or replace function private.draft_text(doc jsonb, key text, at text, nullable boolean default false)
returns text language sql immutable set search_path = ''
as $$ select private.draft_value(doc, key, at, 'string', nullable) #>> '{}'; $$;

create or replace function private.draft_number(doc jsonb, key text, at text, nullable boolean default false)
returns numeric language sql immutable set search_path = ''
as $$ select (private.draft_value(doc, key, at, 'number', nullable) #>> '{}')::numeric; $$;

create or replace function private.draft_bool(doc jsonb, key text, at text)
returns boolean language sql immutable set search_path = ''
as $$ select (private.draft_value(doc, key, at, 'boolean') #>> '{}')::boolean; $$;

create or replace function private.draft_array(doc jsonb, key text, at text)
returns jsonb language sql immutable set search_path = ''
as $$ select private.draft_value(doc, key, at, 'array'); $$;

create or replace function private.draft_enum(doc jsonb, key text, at text, allowed text[], nullable boolean default false)
returns text language plpgsql immutable set search_path = ''
as $$
declare
  v text := private.draft_text(doc, key, at, nullable);
begin
  if v is not null and not v = any (allowed) then
    perform private.draft_fail(private.draft_path(at, key), 'must be one of ' || array_to_string(allowed, ', '));
  end if;
  return v;
end;
$$;

-- Content ids are uuids so they can be primary keys (decision 0004).
create or replace function private.draft_uuid(doc jsonb, key text, at text)
returns uuid language plpgsql immutable set search_path = ''
as $$
declare
  v text := private.draft_text(doc, key, at);
begin
  if v !~ '^[0-9a-fA-F]{8}-([0-9a-fA-F]{4}-){3}[0-9a-fA-F]{12}$' then
    perform private.draft_fail(private.draft_path(at, key), 'must be a uuid');
  end if;
  return v::uuid;
end;
$$;

create or replace function private.draft_date(doc jsonb, key text, at text)
returns date language plpgsql immutable set search_path = ''
as $$
declare
  v text := private.draft_text(doc, key, at, true);
begin
  if v is null then
    return null;
  end if;
  if v ~ '^\d{4}-\d{2}-\d{2}$' then
    begin
      return v::date;
    exception when others then
      null;
    end;
  end if;
  perform private.draft_fail(private.draft_path(at, key), 'must be an ISO date (yyyy-mm-dd)');
  return null;
end;
$$;

-- A NumericRange as {min, max}; scalars arrive with equal endpoints. Never a date.
create or replace function private.draft_range(doc jsonb, key text, at text, nullable boolean default false)
returns numeric[] language plpgsql immutable set search_path = ''
as $$
declare
  r jsonb := private.draft_value(doc, key, at, 'object', nullable);
  p text := private.draft_path(at, key);
  lo numeric;
  hi numeric;
begin
  if r is null then
    return null;
  end if;
  lo := private.draft_number(r, 'min', p);
  hi := private.draft_number(r, 'max', p);
  if lo > hi then
    perform private.draft_fail(p, 'minimum must not exceed maximum');
  end if;
  return array[lo, hi];
end;
$$;

-- ---------------------------------------------------------------------------
-- Draft writers. save_draft replaces the draft's content in one transaction; node ids come from
-- the document, so they stay stable across saves and from the published revision (decision 0005).
-- Range, length and load-mode rules not checked here are enforced by table constraints.
-- ---------------------------------------------------------------------------
create or replace function private.insert_draft_target(rev uuid, exercise uuid, pos integer, t jsonb, at text)
returns void language plpgsql set search_path = ''
as $$
declare
  effort jsonb := private.draft_value(t, 'effort', at, 'object', true);
  load jsonb := private.draft_value(t, 'load', at, 'object', true);
  added jsonb;
  annotations jsonb := private.draft_array(t, 'annotations', at);
  effort_kind text;
  effort_range numeric[];
  per_side boolean;
  load_mode text;
  load_range numeric[];
  load_unit text;
  band_label text;
  rir numeric[] := private.draft_range(t, 'rir', at, true);
  rpe numeric[] := private.draft_range(t, 'rpe', at, true);
begin
  if effort is not null then
    effort_kind := private.draft_enum(effort, 'kind', at || '.effort', array['reps', 'duration']);
    effort_range := private.draft_range(effort, case effort_kind when 'reps' then 'reps' else 'seconds' end, at || '.effort');
    per_side := private.draft_bool(effort, 'perSide', at || '.effort');
  end if;

  if load is not null then
    load_mode := private.draft_enum(load, 'mode', at || '.load',
      array['external', 'bodyweight', 'assisted', 'band', 'not_applicable']);
    if load_mode in ('external', 'assisted') then
      load_range := private.draft_range(load, 'value', at || '.load');
      load_unit := private.draft_enum(load, 'unit', at || '.load', array['lb', 'kg'], true);
    elsif load_mode = 'bodyweight' then
      added := private.draft_value(load, 'added', at || '.load', 'object', true);
      if added is not null then
        load_range := array[private.draft_number(added, 'value', at || '.load.added'),
                            private.draft_number(added, 'value', at || '.load.added')];
        load_unit := private.draft_enum(added, 'unit', at || '.load.added', array['lb', 'kg'], true);
      end if;
    elsif load_mode = 'band' then
      band_label := private.draft_text(load, 'label', at || '.load');
    end if;
  end if;

  if exists (select 1 from jsonb_array_elements(annotations) a where jsonb_typeof(a) <> 'string') then
    perform private.draft_fail(at || '.annotations', 'must contain only strings');
  end if;

  insert into public.prescribed_sets (revision_id, exercise_id, position, effort_kind, effort_min, effort_max,
    per_side, load_mode, load_min, load_max, load_unit, load_band_label, rir_min, rir_max, rpe_min, rpe_max, annotations)
  values (rev, exercise, pos, effort_kind::public.effort_kind, effort_range[1], effort_range[2],
    per_side, load_mode::public.load_mode, load_range[1], load_range[2], load_unit::public.weight_unit, band_label,
    rir[1], rir[2], rpe[1], rpe[2],
    array(select a #>> '{}' from jsonb_array_elements(annotations) with ordinality x(a, n) order by n));
end;
$$;

create or replace function private.insert_draft_exercise(rev uuid, section uuid, pos integer, e jsonb, at text)
returns void language plpgsql set search_path = ''
as $$
declare
  id uuid := private.draft_uuid(e, 'id', at);
  prescription jsonb := private.draft_value(e, 'prescription', at, 'object');
  set_count numeric[] := private.draft_range(prescription, 'setCount', at || '.prescription', true);
  targets jsonb := private.draft_array(prescription, 'targets', at || '.prescription');
  alternatives jsonb := private.draft_array(e, 'alternatives', at);
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

  -- One target applies to every set; otherwise one per set up to setCount.max (contract rule).
  if jsonb_array_length(targets) > 1 and set_count is not null and jsonb_array_length(targets) <> set_count[2] then
    perform private.draft_fail(at || '.prescription.targets', 'per-set targets must match the maximum set count');
  end if;

  insert into public.program_exercises (id, revision_id, section_id, position, logical_key, name, alternatives,
    group_id, demo_url, notes, set_count_min, set_count_max)
  values (id, rev, section, pos, private.draft_text(e, 'logicalKey', at), private.draft_text(e, 'name', at), normalized,
    private.draft_text(e, 'groupId', at, true), private.draft_text(e, 'demoUrl', at, true),
    private.draft_text(e, 'notes', at), set_count[1], set_count[2]);

  for item, idx in select value, ordinality - 1 from jsonb_array_elements(targets) with ordinality loop
    perform private.insert_draft_target(rev, id, idx::integer,
      private.draft_expect_object(item, at || '.prescription.targets.' || idx), at || '.prescription.targets.' || idx);
  end loop;
end;
$$;

create or replace function private.insert_draft_section(rev uuid, day uuid, pos integer, s jsonb, at text)
returns void language plpgsql set search_path = ''
as $$
declare
  id uuid := private.draft_uuid(s, 'id', at);
  item jsonb;
  idx bigint;
begin
  insert into public.program_sections (id, revision_id, day_id, position, kind, title, instructions)
  values (id, rev, day, pos,
    private.draft_enum(s, 'kind', at, array['preparation', 'main', 'cooldown', 'other'])::public.section_kind,
    private.draft_text(s, 'title', at), private.draft_text(s, 'instructions', at));

  for item, idx in select value, ordinality - 1 from jsonb_array_elements(private.draft_array(s, 'exercises', at)) with ordinality loop
    perform private.insert_draft_exercise(rev, id, idx::integer,
      private.draft_expect_object(item, at || '.exercises.' || idx), at || '.exercises.' || idx);
  end loop;
end;
$$;

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
    insert into public.program_weeks (id, revision_id, week_index, label, start_date)
    values (week_id, rev, week_index::integer, private.draft_text(week, 'label', at), private.draft_date(week, 'startDate', at));

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

-- ---------------------------------------------------------------------------
-- Document readers (security invoker, so RLS decides what the caller may see).
-- ---------------------------------------------------------------------------
create or replace function private.range_document(lo numeric, hi numeric)
returns jsonb language sql immutable set search_path = ''
as $$ select case when lo is null then null else jsonb_build_object('min', lo, 'max', hi) end; $$;

create or replace function private.set_target_document(s public.prescribed_sets)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'effort', case when s.effort_kind is null then null else jsonb_build_object(
      'kind', s.effort_kind,
      case s.effort_kind when 'reps' then 'reps' else 'seconds' end, private.range_document(s.effort_min, s.effort_max),
      'perSide', s.per_side) end,
    'load', case s.load_mode
      when 'external' then jsonb_build_object('mode', 'external', 'value', private.range_document(s.load_min, s.load_max), 'unit', s.load_unit)
      when 'assisted' then jsonb_build_object('mode', 'assisted', 'value', private.range_document(s.load_min, s.load_max), 'unit', s.load_unit)
      when 'bodyweight' then jsonb_build_object('mode', 'bodyweight', 'added', case when s.load_min is null then null
        else jsonb_build_object('value', s.load_min, 'unit', s.load_unit) end)
      when 'band' then jsonb_build_object('mode', 'band', 'label', s.load_band_label)
      when 'not_applicable' then jsonb_build_object('mode', 'not_applicable')
    end,
    'rir', private.range_document(s.rir_min, s.rir_max),
    'rpe', private.range_document(s.rpe_min, s.rpe_max),
    'annotations', to_jsonb(s.annotations));
$$;

create or replace function private.section_document(s public.program_sections)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', s.id, 'kind', s.kind, 'title', s.title, 'instructions', s.instructions,
    'exercises', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', e.id, 'logicalKey', e.logical_key, 'name', e.name, 'alternatives', e.alternatives,
        'groupId', e.group_id, 'demoUrl', e.demo_url, 'notes', e.notes,
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

-- The revision as a ProgramDraft document (schema version 1).
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

-- Publish readiness, mirroring validateForPublish() in src/domain/programs/contract.ts.
create or replace function private.publish_problems(target uuid)
returns jsonb language sql stable set search_path = ''
as $$
  with weeks as (
    select id, (row_number() over (order by week_index) - 1)::integer as w
    from public.program_weeks where revision_id = target
  ),
  exercises as (
    select format('weeks.%s.days.%s.sections.%s.exercises.%s', wk.w, d.position, s.position, e.position) as path,
      e.name, e.set_count_min is null as no_count,
      not exists (select 1 from public.prescribed_sets ps where ps.revision_id = target and ps.exercise_id = e.id) as no_target,
      array[wk.w, d.position, s.position, e.position] as ord
    from weeks wk
    join public.workout_days d on d.revision_id = target and d.week_id = wk.id
    join public.program_sections s on s.revision_id = target and s.day_id = d.id
    join public.program_exercises e on e.revision_id = target and e.section_id = s.id
  )
  select coalesce(jsonb_agg(problem order by k), '[]'::jsonb) from (
    select array[0] as k, jsonb_build_object('path', 'title', 'message', 'Program needs a title') as problem
    from public.program_revisions where id = target and title ~ '^\s*$'
    union all
    select array[1], jsonb_build_object('path', 'weeks', 'message', 'Program needs at least one week')
    where not exists (select 1 from weeks)
    union all
    select array[2] || ord || 0, jsonb_build_object('path', path, 'message', name || ': set count is missing')
    from exercises where no_count
    union all
    select array[2] || ord || 1, jsonb_build_object('path', path, 'message', name || ': no target')
    from exercises where no_target
  ) problems;
$$;

-- ---------------------------------------------------------------------------
-- Public write path
-- ---------------------------------------------------------------------------
create or replace function public.create_program(p_enrollment_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  enrollment public.service_enrollments;
  new_id uuid;
begin
  select * into enrollment from public.service_enrollments where id = p_enrollment_id;
  if not found or not private.staff_can_access_client(enrollment.client_id) then
    raise exception 'enrollment not found' using errcode = '42501';
  end if;
  if enrollment.service = 'nutrition' then
    raise exception 'nutrition uses nutrition targets, not a workout program' using errcode = '22023';
  end if;
  if enrollment.status = 'ended' then
    raise exception 'enrollment has ended' using errcode = '55000';
  end if;
  insert into public.programs (client_id, enrollment_id, service, created_by)
  values (enrollment.client_id, enrollment.id, enrollment.service, (select auth.uid()))
  returning id into new_id;
  return new_id;
end;
$$;

-- Saves the whole document. expected_version null creates the draft (none may exist yet);
-- otherwise it must equal the draft's lock_version or the save is refused with PT409 and nothing
-- changes, so a stale editor keeps its edits for review (FR-06).
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
    coach_notes = private.draft_text(p_draft, 'coachNotes', ''),
    schema_version = 1,
    lock_version = lock_version + (p_expected_version is not null)::integer
  where id = rev.id
  returning * into rev;

  perform private.write_draft_content(rev.id, p_draft);

  return jsonb_build_object('revisionId', rev.id, 'revisionNumber', rev.revision_number, 'lockVersion', rev.lock_version);
end;
$$;

-- The working draft, or (with no draft) the current published revision to start one from:
-- save it with expected_version null and the same node ids. lockVersion is null unless status is
-- draft; draft is null when nothing exists yet.
create or replace function public.get_program_draft(p_program_id uuid)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  program public.programs;
  rev public.program_revisions;
begin
  select * into program from public.programs where id = p_program_id;
  if not found or not private.staff_can_access_client(program.client_id) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  select * into rev from public.program_revisions where program_id = p_program_id and status = 'draft';
  if not found then
    select * into rev from public.program_revisions where id = program.current_revision_id;
  end if;
  return jsonb_build_object(
    'programId', program.id,
    'revisionId', rev.id,
    'revisionNumber', rev.revision_number,
    'status', rev.status,
    'lockVersion', case when rev.status = 'draft' then rev.lock_version end,
    'draft', case when rev.id is not null then private.revision_document(rev.id) end);
end;
$$;

-- Freezes the draft and moves the current pointer in one transaction. Any failure leaves the
-- prior revision current. Sessions keep their own snapshot (M4), so this never rewrites them.
-- Update entries and audit events join this transaction when audit_events lands (M3 step 6).
create or replace function public.publish_revision(p_program_id uuid, p_expected_version integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
  rev public.program_revisions;
  problems jsonb;
begin
  select * into program from public.programs where id = p_program_id;
  if not found or not private.staff_can_access_client(program.client_id) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  if not private.staff_can_publish_for_client(program.client_id) then
    raise exception 'not allowed to publish for this client' using errcode = '42501';
  end if;
  select * into program from public.programs where id = p_program_id for update;
  if program.archived_at is not null then
    raise exception 'program is archived' using errcode = '55000';
  end if;
  if exists (select 1 from public.service_enrollments where id = program.enrollment_id and status = 'ended') then
    raise exception 'enrollment has ended' using errcode = '55000';
  end if;

  select * into rev from public.program_revisions
  where program_id = p_program_id and status = 'draft' for update;
  if not found or rev.lock_version is distinct from p_expected_version then
    raise exception 'draft has changed since version %', p_expected_version using errcode = 'PT409',
      detail = jsonb_build_object('currentVersion', rev.lock_version)::text;
  end if;

  problems := private.publish_problems(rev.id);
  if jsonb_array_length(problems) > 0 then
    raise exception 'draft is not ready to publish' using errcode = 'PT422', detail = problems::text;
  end if;

  update public.program_revisions
  set status = 'published', published_at = now(), published_by = (select auth.uid())
  where id = rev.id
  returning * into rev;
  update public.programs set current_revision_id = rev.id where id = p_program_id;

  return jsonb_build_object('revisionId', rev.id, 'revisionNumber', rev.revision_number, 'publishedAt', rev.published_at);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants. Writers and readers called only from the security-definer functions run as the owner,
-- so nobody else needs them. get_program_draft is security invoker and needs its readers.
-- ---------------------------------------------------------------------------
revoke all on function
  private.staff_can_publish_for_client(uuid),
  private.draft_fail(text, text),
  private.draft_path(text, text),
  private.draft_value(jsonb, text, text, text, boolean),
  private.draft_expect_object(jsonb, text),
  private.draft_text(jsonb, text, text, boolean),
  private.draft_number(jsonb, text, text, boolean),
  private.draft_bool(jsonb, text, text),
  private.draft_array(jsonb, text, text),
  private.draft_enum(jsonb, text, text, text[], boolean),
  private.draft_uuid(jsonb, text, text),
  private.draft_date(jsonb, text, text),
  private.draft_range(jsonb, text, text, boolean),
  private.insert_draft_target(uuid, uuid, integer, jsonb, text),
  private.insert_draft_exercise(uuid, uuid, integer, jsonb, text),
  private.insert_draft_section(uuid, uuid, integer, jsonb, text),
  private.write_draft_content(uuid, jsonb),
  private.range_document(numeric, numeric),
  private.set_target_document(public.prescribed_sets),
  private.section_document(public.program_sections),
  private.revision_document(uuid),
  private.publish_problems(uuid),
  public.create_program(uuid),
  public.save_draft(uuid, integer, jsonb),
  public.get_program_draft(uuid),
  public.publish_revision(uuid, integer)
from public, anon, authenticated;

grant execute on function
  private.range_document(numeric, numeric),
  private.set_target_document(public.prescribed_sets),
  private.section_document(public.program_sections),
  private.revision_document(uuid),
  public.create_program(uuid),
  public.save_draft(uuid, integer, jsonb),
  public.get_program_draft(uuid),
  public.publish_revision(uuid, integer)
to authenticated;
