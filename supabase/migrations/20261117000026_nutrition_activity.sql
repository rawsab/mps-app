-- FR-03/09: client daily nutrition in Reviews, recent updates and the shared unread count.
-- One stable item per client / displayed weigh-in day; all writes come from the existing
-- attributed, transactional entry audit. Failed saves/retries cannot create phantom alerts.
create table public.nutrition_daily_activity (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  logged_on date not null,
  program_id uuid references public.nutrition_programs(id) on delete set null,
  client_activity_at timestamptz not null,
  unique(client_id,logged_on)
);
create index nutrition_daily_activity_client_time on public.nutrition_daily_activity(client_id,client_activity_at desc,id);
create table public.staff_nutrition_activity_seen (
  staff_id uuid not null references auth.users(id) on delete cascade,
  activity_id uuid not null references public.nutrition_daily_activity(id) on delete cascade,
  seen_at timestamptz not null,
  primary key(staff_id,activity_id)
);
alter table public.nutrition_daily_activity enable row level security;
alter table public.staff_nutrition_activity_seen enable row level security;
revoke all on public.nutrition_daily_activity,public.staff_nutrition_activity_seen from anon,authenticated;
grant select on public.nutrition_daily_activity,public.staff_nutrition_activity_seen to authenticated;
create policy nutrition_activity_staff_read on public.nutrition_daily_activity for select to authenticated
using (private.staff_can_access_client(client_id));
create policy nutrition_activity_seen_read on public.staff_nutrition_activity_seen for select to authenticated
using (staff_id=auth.uid() and private.is_staff());

create function private.record_nutrition_activity()
returns trigger language plpgsql security definer set search_path='' as $$
declare day date; program uuid;
begin
  if new.by_staff or not exists(select 1 from public.clients where id=new.client_id and auth_user_id=new.actor_id) then return new; end if;
  if new.kind='weight' then
    if new.before_value is not null and (new.before_value->'weight',new.before_value->'unit') is not distinct from (new.after_value->'weight',new.after_value->'unit') then return new; end if;
  else
    if new.after_value->>'intake' is null and new.after_value->>'output' is null then return new; end if;
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
revoke all on function private.record_nutrition_activity() from public,anon,authenticated;
create trigger nutrition_entry_activity after insert on public.nutrition_entry_changes for each row execute function private.record_nutrition_activity();

create function private.nutrition_activity(p_client_id uuid)
returns table(item jsonb,client_id uuid,client_name text,id uuid,activity_at timestamptz,unread boolean)
language sql stable set search_path='' as $$
  select jsonb_build_object('kind','nutrition','id',a.id,'programId',a.program_id,'service','nutrition',
    'programTitle',coalesce(r.program_style,'Nutritional programming'),'loggedOn',a.logged_on,'performedOn',a.logged_on,
    'status',case when w.weight is not null and n.intake is not null and n.output is not null then 'completed' else 'in_progress' end,
    'weight',w.weight,'weightUnit',w.unit,'intake',n.intake,'output',n.output,'activityAt',a.client_activity_at,
    'staffEdited',coalesce(w.updated_by_staff,false) or coalesce(n.updated_by_staff,false)),
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
create function private.all_staff_activity()
returns table(item jsonb,id uuid,activity_at timestamptz,unread boolean,kind text)
language sql stable set search_path='' as $$
  select private.activity_item(s.a)||jsonb_build_object('activityAt',s.client_activity_at,'clientId',s.client_id,'clientName',s.client_name,'unread',s.unread),
    s.id,s.client_activity_at,s.unread,private.activity_kind(s.a) from private.staff_activity() s
  union all
  select n.item||jsonb_build_object('clientId',n.client_id,'clientName',n.client_name,'unread',n.unread),n.id,n.activity_at,n.unread,'nutrition'
    from private.nutrition_activity(null) n;
$$;
revoke all on function private.nutrition_activity(uuid),private.all_staff_activity() from public,anon,authenticated;
grant execute on function private.nutrition_activity(uuid),private.all_staff_activity() to authenticated;

