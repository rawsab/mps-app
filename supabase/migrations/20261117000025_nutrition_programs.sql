-- FR-04/09/10: nutritional program lifecycle and protected spreadsheet access.
-- Daily actuals stay client/date records, shared by overlapping programs, separate from prescriptions.
create table public.nutrition_programs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  enrollment_id uuid not null,
  service public.service_kind not null default 'nutrition' check (service = 'nutrition'),
  current_revision_id uuid,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(id, client_id),
  foreign key(enrollment_id, client_id, service) references public.service_enrollments(id, client_id, service) on delete restrict
);
create table public.nutrition_program_revisions (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null,
  client_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  lock_version integer not null default 1 check (lock_version > 0),
  status public.revision_status not null default 'draft',
  program_style text not null default '' check (length(program_style) <= 160),
  start_date date check (start_date >= date '1900-01-01' and start_date <= date '9998-01-01'),
  week_count integer not null default 4 check (week_count between 1 and 52),
  maintenance integer check (maintenance between 0 and 30000),
  calorie_goal integer check (calorie_goal between 0 and 30000),
  notes text not null default '' check (length(notes) <= 5000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  published_at timestamptz, published_by uuid references auth.users(id),
  unique(program_id, revision_number), unique(id, program_id),
  foreign key(program_id, client_id) references public.nutrition_programs(id, client_id) on delete restrict,
  check ((status = 'published') = (published_at is not null))
);
alter table public.nutrition_programs add foreign key(current_revision_id, id) references public.nutrition_program_revisions(id, program_id);
create index nutrition_programs_client on public.nutrition_programs(client_id);
create unique index nutrition_programs_one_draft on public.nutrition_program_revisions(program_id) where status = 'draft';
create function private.freeze_nutrition_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if old.status = 'published' then raise exception 'Published nutrition revisions are immutable' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;
revoke all on function private.freeze_nutrition_revision() from public, anon, authenticated;
create trigger nutrition_revision_immutable before update or delete on public.nutrition_program_revisions
for each row execute function private.freeze_nutrition_revision();
alter table public.nutrition_programs enable row level security;
alter table public.nutrition_program_revisions enable row level security;
revoke all on public.nutrition_programs, public.nutrition_program_revisions from anon, authenticated;
grant select on public.nutrition_programs, public.nutrition_program_revisions to authenticated;
create policy nutrition_programs_read on public.nutrition_programs for select to authenticated using (
  private.staff_can_access_client(client_id) or (private.current_client_id() = client_id and current_revision_id is not null and private.can_read_nutrition(client_id))
);
create policy nutrition_revisions_read on public.nutrition_program_revisions for select to authenticated using (
  private.staff_can_access_client(client_id) or (private.current_client_id() = client_id and exists (
    select 1 from public.nutrition_programs p where p.id = program_id and p.current_revision_id = nutrition_program_revisions.id
  ))
);

create function public.create_nutrition_program(p_enrollment_id uuid, p_program_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare e public.service_enrollments; existing public.nutrition_programs;
begin
  select * into e from public.service_enrollments where id = p_enrollment_id;
  if not found or not coalesce(private.staff_can_access_client(e.client_id),false) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if e.service <> 'nutrition' or e.status = 'ended' or e.archived_at is not null then raise exception 'An active or paused nutrition service is required' using errcode = '55000'; end if;
  if p_program_id is null then raise exception 'Program id is required' using errcode = '22023'; end if;
  perform 1 from public.clients where id = e.client_id for update;
  select * into existing from public.nutrition_programs where id = p_program_id;
  if found then
    if existing.enrollment_id <> e.id then raise exception 'Program id is already in use' using errcode = '22023'; end if;
    return existing.id;
  end if;
  insert into public.nutrition_programs(id, client_id, enrollment_id, created_by) values(p_program_id, e.client_id, e.id, auth.uid());
  insert into public.nutrition_program_revisions(program_id, client_id, revision_number, start_date)
  select p_program_id, e.client_id, 1, (now() at time zone timezone)::date from public.clients where id = e.client_id;
  return p_program_id;
end;
$$;

create function public.save_nutrition_program_draft(p_program_id uuid, p_expected_version integer, p_value jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions; v_style text; v_start date; v_weeks numeric; v_maintenance numeric; v_goal numeric; v_notes text;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not coalesce(private.staff_can_access_client(p.client_id),false) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p.archived_at is not null then raise exception 'This program is archived' using errcode = '55000'; end if;
  perform private.draft_expect_object(p_value, '');
  if (p_value - array['program_style','start_date','week_count','maintenance','calorie_goal','notes']) <> '{}'::jsonb then raise exception 'Unknown nutrition program fields' using errcode = '22023'; end if;
  v_style := private.draft_text(p_value,'program_style','');
  v_start := private.draft_text(p_value,'start_date','',true)::date;
  v_weeks := private.draft_number(p_value,'week_count','');
  v_maintenance := private.draft_number(p_value,'maintenance','',true);
  v_goal := private.draft_number(p_value,'calorie_goal','',true);
  v_notes := private.draft_text(p_value,'notes','');
  if v_weeks <> trunc(v_weeks) or v_maintenance <> trunc(v_maintenance) or v_goal <> trunc(v_goal) then raise exception 'Weeks and calories must be whole numbers' using errcode = '22023'; end if;
  select * into r from public.nutrition_program_revisions where program_id = p.id and status = 'draft';
  if r.lock_version is distinct from p_expected_version then raise exception 'This draft changed elsewhere. Reload it before saving again.' using errcode = 'PT409'; end if;
  if r.id is null then
    insert into public.nutrition_program_revisions(program_id,client_id,revision_number)
    values(p.id,p.client_id,(select coalesce(max(revision_number),0)+1 from public.nutrition_program_revisions where program_id = p.id)) returning * into r;
  else
    update public.nutrition_program_revisions set lock_version = lock_version + 1 where id = r.id returning * into r;
  end if;
  update public.nutrition_program_revisions set program_style = v_style, start_date = v_start, week_count = v_weeks,
    maintenance = v_maintenance, calorie_goal = v_goal, notes = v_notes where id = r.id returning * into r;
  return to_jsonb(r) - array['client_id','program_id','created_at','published_by'];
end;
$$;

create function public.publish_nutrition_program(p_program_id uuid, p_expected_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not coalesce(private.staff_can_publish_for_client(p.client_id),false) then raise exception 'Not authorized to publish' using errcode = '42501'; end if;
  if p.archived_at is not null or exists(select 1 from public.service_enrollments where id = p.enrollment_id and (status = 'ended' or archived_at is not null)) then raise exception 'This program or service has ended' using errcode = '55000'; end if;
  select * into r from public.nutrition_program_revisions where program_id = p.id and status = 'draft';
  if r.id is null or r.lock_version is distinct from p_expected_version then raise exception 'This draft changed elsewhere. Reload it before publishing.' using errcode = 'PT409'; end if;
  if length(btrim(r.program_style)) = 0 or r.start_date is null or r.maintenance is null or r.calorie_goal is null then
    raise exception 'Program Style, Start Date, maintenance calories and calorie goal are required' using errcode = '22023';
  end if;
  update public.nutrition_program_revisions set status = 'published', published_at = clock_timestamp(), published_by = auth.uid() where id = r.id;
  update public.nutrition_programs set current_revision_id = r.id where id = p.id;
end;
$$;

create function public.remove_nutrition_program(p_program_id uuid, p_expected_version integer, p_archive boolean)
returns text language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; version integer;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not coalesce(private.staff_can_access_client(p.client_id),false) then raise exception 'Not authorized' using errcode = '42501'; end if;
  select lock_version into version from public.nutrition_program_revisions where program_id = p.id and status = 'draft';
  if version is distinct from p_expected_version then raise exception 'This draft changed elsewhere' using errcode = 'PT409'; end if;
  if p_archive then
    if not coalesce(private.staff_can_publish_for_client(p.client_id),false) then raise exception 'Not authorized to archive' using errcode = '42501'; end if;
    update public.nutrition_programs set archived_at = coalesce(archived_at,clock_timestamp()) where id = p.id;
    return 'archived';
  end if;
  if p.current_revision_id is not null then raise exception 'Published programs must be archived' using errcode = '55000'; end if;
  delete from public.nutrition_program_revisions where program_id = p.id;
  delete from public.nutrition_programs where id = p.id;
  return 'deleted';
end;
$$;

create function public.get_nutrition_program(p_program_id uuid, p_published boolean default false)
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
    'can_log',private.can_log_nutrition(c.id) and p.archived_at is null and coalesce(r.id = p.current_revision_id,false),
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

create function public.list_nutrition_programs(p_client_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if not private.can_read_nutrition(p_client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'program_style',r.program_style,'start_date',r.start_date,'week_count',r.week_count,'archived_at',p.archived_at,'published_at',r.published_at) order by r.start_date desc)
    from public.nutrition_programs p join public.nutrition_program_revisions r on r.id = p.current_revision_id where p.client_id = p_client_id),'[]'::jsonb);
end;
$$;

-- A bounded batch makes rectangular spreadsheet paste atomic. The underlying daily writer
-- retains its version checks, request-id retry behavior, and before/after attribution.
create function public.save_nutrition_program_entries(p_program_id uuid, p_revision_id uuid, p_rows jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare p public.nutrition_programs; r public.nutrition_program_revisions; item jsonb; row_date date;
begin
  select * into p from public.nutrition_programs where id = p_program_id for update;
  if not found or not private.can_log_nutrition(p.client_id) then raise exception 'Not authorized' using errcode = '42501'; end if;
  if p.archived_at is not null then raise exception 'This program is archived' using errcode = '55000'; end if;
  if p.current_revision_id is distinct from p_revision_id then raise exception 'The published program changed. Reload the spreadsheet before saving.' using errcode = 'PT409'; end if;
  select * into r from public.nutrition_program_revisions where id = p_revision_id;
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

-- Preserve targets already assigned before the program lifecycle existed. This copies them into
-- published program baselines without moving or duplicating any client actuals.
do $$
declare t public.nutrition_targets; enrollment uuid; program uuid; revision uuid; next_start date;
begin
  for t in select * from public.nutrition_targets order by client_id,starts_on loop
    select id into enrollment from public.service_enrollments where client_id = t.client_id and service = 'nutrition' order by (status <> 'ended') desc, starts_on desc limit 1;
    if enrollment is null then continue; end if;
    select min(starts_on) into next_start from public.nutrition_targets where client_id = t.client_id and starts_on > t.starts_on;
    insert into public.nutrition_programs(client_id,enrollment_id,created_by,created_at) values(t.client_id,enrollment,t.created_by,t.created_at) returning id into program;
    insert into public.nutrition_program_revisions(program_id,client_id,revision_number,program_style,start_date,week_count,maintenance,calorie_goal,notes,status,published_at,published_by)
    values(program,t.client_id,1,t.style,t.starts_on,
      least(52,greatest(1,ceil((coalesce(least(t.ends_on,next_start-1),t.starts_on+27)-t.starts_on+1)/7.0)))::integer,
      t.maintenance,t.calorie_goal,t.notes,'published',t.created_at,t.created_by) returning id into revision;
    update public.nutrition_programs set current_revision_id = revision where id = program;
  end loop;
end;
$$;
revoke all on function public.create_nutrition_program(uuid,uuid),public.save_nutrition_program_draft(uuid,integer,jsonb),public.publish_nutrition_program(uuid,integer),public.remove_nutrition_program(uuid,integer,boolean),public.get_nutrition_program(uuid,boolean),public.list_nutrition_programs(uuid),public.save_nutrition_program_entries(uuid,uuid,jsonb) from public,anon;
grant execute on function public.create_nutrition_program(uuid,uuid),public.save_nutrition_program_draft(uuid,integer,jsonb),public.publish_nutrition_program(uuid,integer),public.remove_nutrition_program(uuid,integer,boolean),public.get_nutrition_program(uuid,boolean),public.list_nutrition_programs(uuid),public.save_nutrition_program_entries(uuid,uuid,jsonb) to authenticated;
