-- FR-09: staff can edit actuals from the working program sheet as well as its published view.
-- Client access to drafts, archive protection, date bounds and entry version checks remain intact.
alter table public.nutrition_logs
  add column intake_updated_by_staff boolean not null default false,
  add column output_updated_by_staff boolean not null default false;

-- Recover field attribution from retained history, falling back to legacy row attribution.
update public.nutrition_logs n set
  intake_updated_by_staff=coalesce((select ch.by_staff from public.nutrition_entry_changes ch
    where ch.client_id=n.client_id and ch.entry_date=n.activity_on and ch.kind='nutrition'
      and coalesce(ch.before_value->'intake','null'::jsonb) is distinct from coalesce(ch.after_value->'intake','null'::jsonb)
    order by ch.created_at desc,ch.id desc limit 1),n.intake is not null and n.updated_by_staff),
  output_updated_by_staff=coalesce((select ch.by_staff from public.nutrition_entry_changes ch
    where ch.client_id=n.client_id and ch.entry_date=n.activity_on and ch.kind='nutrition'
      and coalesce(ch.before_value->'output','null'::jsonb) is distinct from coalesce(ch.after_value->'output','null'::jsonb)
    order by ch.created_at desc,ch.id desc limit 1),n.output is not null and n.updated_by_staff);

-- Track who changed each value, preserving attribution on unchanged companion cells.
create function private.attribute_nutrition_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    new.intake_updated_by_staff := new.intake is not null and new.updated_by_staff;
    new.output_updated_by_staff := new.output is not null and new.updated_by_staff;
  else
    new.intake_updated_by_staff := case when new.intake is distinct from old.intake then new.updated_by_staff else old.intake_updated_by_staff end;
    new.output_updated_by_staff := case when new.output is distinct from old.output then new.updated_by_staff else old.output_updated_by_staff end;
  end if;
  return new;
end;
$$;
revoke all on function private.attribute_nutrition_fields() from public,anon,authenticated;
create trigger nutrition_field_attribution before insert or update on public.nutrition_logs
  for each row execute function private.attribute_nutrition_fields();

create or replace function public.get_nutrition_program(p_program_id uuid, p_published boolean default false)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions; c public.clients; staff boolean; from_date date; to_date date;
begin
  select * into p from public.nutrition_programs where id = p_program_id;
  if not found then raise exception 'Program not found' using errcode = '42501'; end if;
  staff := coalesce(private.staff_can_access_client(p.client_id),false);
  if not staff and not (coalesce(private.current_client_id() = p.client_id,false) and private.can_read_nutrition(p.client_id) and p.current_revision_id is not null) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if staff and not p_published then select * into r from public.nutrition_program_revisions where program_id = p.id and status = 'draft'; end if;
  if r.id is null then select * into r from public.nutrition_program_revisions where id = p.current_revision_id; end if;
  if r.id is null then raise exception 'No published nutrition program yet' using errcode = '42501'; end if;
  select * into c from public.clients where id = p.client_id;
  from_date := r.start_date - 6;
  to_date := r.start_date + r.week_count * 7 - 1;
  return jsonb_build_object('id',p.id,'client_id',c.id,'client_name',c.full_name,'today',(now() at time zone c.timezone)::date,
    'archived_at',p.archived_at,'current_revision_id',p.current_revision_id,
    'can_edit',staff and p.archived_at is null and not p_published,
    'can_publish',private.staff_can_publish_for_client(c.id) and p.archived_at is null and exists(select 1 from public.service_enrollments where id = p.enrollment_id and status <> 'ended' and archived_at is null),
    'can_log',private.can_log_nutrition(c.id) and p.archived_at is null and r.start_date is not null and (staff or coalesce(r.id = p.current_revision_id,false)),
    'revision',to_jsonb(r) - array['client_id','program_id','created_at','published_by'],
    'overlaps',coalesce((select jsonb_agg(jsonb_build_object('id',other.id,'program_style',nr.program_style,'start_date',nr.start_date,'end_date',nr.start_date+nr.week_count*7-1))
      from public.nutrition_programs other join lateral (
        select nr.* from public.nutrition_program_revisions nr where nr.program_id = other.id
          and ((staff and not p_published) or nr.id = other.current_revision_id)
          and nr.start_date <= to_date and nr.start_date+nr.week_count*7-1 >= r.start_date
        order by (nr.status = 'draft') desc limit 1
      ) nr on true
      where other.client_id = c.id and other.id <> p.id and other.archived_at is null and nr.start_date <= to_date and nr.start_date+nr.week_count*7-1 >= r.start_date),'[]'::jsonb),
    'weights',coalesce((select jsonb_agg(to_jsonb(w) - array['client_id','updated_by'] order by measured_on) from public.bodyweight_logs w where client_id = c.id and measured_on between from_date and to_date),'[]'::jsonb),
    'entries',coalesce((select jsonb_agg(to_jsonb(n) - array['client_id','updated_by'] order by activity_on) from public.nutrition_logs n where client_id = c.id and activity_on between r.start_date-1 and to_date-1),'[]'::jsonb),
    'changes',coalesce((select jsonb_agg(v order by v.created_at desc) from (
      select id,kind,entry_date,created_at,by_staff,before_value-array['client_id','updated_by'] as before_value,after_value-array['client_id','updated_by'] as after_value
      from public.nutrition_entry_changes where client_id=c.id and ((kind='weight' and entry_date between r.start_date and to_date) or (kind='nutrition' and entry_date between r.start_date-1 and to_date-1))
      order by created_at desc limit 100
    ) v),'[]'::jsonb));
