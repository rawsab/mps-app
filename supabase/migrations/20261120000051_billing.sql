-- Billing (decision 0053). A scope addition: PRD §3 excludes billing; the PRD is unchanged.
--
-- - Money is integer cents, CAD, before tax. No tax is charged or shown yet.
-- - Charges are what's owed. Each has lines (the itemization), snapshotted when created, so rate changes
--   never rewrite history. Nothing is deleted: charges and payments are voided with a reason.
-- - PT sessions are charged when attendance is recorded (completed, no-show, late cancellation), by a
--   trigger on meetings.status. Price: the meeting's own, else the client's rate for the session type
--   (format + length), else the default. Setting a meeting's price also sets the client's rate, so the
--   last price used becomes the next default.
-- - Mesocycle and Nutrition are charged in advance, once per month in which they are active, from the
--   month the service starts (never earlier: only the current month is ever charged). One programming
--   charge per client per month holds a line per service, plus a bundle discount line when both exist.
-- - Payments are allocated to the chosen charges, then oldest first; the rest is credit, applied to new
--   charges as they arrive. Credits (goodwill) are payments with method 'credit'.
-- - Any staff member with access to the client can do everything except default rates and settings,
--   which are admin-only. Clients read their own billing and write nothing.

-- ---------------------------------------------------------------------------
-- Types and columns
-- ---------------------------------------------------------------------------
create type public.session_format as enum ('solo', 'partner');
create type public.billing_charge_kind as enum ('session', 'programming', 'adjustment');
create type public.billing_line_kind as enum ('session', 'service', 'bundle_discount', 'adjustment');
create type public.payment_method as enum ('e_transfer', 'cash', 'other', 'credit');

