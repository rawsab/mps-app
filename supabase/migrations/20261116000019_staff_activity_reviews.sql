-- Reviews: client activity across every client a staff member can see, with per-staff read
-- state (FR-07, FR-08, NFR-01, PRD §6 "Reviews"; decision 0024).
--
-- The session summary from migration 00018 moves into private.session_activity so the client
-- page feed and Reviews share it. Reviews time items by the client's own latest change; a session
-- only staff have touched never appears, and a coach's correction doesn't make an item unread.
--
-- Read state: a per-staff watermark ("mark all as read") plus per-session "seen" times (opening an
-- item). An item is unread while the client changed it after both. Browsers get SELECT on their
-- own rows only; writes go through mark_activity_read.

-- ---------------------------------------------------------------------------
-- Shared session summary
-- ---------------------------------------------------------------------------
-- Security invoker: RLS on the tables read here decides which sessions the caller sees.
-- p_client_id null = every visible client.
create type private.session_activity_row as (
  id uuid, client_id uuid, client_name text, program_id uuid, service public.service_kind, program_title text,
  week_id uuid, week_index integer, day_id uuid, day_index integer, day_label text,
  status public.session_status, performed_on date, started_at timestamptz, completed_at timestamptz,
  set_count integer, feedback_count integer, activity_at timestamptz, client_activity_at timestamptz, staff_edited boolean);

create or replace function private.session_activity(p_client_id uuid)
returns setof private.session_activity_row
language sql stable set search_path = ''
as $$
  select s.id, s.client_id, c.full_name, s.program_id, p.service,
    coalesce(nullif(btrim(cur.title), ''), r.title),
    w.id, w.week_index - 1, d.id,
    (select count(*) from public.workout_days o where o.revision_id = d.revision_id and o.week_id = d.week_id and o.position < d.position)::integer,
    d.label, s.status, s.performed_on, s.started_at, s.completed_at,
    sets.n::integer, fb.n::integer,
    greatest(s.updated_at, sets.at, fb.at),
    -- greatest() skips nulls: null only when the client changed nothing that still carries their name.
    greatest(case when s.updated_by = c.auth_user_id then s.updated_at end, sets.client_at, fb.client_at),
    (s.updated_by is distinct from c.auth_user_id or sets.staff or fb.staff)
  from public.training_sessions s
  join public.clients c on c.id = s.client_id
  join public.programs p on p.id = s.program_id
  join public.program_revisions r on r.id = s.revision_id
  left join public.program_revisions cur on cur.id = p.current_revision_id
  join public.workout_days d on d.id = s.day_id and d.revision_id = s.revision_id
  join public.program_weeks w on w.id = d.week_id and w.revision_id = d.revision_id
  cross join lateral (
    select count(*) as n, max(ls.updated_at) as at,
      max(ls.updated_at) filter (where ls.updated_by = c.auth_user_id) as client_at,
      coalesce(bool_or(ls.updated_by is distinct from c.auth_user_id), false) as staff
    from public.logged_sets ls where ls.session_id = s.id) sets
  cross join lateral (
    select count(*) as n, max(f.updated_at) as at,
      max(f.updated_at) filter (where f.updated_by = c.auth_user_id) as client_at,
      coalesce(bool_or(f.updated_by is distinct from c.auth_user_id), false) as staff
    from public.muscle_feedback f where f.session_id = s.id) fb
  where p_client_id is null or s.client_id = p_client_id;
$$;

create or replace function private.activity_item(a private.session_activity_row)
returns jsonb language sql immutable set search_path = ''
as $$
  select jsonb_build_object(
    'kind', 'session', 'id', a.id, 'programId', a.program_id, 'service', a.service,
    'programTitle', a.program_title, 'weekId', a.week_id, 'weekIndex', a.week_index,
    'dayId', a.day_id, 'dayIndex', a.day_index, 'dayLabel', a.day_label,
    'status', a.status, 'performedOn', a.performed_on, 'startedAt', a.started_at, 'completedAt', a.completed_at,
    'setCount', a.set_count, 'feedbackCount', a.feedback_count,
    'activityAt', a.activity_at, 'staffEdited', a.staff_edited);
$$;

