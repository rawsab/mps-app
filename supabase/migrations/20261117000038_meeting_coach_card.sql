-- Client Home shows who a meeting is with (decision 0042): the coach's name and profile picture.
-- Staff profiles stay unreadable to clients (decision 0027); only these two values reach them.

-- The current client's primary coach, or the coach of one of their meetings.
create or replace function private.is_my_coach(p_staff_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
    where c.id = private.current_client_id()
      and (c.primary_coach_id = p_staff_id or exists (select 1 from public.meetings m where m.client_id = c.id and m.coach_id = p_staff_id))
  );
$$;

-- Storage policies run as the caller, who can't read staff profiles, so the lookup is definer.
create or replace function private.is_my_coach_photo(p_name text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles p where p.avatar_path = p_name and private.is_my_coach(p.auth_user_id));
$$;

-- Name and picture path for a meeting's coach. Callers only reach it through meeting_document,
-- which RLS on meetings already limits to the client and staff with access.
create or replace function private.meeting_coach_card(p_coach_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('coachName', nullif(btrim(p.display_name), ''), 'coachAvatarPath', p.avatar_path)
  from public.profiles p where p.auth_user_id = p_coach_id;
$$;

-- Same as migration 00035 plus coachName and coachAvatarPath.
create or replace function private.meeting_document(a public.meetings)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'clientId', a.client_id, 'clientName', c.full_name, 'coachId', a.coach_id,
    'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'timezone', a.timezone,
    'status', a.status, 'modified', a.modified, 'services', to_jsonb(a.services), 'billable', a.billable,
    'programs', private.meeting_programs_json(a),
    'scheduleId', a.schedule_id, 'occurrenceOn', a.occurrence_on, 'cycleWeeks', s.cycle_weeks,
    'cancelledAt', a.cancelled_at, 'cancellationReason', a.cancellation_reason,
    'cancelledByClient', a.cancelled_by is not null and a.cancelled_by = c.auth_user_id,
    'meetingUrl', private.meeting_url_for(a.id),
    -- RLS: staff only; clients get null.
    'notes', (select n.body from public.meeting_notes n where n.meeting_id = a.id),
    'patternNotes', (select n.body from public.meeting_schedule_notes n where n.schedule_id = a.schedule_id),
    'request', (select private.meeting_request_document(r, a) from public.meeting_requests r
      where r.meeting_id = a.id order by r.created_at desc, r.id limit 1))
    || coalesce(private.meeting_coach_card(a.coach_id), jsonb_build_object('coachName', null, 'coachAvatarPath', null))
  from public.clients c
  left join public.meeting_schedules s on s.id = a.schedule_id
  where c.id = a.client_id;
$$;

-- Clients may also read their coach's current picture.
drop policy profile_photos_select on storage.objects;
create policy profile_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'profile-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      join public.clients c on c.auth_user_id = p.auth_user_id
      where p.avatar_path = storage.objects.name
        and private.staff_can_access_client(c.id)
    )
    or private.is_my_coach_photo(storage.objects.name)
  )
);

revoke all on function private.is_my_coach(uuid), private.is_my_coach_photo(text), private.meeting_coach_card(uuid) from public, anon, authenticated;
grant execute on function private.is_my_coach(uuid), private.is_my_coach_photo(text), private.meeting_coach_card(uuid) to authenticated;
