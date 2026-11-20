-- Clients edit the message on a pending service request (decision 0044). A changed message
-- brings the request back as unread in Reviews, timed by the edit.

alter table public.service_requests add column message_updated_at timestamptz;

create or replace function public.update_service_request(p_request_id uuid, p_message text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me_client uuid := private.current_client_id();
  r public.service_requests;
begin
  if me_client is null then raise exception 'clients only' using errcode = '42501'; end if;
  perform 1 from public.clients where id = me_client for update;
  select * into r from public.service_requests where id = p_request_id and client_id = me_client for update;
  if r.id is null then raise exception 'request not found' using errcode = '42501'; end if;
  if private.service_request_status(r) <> 'pending' then
    raise exception 'your coach has already answered this request' using errcode = '55000';
  end if;
  if char_length(coalesce(p_message, '')) > 1000 then
    raise exception 'keep the message under 1000 characters' using errcode = '22023';
  end if;
  -- Saving the same text again is not an edit, so it doesn't bring the request back as unread.
  if btrim(coalesce(p_message, '')) <> r.message then
    update public.service_requests set message = btrim(coalesce(p_message, '')), message_updated_at = clock_timestamp()
    where id = r.id returning * into r;
  end if;
  return private.service_request_document(r);
end;
$$;

-- Same as migration 00041, timed by the latest edit.
create or replace function private.service_request_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'service_request', 'id', r.id, 'service', r.service, 'message', r.message,
      'status', d.status, 'response', r.response, 'activityAt', t.at, 'edited', r.message_updated_at is not null, 'staffEdited', false),
    r.client_id, c.full_name, r.id, t.at,
    d.status = 'pending'
      and t.at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.service_requests r
  join public.clients c on c.id = r.client_id
  cross join lateral (select private.service_request_status(r) as status) d
  cross join lateral (select coalesce(r.message_updated_at, r.created_at) as at) t
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_service_request_seen seen on seen.staff_id = (select auth.uid()) and seen.request_id = r.id;
$$;

revoke all on function public.update_service_request(uuid, text) from public, anon, authenticated;
grant execute on function public.update_service_request(uuid, text) to authenticated;