create or replace function public.get_staff_activity(p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 25,p_unread_only boolean default false)
returns jsonb language plpgsql stable set search_path='' as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode='22023'; end if;
  if (p_before_at is null)<>(p_before_id is null) then raise exception 'the cursor needs both a time and an id' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.activity_at desc,x.id desc),'[]'::jsonb) from (
    select * from private.all_staff_activity() a where (not coalesce(p_unread_only,false) or a.unread)
      and (p_before_at is null or (a.activity_at,a.id)<(p_before_at,p_before_id)) order by a.activity_at desc,a.id desc limit p_limit
  ) x);
end;
$$;
create or replace function public.count_unread_activity()
returns integer language plpgsql stable set search_path='' as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  return (select count(*)::integer from private.all_staff_activity() where unread);
end;
$$;
create or replace function public.get_review_summary()
returns jsonb language plpgsql stable set search_path='' as $$
begin
  if not private.is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  return (select jsonb_build_object('unread',count(*),'completed',count(*) filter(where kind='completed'),
    'logged',count(*) filter(where kind='logged'),'skipped',count(*) filter(where kind='skipped'),'started',count(*) filter(where kind='started'))
    ||case when count(*) filter(where kind='nutrition')>0 then jsonb_build_object('nutrition',count(*) filter(where kind='nutrition')) else '{}'::jsonb end
    from private.all_staff_activity() where unread);
end;
$$;
create or replace function public.get_client_activity(p_client_id uuid,p_before_at timestamptz default null,p_before_id uuid default null,p_limit integer default 10)
returns jsonb language plpgsql stable set search_path='' as $$
begin
  if p_client_id is null or not private.staff_can_access_client(p_client_id) then raise exception 'client not found' using errcode='42501'; end if;
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'limit must be between 1 and 100' using errcode='22023'; end if;
  if (p_before_at is null)<>(p_before_id is null) then raise exception 'the cursor needs both a time and an id' using errcode='22023'; end if;
  return (select coalesce(jsonb_agg(x.item order by x.activity_at desc,x.id desc),'[]'::jsonb) from (
    select * from (
      select private.activity_item(s::private.session_activity_row) as item,s.id,s.activity_at from private.session_activity(p_client_id) s
      union all select n.item,n.id,n.activity_at from private.nutrition_activity(p_client_id) n
    ) a where p_before_at is null or (a.activity_at,a.id)<(p_before_at,p_before_id)
    order by a.activity_at desc,a.id desc limit p_limit
  ) x);
end;
$$;
create function public.mark_nutrition_activity_read(p_activity_id uuid)
returns void language plpgsql security definer set search_path='' as $$
declare owner uuid;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  select client_id into owner from public.nutrition_daily_activity where id=p_activity_id;
  if owner is null or not private.staff_can_access_client(owner) then raise exception 'activity not found' using errcode='42501'; end if;
  insert into public.staff_nutrition_activity_seen values(auth.uid(),p_activity_id,clock_timestamp())
  on conflict(staff_id,activity_id) do update set seen_at=excluded.seen_at;
end;
$$;
create or replace function public.mark_activity_read(p_session_id uuid default null)
returns void language plpgsql security definer set search_path='' as $$
declare me uuid:=auth.uid(); owner uuid; at timestamptz:=clock_timestamp();
begin
  if me is null or not private.is_staff() then raise exception 'staff only' using errcode='42501'; end if;
  if p_session_id is null then
    insert into public.staff_activity_reads values(me,at) on conflict(staff_id) do update set read_through=excluded.read_through;
    delete from public.staff_activity_seen where staff_id=me and seen_at<=at;
    delete from public.staff_nutrition_activity_seen where staff_id=me and seen_at<=at;
    return;
  end if;
  select client_id into owner from public.training_sessions where id=p_session_id;
  if owner is null or not private.staff_can_access_client(owner) then raise exception 'session not found' using errcode='42501'; end if;
  insert into public.staff_activity_seen values(me,p_session_id,at) on conflict(staff_id,session_id) do update set seen_at=excluded.seen_at;
end;
$$;
revoke all on function public.mark_nutrition_activity_read(uuid) from public,anon,authenticated;
grant execute on function public.mark_nutrition_activity_read(uuid) to authenticated;
-- Existing public read functions retain their explicit authenticated-only grants on replacement.
