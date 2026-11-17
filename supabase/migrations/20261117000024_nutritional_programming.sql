-- FR-09/10: effective-dated immutable targets, separate daily records and attributed corrections.
create table public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  style text not null check (length(btrim(style)) between 1 and 160),
  starts_on date not null, ends_on date check (ends_on >= starts_on),
  calorie_goal integer not null check (calorie_goal between 0 and 30000),
  maintenance integer check (maintenance between 0 and 30000),
  baseline_weight numeric check (baseline_weight > 0 and baseline_weight <= 1500),
  weight_unit public.weight_unit not null,
  notes text not null default '' check (length(notes) <= 5000),
  created_at timestamptz not null default now(),
  created_by uuid not null references auth.users(id),
  request_id uuid not null unique,
  unique (client_id, starts_on)
);
create table public.bodyweight_logs (
  client_id uuid not null references public.clients(id) on delete cascade,
  measured_on date not null,
  weight numeric not null check (weight > 0 and weight <= 1500),
  unit public.weight_unit not null,
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_by_staff boolean not null,
  primary key (client_id, measured_on)
);
create table public.nutrition_logs (
  client_id uuid not null references public.clients(id) on delete cascade,
  activity_on date not null,
  intake integer check (intake between 0 and 30000),
  output integer check (output between 0 and 30000),
  notes text not null default '' check (length(notes) <= 5000),
  version integer not null default 1,
  updated_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id),
  updated_by_staff boolean not null,
  primary key (client_id, activity_on)
);
create table public.nutrition_entry_changes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  kind text not null check (kind in ('weight', 'nutrition')),
  entry_date date not null,
  actor_id uuid not null references auth.users(id),
  by_staff boolean not null,
  before_value jsonb, after_value jsonb not null,
  created_at timestamptz not null default now(),
  request_id uuid not null unique,
  request_value jsonb not null
);
create index nutrition_changes_client_date on public.nutrition_entry_changes(client_id, entry_date, created_at);

create function private.can_read_nutrition(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_can_access_client(p_client_id)
    or (private.current_client_id() = p_client_id and exists (
      select 1 from public.service_enrollments where client_id = p_client_id and service = 'nutrition'
    )), false);
$$;
create function private.can_log_nutrition(p_client_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.staff_can_access_client(p_client_id)
    or (private.current_client_id() = p_client_id and exists (
      select 1 from public.service_enrollments e join public.clients c on c.id = e.client_id
      where e.client_id = p_client_id and e.service = 'nutrition' and e.status = 'active'
        and e.archived_at is null and e.starts_on <= (now() at time zone c.timezone)::date
        and (e.ends_on is null or e.ends_on >= (now() at time zone c.timezone)::date)
    )), false);
$$;
revoke all on function private.can_read_nutrition(uuid), private.can_log_nutrition(uuid) from public, anon;
grant execute on function private.can_read_nutrition(uuid), private.can_log_nutrition(uuid) to authenticated;

alter table public.nutrition_targets enable row level security;
alter table public.bodyweight_logs enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.nutrition_entry_changes enable row level security;
revoke all on public.nutrition_targets, public.bodyweight_logs, public.nutrition_logs, public.nutrition_entry_changes from anon, authenticated;
grant select on public.nutrition_targets, public.bodyweight_logs, public.nutrition_logs, public.nutrition_entry_changes to authenticated;
create policy nutrition_targets_read on public.nutrition_targets for select to authenticated using (private.can_read_nutrition(client_id));
create policy bodyweight_logs_read on public.bodyweight_logs for select to authenticated using (private.can_read_nutrition(client_id));
create policy nutrition_logs_read on public.nutrition_logs for select to authenticated using (private.can_read_nutrition(client_id));
create policy nutrition_changes_read on public.nutrition_entry_changes for select to authenticated using (private.can_read_nutrition(client_id));