-- Same contract as migration 00018, now reading the shared summary.
create or replace function public.get_client_activity(p_client_id uuid, p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 10)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'the cursor needs both a time and an id' using errcode = '22023';
  end if;

  return (
    select coalesce(jsonb_agg(private.activity_item(i::private.session_activity_row) order by i.activity_at desc, i.id desc), '[]'::jsonb)
    from (
      select * from private.session_activity(p_client_id) a
      where p_before_at is null or (a.activity_at, a.id) < (p_before_at, p_before_id)
      order by a.activity_at desc, a.id desc
      limit p_limit
    ) i
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Read state
-- ---------------------------------------------------------------------------
create table public.staff_activity_reads (
  staff_id uuid primary key references auth.users (id) on delete cascade,
  read_through timestamptz not null
);

create table public.staff_activity_seen (
  staff_id uuid not null references auth.users (id) on delete cascade,
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  seen_at timestamptz not null,
  primary key (staff_id, session_id)
);
create index staff_activity_seen_session on public.staff_activity_seen (session_id);

-- The caller's sessions with client activity, read or not. Staff only.
create or replace function private.staff_activity()
returns table (a private.session_activity_row, client_id uuid, client_name text, client_activity_at timestamptz, id uuid, unread boolean)
language sql stable set search_path = ''
as $$
  select sa::private.session_activity_row, sa.client_id, sa.client_name, sa.client_activity_at, sa.id,
    sa.client_activity_at > coalesce(greatest(r.read_through, seen.seen_at), '-infinity'::timestamptz)
  from private.session_activity(null) sa
  left join public.staff_activity_reads r on r.staff_id = (select auth.uid())
  left join public.staff_activity_seen seen on seen.staff_id = (select auth.uid()) and seen.session_id = sa.id
  where sa.client_activity_at is not null;
$$;

create or replace function public.get_staff_activity(p_before_at timestamptz default null, p_before_id uuid default null,
  p_limit integer default 25, p_unread_only boolean default false)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'limit must be between 1 and 100' using errcode = '22023';
  end if;
  if (p_before_at is null) <> (p_before_id is null) then
    raise exception 'the cursor needs both a time and an id' using errcode = '22023';
  end if;

  return (
    select coalesce(jsonb_agg(private.activity_item(i.a) || jsonb_build_object(
        -- Reviews show when the client acted, not a later coach correction.
        'activityAt', i.client_activity_at, 'clientId', i.client_id, 'clientName', i.client_name, 'unread', i.unread)
      order by i.client_activity_at desc, i.id desc), '[]'::jsonb)
    from (
      select * from private.staff_activity() x
      where (not coalesce(p_unread_only, false) or x.unread)
        and (p_before_at is null or (x.client_activity_at, x.id) < (p_before_at, p_before_id))
      order by x.client_activity_at desc, x.id desc
      limit p_limit
    ) i
  );
end;
$$;

create or replace function public.count_unread_activity()
returns integer language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return (select count(*)::integer from private.staff_activity() x where x.unread);
end;
$$;

-- p_session_id null = mark everything read now; otherwise mark one session seen.
create or replace function public.mark_activity_read(p_session_id uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  owner uuid;
begin
  if me is null or not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  if p_session_id is null then
    insert into public.staff_activity_reads (staff_id, read_through) values (me, now())
      on conflict (staff_id) do update set read_through = excluded.read_through;
    -- The watermark covers every earlier "seen" mark.
    delete from public.staff_activity_seen where staff_id = me and seen_at <= now();
    return;
  end if;
  select client_id into owner from public.training_sessions where id = p_session_id;
  if owner is null or not private.staff_can_access_client(owner) then
    raise exception 'session not found' using errcode = '42501';
  end if;
  insert into public.staff_activity_seen (staff_id, session_id, seen_at) values (me, p_session_id, now())
    on conflict (staff_id, session_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants and RLS
-- ---------------------------------------------------------------------------
revoke all on public.staff_activity_reads, public.staff_activity_seen from anon, authenticated;
grant select on public.staff_activity_reads, public.staff_activity_seen to authenticated;
alter table public.staff_activity_reads enable row level security;
alter table public.staff_activity_seen enable row level security;
create policy staff_activity_reads_select on public.staff_activity_reads for select to authenticated
  using (staff_id = (select auth.uid()));
create policy staff_activity_seen_select on public.staff_activity_seen for select to authenticated
  using (staff_id = (select auth.uid()));

revoke all on type private.session_activity_row from public;
grant usage on type private.session_activity_row to authenticated;
revoke all on function private.session_activity(uuid), private.activity_item(private.session_activity_row), private.staff_activity()
  from public, anon, authenticated;
grant execute on function private.session_activity(uuid), private.activity_item(private.session_activity_row), private.staff_activity() to authenticated;

revoke all on function public.get_staff_activity(timestamptz, uuid, integer, boolean), public.count_unread_activity(),
  public.mark_activity_read(uuid) from public, anon, authenticated;
grant execute on function public.get_staff_activity(timestamptz, uuid, integer, boolean), public.count_unread_activity(),
  public.mark_activity_read(uuid) to authenticated;