alter table public.profiles add column etransfer_email text
  check (etransfer_email is null or (char_length(etransfer_email) <= 254 and etransfer_email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$'));

-- The partner is only a label: the whole partner price goes to the meeting's client.
alter table public.meeting_schedules add column format public.session_format not null default 'solo';
alter table public.meetings add column format public.session_format not null default 'solo';
-- Null: use the client's rate or the default. Zero is a real price (complimentary).
alter table public.meetings add column price_cents integer check (price_cents is null or price_cents between 0 and 10000000);

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.billing_settings (
  id boolean primary key default true check (id),
  -- Months and "today" for monthly charges and balances.
  timezone text not null default 'America/Toronto' check (char_length(timezone) between 1 and 64),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.billing_settings default values;

create table public.billing_rates (
  key text primary key check (key in ('pt_solo_60', 'pt_solo_40', 'pt_partner_60', 'pt_partner_40',
    'mesocycle_month', 'nutrition_month', 'bundle_discount_month')),
  amount_cents integer not null check (amount_cents between 0 and 10000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.billing_rates (key, amount_cents) values
  ('pt_solo_60', 10000), ('pt_solo_40', 7000), ('pt_partner_60', 12000), ('pt_partner_40', 8500),
  ('mesocycle_month', 20000), ('nutrition_month', 20000), ('bundle_discount_month', 10000);

create table public.client_service_rates (
  client_id uuid not null references public.clients (id) on delete cascade,
  key text not null check (key in ('mesocycle_month', 'nutrition_month', 'bundle_discount_month')),
  amount_cents integer not null check (amount_cents between 0 and 10000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, key)
);

-- The client's PT price per session type ('solo_60', 'partner_40', …): the last price used.
create table public.client_session_rates (
  client_id uuid not null references public.clients (id) on delete cascade,
  session_type text not null check (session_type ~ '^(solo|partner)_[0-9]{1,3}$'),
  amount_cents integer not null check (amount_cents between 0 and 10000000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (client_id, session_type)
);

create table public.billing_charges (
  -- Chosen by the browser for adjustments, so a retried add returns the same charge.
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.billing_charge_kind not null,
  -- The first of the month the charge belongs to.
  period date not null check (extract(day from period) = 1),
  occurred_on date not null,
  label text not null check (char_length(label) between 1 and 200),
  meeting_id uuid references public.meetings (id) on delete set null,
  -- Sum of the lines, kept by private.refresh_charge.
  amount_cents integer not null default 0 check (amount_cents between 0 and 100000000),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text not null default '' check (char_length(void_reason) <= 1000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, client_id),
  check (kind = 'session' or meeting_id is null)
);
create unique index billing_charges_open_meeting on public.billing_charges (meeting_id) where voided_at is null;
create index billing_charges_client on public.billing_charges (client_id, period, occurred_on);
create index billing_charges_meeting on public.billing_charges (meeting_id);

create table public.billing_charge_lines (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null,
  client_id uuid not null,
  -- Copied from the charge so a service and a bundle are charged once per month, even after a void.
  period date not null,
  position smallint not null default 0,
  kind public.billing_line_kind not null,
  service public.service_kind,
  enrollment_id uuid references public.service_enrollments (id) on delete set null,
  label text not null check (char_length(label) between 1 and 200),
  amount_cents integer not null check (amount_cents between -10000000 and 10000000),
  foreign key (charge_id, client_id) references public.billing_charges (id, client_id) on delete cascade,
  check ((kind = 'bundle_discount' and amount_cents <= 0) or (kind <> 'bundle_discount' and amount_cents >= 0))
);
create index billing_charge_lines_charge on public.billing_charge_lines (charge_id, position);
create unique index billing_charge_lines_service_month on public.billing_charge_lines (enrollment_id, period) where kind = 'service';
create unique index billing_charge_lines_bundle_month on public.billing_charge_lines (client_id, period) where kind = 'bundle_discount';

create table public.billing_payments (
  -- Chosen by the browser, so a retried payment is recorded once.
  id uuid primary key,
  client_id uuid not null references public.clients (id) on delete cascade,
  amount_cents integer not null check (amount_cents between 1 and 100000000),
  received_on date not null,
  method public.payment_method not null,
  -- Staff-only, like void_reason (no column grant to browsers).
  note text not null default '' check (char_length(note) <= 1000),
  recorded_by uuid references auth.users (id) on delete set null,
  recorded_at timestamptz not null default now(),
  voided_at timestamptz,
  voided_by uuid references auth.users (id) on delete set null,
  void_reason text not null default '' check (char_length(void_reason) <= 1000),
  unique (id, client_id)
);
create index billing_payments_client on public.billing_payments (client_id, received_on);

create table public.billing_allocations (
  payment_id uuid not null,
  charge_id uuid not null,
  client_id uuid not null,
  amount_cents integer not null check (amount_cents > 0),
  primary key (payment_id, charge_id),
  foreign key (payment_id, client_id) references public.billing_payments (id, client_id) on delete cascade,
  foreign key (charge_id, client_id) references public.billing_charges (id, client_id) on delete cascade
);
create index billing_allocations_charge on public.billing_allocations (charge_id);

create table public.billing_events (
  id uuid primary key default gen_random_uuid(),
  seq bigint generated always as identity,
  client_id uuid not null references public.clients (id) on delete cascade,
  action text not null,
  charge_id uuid,
  payment_id uuid,
  details jsonb not null default '{}',
  -- Null for automatic changes (monthly charges, attendance triggers run by the job).
  actor uuid references auth.users (id) on delete set null,
  at timestamptz not null default now()
);
create index billing_events_client on public.billing_events (client_id, seq);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function private.billing_timezone()
returns text language sql stable security definer set search_path = ''
as $$ select timezone from public.billing_settings $$;

create or replace function private.billing_today()
returns date language sql stable set search_path = ''
as $$ select (now() at time zone private.billing_timezone())::date $$;

create or replace function private.billing_month()
returns date language sql stable set search_path = ''
as $$ select date_trunc('month', private.billing_today())::date $$;

-- Serializes allocation and charge creation per client.
create or replace function private.lock_billing(p_client_id uuid)
returns void language sql set search_path = ''
as $$ select pg_advisory_xact_lock(hashtextextended('billing:' || p_client_id::text, 0)) $$;

create or replace function private.charge_allocated(p_charge_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select coalesce(sum(amount_cents), 0)::integer from public.billing_allocations where charge_id = p_charge_id $$;

create or replace function private.payment_allocated(p_payment_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$ select coalesce(sum(amount_cents), 0)::integer from public.billing_allocations where payment_id = p_payment_id $$;

create or replace function private.billing_event(p_client_id uuid, p_action text, p_charge_id uuid, p_payment_id uuid, p_details jsonb)
returns void language sql security definer set search_path = ''
as $$
  insert into public.billing_events (client_id, action, charge_id, payment_id, details, actor)
  values (p_client_id, p_action, p_charge_id, p_payment_id, coalesce(p_details, '{}'), (select auth.uid()));
$$;

-- Defence in depth: the functions below never over-allocate, and this refuses it if they ever did.
create or replace function private.check_allocation()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if not exists (select 1 from public.billing_charges c where c.id = new.charge_id and c.voided_at is null
      and c.amount_cents >= (select sum(amount_cents) from public.billing_allocations where charge_id = c.id))
    or not exists (select 1 from public.billing_payments p where p.id = new.payment_id and p.voided_at is null
      and p.amount_cents >= (select sum(amount_cents) from public.billing_allocations where payment_id = p.id)) then
    raise exception 'an allocation can''t exceed its charge or payment' using errcode = '23514';
  end if;
  return null;
end;
$$;
create constraint trigger billing_allocations_check after insert or update on public.billing_allocations
  for each row execute function private.check_allocation();

-- Recomputes a charge's amount from its lines. It can't drop below what's been paid.
create or replace function private.refresh_charge(p_charge_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  total integer := (select greatest(coalesce(sum(amount_cents), 0), 0) from public.billing_charge_lines where charge_id = p_charge_id);
begin
  if total < private.charge_allocated(p_charge_id) then
    raise exception 'a charge can''t go below what''s been paid; void the payment or the charge first' using errcode = '55000';
  end if;
  update public.billing_charges set amount_cents = total, updated_at = now() where id = p_charge_id;
end;
$$;

create or replace function private.allocate(p_payment_id uuid, p_charge_id uuid, p_client_id uuid, p_amount integer)
returns void language sql security definer set search_path = ''
as $$
  insert into public.billing_allocations (payment_id, charge_id, client_id, amount_cents)
  values (p_payment_id, p_charge_id, p_client_id, p_amount)
  on conflict (payment_id, charge_id) do update set amount_cents = public.billing_allocations.amount_cents + excluded.amount_cents;
$$;

-- Applies unallocated payments to open charges, oldest first, so credit and open charges never coexist.
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
end;
$$;

-- Voiding releases the charge's allocations, which become credit for other open charges.
create or replace function private.void_charge_row(p_charge_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  ch public.billing_charges;
begin
  delete from public.billing_allocations where charge_id = p_charge_id;
  update public.billing_charges set voided_at = now(), voided_by = (select auth.uid()), void_reason = p_reason, updated_at = now()
  where id = p_charge_id and voided_at is null
  returning * into ch;
  if found then
    perform private.billing_event(ch.client_id, 'charge_voided', ch.id, null, jsonb_build_object('reason', p_reason));
    perform private.apply_credit(ch.client_id);
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rates
-- ---------------------------------------------------------------------------
create or replace function private.session_type(p_format public.session_format, p_minutes integer)
returns text language sql immutable set search_path = ''
as $$ select p_format::text || '_' || p_minutes $$;

create or replace function private.client_service_rate(p_client_id uuid, p_key text)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(
    (select amount_cents from public.client_service_rates where client_id = p_client_id and key = p_key),
    (select amount_cents from public.billing_rates where key = p_key));
$$;

-- The meeting's own price, else the client's rate for its session type, else the default, else null.
create or replace function private.session_price(m public.meetings)
returns integer language sql stable security definer set search_path = ''
as $$
  select coalesce(m.price_cents,
    (select amount_cents from public.client_session_rates
      where client_id = m.client_id and session_type = private.session_type(m.format, m.duration_minutes)),
    (select amount_cents from public.billing_rates where key = 'pt_' || private.session_type(m.format, m.duration_minutes)));
$$;

create or replace function private.session_price_source(m public.meetings)
returns text language sql stable security definer set search_path = ''
as $$
  select case
    when m.price_cents is not null then 'meeting'
    when exists (select 1 from public.client_session_rates
      where client_id = m.client_id and session_type = private.session_type(m.format, m.duration_minutes)) then 'client'
    when exists (select 1 from public.billing_rates where key = 'pt_' || private.session_type(m.format, m.duration_minutes)) then 'default'
  end;
$$;

-- Live Mesocycle and Nutrition at current rates, less the bundle discount. Null without either.
create or replace function private.monthly_plan_cents(p_client_id uuid)
returns integer language sql stable security definer set search_path = ''
as $$
  with live as (
    select distinct service from public.service_enrollments
    where client_id = p_client_id and status <> 'ended' and service in ('mesocycle', 'nutrition')
  ), total as (
    select sum(private.client_service_rate(p_client_id, service::text || '_month'))::integer as cents, count(*) as n from live
  )
  select case when n = 0 then null
    when n = 2 then cents - least(private.client_service_rate(p_client_id, 'bundle_discount_month'), cents)
    else cents end
  from total;
$$;

-- ---------------------------------------------------------------------------
-- Session charges
-- ---------------------------------------------------------------------------
create or replace function private.session_chargeable(m public.meetings)
returns boolean language sql immutable set search_path = ''
as $$ select m.billable and m.status in ('completed', 'no_show', 'late_cancelled') $$;

-- Sessions are billed from the PT service's start, and never before the day it was added to the app.
create or replace function private.session_billing_started(m public.meetings)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.service_enrollments e
    where e.client_id = m.client_id and e.service = 'personal_training'
      and (m.starts_at at time zone m.timezone)::date
        >= greatest(e.starts_on, (e.created_at at time zone private.billing_timezone())::date));
$$;

create or replace function private.session_label(m public.meetings)
returns text language sql immutable set search_path = ''
as $$
  select case when m.format = 'partner' then 'Partner personal training' else 'Personal training' end
    || ' · ' || m.duration_minutes || ' min'
    || case m.status when 'no_show' then ' · No-show' when 'late_cancelled' then ' · Late cancellation' else '' end;
$$;

-- Null when the session has no price or isn't billed yet; it then waits on "Needs a price".
create or replace function private.create_session_charge(m public.meetings)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  price integer := private.session_price(m);
  local_day date := (m.starts_at at time zone m.timezone)::date;
  charge uuid;
begin
  if price is null or not private.session_billing_started(m) then
    return null;
  end if;
  perform private.lock_billing(m.client_id);
  insert into public.billing_charges (client_id, kind, period, occurred_on, label, meeting_id, created_by)
  values (m.client_id, 'session', date_trunc('month', local_day)::date, local_day, private.session_label(m), m.id, (select auth.uid()))
  returning id into charge;
  insert into public.billing_charge_lines (charge_id, client_id, period, kind, service, label, amount_cents)
  values (charge, m.client_id, date_trunc('month', local_day)::date, 'session', 'personal_training', private.session_label(m), price);
  perform private.refresh_charge(charge);
  perform private.billing_event(m.client_id, 'charge_created', charge, null, jsonb_build_object('meetingId', m.id, 'amountCents', price));
  perform private.apply_credit(m.client_id);
  return charge;
end;
$$;

-- Keeps session charges in step with attendance. A charge the coach voided (waived) isn't recreated
-- unless the meeting leaves the charged statuses and comes back.
create or replace function private.sync_session_charge()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  open_id uuid;
begin
  select id into open_id from public.billing_charges where meeting_id = new.id and voided_at is null;
  if private.session_chargeable(new) then
    if open_id is null then
      if not private.session_chargeable(old) then
        perform private.create_session_charge(new);
      end if;
    else
      update public.billing_charge_lines set label = private.session_label(new) where charge_id = open_id and kind = 'session';
      update public.billing_charges set label = private.session_label(new), updated_at = now() where id = open_id;
    end if;
  elsif open_id is not null then
    perform private.lock_billing(new.client_id);
    perform private.void_charge_row(open_id, 'Attendance changed');
  end if;
  return null;
end;
$$;
create trigger meetings_billing after update of status, services on public.meetings
  for each row when (old.status is distinct from new.status or old.services is distinct from new.services)
  execute function private.sync_session_charge();

-- Generated meetings take their pattern's format, and a "this and following" change keeps it.
create or replace function private.inherit_meeting_format()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select format into new.format from public.meeting_schedules where id = new.schedule_id;
  return new;
end;
$$;
create trigger meetings_inherit_format before insert on public.meetings
  for each row when (new.schedule_id is not null) execute function private.inherit_meeting_format();

create or replace function private.inherit_schedule_format()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  select format into new.format from public.meeting_schedules where id = new.replaces_id;
  return new;
end;
$$;
create trigger meeting_schedules_inherit_format before insert on public.meeting_schedules
  for each row when (new.replaces_id is not null) execute function private.inherit_schedule_format();

-- ---------------------------------------------------------------------------
-- Monthly programming charges
-- ---------------------------------------------------------------------------
-- Charges this month for an active Mesocycle or Nutrition service that has started, once. An unpaid
-- programming charge for the month takes the line; otherwise a second charge holds it.
create or replace function private.charge_programming_month(e public.service_enrollments)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  today date := private.billing_today();
  month_start date := date_trunc('month', private.billing_today())::date;
  ch public.billing_charges;
  service_total integer;
  discount integer;
begin
  if e.service not in ('mesocycle', 'nutrition') or e.status <> 'active' or e.starts_on > today
      or exists (select 1 from public.clients where id = e.client_id and status = 'disabled') then
    return;
  end if;
  perform private.lock_billing(e.client_id);
  if exists (select 1 from public.billing_charge_lines where enrollment_id = e.id and period = month_start and kind = 'service') then
    return;
  end if;

  select c.* into ch from public.billing_charges c
  where c.client_id = e.client_id and c.kind = 'programming' and c.period = month_start and c.voided_at is null
    and not exists (select 1 from public.billing_allocations a where a.charge_id = c.id)
  order by c.created_at limit 1;
  if not found then
    insert into public.billing_charges (client_id, kind, period, occurred_on, label)
    values (e.client_id, 'programming', month_start, today, to_char(month_start, 'FMMonth YYYY') || ' programming')
    returning * into ch;
  end if;

  insert into public.billing_charge_lines (charge_id, client_id, period, position, kind, service, enrollment_id, label, amount_cents)
  values (ch.id, e.client_id, month_start, case e.service when 'mesocycle' then 1 else 2 end, 'service', e.service, e.id,
    case e.service when 'mesocycle' then 'Mesocycle programming' else 'Nutrition programming' end,
    private.client_service_rate(e.client_id, e.service::text || '_month'));

  -- Bundle: both services this month, in charges that weren't voided, and no discount yet.
  select sum(l.amount_cents)::integer into service_total
  from public.billing_charge_lines l join public.billing_charges c on c.id = l.charge_id
  where l.client_id = e.client_id and l.period = month_start and l.kind = 'service' and c.voided_at is null;
  if (select count(distinct l.service) from public.billing_charge_lines l join public.billing_charges c on c.id = l.charge_id
      where l.client_id = e.client_id and l.period = month_start and l.kind = 'service' and c.voided_at is null) = 2
    and not exists (select 1 from public.billing_charge_lines where client_id = e.client_id and period = month_start and kind = 'bundle_discount') then
    discount := least(private.client_service_rate(e.client_id, 'bundle_discount_month'), service_total);
    if discount > 0 then
      insert into public.billing_charge_lines (charge_id, client_id, period, position, kind, label, amount_cents)
      values (ch.id, e.client_id, month_start, 3, 'bundle_discount', 'Bundle discount (Mesocycle + Nutrition)', -discount);
    end if;
  end if;

  perform private.refresh_charge(ch.id);
  perform private.billing_event(e.client_id, 'charge_created', ch.id, null,
    jsonb_build_object('enrollmentId', e.id, 'service', e.service, 'period', month_start));
  perform private.apply_credit(e.client_id);
end;
$$;

create or replace function private.charge_programming_months()
returns void language plpgsql security definer set search_path = ''
as $$
declare
  e public.service_enrollments;
begin
  for e in
    select * from public.service_enrollments
    where service in ('mesocycle', 'nutrition') and status = 'active' and starts_on <= private.billing_today()
  loop
    perform private.charge_programming_month(e);
  end loop;
end;
$$;

-- A service added or resumed mid-month is charged at once rather than at the next hourly run.
create or replace function private.charge_enrollment_change()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  perform private.charge_programming_month(new);
  return null;
end;
$$;
create trigger service_enrollments_billing after insert or update of status, starts_on on public.service_enrollments
  for each row execute function private.charge_enrollment_change();

select cron.schedule('billing-programming', '17 * * * *', 'select private.charge_programming_months()');

-- ---------------------------------------------------------------------------
-- Documents
-- ---------------------------------------------------------------------------
create or replace function private.charge_json(c public.billing_charges, p_staff boolean)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', c.id, 'kind', c.kind, 'period', c.period, 'occurredOn', c.occurred_on, 'label', c.label,
    'meetingId', c.meeting_id, 'amountCents', c.amount_cents, 'paidCents', paid.cents,
    'status', case when c.voided_at is not null then 'void' when paid.cents >= c.amount_cents then 'paid'
      when paid.cents > 0 then 'part_paid' else 'unpaid' end,
    'voidedAt', c.voided_at, 'voidReason', case when p_staff then nullif(c.void_reason, '') end,
    'lines', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'kind', l.kind, 'service', l.service, 'label', l.label,
      'amountCents', l.amount_cents) order by l.position, l.id) from public.billing_charge_lines l where l.charge_id = c.id), '[]'))
  from (select private.charge_allocated(c.id) as cents) paid;
$$;

create or replace function private.payment_json(p public.billing_payments, p_staff boolean)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'id', p.id, 'amountCents', p.amount_cents, 'allocatedCents', private.payment_allocated(p.id),
    'receivedOn', p.received_on, 'method', p.method, 'recordedAt', p.recorded_at,
    'note', case when p_staff then nullif(p.note, '') end,
    'voidedAt', p.voided_at, 'voidReason', case when p_staff then nullif(p.void_reason, '') end,
    'allocations', coalesce((select jsonb_agg(jsonb_build_object('chargeId', a.charge_id, 'amountCents', a.amount_cents))
      from public.billing_allocations a where a.payment_id = p.id), '[]'));
$$;

-- Outstanding: unpaid parts of open charges. Credit: unallocated payments. Carried over: outstanding
-- from months before this one.
create or replace function private.billing_summary(p_client_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  with open_charges as (
    select c.period, c.amount_cents - private.charge_allocated(c.id) as remaining
    from public.billing_charges c where c.client_id = p_client_id and c.voided_at is null
  ), totals as (
    select coalesce(sum(remaining), 0)::integer as outstanding,
      coalesce(sum(remaining) filter (where period < private.billing_month()), 0)::integer as carried,
      min(period) filter (where remaining > 0) as oldest
    from open_charges
  ), credit as (
    select coalesce(sum(p.amount_cents - private.payment_allocated(p.id)), 0)::integer as cents
    from public.billing_payments p where p.client_id = p_client_id and p.voided_at is null
  )
  select jsonb_build_object('outstandingCents', t.outstanding, 'creditCents', cr.cents, 'balanceCents', t.outstanding - cr.cents,
    'carriedOverCents', t.carried, 'oldestUnpaidPeriod', t.oldest)
  from totals t, credit cr;
$$;

create or replace function private.client_rates_json(p_client_id uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'services', (select jsonb_agg(jsonb_build_object('key', r.key, 'defaultCents', r.amount_cents, 'customCents', o.amount_cents,
        'amountCents', coalesce(o.amount_cents, r.amount_cents)) order by r.key)
      from public.billing_rates r
      left join public.client_service_rates o on o.client_id = p_client_id and o.key = r.key
      where r.key in ('mesocycle_month', 'nutrition_month', 'bundle_discount_month')),
    'sessions', coalesce((select jsonb_agg(jsonb_build_object('sessionType', t.session_type, 'defaultCents', d.amount_cents,
        'customCents', o.amount_cents, 'amountCents', coalesce(o.amount_cents, d.amount_cents))
        order by split_part(t.session_type, '_', 1) desc, split_part(t.session_type, '_', 2)::integer desc)
      from (select substr(key, 4) as session_type from public.billing_rates where key like 'pt\_%'
            union select session_type from public.client_session_rates where client_id = p_client_id) t
      left join public.billing_rates d on d.key = 'pt_' || t.session_type
      left join public.client_session_rates o on o.client_id = p_client_id and o.session_type = t.session_type), '[]'));
$$;

create or replace function public.get_client_billing(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  staff boolean := private.staff_can_access_client(p_client_id);
begin
  if not staff and (p_client_id is null or p_client_id is distinct from private.current_client_id()) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'clientId', p_client_id,
    'currentPeriod', private.billing_month(),
    'summary', private.billing_summary(p_client_id),
    'rates', private.client_rates_json(p_client_id),
    'planCents', private.monthly_plan_cents(p_client_id),
    'charges', coalesce((select jsonb_agg(private.charge_json(c, staff) order by c.period desc, c.occurred_on desc, c.created_at desc)
      from public.billing_charges c where c.client_id = p_client_id and (staff or c.voided_at is null)), '[]'),
    'payments', coalesce((select jsonb_agg(private.payment_json(p, staff) order by p.received_on desc, p.recorded_at desc)
      from public.billing_payments p where p.client_id = p_client_id and (staff or p.voided_at is null)), '[]'));
end;
$$;

-- Every client the caller can access who has billing history or a live service.
create or replace function public.billing_overview()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  month_start date := private.billing_month();
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'currentPeriod', month_start,
    'billedThisMonthCents', (select coalesce(sum(ch.amount_cents), 0)::integer from public.billing_charges ch
      where ch.period = month_start and ch.voided_at is null and private.staff_can_access_client(ch.client_id)),
    'receivedThisMonthCents', (select coalesce(sum(p.amount_cents), 0)::integer from public.billing_payments p
      where p.voided_at is null and p.method <> 'credit' and date_trunc('month', p.received_on)::date = month_start
        and private.staff_can_access_client(p.client_id)),
    'clients', coalesce((select jsonb_agg(x.doc order by (x.doc->'summary'->>'balanceCents')::integer desc, x.doc->>'fullName')
      from (select jsonb_build_object('clientId', c.id, 'fullName', c.full_name, 'status', c.status,
          'summary', private.billing_summary(c.id), 'planCents', private.monthly_plan_cents(c.id),
          'lastPaymentOn', (select max(p.received_on) from public.billing_payments p
            where p.client_id = c.id and p.voided_at is null and p.method <> 'credit')) as doc
        from public.clients c
        where private.staff_can_access_client(c.id)
          and (exists (select 1 from public.billing_charges ch where ch.client_id = c.id)
            or exists (select 1 from public.billing_payments p where p.client_id = c.id)
            or exists (select 1 from public.service_enrollments e where e.client_id = c.id and e.status <> 'ended'))) x), '[]'));
end;
$$;

-- Charged-status PT sessions that have no charge because no price resolves.
create or replace function public.list_sessions_needing_price()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return coalesce((select jsonb_agg(jsonb_build_object('meetingId', a.id, 'clientId', a.client_id, 'clientName', c.full_name,
      'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'timezone', a.timezone, 'format', a.format, 'status', a.status)
      order by a.starts_at)
    from public.meetings a join public.clients c on c.id = a.client_id
    where private.staff_can_access_client(a.client_id) and private.session_chargeable(a)
      and not exists (select 1 from public.billing_charges ch where ch.meeting_id = a.id)
      and private.session_price(a) is null and private.session_billing_started(a)), '[]');
end;
$$;

create or replace function private.meeting_billing_json(a public.meetings, p_staff boolean)
returns jsonb language sql stable security definer set search_path = ''
as $$
  select jsonb_build_object(
    'meetingId', a.id, 'billable', a.billable, 'format', a.format,
    'sessionType', private.session_type(a.format, a.duration_minutes),
    'priceCents', a.price_cents, 'resolvedPriceCents', private.session_price(a), 'priceSource', private.session_price_source(a),
    'charge', (select private.charge_json(c, p_staff) from public.billing_charges c where c.meeting_id = a.id
      order by c.voided_at is null desc, c.created_at desc limit 1));
$$;

create or replace function public.get_meeting_billing(p_meeting_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
declare
  a public.meetings;
begin
  select * into a from public.meetings where id = p_meeting_id;
  if not found or not (private.staff_can_access_client(a.client_id) or a.client_id = private.current_client_id()) then
    raise exception 'meeting not found' using errcode = '42501';
  end if;
  return private.meeting_billing_json(a, private.staff_can_access_client(a.client_id));
end;
$$;

-- For the client's Pay dialog: their primary coach's e-transfer email, never the profile row.
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
      'balanceCents', (private.billing_summary(me)->>'balanceCents')::integer)
    from public.clients c left join public.profiles p on p.auth_user_id = c.primary_coach_id
    where c.id = me);
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes: settings and rates
-- ---------------------------------------------------------------------------
create or replace function public.get_billing_settings()
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return jsonb_build_object('timezone', private.billing_timezone(),
    'rates', (select jsonb_object_agg(key, amount_cents) from public.billing_rates));
end;
$$;

create or replace function public.save_billing_settings(p_timezone text, p_rates jsonb)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r record;
begin
  if not private.is_admin() then
    raise exception 'admins only' using errcode = '42501';
  end if;
  if not private.is_timezone(p_timezone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;
  if p_rates is null or jsonb_typeof(p_rates) <> 'object' then
    raise exception 'rates are an object of cents by key' using errcode = '22023';
  end if;
  for r in select key, value from jsonb_each(p_rates) loop
    if not exists (select 1 from public.billing_rates where key = r.key) then
      raise exception 'unknown rate %', r.key using errcode = '22023';
    end if;
    if jsonb_typeof(r.value) <> 'number' or (r.value::text)::numeric <> floor((r.value::text)::numeric)
        or (r.value::text)::numeric not between 0 and 10000000 then
      raise exception 'rate % must be whole cents from 0 to 10000000', r.key using errcode = '22023';
    end if;
    update public.billing_rates set amount_cents = (r.value::text)::integer, updated_by = (select auth.uid()), updated_at = now()
    where key = r.key and amount_cents <> (r.value::text)::integer;
  end loop;
  update public.billing_settings set timezone = p_timezone, updated_by = (select auth.uid()), updated_at = now();
  return public.get_billing_settings();
end;
$$;

-- Null resets to the default. A change applies to charges created after it.
create or replace function public.set_client_service_rate(p_client_id uuid, p_key text, p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if p_key is null or p_key not in ('mesocycle_month', 'nutrition_month', 'bundle_discount_month') then
    raise exception 'unknown rate' using errcode = '22023';
  end if;
  if p_amount_cents is null then
    delete from public.client_service_rates where client_id = p_client_id and key = p_key;
  elsif p_amount_cents not between 0 and 10000000 then
    raise exception 'a rate is 0 to 10000000 cents' using errcode = '22023';
  else
    insert into public.client_service_rates (client_id, key, amount_cents, updated_by)
    values (p_client_id, p_key, p_amount_cents, (select auth.uid()))
    on conflict (client_id, key) do update set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform private.billing_event(p_client_id, 'rate_changed', null, null, jsonb_build_object('key', p_key, 'amountCents', p_amount_cents));
  return public.get_client_billing(p_client_id);
end;
$$;

create or replace function public.set_client_session_rate(p_client_id uuid, p_session_type text, p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  if p_session_type is null or p_session_type !~ '^(solo|partner)_[0-9]{1,3}$'
      or split_part(p_session_type, '_', 2)::integer not between 5 and 600 then
    raise exception 'unknown session type' using errcode = '22023';
  end if;
  if p_amount_cents is null then
    delete from public.client_session_rates where client_id = p_client_id and session_type = p_session_type;
  elsif p_amount_cents not between 0 and 10000000 then
    raise exception 'a rate is 0 to 10000000 cents' using errcode = '22023';
  else
    insert into public.client_session_rates (client_id, session_type, amount_cents, updated_by)
    values (p_client_id, p_session_type, p_amount_cents, (select auth.uid()))
    on conflict (client_id, session_type) do update set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;
  perform private.billing_event(p_client_id, 'rate_changed', null, null,
    jsonb_build_object('sessionType', p_session_type, 'amountCents', p_amount_cents));
  return public.get_client_billing(p_client_id);
end;
$$;

-- Format and price of one PT meeting. A price also becomes the client's rate for that session type.
-- An open charge follows the new price; a session that was waived (voided) stays waived.
create or replace function public.set_meeting_billing(p_meeting_id uuid, p_format text, p_price_cents integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  open_id uuid;
  price integer;
begin
  if p_format is null or p_format not in ('solo', 'partner') then
    raise exception 'format is solo or partner' using errcode = '22023';
  end if;
  if p_price_cents is not null and p_price_cents not between 0 and 10000000 then
    raise exception 'a price is 0 to 10000000 cents' using errcode = '22023';
  end if;
  if not a.billable then
    raise exception 'only personal training meetings are billed' using errcode = '55000';
  end if;
  perform private.lock_billing(a.client_id);
  update public.meetings set format = p_format::public.session_format, price_cents = p_price_cents, updated_by = (select auth.uid())
  where id = a.id returning * into a;
  if p_price_cents is not null then
    insert into public.client_session_rates (client_id, session_type, amount_cents, updated_by)
    values (a.client_id, private.session_type(a.format, a.duration_minutes), p_price_cents, (select auth.uid()))
    on conflict (client_id, session_type) do update set amount_cents = excluded.amount_cents, updated_by = excluded.updated_by, updated_at = now();
  end if;

  price := private.session_price(a);
  select id into open_id from public.billing_charges where meeting_id = a.id and voided_at is null;
  if open_id is not null then
    if price is not null then
      update public.billing_charge_lines set amount_cents = price, label = private.session_label(a) where charge_id = open_id and kind = 'session';
      update public.billing_charges set label = private.session_label(a) where id = open_id;
      perform private.refresh_charge(open_id);
      perform private.apply_credit(a.client_id);
    end if;
  elsif private.session_chargeable(a) and not exists (select 1 from public.billing_charges where meeting_id = a.id) then
    perform private.create_session_charge(a);
  end if;
  perform private.billing_event(a.client_id, 'meeting_price_set', open_id, null,
    jsonb_build_object('meetingId', a.id, 'format', p_format, 'priceCents', p_price_cents));
  return private.meeting_billing_json(a, true);
end;
$$;

-- A pattern's format applies to its future scheduled meetings too.
create or replace function public.set_meeting_schedule_format(p_schedule_id uuid, p_format text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
begin
  select * into sch from public.meeting_schedules where id = p_schedule_id for update;
  if not found or not private.staff_can_access_client(sch.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  if p_format is null or p_format not in ('solo', 'partner') then
    raise exception 'format is solo or partner' using errcode = '22023';
  end if;
  update public.meeting_schedules set format = p_format::public.session_format, updated_by = (select auth.uid()) where id = sch.id;
  update public.meetings set format = p_format::public.session_format, updated_by = (select auth.uid())
  where schedule_id = sch.id and status = 'scheduled' and starts_at > now();
  return jsonb_build_object('scheduleId', sch.id, 'format', p_format);
end;
$$;

create or replace function public.save_etransfer_email(p_email text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  saved public.profiles;
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  update public.profiles set etransfer_email = nullif(btrim(p_email), '')
  where auth_user_id = (select auth.uid())
  returning * into saved;
  return jsonb_build_object('etransferEmail', saved.etransfer_email);
exception
  when check_violation then
    raise exception 'enter a valid email address' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Writes: charges and payments
-- ---------------------------------------------------------------------------
create or replace function private.staff_charge(p_charge_id uuid)
returns public.billing_charges language plpgsql security definer set search_path = ''
as $$
declare
  ch public.billing_charges;
begin
  select * into ch from public.billing_charges where id = p_charge_id;
  if not found or not private.staff_can_access_client(ch.client_id) then
    raise exception 'charge not found' using errcode = '42501';
  end if;
  perform private.lock_billing(ch.client_id);
  select * into ch from public.billing_charges where id = p_charge_id;
  return ch;
end;
$$;

create or replace function private.required_reason(p_reason text)
returns text language plpgsql immutable set search_path = ''
as $$
begin
  if nullif(btrim(p_reason), '') is null then
    raise exception 'give a reason' using errcode = '22023';
  end if;
  if char_length(btrim(p_reason)) > 1000 then
    raise exception 'keep the reason under 1000 characters' using errcode = '22023';
  end if;
  return btrim(p_reason);
end;
$$;

-- Allocates to the listed charges in order, then oldest first; the rest is credit. The caller holds the lock.
create or replace function private.insert_payment(p_id uuid, p_client_id uuid, p_amount_cents integer, p_received_on date,
  p_method text, p_note text, p_charge_ids uuid[])
returns void language plpgsql security definer set search_path = ''
as $$
declare
  left_over integer := p_amount_cents;
  c record;
  take integer;
begin
  if p_id is null then
    raise exception 'a payment needs an id' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 100000000 then
    raise exception 'a payment is more than $0' using errcode = '22023';
  end if;
  -- A day's slack for a coach east of the business time zone around midnight.
  if p_received_on is null or p_received_on > private.billing_today() + 1 then
    raise exception 'a payment can''t be received in the future' using errcode = '22023';
  end if;
  if p_method is null or p_method not in ('e_transfer', 'cash', 'other', 'credit') then
    raise exception 'unknown payment method' using errcode = '22023';
  end if;
  if char_length(coalesce(p_note, '')) > 1000 then
    raise exception 'keep the note under 1000 characters' using errcode = '22023';
  end if;
  insert into public.billing_payments (id, client_id, amount_cents, received_on, method, note, recorded_by)
  values (p_id, p_client_id, p_amount_cents, p_received_on, p_method::public.payment_method, btrim(coalesce(p_note, '')), (select auth.uid()));

  for c in
    select ch.id, ch.client_id, ch.voided_at, ch.amount_cents - private.charge_allocated(ch.id) as remaining, ids.n
    from unnest(coalesce(p_charge_ids, '{}')) with ordinality ids(id, n)
    left join public.billing_charges ch on ch.id = ids.id
    order by ids.n
  loop
    if c.id is null or c.client_id <> p_client_id or c.voided_at is not null then
      raise exception 'charge not found' using errcode = '22023';
    end if;
    exit when left_over <= 0;
    take := least(left_over, c.remaining);
    if take > 0 then
      perform private.allocate(p_id, c.id, p_client_id, take);
      left_over := left_over - take;
    end if;
  end loop;

  perform private.billing_event(p_client_id, 'payment_recorded', null, p_id,
    jsonb_build_object('amountCents', p_amount_cents, 'method', p_method, 'receivedOn', p_received_on));
  perform private.apply_credit(p_client_id);
end;
$$;

create or replace function public.record_payment(p_id uuid, p_client_id uuid, p_amount_cents integer, p_received_on date,
  p_method text, p_note text, p_charge_ids uuid[] default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  existing public.billing_payments;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  perform private.lock_billing(p_client_id);
  select * into existing from public.billing_payments where id = p_id;
  if found then
    if existing.client_id <> p_client_id then
      raise exception 'that payment id is taken' using errcode = '23505';
    end if;
    return public.get_client_billing(p_client_id);
  end if;
  perform private.insert_payment(p_id, p_client_id, p_amount_cents, p_received_on, p_method, p_note, p_charge_ids);
  return public.get_client_billing(p_client_id);
end;
$$;

-- "Mark paid" on charges or a whole month: a payment of exactly what's left on them.
create or replace function public.mark_charges_paid(p_id uuid, p_charge_ids uuid[], p_received_on date, p_method text, p_note text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  owner uuid;
  remaining integer;
begin
  if p_charge_ids is null or cardinality(p_charge_ids) = 0 then
    raise exception 'choose charges to mark paid' using errcode = '22023';
  end if;
  if (select count(distinct client_id) from public.billing_charges where id = any (p_charge_ids)) <> 1
      or (select count(*) from public.billing_charges where id = any (p_charge_ids)) <> cardinality(array(select distinct unnest(p_charge_ids))) then
    raise exception 'charge not found' using errcode = '42501';
  end if;
  select client_id into owner from public.billing_charges where id = p_charge_ids[1];
  if not private.staff_can_access_client(owner) then
    raise exception 'charge not found' using errcode = '42501';
  end if;
  perform private.lock_billing(owner);
  if exists (select 1 from public.billing_payments where id = p_id) then
    return public.record_payment(p_id, owner, null, null, null, null);
  end if;
  select coalesce(sum(amount_cents - private.charge_allocated(id)), 0)::integer into remaining
  from public.billing_charges where id = any (p_charge_ids) and voided_at is null;
  if remaining <= 0 then
    raise exception 'those charges are already paid' using errcode = '55000';
  end if;
  perform private.insert_payment(p_id, owner, remaining, p_received_on, p_method, p_note, p_charge_ids);
  return public.get_client_billing(owner);
end;
$$;

create or replace function public.void_payment(p_payment_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  p public.billing_payments;
  reason text := private.required_reason(p_reason);
begin
  select * into p from public.billing_payments where id = p_payment_id;
  if not found or not private.staff_can_access_client(p.client_id) then
    raise exception 'payment not found' using errcode = '42501';
  end if;
  perform private.lock_billing(p.client_id);
  if p.voided_at is not null then
    raise exception 'that payment is already void' using errcode = '55000';
  end if;
  delete from public.billing_allocations where payment_id = p.id;
  update public.billing_payments set voided_at = now(), voided_by = (select auth.uid()), void_reason = reason where id = p.id;
  perform private.billing_event(p.client_id, 'payment_voided', null, p.id, jsonb_build_object('reason', reason));
  perform private.apply_credit(p.client_id);
  return public.get_client_billing(p.client_id);
end;
$$;

create or replace function public.void_charge(p_charge_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  ch public.billing_charges := private.staff_charge(p_charge_id);
  reason text := private.required_reason(p_reason);
begin
  if ch.voided_at is not null then
    raise exception 'that charge is already void' using errcode = '55000';
  end if;
  perform private.void_charge_row(ch.id, reason);
  return public.get_client_billing(ch.client_id);
end;
$$;

-- Edits one line of an open charge. The charge can't drop below what's been paid.
create or replace function public.edit_charge_line(p_line_id uuid, p_label text, p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  l public.billing_charge_lines;
  ch public.billing_charges;
  new_label text := btrim(coalesce(p_label, ''));
begin
  select * into l from public.billing_charge_lines where id = p_line_id;
  if not found then
    raise exception 'charge not found' using errcode = '42501';
  end if;
  ch := private.staff_charge(l.charge_id);
  if ch.voided_at is not null then
    raise exception 'a void charge can''t be edited' using errcode = '55000';
  end if;
  if char_length(new_label) not between 1 and 200 then
    raise exception 'a label is 1 to 200 characters' using errcode = '22023';
  end if;
  if p_amount_cents is null or abs(p_amount_cents) > 10000000
      or (l.kind = 'bundle_discount' and p_amount_cents > 0) or (l.kind <> 'bundle_discount' and p_amount_cents < 0) then
    raise exception 'that amount doesn''t fit this line' using errcode = '22023';
  end if;
  update public.billing_charge_lines set label = new_label, amount_cents = p_amount_cents where id = l.id;
  if (select count(*) from public.billing_charge_lines where charge_id = ch.id) = 1 then
    update public.billing_charges set label = new_label where id = ch.id;
  end if;
  perform private.refresh_charge(ch.id);
  perform private.billing_event(ch.client_id, 'charge_edited', ch.id, null, jsonb_build_object('lineId', l.id,
    'from', jsonb_build_object('label', l.label, 'amountCents', l.amount_cents),
    'to', jsonb_build_object('label', new_label, 'amountCents', p_amount_cents)));
  perform private.apply_credit(ch.client_id);
  return public.get_client_billing(ch.client_id);
end;
$$;

-- A manual charge, e.g. "Opening balance" dated the month before billing began. Never a future month.
create or replace function public.add_adjustment(p_id uuid, p_client_id uuid, p_period date, p_label text, p_amount_cents integer)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  month_start date := date_trunc('month', p_period)::date;
  new_label text := btrim(coalesce(p_label, ''));
  existing public.billing_charges;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  perform private.lock_billing(p_client_id);
  select * into existing from public.billing_charges where id = p_id;
  if found then
    if existing.client_id <> p_client_id then
      raise exception 'that charge id is taken' using errcode = '23505';
    end if;
    return public.get_client_billing(p_client_id);
  end if;
  if p_id is null or month_start is null or month_start > private.billing_month() then
    raise exception 'an adjustment needs an id and a month up to this one' using errcode = '22023';
  end if;
  if char_length(new_label) not between 1 and 200 then
    raise exception 'a label is 1 to 200 characters' using errcode = '22023';
  end if;
  if p_amount_cents is null or p_amount_cents not between 1 and 10000000 then
    raise exception 'an adjustment is more than $0; record a credit to reduce the balance' using errcode = '22023';
  end if;
  insert into public.billing_charges (id, client_id, kind, period, occurred_on, label, created_by)
  values (p_id, p_client_id, 'adjustment', month_start,
    case when month_start = private.billing_month() then private.billing_today() else month_start end, new_label, (select auth.uid()));
  insert into public.billing_charge_lines (charge_id, client_id, period, kind, label, amount_cents)
  values (p_id, p_client_id, month_start, 'adjustment', new_label, p_amount_cents);
  perform private.refresh_charge(p_id);
  perform private.billing_event(p_client_id, 'charge_created', p_id, null, jsonb_build_object('amountCents', p_amount_cents));
  perform private.apply_credit(p_client_id);
  return public.get_client_billing(p_client_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.billing_settings enable row level security;
alter table public.billing_rates enable row level security;
alter table public.client_service_rates enable row level security;
alter table public.client_session_rates enable row level security;
alter table public.billing_charges enable row level security;
alter table public.billing_charge_lines enable row level security;
alter table public.billing_payments enable row level security;
alter table public.billing_allocations enable row level security;
alter table public.billing_events enable row level security;

create policy billing_settings_select on public.billing_settings for select to authenticated using (true);
create policy billing_rates_select on public.billing_rates for select to authenticated using (true);
create policy client_service_rates_select on public.client_service_rates for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy client_session_rates_select on public.client_session_rates for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy billing_charges_select on public.billing_charges for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy billing_charge_lines_select on public.billing_charge_lines for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy billing_payments_select on public.billing_payments for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy billing_allocations_select on public.billing_allocations for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy billing_events_select on public.billing_events for select to authenticated
  using ((select private.staff_can_access_client(client_id)));

revoke all on public.billing_settings, public.billing_rates, public.client_service_rates, public.client_session_rates,
  public.billing_charges, public.billing_charge_lines, public.billing_payments, public.billing_allocations, public.billing_events
  from anon, authenticated;
grant select on public.billing_settings, public.billing_rates, public.client_service_rates, public.client_session_rates,
  public.billing_charge_lines, public.billing_allocations, public.billing_events to authenticated;
-- Staff-only notes and void reasons are read through get_client_billing.
grant select (id, client_id, kind, period, occurred_on, label, meeting_id, amount_cents, voided_at, created_at, updated_at)
  on public.billing_charges to authenticated;
grant select (id, client_id, amount_cents, received_on, method, recorded_at, voided_at) on public.billing_payments to authenticated;

revoke all on function private.billing_timezone(), private.billing_today(), private.billing_month(), private.lock_billing(uuid),
  private.charge_allocated(uuid), private.payment_allocated(uuid), private.billing_event(uuid, text, uuid, uuid, jsonb),
  private.check_allocation(), private.refresh_charge(uuid), private.allocate(uuid, uuid, uuid, integer), private.apply_credit(uuid),
  private.void_charge_row(uuid, text), private.session_type(public.session_format, integer), private.client_service_rate(uuid, text),
  private.session_price(public.meetings), private.session_price_source(public.meetings), private.monthly_plan_cents(uuid),
  private.session_chargeable(public.meetings), private.session_billing_started(public.meetings), private.session_label(public.meetings),
  private.create_session_charge(public.meetings), private.sync_session_charge(), private.inherit_meeting_format(),
  private.inherit_schedule_format(), private.charge_programming_month(public.service_enrollments), private.charge_programming_months(),
  private.charge_enrollment_change(), private.charge_json(public.billing_charges, boolean),
  private.payment_json(public.billing_payments, boolean), private.billing_summary(uuid), private.client_rates_json(uuid),
  private.meeting_billing_json(public.meetings, boolean), private.staff_charge(uuid), private.required_reason(text),
  private.insert_payment(uuid, uuid, integer, date, text, text, uuid[])
  from public, anon, authenticated;

revoke all on function public.get_client_billing(uuid), public.billing_overview(), public.list_sessions_needing_price(),
  public.get_meeting_billing(uuid), public.billing_payment_details(), public.get_billing_settings(),
  public.save_billing_settings(text, jsonb), public.set_client_service_rate(uuid, text, integer),
  public.set_client_session_rate(uuid, text, integer), public.set_meeting_billing(uuid, text, integer),
  public.set_meeting_schedule_format(uuid, text), public.save_etransfer_email(text),
  public.record_payment(uuid, uuid, integer, date, text, text, uuid[]), public.mark_charges_paid(uuid, uuid[], date, text, text),
  public.void_payment(uuid, text), public.void_charge(uuid, text), public.edit_charge_line(uuid, text, integer),
  public.add_adjustment(uuid, uuid, date, text, integer)
  from public, anon, authenticated;
grant execute on function public.get_client_billing(uuid), public.billing_overview(), public.list_sessions_needing_price(),
  public.get_meeting_billing(uuid), public.billing_payment_details(), public.get_billing_settings(),
  public.save_billing_settings(text, jsonb), public.set_client_service_rate(uuid, text, integer),
  public.set_client_session_rate(uuid, text, integer), public.set_meeting_billing(uuid, text, integer),
  public.set_meeting_schedule_format(uuid, text), public.save_etransfer_email(text),
  public.record_payment(uuid, uuid, integer, date, text, text, uuid[]), public.mark_charges_paid(uuid, uuid[], date, text, text),
  public.void_payment(uuid, text), public.void_charge(uuid, text), public.edit_charge_line(uuid, text, integer),
  public.add_adjustment(uuid, uuid, date, text, integer)
  to authenticated;
