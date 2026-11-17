-- M4 (FR-04, FR-07, NFR-01, NFR-03; decision 0021): mesocycle set logging.
--
-- A session is one client's log of one program day. It is pinned to the published revision that
-- was current when it started, so a later publish never rewrites it (roadmap invariant 6). That
-- revision is immutable, so the session's "target snapshot" is the revision's content itself.
-- Logged sets are actual results, kept apart from prescriptions.
--
-- Write path: browsers get SELECT only. The client and staff with access to the client write
-- through these security-definer functions, which check ownership, the parent chain and set
-- limits. Set ids come from the browser, so a retried save updates the same row instead of
-- duplicating it. updated_by records who last changed a row (client or coach); full audit history
-- lands with audit_events.

create type public.session_status as enum ('in_progress', 'completed', 'skipped');

create table public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  program_id uuid not null,
  revision_id uuid not null,
  day_id uuid not null,
  status public.session_status not null default 'in_progress',
  -- The client's local date for the workout; null until known.
  performed_on date,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  notes text not null default '' check (char_length(notes) <= 5000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- One log per program day. Its revision stays fixed for the life of the session.
  unique (program_id, day_id),
  unique (id, client_id),
  unique (id, revision_id),
  foreign key (program_id, client_id) references public.programs (id, client_id) on delete restrict,
  foreign key (revision_id, program_id) references public.program_revisions (id, program_id) on delete restrict,
  foreign key (day_id, revision_id) references public.workout_days (id, revision_id) on delete restrict,
  constraint training_sessions_completed check ((status = 'completed') = (completed_at is not null))
);
create index training_sessions_client on public.training_sessions (client_id);

create table public.logged_sets (
  id uuid primary key,
  session_id uuid not null,
  client_id uuid not null,
  revision_id uuid not null,
  exercise_id uuid not null,
  set_number integer not null check (set_number between 1 and 50),
  -- Actual load. A weight always carries the unit the person chose; a bare number is never stored.
  load_mode public.load_mode,
  load_value numeric,
  load_unit public.weight_unit,
  -- Null = not entered; 0 is a real result. Decimal reps (8.5) are allowed.
  reps numeric check (reps >= 0 and reps <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, exercise_id, set_number),
  foreign key (session_id, client_id) references public.training_sessions (id, client_id) on delete cascade,
  foreign key (session_id, revision_id) references public.training_sessions (id, revision_id) on delete cascade,
  foreign key (exercise_id, revision_id) references public.program_exercises (id, revision_id) on delete restrict,
  constraint logged_sets_load check (
    case load_mode
      when 'external' then load_value >= 0 and load_unit is not null
      when 'assisted' then load_value >= 0 and load_unit is not null
      when 'bodyweight' then (load_value is null and load_unit is null) or (load_value >= 0 and load_unit is not null)
      else load_mode is null and load_value is null and load_unit is null
    end)
);
create index logged_sets_session on public.logged_sets (session_id);

create trigger training_sessions_touch before update on public.training_sessions
  for each row execute function private.touch_updated_at();
create trigger logged_sets_touch before update on public.logged_sets
  for each row execute function private.touch_updated_at();

-- Sessions run only against published revisions, whatever path inserts them.
create or replace function private.guard_session_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.program_revisions where id = new.revision_id and status = 'published') then
    raise exception 'sessions use published revisions only' using errcode = '55000';
  end if;
  if tg_op = 'UPDATE' and (new.revision_id <> old.revision_id or new.day_id <> old.day_id
      or new.program_id <> old.program_id or new.client_id <> old.client_id) then
    raise exception 'a session keeps its program day and revision' using errcode = '55000';
  end if;
  return new;
end;
$$;
create trigger training_sessions_revision before insert or update on public.training_sessions
  for each row execute function private.guard_session_revision();

