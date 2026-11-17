-- FR-09: cleared weights retain their version as a null-valued record, never zero.
-- Keep existing RLS, grants, optimistic locking, request retries and before/after attribution.
alter table public.bodyweight_logs alter column weight drop not null;

create or replace function public.save_nutrition_entry(p_client_id uuid, p_kind text, p_date date, p_value jsonb, p_expected_version integer, p_request_id uuid)
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
      or jsonb_typeof(p_value->'weight') not in ('number','null') or p_value->>'unit' not in ('lb','kg') then
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

create or replace function private.record_nutrition_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare day date; program uuid;
begin
  if new.by_staff or not exists(select 1 from public.clients where id=new.client_id and auth_user_id=new.actor_id) then return new; end if;
  if new.kind='weight' then
    if new.after_value->>'weight' is null and (new.before_value is null or new.before_value->>'weight' is null) then return new; end if;
    if new.before_value is not null and (new.before_value->'weight',new.before_value->'unit') is not distinct from (new.after_value->'weight',new.after_value->'unit') then return new; end if;
  else
    if new.after_value->>'intake' is null and new.after_value->>'output' is null and (new.before_value is null or (new.before_value->>'intake' is null and new.before_value->>'output' is null)) then return new; end if;
    if new.before_value is not null and (new.before_value->'intake',new.before_value->'output',new.before_value->'notes') is not distinct from (new.after_value->'intake',new.after_value->'output',new.after_value->'notes') then return new; end if;
  end if;
  day := case when new.kind='weight' then new.entry_date else new.entry_date+1 end;
  select p.id into program from public.nutrition_programs p join public.nutrition_program_revisions r on r.id=p.current_revision_id
  where p.client_id=new.client_id and p.archived_at is null and day between r.start_date and r.start_date+r.week_count*7-1
  order by r.start_date desc,p.created_at desc,p.id limit 1;
  insert into public.nutrition_daily_activity(client_id,logged_on,program_id,client_activity_at)
  values(new.client_id,day,program,clock_timestamp())
  on conflict(client_id,logged_on) do update set program_id=coalesce(excluded.program_id,nutrition_daily_activity.program_id),client_activity_at=excluded.client_activity_at;
  return new;
end;
$$;