end;
$$;

create or replace function public.save_nutrition_program_entries(p_program_id uuid, p_revision_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions; item jsonb; row_date date; staff boolean;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not private.can_log_nutrition(p.client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  staff := coalesce(private.staff_can_access_client(p.client_id),false);
  if not staff and p.current_revision_id is null then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p.archived_at is not null then raise exception 'This program is archived' using errcode = '55000'; end if;
  select * into r from public.nutrition_program_revisions where id = p_revision_id and program_id = p.id;
  if not found or (p.current_revision_id is distinct from p_revision_id and (not staff or r.status <> 'draft')) then
    raise exception 'The program changed. Reload the spreadsheet before saving.' using errcode = 'PT409';
  end if;
  if r.start_date is null then raise exception 'Set a Start Date before logging entries' using errcode = '22023'; end if;
  if jsonb_typeof(p_rows) is distinct from 'array' or jsonb_array_length(p_rows) not between 1 and 104 then raise exception 'Save between 1 and 104 entries at a time' using errcode = '22023'; end if;
  for item in select * from jsonb_array_elements(p_rows) loop
    row_date := private.draft_text(item,'row_date','')::date;
    if row_date < r.start_date or row_date >= r.start_date+r.week_count*7 or row_date > (select (now() at time zone timezone)::date from public.clients where id = p.client_id) then raise exception 'Entry is outside this program or in the future' using errcode = '22023'; end if;
    if private.draft_text(item,'kind','') not in ('weight','nutrition') then raise exception 'Unknown entry type' using errcode = '22023'; end if;
    if private.draft_number(item,'expected_version','') <> trunc(private.draft_number(item,'expected_version','')) then raise exception 'Entry version must be a whole number' using errcode = '22023'; end if;
    perform public.save_nutrition_entry(p.client_id,item->>'kind',case when item->>'kind' = 'nutrition' then row_date-1 else row_date end,
      item->'value',private.draft_number(item,'expected_version','')::integer,(private.draft_text(item,'request_id',''))::uuid);
  end loop;
end;
$$;

create or replace function private.nutrition_activity(p_client_id uuid)
returns table(item jsonb,client_id uuid,client_name text,id uuid,activity_at timestamptz,unread boolean)
language sql stable set search_path='' as $$
  select jsonb_build_object('kind','nutrition','id',a.id,'programId',a.program_id,'service','nutrition',
    'programTitle',coalesce(r.program_style,'Nutritional programming'),'loggedOn',a.logged_on,'performedOn',a.logged_on,
    'status',case when w.weight is not null and n.intake is not null and n.output is not null then 'completed' else 'in_progress' end,
    'weight',w.weight,'weightUnit',w.unit,'intake',n.intake,'output',n.output,'activityAt',a.client_activity_at,
    'staffEdited',coalesce(w.updated_by_staff,false) or coalesce(n.updated_by_staff,false) or coalesce(n.intake_updated_by_staff,false) or coalesce(n.output_updated_by_staff,false)),
    a.client_id,c.full_name,a.id,a.client_activity_at,
    a.client_activity_at > coalesce(greatest(reads.read_through,seen.seen_at),'-infinity'::timestamptz)
  from public.nutrition_daily_activity a join public.clients c on c.id=a.client_id
  left join public.nutrition_programs p on p.id=a.program_id
  left join public.nutrition_program_revisions r on r.id=p.current_revision_id
  left join public.bodyweight_logs w on w.client_id=a.client_id and w.measured_on=a.logged_on
  left join public.nutrition_logs n on n.client_id=a.client_id and n.activity_on=a.logged_on-1
  left join public.staff_activity_reads reads on reads.staff_id=auth.uid()
  left join public.staff_nutrition_activity_seen seen on seen.staff_id=auth.uid() and seen.activity_id=a.id
  where p_client_id is null or a.client_id=p_client_id;
$$;
-- Existing table RLS/read-only grants and function EXECUTE grants are preserved.
