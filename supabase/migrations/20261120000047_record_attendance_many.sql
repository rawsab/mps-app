-- "Mark all completed" on the Meetings page's Record attendance section (decision 0048). All or
-- nothing: every meeting must be one the caller can access, started, still unrecorded and without a
-- pending client request, or none is recorded. Each one is audited like record_attendance.
create or replace function public.record_attendance_many(p_meeting_ids uuid[], p_status text default 'completed')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  meeting_id uuid;
  a public.meetings;
  recorded integer := 0;
begin
  if p_status is null or p_status not in ('completed', 'no_show') then
    raise exception 'attendance is completed or no_show' using errcode = '22023';
  end if;
  if p_meeting_ids is null or cardinality(p_meeting_ids) not between 1 and 200 then
    raise exception 'choose 1 to 200 meetings' using errcode = '22023';
  end if;
  -- Sorted, so two callers lock overlapping meetings in the same order.
  for meeting_id in select distinct id from unnest(p_meeting_ids) id order by id loop
    a := private.staff_meeting(meeting_id);
    if a.status <> 'scheduled' then
      raise exception 'attendance is already recorded, or the meeting was cancelled' using errcode = '55000';
    end if;
    if a.starts_at > now() then
      raise exception 'attendance can be recorded once the meeting has started' using errcode = '55000';
    end if;
    perform private.require_no_pending_request(a.id);
    perform private.write_attendance(a, p_status::public.meeting_status, '');
    recorded := recorded + 1;
  end loop;
  return jsonb_build_object('recorded', recorded);
end;
$$;

revoke all on function public.record_attendance_many(uuid[], text) from public, anon, authenticated;
grant execute on function public.record_attendance_many(uuid[], text) to authenticated;
