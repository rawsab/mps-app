-- Answered requests are no longer unread (decision 0043). Meeting requests count as unread only
-- while pending, or after the client withdraws one (decision 0037); service requests only while
-- pending. Answered requests stay in Reviews' full history with their status.

-- Same as migration 00033 plus the status check on `unread`.
create or replace function private.request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'request', 'id', r.id, 'services', to_jsonb(a.services),
      'requestKind', r.kind, 'status', d.status,
      'message', r.message, 'preferredStartsAt', r.preferred_starts_at, 'late', r.late, 'response', r.response,
      'meetingId', a.id, 'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes,
      'activityAt', t.at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, t.at,
    d.status in ('pending', 'withdrawn')
      and t.at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.meeting_requests r
  join public.meetings a on a.id = r.meeting_id
  join public.clients c on c.id = r.client_id
  -- 'expired' is derived: a pending reschedule whose meeting has started.
  cross join lateral (select private.meeting_request_document(r, a)->>'status' as status) d
  cross join lateral (select case when r.status = 'withdrawn' then r.resolved_at else r.created_at end as at) t
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;

-- Same as migration 00037 plus the status check on `unread`.
create or replace function private.service_request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'service_request', 'id', r.id, 'service', r.service, 'message', r.message,
      'status', d.status, 'activityAt', r.created_at, 'staffEdited', false),
    r.client_id, c.full_name, r.id, r.created_at,
    d.status = 'pending'
      and r.created_at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.service_requests r
  join public.clients c on c.id = r.client_id
  cross join lateral (select private.service_request_status(r) as status) d
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_service_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;
-- Replaced functions keep their grants.
