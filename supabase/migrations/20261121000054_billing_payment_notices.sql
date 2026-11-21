-- Billing (decision 0055): a client's "I've sent it" (the whole balance) or "I've paid this" (chosen
-- charges). A notice never changes the balance. Staff confirm it by recording the payment
-- (record_reported_payment) or dismiss it. It settles by itself once what it covers is paid.
create table public.billing_payment_notices (
  -- Chosen by the browser, so a retried report is recorded once.
  id uuid primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  sent_on date not null,
  message text not null default '' check (char_length(message) <= 1000),
  -- Empty: the whole balance. Otherwise the charges the client says this paid, applied to first.
  charge_ids uuid[] not null default '{}',
  -- settled: what it covers was paid some other way (e.g. the coach marked the month paid).
  status text not null default 'pending' check (status in ('pending', 'confirmed', 'dismissed', 'settled')),
  payment_id uuid references public.billing_payments (id) on delete set null,
  -- Staff-only (no column grant to browsers), like void reasons.
  dismiss_reason text not null default '' check (char_length(dismiss_reason) <= 1000),
  -- The client's latest report or update: what Activity is timed by.
  reported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_by uuid references auth.users (id) on delete set null,
  resolved_at timestamptz,
  check ((status = 'pending') = (resolved_at is null))
);
create index billing_payment_notices_client on public.billing_payment_notices (client_id) where status = 'pending';

-- Which notices each staff member has opened in Activity, like staff_service_request_seen.
create table public.staff_payment_notice_seen (
  staff_id uuid not null references auth.users (id) on delete cascade,
  notice_id uuid not null references public.billing_payment_notices (id) on delete cascade,
  seen_at timestamptz not null,
  primary key (staff_id, notice_id)
);
create index staff_payment_notice_seen_notice on public.staff_payment_notice_seen (notice_id);

alter table public.billing_payment_notices enable row level security;
alter table public.staff_payment_notice_seen enable row level security;
create policy billing_payment_notices_select on public.billing_payment_notices for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy staff_payment_notice_seen_select on public.staff_payment_notice_seen for select to authenticated
  using (staff_id = (select auth.uid()));
revoke all on public.billing_payment_notices, public.staff_payment_notice_seen from anon, authenticated;
grant select (id, client_id, amount_cents, sent_on, message, charge_ids, status, payment_id, reported_at, created_at, updated_at, resolved_at)
  on public.billing_payment_notices to authenticated;
grant select on public.staff_payment_notice_seen to authenticated;

create or replace function private.payment_notice_json(n public.billing_payment_notices)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object('id', n.id, 'amountCents', n.amount_cents, 'sentOn', n.sent_on, 'message', n.message,
    'chargeIds', to_jsonb(n.charge_ids),
    'chargeLabels', coalesce((select jsonb_agg(c.label order by c.period, c.occurred_on) from public.billing_charges c where c.id = any (n.charge_ids)), '[]'),
    'status', n.status, 'reportedAt', n.reported_at, 'createdAt', n.created_at, 'updatedAt', n.updated_at);
$$;

