-- M3 / migration step 2 (roadmap §6): templates, client programs, immutable revisions and the
-- week/day/section/exercise/prescribed-set hierarchy (FR-04, FR-05, FR-06).
--
-- Write path: browsers get SELECT only. Every write goes through transactional security-definer
-- functions (save_draft / publish_revision, next migration) so lock versions, contract
-- validation and publish rules can't be bypassed. Immutability of published content is enforced
-- here by triggers, so it also holds for those functions and for operators using SQL directly.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
create type public.revision_status as enum ('draft', 'published');
create type public.program_source as enum ('scratch', 'template', 'duplicate', 'import');
create type public.section_kind as enum ('preparation', 'main', 'cooldown', 'other');
create type public.effort_kind as enum ('reps', 'duration');
create type public.load_mode as enum ('external', 'bodyweight', 'assisted', 'band', 'not_applicable');

-- ---------------------------------------------------------------------------
-- Templates: client-free reusable content. A version stores a validated ProgramDraft document;
-- assigning it copies the content, so editing a template never rewrites assigned programs (FR-04).
-- ---------------------------------------------------------------------------
create table public.templates (
  id uuid primary key default gen_random_uuid(),
  service public.service_kind not null check (service <> 'nutrition'),
  title text not null check (char_length(title) between 1 and 160),
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.templates (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status public.revision_status not null default 'draft',
  schema_version smallint not null check (schema_version > 0),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (template_id, version_number),
  constraint template_versions_published_at check ((status = 'published') = (published_at is not null))
);
create unique index template_versions_one_draft on public.template_versions (template_id) where status = 'draft';

-- ---------------------------------------------------------------------------
-- Programs and revisions. Composite foreign keys carry client_id/service down the chain, so a
-- program can't hang off another client's enrollment and a revision can't claim another client
-- (roadmap §6 invariant 1).
-- ---------------------------------------------------------------------------
alter table public.service_enrollments
  add constraint service_enrollments_id_client_service unique (id, client_id, service);

create table public.programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete restrict,
  enrollment_id uuid not null,
  -- Nutrition uses its own target/log model, not workout sets (M3 exit criteria).
  service public.service_kind not null check (service <> 'nutrition'),
  current_revision_id uuid,
  archived_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  foreign key (enrollment_id, client_id, service)
    references public.service_enrollments (id, client_id, service) on delete restrict
);
comment on table public.programs is 'Titles and content live on revisions so a draft rename never reaches the client.';

create table public.program_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  client_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  status public.revision_status not null default 'draft',
  -- Optimistic lock for save_draft(expected_version, payload): stale editors get a conflict (FR-06).
  lock_version integer not null default 1 check (lock_version > 0),
  schema_version smallint not null check (schema_version > 0),
  title text not null default '' check (char_length(title) <= 160),
  coach_notes text not null default '' check (char_length(coach_notes) <= 20000),
  source_kind public.program_source not null default 'scratch',
  source_template_version_id uuid references public.template_versions (id) on delete restrict,
  published_at timestamptz,
  published_by uuid references auth.users (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_id, revision_number),
  unique (id, program_id),
  foreign key (program_id, client_id) references public.programs (id, client_id) on delete restrict,
  constraint program_revisions_published_at check ((status = 'published') = (published_at is not null)),
  constraint program_revisions_template_source
    check ((source_kind = 'template') = (source_template_version_id is not null))
);
-- One working draft per program.
create unique index program_revisions_one_draft on public.program_revisions (program_id) where status = 'draft';
create index program_revisions_client on public.program_revisions (client_id);

alter table public.programs
  add foreign key (current_revision_id, id) references public.program_revisions (id, program_id);
create index programs_client on public.programs (client_id);

