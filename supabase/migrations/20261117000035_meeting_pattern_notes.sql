-- Notes on repeating patterns (decision 0039, owner request). Staff only, like meeting notes.
-- Each meeting a pattern creates shows them beside its own notes. They're edited on their own
-- (save_meeting_schedule_notes) because changing the pattern itself starts a new one; a
-- "this and following" change carries them over.

create table public.meeting_schedule_notes (
  schedule_id uuid primary key references public.meeting_schedules (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.meeting_schedule_notes enable row level security;
revoke all on public.meeting_schedule_notes from anon, authenticated;
grant select on public.meeting_schedule_notes to authenticated;
create policy meeting_schedule_notes_select on public.meeting_schedule_notes for select to authenticated
  using ((select private.staff_can_access_client(client_id)));

drop function public.create_meeting_schedule(uuid, text[], integer, date, date, date, jsonb, jsonb);
create or replace function public.create_meeting_schedule(p_client_id uuid, p_services text[], p_cycle_weeks integer, p_anchor_on date,
  p_starts_on date, p_ends_on date, p_slots jsonb, p_programs jsonb default '{}', p_notes text default '')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  coach record;
  sch public.meeting_schedules;
begin
  if not private.staff_can_access_client(p_client_id) then
    raise exception 'client not found' using errcode = '42501';
  end if;
  coach := private.meeting_coach(p_client_id);
  sch := private.insert_meeting_schedule(p_client_id, private.meeting_services(p_client_id, p_services), coach.timezone,
    p_cycle_weeks, p_anchor_on, p_starts_on, p_ends_on, p_slots, p_programs, null);
  if nullif(btrim(p_notes), '') is not null then
    insert into public.meeting_schedule_notes (schedule_id, client_id, body, updated_by) values (sch.id, sch.client_id, btrim(p_notes), (select auth.uid()));
  end if;
  return private.schedule_document(sch.id);
end;
$$;

create or replace function public.change_meeting_schedule(p_schedule_id uuid, p_from date, p_services text[], p_cycle_weeks integer,
  p_anchor_on date, p_ends_on date, p_slots jsonb, p_programs jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  old public.meeting_schedules;
  coach record;
  services public.service_kind[];
  kept integer;
  sch public.meeting_schedules;
begin
  select * into old from public.meeting_schedules where id = p_schedule_id;
  if not found or not private.staff_can_access_client(old.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  coach := private.meeting_coach(old.client_id);
  services := private.meeting_services(old.client_id, p_services);
  kept := private.end_meeting_schedule_from(old.id, p_from);
  sch := private.insert_meeting_schedule(old.client_id, services, coach.timezone, p_cycle_weeks, p_anchor_on, p_from,
    p_ends_on, p_slots, p_programs, old.id);
  -- The pattern's notes carry over to the one that continues it.
  insert into public.meeting_schedule_notes (schedule_id, client_id, body, updated_by)
  select sch.id, n.client_id, n.body, (select auth.uid()) from public.meeting_schedule_notes n where n.schedule_id = old.id;
  return private.schedule_document(sch.id) || jsonb_build_object('keptMeetings', kept);
end;
$$;

create or replace function private.schedule_document(p_schedule_id uuid)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object('id', s.id, 'clientId', s.client_id, 'cycleWeeks', s.cycle_weeks, 'anchorOn', s.anchor_on,
    'startsOn', s.starts_on, 'endsOn', s.ends_on, 'timezone', s.timezone, 'replacesId', s.replaces_id,
    'services', to_jsonb(s.services),
    'programs', (select coalesce(jsonb_object_agg(p.service, coalesce(p.program_id, p.nutrition_program_id)), '{}'::jsonb)
      from public.meeting_schedule_programs p where p.schedule_id = s.id),
    -- Generating only while one of its services is active.
    'active', exists (select 1 from public.service_enrollments e where e.client_id = s.client_id and e.service = any (s.services)
      and e.status = 'active' and e.archived_at is null),
    -- RLS: staff only; clients get null.
    'notes', (select n.body from public.meeting_schedule_notes n where n.schedule_id = s.id),
    'slots', private.schedule_slots_json(s.id))
  from public.meeting_schedules s where s.id = p_schedule_id;
$$;

create or replace function private.meeting_document(a public.meetings)
returns jsonb language sql stable set search_path = ''
as $$
  select jsonb_build_object(
    'id', a.id, 'clientId', a.client_id, 'clientName', c.full_name, 'coachId', a.coach_id,
    'startsAt', a.starts_at, 'durationMinutes', a.duration_minutes, 'timezone', a.timezone,
    'status', a.status, 'modified', a.modified, 'services', to_jsonb(a.services), 'billable', a.billable,
    'programs', private.meeting_programs_json(a),
    'scheduleId', a.schedule_id, 'occurrenceOn', a.occurrence_on, 'cycleWeeks', s.cycle_weeks,
    'cancelledAt', a.cancelled_at, 'cancellationReason', a.cancellation_reason,
    'cancelledByClient', a.cancelled_by is not null and a.cancelled_by = c.auth_user_id,
    'meetingUrl', private.meeting_url_for(a.id),
    -- RLS: staff only; clients get null.
    'notes', (select n.body from public.meeting_notes n where n.meeting_id = a.id),
    'patternNotes', (select n.body from public.meeting_schedule_notes n where n.schedule_id = a.schedule_id),
    'request', (select private.meeting_request_document(r, a) from public.meeting_requests r
      where r.meeting_id = a.id order by r.created_at desc, r.id limit 1))
  from public.clients c
  left join public.meeting_schedules s on s.id = a.schedule_id
  where c.id = a.client_id;
$$;

-- Blank removes them.
create or replace function public.save_meeting_schedule_notes(p_schedule_id uuid, p_notes text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
begin
  select * into sch from public.meeting_schedules where id = p_schedule_id;
  if not found or not private.staff_can_access_client(sch.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  if nullif(btrim(p_notes), '') is null then
    delete from public.meeting_schedule_notes where schedule_id = sch.id;
  else
    insert into public.meeting_schedule_notes (schedule_id, client_id, body, updated_by, updated_at)
    values (sch.id, sch.client_id, btrim(p_notes), (select auth.uid()), now())
    on conflict (schedule_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  return private.schedule_document(sch.id);
exception
  when check_violation then
    raise exception 'notes are limited to 5000 characters' using errcode = '22023';
end;
$$;

revoke all on function public.create_meeting_schedule(uuid, text[], integer, date, date, date, jsonb, jsonb, text),
  public.save_meeting_schedule_notes(uuid, text) from public, anon, authenticated;
grant execute on function public.create_meeting_schedule(uuid, text[], integer, date, date, date, jsonb, jsonb, text),
  public.save_meeting_schedule_notes(uuid, text) to authenticated;