create function public.assign_nutrition_target(p_client_id uuid, p_value jsonb, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result public.nutrition_targets; last_start date; today date;
begin
  if not coalesce(private.staff_can_access_client(p_client_id), false) then
    raise exception 'Not authorized' using errcode = '42501';
  end if;
  -- Serializes first inserts as well as new versions and lost-response retries.
  select (now() at time zone timezone)::date into today from public.clients where id = p_client_id for update;
  select * into result from public.nutrition_targets where request_id = p_request_id;
  if found then
    if result.client_id <> p_client_id or result.created_by <> auth.uid() or (to_jsonb(result) - array['id','client_id','created_at','created_by','request_id']) <> p_value then
      raise exception 'Retry does not match the original target' using errcode = '22023';
    end if;
    return to_jsonb(result);
  end if;
  if jsonb_typeof(p_value) is distinct from 'object' or p_request_id is null
    or not (p_value ?& array['style','starts_on','ends_on','calorie_goal','maintenance','baseline_weight','weight_unit','notes'])
    or (p_value - array['style','starts_on','ends_on','calorie_goal','maintenance','baseline_weight','weight_unit','notes']) <> '{}'::jsonb
    or jsonb_typeof(p_value->'style') is distinct from 'string'
    or jsonb_typeof(p_value->'notes') is distinct from 'string'
    or jsonb_typeof(p_value->'calorie_goal') is distinct from 'number'
    or jsonb_typeof(p_value->'maintenance') not in ('number','null')
    or jsonb_typeof(p_value->'baseline_weight') not in ('number','null')
    or jsonb_typeof(p_value->'starts_on') is distinct from 'string'
    or jsonb_typeof(p_value->'ends_on') not in ('string','null')
    or (p_value->>'calorie_goal')::numeric <> trunc((p_value->>'calorie_goal')::numeric)
    or (p_value->>'maintenance')::numeric <> trunc((p_value->>'maintenance')::numeric)
  then raise exception 'Invalid nutrition target' using errcode = '22023'; end if;
  if not exists (select 1 from public.service_enrollments where client_id = p_client_id and service = 'nutrition' and status <> 'ended' and archived_at is null) then
    raise exception 'Add a nutrition service before assigning targets' using errcode = '22023';
  end if;
  select max(starts_on) into last_start from public.nutrition_targets where client_id = p_client_id;
  if last_start is not null and ((p_value->>'starts_on')::date <= last_start or (p_value->>'starts_on')::date < today) then
    raise exception 'New targets must start today or later, after the latest target. Historical targets are preserved.' using errcode = '22023';
  end if;
  insert into public.nutrition_targets (client_id, style, starts_on, ends_on, calorie_goal, maintenance, baseline_weight, weight_unit, notes, created_by, request_id)
  values (p_client_id, btrim(p_value->>'style'), (p_value->>'starts_on')::date, (p_value->>'ends_on')::date,
    (p_value->>'calorie_goal')::integer, (p_value->>'maintenance')::integer, (p_value->>'baseline_weight')::numeric,
    (p_value->>'weight_unit')::public.weight_unit, p_value->>'notes', auth.uid(), p_request_id) returning * into result;
  return to_jsonb(result);
end;
$$;

create function public.save_nutrition_entry(p_client_id uuid, p_kind text, p_date date, p_value jsonb, p_expected_version integer, p_request_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare previous jsonb; result jsonb; replay public.nutrition_entry_changes; staff boolean; today date;
begin
  if not private.can_log_nutrition(p_client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select (now() at time zone timezone)::date into today from public.clients where id = p_client_id for update;
  staff := private.staff_can_access_client(p_client_id);
  select * into replay from public.nutrition_entry_changes where request_id = p_request_id;
  if found then
    if replay.client_id <> p_client_id or replay.actor_id <> auth.uid() or replay.kind <> p_kind or replay.entry_date <> p_date or replay.request_value <> p_value then
      raise exception 'Retry does not match the original entry' using errcode = '22023';
    end if;
    return replay.after_value;
  end if;
  if p_kind is null or p_kind not in ('weight','nutrition') or p_date is null or p_date > today
    or p_date < date '1900-01-01' or p_expected_version is null or p_expected_version < 0 or p_request_id is null
    or jsonb_typeof(p_value) is distinct from 'object' then
    raise exception 'Invalid date or entry' using errcode = '22023';
  end if;
  if p_kind = 'weight' then
    if not (p_value ?& array['weight','unit']) or (p_value - array['weight','unit']) <> '{}'::jsonb
      or jsonb_typeof(p_value->'weight') is distinct from 'number' or p_value->>'unit' not in ('lb','kg') then
      raise exception 'Enter a weight and unit' using errcode = '22023';
    end if;
    select to_jsonb(w) into previous from public.bodyweight_logs w where client_id = p_client_id and measured_on = p_date;
  else
    if not (p_value ?& array['intake','output','notes']) or (p_value - array['intake','output','notes']) <> '{}'::jsonb
      or jsonb_typeof(p_value->'notes') is distinct from 'string'
      or jsonb_typeof(p_value->'intake') not in ('number','null') or jsonb_typeof(p_value->'output') not in ('number','null')
      or (p_value->>'intake')::numeric <> trunc((p_value->>'intake')::numeric)
      or (p_value->>'output')::numeric <> trunc((p_value->>'output')::numeric) then
      raise exception 'Calories must be whole numbers; leave unknown values blank' using errcode = '22023';
    end if;
    select to_jsonb(n) into previous from public.nutrition_logs n where client_id = p_client_id and activity_on = p_date;
  end if;
  if coalesce((previous->>'version')::integer, 0) <> p_expected_version then
    raise exception 'This entry changed elsewhere. Reload the saved entry before saving again.' using errcode = 'PT409';
  end if;
  if p_kind = 'weight' then
    insert into public.bodyweight_logs as w (client_id, measured_on, weight, unit, updated_by, updated_by_staff)
    values (p_client_id, p_date, (p_value->>'weight')::numeric, (p_value->>'unit')::public.weight_unit, auth.uid(), staff)
    on conflict (client_id, measured_on) do update set weight = excluded.weight, unit = excluded.unit,
      version = w.version + 1, updated_at = clock_timestamp(), updated_by = excluded.updated_by, updated_by_staff = excluded.updated_by_staff
    returning to_jsonb(w) into result;
  else
    insert into public.nutrition_logs as n (client_id, activity_on, intake, output, notes, updated_by, updated_by_staff)
    values (p_client_id, p_date, (p_value->>'intake')::integer, (p_value->>'output')::integer, p_value->>'notes', auth.uid(), staff)
    on conflict (client_id, activity_on) do update set intake = excluded.intake, output = excluded.output, notes = excluded.notes,
      version = n.version + 1, updated_at = clock_timestamp(), updated_by = excluded.updated_by, updated_by_staff = excluded.updated_by_staff
    returning to_jsonb(n) into result;
  end if;
  insert into public.nutrition_entry_changes(client_id, kind, entry_date, actor_id, by_staff, before_value, after_value, request_id, request_value)
  values (p_client_id, p_kind, p_date, auth.uid(), staff, previous, result, p_request_id, p_value);
  return result;
end;
$$;

create function public.get_nutrition(p_client_id uuid, p_through date default null)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare c public.clients; today date; through_date date; from_date date;
begin
  if not private.can_read_nutrition(p_client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select * into c from public.clients where id = p_client_id;
  today := (now() at time zone c.timezone)::date;
  if p_through < date '1900-01-28' then raise exception 'Choose a history date on or after January 28, 1900' using errcode = '22023'; end if;
  through_date := least(coalesce(p_through, today), today);
  from_date := through_date - 27;
  return jsonb_build_object('client_id', c.id, 'client_name', c.full_name, 'timezone', c.timezone, 'today', today,
    'from', from_date, 'through', through_date,
    'can_assign', private.staff_can_access_client(c.id) and exists(select 1 from public.service_enrollments where client_id = c.id and service = 'nutrition' and status <> 'ended' and archived_at is null),
    'can_log', private.can_log_nutrition(c.id),
    'targets', coalesce((select jsonb_agg(to_jsonb(t) - array['created_by','request_id','client_id'] order by starts_on desc) from public.nutrition_targets t where client_id = c.id), '[]'::jsonb),
    'weights', coalesce((select jsonb_agg(to_jsonb(w) - array['client_id','updated_by'] order by measured_on desc) from public.bodyweight_logs w where client_id = c.id and measured_on between from_date and through_date), '[]'::jsonb),
    'entries', coalesce((select jsonb_agg(to_jsonb(n) - array['client_id','updated_by'] order by activity_on desc) from public.nutrition_logs n where client_id = c.id and activity_on between from_date and through_date), '[]'::jsonb),
    'changes', coalesce((select jsonb_agg(v order by v.created_at desc) from (
      select id, kind, entry_date, created_at, by_staff, before_value - array['client_id','updated_by'] as before_value, after_value - array['client_id','updated_by'] as after_value
      from public.nutrition_entry_changes where client_id = c.id and entry_date between from_date and through_date order by created_at desc limit 100
    ) v), '[]'::jsonb));
end;
$$;
revoke all on function public.assign_nutrition_target(uuid,jsonb,uuid), public.save_nutrition_entry(uuid,text,date,jsonb,integer,uuid), public.get_nutrition(uuid,date) from public, anon;
grant execute on function public.assign_nutrition_target(uuid,jsonb,uuid), public.save_nutrition_entry(uuid,text,date,jsonb,integer,uuid), public.get_nutrition(uuid,date) to authenticated;