-- ---------------------------------------------------------------------------
-- Revision content hierarchy. Every row carries revision_id, and each parent link is a composite
-- FK on (parent_id, revision_id), so a row can't be attached to a parent in another revision.
-- Node ids are scoped to a revision (primary key (id, revision_id)), so a draft opened from the
-- published revision keeps the same ids and editors address nodes stably (decision 0005).
-- Positions are deferrable so a draft save can reorder within one transaction.
-- ---------------------------------------------------------------------------
create table public.program_weeks (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null references public.program_revisions (id) on delete cascade,
  week_index integer not null check (week_index > 0),
  label text not null default '' check (char_length(label) <= 120),
  start_date date,
  primary key (id, revision_id),
  unique (revision_id, week_index) deferrable initially immediate
);

create table public.workout_days (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null,
  week_id uuid not null,
  position integer not null check (position >= 0),
  label text not null check (char_length(label) between 1 and 120),
  -- Optional: without a date, days are sequence-only (FR-03).
  scheduled_date date,
  primary key (id, revision_id),
  unique (revision_id, week_id, position) deferrable initially immediate,
  foreign key (week_id, revision_id) references public.program_weeks (id, revision_id) on delete cascade
);

-- day_id null = a shared section (e.g. a warm-up) that applies across days.
create table public.program_sections (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null references public.program_revisions (id) on delete cascade,
  day_id uuid,
  position integer not null check (position >= 0),
  kind public.section_kind not null default 'main',
  title text not null default '' check (char_length(title) <= 160),
  instructions text not null default '' check (char_length(instructions) <= 20000),
  primary key (id, revision_id),
  unique (revision_id, day_id, position) deferrable initially immediate,
  foreign key (day_id, revision_id) references public.workout_days (id, revision_id) on delete cascade
);
create unique index program_sections_shared_position
  on public.program_sections (revision_id, position) where day_id is null;

create table public.program_exercises (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null,
  section_id uuid not null,
  position integer not null check (position >= 0),
  -- Stable across revisions so history and progress follow the same movement.
  logical_key text not null check (char_length(logical_key) between 1 and 120),
  name text not null check (char_length(name) between 1 and 200),
  -- [{id, name}]: explicit alternatives fill one slot; "A or B" is not two exercises (FR-05).
  alternatives jsonb not null default '[]' check (jsonb_typeof(alternatives) = 'array'),
  group_id text check (char_length(group_id) <= 64),
  demo_url text check (demo_url ~ '^https?://' and char_length(demo_url) <= 2048),
  notes text not null default '' check (char_length(notes) <= 20000),
  -- "2-3" sets is a range; null = not yet prescribed (publish rejects it).
  set_count_min numeric,
  set_count_max numeric,
  primary key (id, revision_id),
  unique (revision_id, section_id, position) deferrable initially immediate,
  foreign key (section_id, revision_id) references public.program_sections (id, revision_id) on delete cascade,
  constraint program_exercises_set_count check (
    (set_count_min is null and set_count_max is null)
    or (set_count_min >= 0 and set_count_min <= set_count_max))
);
create index program_exercises_logical_key on public.program_exercises (logical_key);

