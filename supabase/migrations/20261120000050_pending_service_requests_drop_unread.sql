-- Pending service requests no longer say whether the caller has opened them: nothing displays it,
-- and Activity keeps its own read state (decision 0044 follow-up). Same as migration 00043 without
-- `unread`, newest first. Security invoker: RLS limits rows to accessible clients. The signature is
-- unchanged, so existing grants carry over.
create or replace function public.list_pending_service_requests(p_client_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(private.service_request_document(r)
      || jsonb_build_object('clientId', r.client_id, 'clientName', c.full_name)
      order by r.created_at desc, r.id desc), '[]'::jsonb)
    from public.service_requests r
    join public.clients c on c.id = r.client_id
    where (p_client_id is null or r.client_id = p_client_id)
      and private.service_request_status(r) = 'pending');
end;
$$;
