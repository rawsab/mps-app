-- Payment notices in Activity and Clients > To review (decision 0055). Timed by the client's latest
-- report; unread while pending and not opened since. Every status stays in the full history.

-- Security invoker: RLS decides which notices (and charge labels) the caller sees.
create or replace function private.payment_notice_activity()
returns table (item jsonb, client_id uuid, client_name text, id uuid, activity_at timestamptz, unread boolean)
language sql stable set search_path = ''
as $$
  select jsonb_build_object('kind', 'payment_notice', 'id', n.id, 'amountCents', n.amount_cents, 'sentOn', n.sent_on, 'message', n.message,
      'chargeLabels', coalesce((select jsonb_agg(ch.label order by ch.period, ch.occurred_on) from public.billing_charges ch where ch.id = any (n.charge_ids)), '[]'),
      'status', n.status, 'activityAt', n.reported_at, 'staffEdited', false),
    n.client_id, c.full_name, n.id, n.reported_at,
    n.status = 'pending' and n.reported_at > coalesce(greatest(reads.read_through, seen.seen_at), '-infinity'::timestamptz)
  from public.billing_payment_notices n
  join public.clients c on c.id = n.client_id
  left join public.staff_activity_reads reads on reads.staff_id = (select auth.uid())
  left join public.staff_payment_notice_seen seen on seen.staff_id = (select auth.uid()) and seen.notice_id = n.id;
$$;

-- Same as migration 00037 plus payment notices.
create or replace function private.all_staff_activity()
returns table (item jsonb, id uuid, activity_at timestamptz, unread boolean, kind text)
language sql stable set search_path = ''
as $$
  select private.activity_item(s.a) || jsonb_build_object('activityAt', s.client_activity_at, 'clientId', s.client_id, 'clientName', s.client_name, 'unread', s.unread),
    s.id, s.client_activity_at, s.unread, private.activity_kind(s.a) from private.staff_activity() s
  union all
  select n.item || jsonb_build_object('clientId', n.client_id, 'clientName', n.client_name, 'unread', n.unread), n.id, n.activity_at, n.unread, 'nutrition'
    from private.nutrition_activity(null) n
  union all
  select q.item || jsonb_build_object('clientId', q.client_id, 'clientName', q.client_name, 'unread', q.unread), q.id, q.activity_at, q.unread, 'request'
    from private.request_activity() q
  union all
  select q.item || jsonb_build_object('clientId', q.client_id, 'clientName', q.client_name, 'unread', q.unread), q.id, q.activity_at, q.unread, 'service_request'
    from private.service_request_activity() q
  union all
  select q.item || jsonb_build_object('clientId', q.client_id, 'clientName', q.client_name, 'unread', q.unread), q.id, q.activity_at, q.unread, 'payment_notice'
    from private.payment_notice_activity() q;
$$;

-- Same as migration 00037; Focused also lists payment notices.
create or replace function public.get_staff_activity(p_before_at timestamptz default null, p_before_id uuid default null, p_limit integer default 25,
  p_unread_only boolean default false, p_focused boolean default false)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode = '22023'; end if;
  if (p_before_at is null) <> (p_before_id is null) then raise exception 'the cursor needs both a time and an id' using errcode = '22023'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.activity_at desc, x.id desc), '[]'::jsonb) from (
    select * from private.all_staff_activity() a
    where (not coalesce(p_unread_only, false) or a.unread)
      and (not coalesce(p_focused, false) or a.kind in ('request', 'service_request', 'payment_notice'))
      and (p_before_at is null or (a.activity_at, a.id) < (p_before_at, p_before_id))
    order by a.activity_at desc, a.id desc limit p_limit
  ) x);
end;
$$;

create or replace function public.mark_payment_notice_read(p_notice_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select client_id into owner from public.billing_payment_notices where id = p_notice_id;
  if owner is null or not private.staff_can_access_client(owner) then
    raise exception 'notice not found' using errcode = '42501';
  end if;
  insert into public.staff_payment_notice_seen values ((select auth.uid()), p_notice_id, clock_timestamp())
  on conflict (staff_id, notice_id) do update set seen_at = excluded.seen_at;
end;
$$;

-- Same as migration 00037; "mark all" also covers payment notices.
create or replace function public.mark_activity_read(p_session_id uuid default null)
returns void language plpgsql security definer set search_path = ''
as $$
declare me uuid := auth.uid(); owner uuid; at timestamptz := clock_timestamp();
begin
  if me is null or not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_session_id is null then
    insert into public.staff_activity_reads values (me, at) on conflict (staff_id) do update set read_through = excluded.read_through;
    delete from public.staff_activity_seen where staff_id = me and seen_at <= at;
    delete from public.staff_nutrition_activity_seen where staff_id = me and seen_at <= at;
    delete from public.staff_request_seen where staff_id = me and seen_at <= at;
    delete from public.staff_service_request_seen where staff_id = me and seen_at <= at;
    delete from public.staff_payment_notice_seen where staff_id = me and seen_at <= at;
    return;
  end if;
  select client_id into owner from public.training_sessions where id = p_session_id;
  if owner is null or not private.staff_can_access_client(owner) then raise exception 'session not found' using errcode = '42501'; end if;
  insert into public.staff_activity_seen values (me, p_session_id, at) on conflict (staff_id, session_id) do update set seen_at = excluded.seen_at;
end;
$$;

revoke all on function private.payment_notice_activity() from public, anon, authenticated;
grant execute on function private.payment_notice_activity() to authenticated;
revoke all on function public.mark_payment_notice_read(uuid) from public, anon, authenticated;
grant execute on function public.mark_payment_notice_read(uuid) to authenticated;