-- One row applies to every set; otherwise one row per set (ExercisePrescription.targets).
-- Ranges are numeric min/max pairs; scalars use equal endpoints. RIR "1-2" is never a date.
-- Null = not prescribed; zero is a real target.
create table public.prescribed_sets (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null,
  exercise_id uuid not null,
  position integer not null check (position >= 0),
  effort_kind public.effort_kind,
  effort_min numeric,
  effort_max numeric,
  per_side boolean,
  load_mode public.load_mode,
  load_min numeric,
  load_max numeric,
  -- Never inferred from a bare number; null = unit not known yet.
  load_unit public.weight_unit,
  load_band_label text check (char_length(load_band_label) between 1 and 120),
  rir_min numeric,
  rir_max numeric,
  rpe_min numeric,
  rpe_max numeric,
  annotations text[] not null default '{}',
  unique (revision_id, exercise_id, position) deferrable initially immediate,
  foreign key (exercise_id, revision_id) references public.program_exercises (id, revision_id) on delete cascade,
  constraint prescribed_sets_effort check (
    (effort_kind is null and effort_min is null and effort_max is null and per_side is null)
    or (effort_kind is not null and per_side is not null and effort_min >= 0 and effort_min <= effort_max)),
  constraint prescribed_sets_load check (
    case load_mode
      -- Loads are never negative; assistance is its own mode with a positive amount.
      when 'external' then load_min >= 0 and load_min <= load_max and load_band_label is null
      when 'assisted' then load_min >= 0 and load_min <= load_max and load_band_label is null
      -- Bodyweight with optional added weight, stored as equal endpoints.
      when 'bodyweight' then load_band_label is null
        and ((load_min is null and load_max is null and load_unit is null) or (load_min >= 0 and load_min = load_max))
      when 'band' then load_band_label is not null
        and load_min is null and load_max is null and load_unit is null
      else load_min is null and load_max is null and load_unit is null and load_band_label is null
    end),
  constraint prescribed_sets_rir check (
    (rir_min is null and rir_max is null) or (rir_min >= 0 and rir_min <= rir_max)),
  constraint prescribed_sets_rpe check (
    (rpe_min is null and rpe_max is null) or (rpe_min >= 0 and rpe_min <= rpe_max and rpe_max <= 10))
);
create index prescribed_sets_revision on public.prescribed_sets (revision_id);

create table public.program_resources (
  id uuid not null default gen_random_uuid(),
  revision_id uuid not null references public.program_revisions (id) on delete cascade,
  position integer not null check (position >= 0),
  title text not null check (char_length(title) between 1 and 160),
  body text not null default '' check (char_length(body) <= 20000),
  url text check (url ~ '^https?://' and char_length(url) <= 2048),
  primary key (id, revision_id),
  unique (revision_id, position) deferrable initially immediate
);

create index program_weeks_revision on public.program_weeks (revision_id);
create index workout_days_revision on public.workout_days (revision_id);
create index program_sections_revision on public.program_sections (revision_id);
create index program_exercises_revision on public.program_exercises (revision_id);

-- ---------------------------------------------------------------------------
-- Immutability (roadmap §6 invariants 4-5). Published revisions and template versions are frozen
-- for every role, including the write functions; only draft -> published is allowed.
-- ---------------------------------------------------------------------------
create or replace function private.guard_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' then
      raise exception 'published revision % is immutable', old.id using errcode = '55000';
    end if;
    return old;
  end if;
  if old.status = 'published' then
    raise exception 'published revision % is immutable', old.id using errcode = '55000';
  end if;
  if new.program_id <> old.program_id or new.client_id <> old.client_id
     or new.revision_number <> old.revision_number then
    raise exception 'revision identity cannot change' using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger program_revisions_guard before update or delete on public.program_revisions
  for each row execute function private.guard_revision();

create or replace function private.guard_template_version()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if old.status = 'published' then
    raise exception 'published template version % is immutable', old.id using errcode = '55000';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.template_id <> old.template_id or new.version_number <> old.version_number then
    raise exception 'template version identity cannot change' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger template_versions_guard before update or delete on public.template_versions
  for each row execute function private.guard_template_version();

-- Content rows can change only while their revision is a draft. A missing revision means the
-- draft itself is being deleted (cascade), which is allowed.
create or replace function private.guard_revision_content()
returns trigger language plpgsql set search_path = ''
as $$
declare
  rev uuid;
  rev_status public.revision_status;
begin
  foreach rev in array array_remove(array[
    case when tg_op <> 'INSERT' then old.revision_id end,
    case when tg_op <> 'DELETE' then new.revision_id end], null)
  loop
    select status into rev_status from public.program_revisions where id = rev;
    if rev_status = 'published' then
      raise exception 'content of published revision % is immutable', rev using errcode = '55000';
    end if;
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create trigger program_weeks_guard before insert or update or delete on public.program_weeks
  for each row execute function private.guard_revision_content();
create trigger workout_days_guard before insert or update or delete on public.workout_days
  for each row execute function private.guard_revision_content();