-- ---------------------------------------------------------------------------
-- Access helpers
-- ---------------------------------------------------------------------------
-- The client themself, or staff with access to that client (PRD: coaches can correct client data).
-- Never null: current_client_id() is null for staff, and a null check would pass `if not ...`.
create or replace function private.can_log_for_client(target_client uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce(target_client = private.current_client_id(), false) or private.staff_can_access_client(target_client);
$$;

-- Locks and returns a session the caller may write, or raises 42501 for anything else.
create or replace function private.writable_session(p_session_id uuid)
returns public.training_sessions language plpgsql security definer set search_path = ''
as $$
declare
  s public.training_sessions;
begin
  select * into s from public.training_sessions where id = p_session_id for update;
  if not found or not private.can_log_for_client(s.client_id) then
    raise exception 'session not found' using errcode = '42501';
  end if;
  return s;
end;
$$;

-- ---------------------------------------------------------------------------
-- Write functions
-- ---------------------------------------------------------------------------
-- Opens the log for a program day, or returns the existing one. New sessions use the program's
-- current published revision; the day must exist in it.
create or replace function public.start_session(p_program_id uuid, p_day_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
  s public.training_sessions;
  tz text;
begin
  select * into program from public.programs where id = p_program_id;
  if not found or not private.can_log_for_client(program.client_id) or program.current_revision_id is null then
    raise exception 'program not found' using errcode = '42501';
  end if;
  select * into s from public.training_sessions where program_id = p_program_id and day_id = p_day_id;
  if found then
    return to_jsonb(s);
  end if;
  if program.service <> 'mesocycle' then
    raise exception 'set logging is available for mesocycles only' using errcode = '22023';
  end if;
  if program.archived_at is not null then
    raise exception 'program is archived' using errcode = '55000';
  end if;
  if not exists (select 1 from public.workout_days where id = p_day_id and revision_id = program.current_revision_id) then
    raise exception 'day not found in the current program' using errcode = '22023';
  end if;
  select timezone into tz from public.clients where id = program.client_id;
  insert into public.training_sessions (client_id, program_id, revision_id, day_id, performed_on, created_by, updated_by)
  values (program.client_id, program.id, program.current_revision_id, p_day_id,
    (now() at time zone coalesce(tz, 'UTC'))::date, (select auth.uid()), (select auth.uid()))
  on conflict (program_id, day_id) do nothing
  returning * into s;
  if s.id is null then
    -- A concurrent start won; return its session.
    select * into s from public.training_sessions where program_id = p_program_id and day_id = p_day_id;
  end if;
  return to_jsonb(s);
end;
$$;

-- Creates or updates one set (idempotent on p_set_id). Sets are numbered 1..the exercise's maximum
-- prescribed set count, and only exercises of the session's own day can be logged.
create or replace function public.save_logged_set(p_set_id uuid, p_session_id uuid, p_exercise_id uuid, p_set_number integer,
  p_load_mode text, p_load_value numeric, p_load_unit text, p_reps numeric)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  s public.training_sessions := private.writable_session(p_session_id);
  existing public.logged_sets;
  max_sets numeric;
  saved public.logged_sets;
begin
  select e.set_count_max into max_sets
  from public.program_exercises e
  join public.program_sections sec on sec.id = e.section_id and sec.revision_id = e.revision_id
  where e.id = p_exercise_id and e.revision_id = s.revision_id and sec.day_id = s.day_id;
  if not found then
    raise exception 'exercise is not part of this workout' using errcode = '22023';
  end if;
  if max_sets is null or p_set_number is null or p_set_number < 1 or p_set_number > ceil(max_sets) then
    raise exception 'set % is outside the % prescribed sets', p_set_number, coalesce(ceil(max_sets)::text, 'no') using errcode = '22023';
  end if;
  if p_load_mode is not null and p_load_mode not in ('external', 'assisted', 'bodyweight') then
    raise exception 'unsupported load mode %', p_load_mode using errcode = '22023';
  end if;
  if p_load_unit is not null and p_load_unit not in ('lb', 'kg') then
    raise exception 'unit must be lb or kg' using errcode = '22023';
  end if;

  select * into existing from public.logged_sets where id = p_set_id;
  if found and (existing.session_id <> s.id or existing.exercise_id <> p_exercise_id or existing.set_number <> p_set_number) then
    raise exception 'set id belongs to another set' using errcode = '22023';
  end if;

  insert into public.logged_sets (id, session_id, client_id, revision_id, exercise_id, set_number,
    load_mode, load_value, load_unit, reps, created_by, updated_by)
  values (p_set_id, s.id, s.client_id, s.revision_id, p_exercise_id, p_set_number,
    p_load_mode::public.load_mode, p_load_value, p_load_unit::public.weight_unit, p_reps, (select auth.uid()), (select auth.uid()))
  on conflict (id) do update set
    load_mode = excluded.load_mode, load_value = excluded.load_value, load_unit = excluded.load_unit,
    reps = excluded.reps, updated_by = excluded.updated_by
  returning * into saved;
  return to_jsonb(saved);
exception
  when unique_violation then
    raise exception 'set % is already logged for this exercise', p_set_number using errcode = 'PT409';
  when check_violation then
    raise exception 'invalid set: %', sqlerrm using errcode = '22023';
end;
$$;

-- Removes a set. Only the highest-numbered set of an exercise can go, so numbering stays 1..n.
create or replace function public.delete_logged_set(p_set_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  target public.logged_sets;
begin
  select * into target from public.logged_sets where id = p_set_id;
  if not found then
    return; -- Already gone: a retried delete succeeds.
  end if;
  perform private.writable_session(target.session_id);
  if exists (select 1 from public.logged_sets where session_id = target.session_id
             and exercise_id = target.exercise_id and set_number > target.set_number) then
    raise exception 'remove later sets first' using errcode = '22023';
  end if;
  delete from public.logged_sets where id = p_set_id;
end;
$$;

-- Status, date and notes. Completing stamps completed_at; reopening clears it.
create or replace function public.update_session(p_session_id uuid, p_status text, p_performed_on date, p_notes text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  s public.training_sessions := private.writable_session(p_session_id);
begin
  if p_status not in ('in_progress', 'completed', 'skipped') then
    raise exception 'unknown status %', p_status using errcode = '22023';
  end if;
  update public.training_sessions set
    status = p_status::public.session_status,
    completed_at = case when p_status = 'completed' then coalesce(s.completed_at, now()) end,
    performed_on = p_performed_on,
    notes = coalesce(p_notes, ''),
    updated_by = (select auth.uid())
  where id = s.id
  returning * into s;
  return to_jsonb(s);
exception
  when check_violation then
    raise exception 'invalid session: %', sqlerrm using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reader (security invoker: RLS decides). Each session carries its own revision's day and each set
-- its exercise's muscles, so totals follow what was prescribed when the session ran.
-- ---------------------------------------------------------------------------
create or replace function public.get_training_log(p_program_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'id', s.id, 'dayId', s.day_id, 'revisionId', s.revision_id, 'status', s.status,
      'performedOn', s.performed_on, 'startedAt', s.started_at, 'completedAt', s.completed_at, 'notes', s.notes,
      'updatedAt', s.updated_at, 'updatedByStaff', s.updated_by is distinct from c.auth_user_id,
      'useSections', w.use_sections,
      'day', jsonb_build_object('id', d.id, 'label', d.label, 'scheduledDate', d.scheduled_date,
        'sections', coalesce((select jsonb_agg(private.section_document(sec) order by sec.position)
          from public.program_sections sec where sec.revision_id = s.revision_id and sec.day_id = d.id), '[]'::jsonb)),
      'sets', coalesce((select jsonb_agg(jsonb_build_object(
          'id', ls.id, 'exerciseId', ls.exercise_id, 'setNumber', ls.set_number,
          'loadMode', ls.load_mode, 'loadValue', ls.load_value, 'loadUnit', ls.load_unit, 'reps', ls.reps,
          'muscles', to_jsonb(e.muscles), 'updatedAt', ls.updated_at,
          'updatedByStaff', ls.updated_by is distinct from c.auth_user_id)
          order by ls.exercise_id, ls.set_number)
        from public.logged_sets ls
        join public.program_exercises e on e.id = ls.exercise_id and e.revision_id = ls.revision_id
        where ls.session_id = s.id), '[]'::jsonb))
    order by s.started_at), '[]'::jsonb)
  from public.training_sessions s
  join public.clients c on c.id = s.client_id
  join public.workout_days d on d.id = s.day_id and d.revision_id = s.revision_id
  join public.program_weeks w on w.id = d.week_id and w.revision_id = d.revision_id
  where s.program_id = p_program_id;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on public.training_sessions, public.logged_sets from anon, authenticated;
grant select on public.training_sessions, public.logged_sets to authenticated;

alter table public.training_sessions enable row level security;
alter table public.logged_sets enable row level security;

create policy training_sessions_select on public.training_sessions for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy logged_sets_select on public.logged_sets for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));

revoke all on function private.guard_session_revision(), private.writable_session(uuid) from public, anon, authenticated;
revoke all on function private.can_log_for_client(uuid) from public, anon;
grant execute on function private.can_log_for_client(uuid) to authenticated;

revoke all on function public.start_session(uuid, uuid),
  public.save_logged_set(uuid, uuid, uuid, integer, text, numeric, text, numeric),
  public.delete_logged_set(uuid),
  public.update_session(uuid, text, date, text),
  public.get_training_log(uuid)
from public, anon, authenticated;
grant execute on function public.start_session(uuid, uuid),
  public.save_logged_set(uuid, uuid, uuid, integer, text, numeric, text, numeric),
  public.delete_logged_set(uuid),
  public.update_session(uuid, text, date, text),
  public.get_training_log(uuid)
to authenticated;
