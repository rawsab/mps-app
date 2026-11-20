-- Pending service requests, newest first, saying whether the caller has opened them (decision
-- 0044). Read state is Reviews' own: opening a request anywhere marks it seen, and an edited note
-- makes it new again (migration 00042).

-- Same as migration 00041 plus `unread`, newest first. Security invoker: RLS limits rows to accessible clients.
create or replace function public.list_pending_service_requests(p_client_id uuid default null)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return (select coalesce(jsonb_agg(private.service_request_document(r)
      || jsonb_build_object('clientId', r.client_id, 'clientName', c.full_name, 'unread', a.unread)
      order by r.created_at desc, r.id desc), '[]'::jsonb)
    from public.service_requests r
    join public.clients c on c.id = r.client_id
    join private.service_request_activity() a on a.id = r.id
    where (p_client_id is null or r.client_id = p_client_id)
      and private.service_request_status(r) = 'pending');
end;
$$;
