-- M4 (FR-08, NFR-01, NFR-03; decision 0021): Stimulus & Fatigue Tracking.
--
-- Optional 0–3 answers per session and muscle trained that day: Acute Muscle Stimulus (challenge,
-- pump, disruption) and Set Progression Assessment (soreness, performance). Null = unanswered; 0
-- is an answer. Feedback is a result: it never changes a prescription and never blocks completing
-- a workout. compared_session_id is the earlier session the progression answers refer to (the
-- last earlier day that trained the muscle, across weeks), or null when that day isn't logged.
--
-- Write path mirrors logged sets: SELECT only for browsers; the client and staff with access write
-- through save_muscle_feedback, and updated_by attributes coach edits.

create table public.muscle_feedback (
  session_id uuid not null,
  client_id uuid not null,
  -- muscleKey(): trimmed, single-spaced, lower case. muscle_name keeps the coach's spelling.
  muscle_key text not null check (muscle_key = lower(regexp_replace(btrim(muscle_key), '\s+', ' ', 'g')) and char_length(muscle_key) between 1 and 60),
  muscle_name text not null check (char_length(muscle_name) between 1 and 60),
  challenge smallint check (challenge between 0 and 3),
  pump smallint check (pump between 0 and 3),
  disruption smallint check (disruption between 0 and 3),
  soreness smallint check (soreness between 0 and 3),
  performance smallint check (performance between 0 and 3),
  compared_session_id uuid,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, muscle_key),
  foreign key (session_id, client_id) references public.training_sessions (id, client_id) on delete cascade,
  foreign key (compared_session_id, client_id) references public.training_sessions (id, client_id) on delete set null (compared_session_id),
  constraint muscle_feedback_compared_other check (compared_session_id is distinct from session_id)
);
create index muscle_feedback_client on public.muscle_feedback (client_id);
create index muscle_feedback_compared on public.muscle_feedback (compared_session_id);

create trigger muscle_feedback_touch before update on public.muscle_feedback
  for each row execute function private.touch_updated_at();

-- True when an exercise of the session's own day (in its revision) lists the muscle.
create or replace function private.session_trains_muscle(p_session public.training_sessions, p_muscle_key text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.program_exercises e
    join public.program_sections sec on sec.id = e.section_id and sec.revision_id = e.revision_id
    cross join unnest(e.muscles) as m(name)
    where e.revision_id = p_session.revision_id and sec.day_id = p_session.day_id
      and lower(regexp_replace(btrim(m.name), '\s+', ' ', 'g')) = p_muscle_key);
$$;

-- Saves all five answers for one muscle of a session (each call replaces the row's answers).
create or replace function public.save_muscle_feedback(p_session_id uuid, p_muscle_name text,
  p_challenge integer, p_pump integer, p_disruption integer, p_soreness integer, p_performance integer,
  p_compared_session_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  s public.training_sessions := private.writable_session(p_session_id);
  compared public.training_sessions;
  name text := regexp_replace(btrim(coalesce(p_muscle_name, '')), '\s+', ' ', 'g');
  key text := lower(regexp_replace(btrim(coalesce(p_muscle_name, '')), '\s+', ' ', 'g'));
  saved public.muscle_feedback;
begin
  if not private.session_trains_muscle(s, key) then
    raise exception 'muscle is not trained in this workout' using errcode = '22023';
  end if;
  if p_compared_session_id is not null then
    select * into compared from public.training_sessions where id = p_compared_session_id;
    if not found or compared.program_id <> s.program_id or compared.id = s.id
        or not private.session_trains_muscle(compared, key) then
      raise exception 'compared session must be another day of this program that trained the muscle' using errcode = '22023';
    end if;
  end if;

  insert into public.muscle_feedback (session_id, client_id, muscle_key, muscle_name,
    challenge, pump, disruption, soreness, performance, compared_session_id, created_by, updated_by)
  values (s.id, s.client_id, key, name, p_challenge, p_pump, p_disruption, p_soreness, p_performance,
    p_compared_session_id, (select auth.uid()), (select auth.uid()))
  on conflict (session_id, muscle_key) do update set
    muscle_name = excluded.muscle_name, challenge = excluded.challenge, pump = excluded.pump,
    disruption = excluded.disruption, soreness = excluded.soreness, performance = excluded.performance,
    compared_session_id = excluded.compared_session_id, updated_by = excluded.updated_by
  returning * into saved;
  return to_jsonb(saved);
exception
  when check_violation then
    raise exception 'invalid feedback: %', sqlerrm using errcode = '22023';
end;
$$;

-- The log reader from migration 00016, plus each session's muscle feedback.
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
        where ls.session_id = s.id), '[]'::jsonb),
      'feedback', coalesce((select jsonb_agg(jsonb_build_object(
          'muscleKey', f.muscle_key, 'muscleName', f.muscle_name,
          'challenge', f.challenge, 'pump', f.pump, 'disruption', f.disruption,
          'soreness', f.soreness, 'performance', f.performance,
          'comparedSessionId', f.compared_session_id, 'updatedAt', f.updated_at,
          'updatedByStaff', f.updated_by is distinct from c.auth_user_id)
          order by f.muscle_key)
        from public.muscle_feedback f where f.session_id = s.id), '[]'::jsonb))
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
revoke all on public.muscle_feedback from anon, authenticated;
grant select on public.muscle_feedback to authenticated;
alter table public.muscle_feedback enable row level security;
create policy muscle_feedback_select on public.muscle_feedback for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));

revoke all on function private.session_trains_muscle(public.training_sessions, text) from public, anon, authenticated;
revoke all on function public.save_muscle_feedback(uuid, text, integer, integer, integer, integer, integer, uuid)
  from public, anon, authenticated;
grant execute on function public.save_muscle_feedback(uuid, text, integer, integer, integer, integer, integer, uuid) to authenticated;
-- create or replace keeps get_training_log's grants from migration 00016.