-- Settles pending notices whose charges are all paid (or void), and every pending notice once
-- nothing is owed. Runs after anything that applies money (apply_credit, below).
create or replace function private.settle_payment_notices(p_client_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  owed integer := (private.billing_summary(p_client_id)->>'balanceCents')::integer;
begin
  update public.billing_payment_notices n
  set status = 'settled', resolved_by = (select auth.uid()), resolved_at = now(), updated_at = now()
  where n.client_id = p_client_id and n.status = 'pending'
    and (owed <= 0 or (cardinality(n.charge_ids) > 0 and not exists (
      select 1 from public.billing_charges c
      where c.id = any (n.charge_ids) and c.voided_at is null and c.amount_cents > private.charge_allocated(c.id))));
end;
$$;

-- Same as migration 00051, then settles notices.
create or replace function private.apply_credit(p_client_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  c record;
  left_over integer;
  take integer;
begin
  for p in
    select bp.id, bp.amount_cents - private.payment_allocated(bp.id) as remaining
    from public.billing_payments bp
    where bp.client_id = p_client_id and bp.voided_at is null
    order by bp.received_on, bp.recorded_at, bp.id
  loop
    left_over := p.remaining;
    continue when left_over <= 0;
    for c in
      select ch.id, ch.amount_cents - private.charge_allocated(ch.id) as remaining
      from public.billing_charges ch
      where ch.client_id = p_client_id and ch.voided_at is null and ch.amount_cents > private.charge_allocated(ch.id)
      order by ch.period, ch.occurred_on, ch.created_at, ch.id
    loop
      exit when left_over <= 0;
      take := least(left_over, c.remaining);
      perform private.allocate(p.id, c.id, p_client_id, take);
      left_over := left_over - take;
    end loop;
  end loop;
  perform private.settle_payment_notices(p_client_id);
end;
$$;

-- Same as migration 00051, plus the client's pending notices, oldest first.
create or replace function public.billing_payment_details()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  me uuid := private.current_client_id();
begin
  if me is null then
    raise exception 'clients only' using errcode = '42501';
  end if;
  return (select jsonb_build_object('etransferEmail', p.etransfer_email, 'coachName', nullif(btrim(p.display_name), ''),
      'balanceCents', (private.billing_summary(me)->>'balanceCents')::integer,
      'pendingNotices', coalesce((select jsonb_agg(private.payment_notice_json(n) order by n.reported_at, n.id)
        from public.billing_payment_notices n where n.client_id = me and n.status = 'pending'), '[]'))
    from public.clients c left join public.profiles p on p.auth_user_id = c.primary_coach_id
    where c.id = me);
end;
$$;

-- The client says they sent a payment, for the whole balance (no charges) or for chosen charges.
-- Reporting again for the same charges (or the whole balance again) updates that pending notice.
create or replace function public.report_payment_sent(p_id uuid, p_amount_cents integer, p_sent_on date, p_message text,
  p_charge_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := private.current_client_id();
  ids uuid[] := array(select distinct unnest(coalesce(p_charge_ids, '{}')) order by 1);
  n public.billing_payment_notices;
begin
  if me is null then
    raise exception 'clients only' using errcode = '42501';
  end if;
  if p_id is null then
    raise exception 'a notice needs an id' using errcode = '22023';
  end if;
  perform private.lock_billing(me);
  select * into n from public.billing_payment_notices where id = p_id;
  if found then
    if n.client_id <> me then
      raise exception 'that notice id is taken' using errcode = '23505';
    end if;
    return public.billing_payment_details();
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 100000000 then
    raise exception 'a payment is more than $0' using errcode = '22023';
  end if;
  if p_sent_on is null or p_sent_on > private.billing_today() + 1 then
    raise exception 'a payment can''t be sent in the future' using errcode = '22023';
  end if;
  if char_length(coalesce(p_message, '')) > 1000 then
    raise exception 'keep the message under 1000 characters' using errcode = '22023';
  end if;
  if (select count(*) from public.billing_charges c where c.id = any (ids) and c.client_id = me and c.voided_at is null) <> cardinality(ids) then
    raise exception 'charge not found' using errcode = '22023';
  end if;

  update public.billing_payment_notices
  set amount_cents = p_amount_cents, sent_on = p_sent_on, message = btrim(coalesce(p_message, '')), reported_at = clock_timestamp(), updated_at = now()
  where client_id = me and status = 'pending' and charge_ids = ids
  returning * into n;
  if not found then
    insert into public.billing_payment_notices (id, client_id, amount_cents, sent_on, message, charge_ids, reported_at)
    values (p_id, me, p_amount_cents, p_sent_on, btrim(coalesce(p_message, '')), ids, clock_timestamp())
    returning * into n;
  end if;
  perform private.billing_event(me, 'payment_reported', null, null,
    jsonb_build_object('noticeId', n.id, 'amountCents', p_amount_cents, 'sentOn', p_sent_on, 'chargeIds', to_jsonb(ids)));
  return public.billing_payment_details();
end;
$$;

-- Pending notices across the clients the caller can access, oldest first (the Billing page to-do).
create or replace function public.list_payment_notices()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(private.payment_notice_json(n) || jsonb_build_object('clientId', n.client_id, 'clientName', c.full_name)
      order by n.reported_at, n.id), '[]'::jsonb)
    from public.billing_payment_notices n join public.clients c on c.id = n.client_id
    where n.status = 'pending' and private.staff_can_access_client(n.client_id));
end;
$$;

create or replace function private.staff_notice(p_notice_id uuid)
returns public.billing_payment_notices language plpgsql security definer set search_path = ''
as $$
declare
  n public.billing_payment_notices;
begin
  select * into n from public.billing_payment_notices where id = p_notice_id;
  if not found or not private.staff_can_access_client(n.client_id) then
    raise exception 'notice not found' using errcode = '42501';
  end if;
  return n;
end;
$$;

-- Records the payment a client reported, applied to the charges they named first, and confirms the
-- notice in one step. Retrying with the same payment id is a no-op.
create or replace function public.record_reported_payment(p_notice_id uuid, p_payment_id uuid, p_amount_cents integer,
  p_received_on date, p_method text, p_note text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  n public.billing_payment_notices := private.staff_notice(p_notice_id);
begin
  perform private.lock_billing(n.client_id);
  select * into n from public.billing_payment_notices where id = p_notice_id;
  if n.status = 'confirmed' and n.payment_id = p_payment_id then
    return public.get_client_billing(n.client_id);
  end if;
  if n.status <> 'pending' then
    raise exception 'that notice was already handled' using errcode = '55000';
  end if;
  perform private.insert_payment(p_payment_id, n.client_id, p_amount_cents, p_received_on, p_method, p_note,
    array(select c.id from public.billing_charges c where c.id = any (n.charge_ids) and c.voided_at is null order by c.period, c.occurred_on));
  -- insert_payment may already have settled it; this one is confirmed either way.
  update public.billing_payment_notices
  set status = 'confirmed', payment_id = p_payment_id, resolved_by = (select auth.uid()), resolved_at = now(), updated_at = now()
  where id = n.id;
  perform private.billing_event(n.client_id, 'payment_notice_confirmed', null, p_payment_id, jsonb_build_object('noticeId', n.id));
  return public.get_client_billing(n.client_id);
end;
$$;

create or replace function public.dismiss_payment_notice(p_notice_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  n public.billing_payment_notices := private.staff_notice(p_notice_id);
  reason text := private.required_reason(p_reason);
begin
  perform private.lock_billing(n.client_id);
  select * into n from public.billing_payment_notices where id = p_notice_id;
  if n.status <> 'pending' then
    raise exception 'that notice was already handled' using errcode = '55000';
  end if;
  update public.billing_payment_notices
  set status = 'dismissed', dismiss_reason = reason, resolved_by = (select auth.uid()), resolved_at = now(), updated_at = now()
  where id = n.id;
  perform private.billing_event(n.client_id, 'payment_notice_dismissed', null, null, jsonb_build_object('noticeId', n.id, 'reason', reason));
  return public.list_payment_notices();
end;
$$;

revoke all on function private.payment_notice_json(public.billing_payment_notices), private.staff_notice(uuid),
  private.settle_payment_notices(uuid)
  from public, anon, authenticated;
revoke all on function public.report_payment_sent(uuid, integer, date, text, uuid[]), public.list_payment_notices(),
  public.record_reported_payment(uuid, uuid, integer, date, text, text), public.dismiss_payment_notice(uuid, text)
  from public, anon;
grant execute on function public.report_payment_sent(uuid, integer, date, text, uuid[]), public.list_payment_notices(),
  public.record_reported_payment(uuid, uuid, integer, date, text, text), public.dismiss_payment_notice(uuid, text)
  to authenticated;
