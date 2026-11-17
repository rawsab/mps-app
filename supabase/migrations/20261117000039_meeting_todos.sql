-- The coach's actionable requests are independent of the calendar's visible date range and
-- Reviews' read state. RLS limits the meetings and requests to clients the caller can access.
create function public.list_pending_meeting_requests()
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'clientId', m.client_id, 'clientName', c.full_name, 'startsAt', m.starts_at,
      'services', m.services, 'request', private.meeting_request_document(r, m)
    ) order by m.starts_at, m.id), '[]'::jsonb)
    from public.meeting_requests r
    join public.meetings m on m.id = r.meeting_id and m.client_id = r.client_id
    join public.clients c on c.id = m.client_id
    where r.status = 'pending'
      and m.status = 'scheduled'
      -- A cancellation can still be answered after the meeting starts.
      and (r.kind = 'cancel' or m.starts_at > now())
  );
end;
$$;

revoke all on function public.list_pending_meeting_requests() from public, anon, authenticated;
grant execute on function public.list_pending_meeting_requests() to authenticated;
