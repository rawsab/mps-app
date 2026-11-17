-- Client activity feed for staff (FR-07, FR-08, NFR-01; decision 0023): the client page's Recent
-- Updates card and its full-history page.
--
-- Read-only and derived from existing records: one item per training session, timed by the latest
-- change to the session, its logged sets or its muscle feedback. Rows keep only their latest
-- state, so this shows what happened and who touched it last, not earlier values. Edit history
-- arrives with audit_events, which this function will union in.
--
-- Security invoker: RLS on every table read here still applies. The explicit staff check keeps
-- the feed staff-only; a client gets 42501 rather than their own activity.

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
    with items as (
      select s.id, s.program_id, p.service, s.status, s.performed_on, s.started_at, s.completed_at,
        coalesce(nullif(btrim(cur.title), ''), r.title) as program_title,
        w.id as week_id, w.week_index, d.id as day_id, d.label as day_label,
        (select count(*) from public.workout_days o where o.revision_id = d.revision_id and o.week_id = d.week_id and o.position < d.position) as day_index,
        sets.n as set_count, fb.n as feedback_count,
        greatest(s.updated_at, sets.at, fb.at) as activity_at,
        (s.updated_by is distinct from c.auth_user_id or sets.staff or fb.staff) as staff_edited
      from public.training_sessions s
      join public.clients c on c.id = s.client_id
      join public.programs p on p.id = s.program_id
      join public.program_revisions r on r.id = s.revision_id
      left join public.program_revisions cur on cur.id = p.current_revision_id
      join public.workout_days d on d.id = s.day_id and d.revision_id = s.revision_id
      join public.program_weeks w on w.id = d.week_id and w.revision_id = d.revision_id
      cross join lateral (
        select count(*) as n, max(ls.updated_at) as at, coalesce(bool_or(ls.updated_by is distinct from c.auth_user_id), false) as staff
        from public.logged_sets ls where ls.session_id = s.id) sets
      cross join lateral (
        select count(*) as n, max(f.updated_at) as at, coalesce(bool_or(f.updated_by is distinct from c.auth_user_id), false) as staff
        from public.muscle_feedback f where f.session_id = s.id) fb
      where s.client_id = p_client_id
    )
    select coalesce(jsonb_agg(jsonb_build_object(
        'kind', 'session', 'id', i.id, 'programId', i.program_id, 'service', i.service,
        'programTitle', i.program_title, 'weekId', i.week_id, 'weekIndex', i.week_index - 1,
        'dayId', i.day_id, 'dayIndex', i.day_index, 'dayLabel', i.day_label,
        'status', i.status, 'performedOn', i.performed_on, 'startedAt', i.started_at, 'completedAt', i.completed_at,
        'setCount', i.set_count, 'feedbackCount', i.feedback_count,
        'activityAt', i.activity_at, 'staffEdited', i.staff_edited)
      order by i.activity_at desc, i.id desc), '[]'::jsonb)
    from (
      select * from items
      where p_before_at is null or (activity_at, id) < (p_before_at, p_before_id)
      order by activity_at desc, id desc
      limit p_limit
    ) i
  );
end;
$$;

revoke all on function public.get_client_activity(uuid, timestamptz, uuid, integer) from public, anon, authenticated;
grant execute on function public.get_client_activity(uuid, timestamptz, uuid, integer) to authenticated;