create trigger program_sections_guard before insert or update or delete on public.program_sections
  for each row execute function private.guard_revision_content();
create trigger program_exercises_guard before insert or update or delete on public.program_exercises
  for each row execute function private.guard_revision_content();
create trigger prescribed_sets_guard before insert or update or delete on public.prescribed_sets
  for each row execute function private.guard_revision_content();
create trigger program_resources_guard before insert or update or delete on public.program_resources
  for each row execute function private.guard_revision_content();

-- The current pointer may only reference a published revision of the same program (FK covers
-- the program match).
create or replace function private.guard_program_current_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.current_revision_id is not null and not exists (
    select 1 from public.program_revisions
    where id = new.current_revision_id and status = 'published'
  ) then
    raise exception 'current revision must be published' using errcode = '55000';
  end if;
  return new;
end;
$$;

create trigger programs_current_revision before insert or update of current_revision_id on public.programs
  for each row execute function private.guard_program_current_revision();

create trigger programs_touch before update on public.programs
  for each row execute function private.touch_updated_at();
create trigger templates_touch before update on public.templates
  for each row execute function private.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Read helper for content rows. Staff with access to the client read drafts; the client reads
-- published revisions only (PRD §4: drafts are staff-only).
-- ---------------------------------------------------------------------------
create or replace function private.can_read_revision(target_revision uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.program_revisions r
    where r.id = target_revision
      and (private.staff_can_access_client(r.client_id)
           or (r.client_id = private.current_client_id() and r.status = 'published'))
  );
$$;

revoke all on function private.can_read_revision(uuid) from public;
grant execute on function private.can_read_revision(uuid) to authenticated, anon;
revoke all on function private.guard_revision(), private.guard_template_version(),
  private.guard_revision_content(), private.guard_program_current_revision() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Grants: read-only for browsers; writes arrive with the transactional functions.
-- ---------------------------------------------------------------------------
revoke all on public.templates, public.template_versions, public.programs, public.program_revisions,
  public.program_weeks, public.workout_days, public.program_sections, public.program_exercises,
  public.prescribed_sets, public.program_resources from anon, authenticated;

grant select on public.templates, public.template_versions, public.programs, public.program_revisions,
  public.program_weeks, public.workout_days, public.program_sections, public.program_exercises,
  public.prescribed_sets, public.program_resources to authenticated;

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.templates enable row level security;
alter table public.template_versions enable row level security;
alter table public.programs enable row level security;
alter table public.program_revisions enable row level security;
alter table public.program_weeks enable row level security;
alter table public.workout_days enable row level security;
alter table public.program_sections enable row level security;
alter table public.program_exercises enable row level security;
alter table public.prescribed_sets enable row level security;
alter table public.program_resources enable row level security;

-- Templates hold no client data; any staff member may read them.
create policy templates_select on public.templates for select to authenticated
  using ((select private.is_staff()));
create policy template_versions_select on public.template_versions for select to authenticated
  using ((select private.is_staff()));

-- A client sees a program only once something has been published for it.
create policy programs_select on public.programs for select to authenticated
  using ((select private.staff_can_access_client(client_id))
         or (client_id = (select private.current_client_id()) and current_revision_id is not null));

create policy program_revisions_select on public.program_revisions for select to authenticated
  using ((select private.staff_can_access_client(client_id))
         or (client_id = (select private.current_client_id()) and status = 'published'));

create policy program_weeks_select on public.program_weeks for select to authenticated
  using (private.can_read_revision(revision_id));
create policy workout_days_select on public.workout_days for select to authenticated
  using (private.can_read_revision(revision_id));
create policy program_sections_select on public.program_sections for select to authenticated
  using (private.can_read_revision(revision_id));
create policy program_exercises_select on public.program_exercises for select to authenticated
  using (private.can_read_revision(revision_id));
create policy prescribed_sets_select on public.prescribed_sets for select to authenticated
  using (private.can_read_revision(revision_id));
create policy program_resources_select on public.program_resources for select to authenticated
  using (private.can_read_revision(revision_id));
