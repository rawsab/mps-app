-- PT sessions, coach view (decision 0047, on top of 0037 and 0039): attendance, notes shared with
-- the client, and resources. Billing stays out.
--
-- - Attendance: record_attendance marks a started meeting completed or no-show. correct_attendance
--   changes a recorded one (to the other status, or back to "not recorded"), with an optional reason. Both
--   write meeting_attendance_changes, and the frozen-meeting guard only lets a recorded status move
--   when that audit row exists in the same transaction.
-- - Shared notes: their own table, so no change to the staff-only meeting_notes policy can expose
--   private notes.
-- - Resources: files in the private meeting-resources bucket under {client}/{meeting}/{uuid}.ext, or
--   https links. Always shared with the client. Clients read files through signed URLs.
-- - Ending a pattern also keeps meetings with shared notes, resources or recorded attendance.

-- ---------------------------------------------------------------------------
-- Attendance
-- ---------------------------------------------------------------------------
create table public.meeting_attendance_changes (
  id uuid primary key default gen_random_uuid(),
  -- Orders changes made within one transaction, which share changed_at.
  seq bigint generated always as identity,
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  from_status public.meeting_status not null,
  to_status public.meeting_status not null,
  reason text not null default '' check (char_length(reason) <= 1000),
  changed_by uuid references auth.users (id) on delete set null,
  changed_at timestamptz not null default now(),
  check (from_status <> to_status),
  check (from_status in ('scheduled', 'completed', 'no_show') and to_status in ('scheduled', 'completed', 'no_show'))
);
create index meeting_attendance_changes_meeting on public.meeting_attendance_changes (meeting_id, seq);

-- As migration 00030, except that a recorded status may move when this transaction audited it.
create or replace function private.guard_pt_appointment()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.client_id, new.schedule_id, new.slot_id, new.occurrence_on)
      is distinct from (old.client_id, old.schedule_id, old.slot_id, old.occurrence_on) then
    raise exception 'a session keeps its client and pattern' using errcode = '55000';
  end if;
  if old.status in ('completed', 'no_show') and (new.status, new.starts_at, new.duration_minutes, new.coach_id)
      is distinct from (old.status, old.starts_at, old.duration_minutes, old.coach_id) then
    if (new.starts_at, new.duration_minutes, new.coach_id) is not distinct from (old.starts_at, old.duration_minutes, old.coach_id)
        and exists (select 1 from public.meeting_attendance_changes c
          where c.meeting_id = new.id and c.from_status = old.status and c.to_status = new.status and c.changed_at = now()) then
      return new;
    end if;
    raise exception 'attended and no-show sessions cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function private.write_attendance(a public.meetings, p_status public.meeting_status, p_reason text)
returns public.meetings language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.meeting_attendance_changes (meeting_id, client_id, from_status, to_status, reason, changed_by)
  values (a.id, a.client_id, a.status, p_status, p_reason, (select auth.uid()));
  update public.meetings set status = p_status, updated_by = (select auth.uid()) where id = a.id returning * into a;
  return a;
end;
$$;

create or replace function public.record_attendance(p_meeting_id uuid, p_status text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
begin
  if p_status is null or p_status not in ('completed', 'no_show') then
    raise exception 'attendance is completed or no_show' using errcode = '22023';
  end if;
  if a.status <> 'scheduled' then
    raise exception 'attendance is already recorded, or the meeting was cancelled' using errcode = '55000';
  end if;
  if a.starts_at > now() then
    raise exception 'attendance can be recorded once the meeting has started' using errcode = '55000';
  end if;
  perform private.require_no_pending_request(a.id);
  a := private.write_attendance(a, p_status::public.meeting_status, '');
  return private.meeting_document(a);
end;
$$;

-- 'scheduled' sets a past meeting back to "not recorded". The reason is optional.
create or replace function public.correct_attendance(p_meeting_id uuid, p_status text, p_reason text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  reason text := btrim(coalesce(p_reason, ''));
begin
  if p_status is null or p_status not in ('completed', 'no_show', 'scheduled') then
    raise exception 'attendance is completed, no_show or scheduled' using errcode = '22023';
  end if;
  if a.status not in ('completed', 'no_show') then
    raise exception 'only recorded attendance can be corrected' using errcode = '55000';
  end if;
  if a.status::text = p_status then
    raise exception 'attendance is already %', p_status using errcode = '22023';
  end if;
  if char_length(reason) > 1000 then
    raise exception 'keep the reason under 1000 characters' using errcode = '22023';
  end if;
  a := private.write_attendance(a, p_status::public.meeting_status, reason);
  return private.meeting_document(a);
end;
$$;

-- ---------------------------------------------------------------------------
-- Shared notes
-- ---------------------------------------------------------------------------
create table public.meeting_shared_notes (
  meeting_id uuid primary key references public.meetings (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 5000),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);

create or replace function public.save_meeting_shared_notes(p_meeting_id uuid, p_notes text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
begin
  if nullif(btrim(p_notes), '') is null then
    delete from public.meeting_shared_notes where meeting_id = a.id;
  else
    insert into public.meeting_shared_notes (meeting_id, client_id, body, updated_by, updated_at)
    values (a.id, a.client_id, btrim(p_notes), (select auth.uid()), now())
    on conflict (meeting_id) do update set body = excluded.body, updated_by = excluded.updated_by, updated_at = excluded.updated_at;
  end if;
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'notes are limited to 5000 characters' using errcode = '22023';
end;
$$;

-- ---------------------------------------------------------------------------
-- Resources
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('meeting-resources', 'meeting-resources', false, 52428800, array[
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime', 'video/webm', 'application/pdf']);

create table public.meeting_resources (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null,
  client_id uuid not null,
  kind text not null check (kind in ('file', 'link')),
  title text not null check (char_length(title) between 1 and 200),
  -- file: the object in meeting-resources; link: an https URL.
  storage_path text unique,
  mime_type text,
  size_bytes bigint,
  url text check (url is null or (char_length(url) <= 2000 and url ~ '^https://[^\s]+$')),
  created_by uuid references auth.users (id) on delete set null,
  -- Clock time, so resources added together keep the order they were added in.
  created_at timestamptz not null default clock_timestamp(),
  foreign key (meeting_id, client_id) references public.meetings (id, client_id) on delete cascade,
  check ((kind = 'file') = (storage_path is not null and mime_type is not null and size_bytes is not null) and (kind = 'link') = (url is not null))
);
create index meeting_resources_meeting on public.meeting_resources (meeting_id, created_at);

create or replace function private.max_meeting_resources()
returns integer language sql immutable set search_path = ''
as $$ select 20 $$;

-- The client a meeting-resources object path belongs to, or null unless it is exactly
-- {client}/{meeting}/{uuid}.{ext} for a meeting of that client.
create or replace function private.meeting_resource_client(p_name text)
returns uuid language plpgsql stable security definer set search_path = ''
as $$
declare
  parts text[];
  found_client uuid;
begin
  if p_name is null or p_name !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp|gif|mp4|mov|webm|pdf)$' then
    return null;
  end if;
  parts := string_to_array(p_name, '/');
  select m.client_id into found_client from public.meetings m where m.id = parts[2]::uuid and m.client_id = parts[1]::uuid;
  return found_client;
exception
  when invalid_text_representation then return null;
end;
$$;

create or replace function private.check_resource_room(p_meeting_id uuid)
returns void language plpgsql stable security definer set search_path = ''
as $$
begin
  if (select count(*) from public.meeting_resources where meeting_id = p_meeting_id) >= private.max_meeting_resources() then
    raise exception 'a meeting can have up to % resources', private.max_meeting_resources() using errcode = '22023';
  end if;
end;
$$;

-- Records a file the browser has already uploaded to the meeting's folder.
create or replace function public.add_meeting_resource(p_meeting_id uuid, p_path text, p_title text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  obj storage.objects;
begin
  if private.meeting_resource_client(p_path) is distinct from a.client_id or split_part(p_path, '/', 2) <> a.id::text then
    raise exception 'upload the file to this meeting''s folder first' using errcode = '22023';
  end if;
  select * into obj from storage.objects where bucket_id = 'meeting-resources' and name = p_path;
  if not found then
    raise exception 'upload the file to this meeting''s folder first' using errcode = '22023';
  end if;
  perform private.check_resource_room(a.id);
  insert into public.meeting_resources (meeting_id, client_id, kind, title, storage_path, mime_type, size_bytes, created_by)
  values (a.id, a.client_id, 'file', btrim(coalesce(p_title, '')), p_path,
    coalesce(obj.metadata->>'mimetype', 'application/octet-stream'), coalesce((obj.metadata->>'size')::bigint, 0), (select auth.uid()));
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'give the resource a title of up to 200 characters' using errcode = '22023';
  when unique_violation then
    raise exception 'that file is already attached' using errcode = '22023';
end;
$$;

create or replace function public.add_meeting_link(p_meeting_id uuid, p_url text, p_title text)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  link text := btrim(coalesce(p_url, ''));
begin
  if link !~ '^https://[^\s]+$' or char_length(link) > 2000 then
    raise exception 'links start with https://' using errcode = '22023';
  end if;
  perform private.check_resource_room(a.id);
  insert into public.meeting_resources (meeting_id, client_id, kind, title, url, created_by)
  values (a.id, a.client_id, 'link', btrim(coalesce(nullif(btrim(p_title), ''), link)), link, (select auth.uid()));
  return private.meeting_document(a);
exception
  when check_violation then
    raise exception 'give the link a title of up to 200 characters' using errcode = '22023';
end;
$$;

-- Removes the row and returns the stored file's path (or null for a link). The browser then deletes
-- the file through the Storage API, which is the only way Storage allows.
create or replace function public.remove_meeting_resource(p_resource_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  r public.meeting_resources;
  a public.meetings;
begin
  select * into r from public.meeting_resources where id = p_resource_id;
  if not found then
    raise exception 'resource not found' using errcode = '42501';
  end if;
  a := private.staff_meeting(r.meeting_id);
  delete from public.meeting_resources where id = r.id;
  return jsonb_build_object('storagePath', r.storage_path, 'meeting', private.meeting_document(a));
end;
$$;

create policy meeting_resources_object_select on storage.objects for select to authenticated using (
  bucket_id = 'meeting-resources' and (
    (select private.staff_can_access_client(private.meeting_resource_client(name)))
    or exists (select 1 from public.meeting_resources r
      where r.storage_path = storage.objects.name and r.client_id = (select private.current_client_id()))
  )
);
create policy meeting_resources_object_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'meeting-resources' and (select private.staff_can_access_client(private.meeting_resource_client(name)))
);
create policy meeting_resources_object_delete on storage.objects for delete to authenticated using (
  bucket_id = 'meeting-resources' and (select private.staff_can_access_client(private.meeting_resource_client(name)))
);
-- No update policy: files are replaced by removing and adding.

-- ---------------------------------------------------------------------------
-- Documents and lists
-- ---------------------------------------------------------------------------
-- As migration 00038, plus shared notes, resources and the attendance audit (staff only by RLS).
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
    'sharedNotes', (select n.body from public.meeting_shared_notes n where n.meeting_id = a.id),
    'resources', coalesce((select jsonb_agg(jsonb_build_object(
        'id', r.id, 'kind', r.kind, 'title', r.title, 'storagePath', r.storage_path, 'mimeType', r.mime_type,
        'sizeBytes', r.size_bytes, 'url', r.url, 'createdAt', r.created_at) order by r.created_at, r.id)
      from public.meeting_resources r where r.meeting_id = a.id), '[]'::jsonb),
    -- RLS: staff only; clients get an empty list.
    'attendanceChanges', coalesce((select jsonb_agg(jsonb_build_object(
        'fromStatus', x.from_status, 'toStatus', x.to_status, 'reason', x.reason, 'changedAt', x.changed_at,
        'changedByName', private.meeting_coach_card(x.changed_by)->>'coachName') order by x.seq)
      from public.meeting_attendance_changes x where x.meeting_id = a.id), '[]'::jsonb),
    'request', (select private.meeting_request_document(r, a) from public.meeting_requests r
      where r.meeting_id = a.id order by r.created_at desc, r.id limit 1))
    || coalesce(private.meeting_coach_card(a.coach_id), jsonb_build_object('coachName', null, 'coachAvatarPath', null))
  from public.clients c
  left join public.meeting_schedules s on s.id = a.schedule_id
  where c.id = a.client_id;
$$;

-- Started meetings, newest first, paged by (starts_at, id). RLS limits them to the caller.
create or replace function public.list_past_meetings(p_client_id uuid, p_before_at timestamptz default null,
  p_before_id uuid default null, p_limit integer default 25)
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if p_limit is null or p_limit not between 1 and 100 then
    raise exception 'choose a page of 1 to 100 meetings' using errcode = '22023';
  end if;
  return (
    select coalesce(jsonb_agg(private.meeting_document(m) order by m.starts_at desc, m.id desc), '[]'::jsonb)
    from (
      select * from public.meetings a
      where a.client_id = p_client_id and a.starts_at <= now()
        and (p_before_at is null or (a.starts_at, a.id) < (p_before_at, p_before_id))
      order by a.starts_at desc, a.id desc
      limit p_limit
    ) m
  );
end;
$$;

-- Meetings that have ended without attendance, oldest first, for the Meetings page to-dos.
create or replace function public.list_meetings_needing_attendance()
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', m.id, 'clientId', m.client_id, 'clientName', c.full_name, 'startsAt', m.starts_at,
      'durationMinutes', m.duration_minutes, 'services', m.services
    ) order by m.starts_at, m.id), '[]'::jsonb)
    from public.meetings m
    join public.clients c on c.id = m.client_id
    where m.status = 'scheduled' and m.starts_at + make_interval(mins => m.duration_minutes) <= now()
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Pattern changes keep meetings with shared notes, resources or attendance
-- ---------------------------------------------------------------------------
create or replace function private.meeting_has_history(p_meeting_id uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.meeting_requests r where r.meeting_id = p_meeting_id)
    or exists (select 1 from public.meeting_notes n where n.meeting_id = p_meeting_id)
    or exists (select 1 from public.meeting_shared_notes n where n.meeting_id = p_meeting_id)
    or exists (select 1 from public.meeting_resources r where r.meeting_id = p_meeting_id)
    or exists (select 1 from public.meeting_attendance_changes x where x.meeting_id = p_meeting_id);
$$;

-- As migration 00033, with private.meeting_has_history deciding what stays.
create or replace function private.end_meeting_schedule_from(p_schedule_id uuid, p_from date)
returns integer language plpgsql security definer set search_path = ''
as $$
declare
  sch public.meeting_schedules;
  kept integer;
begin
  select * into sch from public.meeting_schedules where id = p_schedule_id for update;
  if not found or not private.staff_can_access_client(sch.client_id) then
    raise exception 'schedule not found' using errcode = '42501';
  end if;
  if p_from is null or p_from < sch.starts_on or p_from < (now() at time zone sch.timezone)::date then
    raise exception 'choose a date from today and within the pattern' using errcode = '22023';
  end if;
  if sch.ends_on is not null and sch.ends_on < p_from then
    raise exception 'this pattern has already ended' using errcode = '55000';
  end if;
  if exists (select 1 from public.meetings a
      join public.meeting_requests r on r.meeting_id = a.id and r.status = 'pending'
      where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and a.starts_at > now()) then
    raise exception 'respond to the client''s requests for the affected meetings first' using errcode = 'PT409';
  end if;
  delete from public.meetings a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from and a.status = 'scheduled' and not a.modified and a.starts_at > now()
    and not private.meeting_has_history(a.id);
  select count(*) into kept from public.meetings a
  where a.schedule_id = sch.id and a.occurrence_on >= p_from
    and (a.modified or a.status in ('completed', 'no_show') or private.meeting_has_history(a.id));
  update public.meeting_schedules set ends_on = p_from - 1, updated_by = (select auth.uid()) where id = sch.id;
  return kept;
end;
$$;

-- ---------------------------------------------------------------------------
-- RLS and grants
-- ---------------------------------------------------------------------------
alter table public.meeting_attendance_changes enable row level security;
alter table public.meeting_shared_notes enable row level security;
alter table public.meeting_resources enable row level security;

create policy meeting_attendance_changes_select on public.meeting_attendance_changes for select to authenticated
  using ((select private.staff_can_access_client(client_id)));
create policy meeting_shared_notes_select on public.meeting_shared_notes for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));
create policy meeting_resources_select on public.meeting_resources for select to authenticated
  using (client_id = (select private.current_client_id()) or (select private.staff_can_access_client(client_id)));

revoke all on public.meeting_attendance_changes, public.meeting_shared_notes, public.meeting_resources from anon, authenticated;
grant select on public.meeting_attendance_changes, public.meeting_shared_notes, public.meeting_resources to authenticated;

revoke all on function private.write_attendance(public.meetings, public.meeting_status, text), private.max_meeting_resources(),
  private.meeting_resource_client(text), private.check_resource_room(uuid), private.meeting_has_history(uuid)
  from public, anon, authenticated;
-- Storage policies call this one as the signed-in user.
grant execute on function private.meeting_resource_client(text) to authenticated;

revoke all on function public.record_attendance(uuid, text), public.correct_attendance(uuid, text, text),
  public.save_meeting_shared_notes(uuid, text), public.add_meeting_resource(uuid, text, text), public.add_meeting_link(uuid, text, text),
  public.remove_meeting_resource(uuid), public.list_past_meetings(uuid, timestamptz, uuid, integer), public.list_meetings_needing_attendance()
  from public, anon, authenticated;
grant execute on function public.record_attendance(uuid, text), public.correct_attendance(uuid, text, text),
  public.save_meeting_shared_notes(uuid, text), public.add_meeting_resource(uuid, text, text), public.add_meeting_link(uuid, text, text),
  public.remove_meeting_resource(uuid), public.list_past_meetings(uuid, timestamptz, uuid, integer), public.list_meetings_needing_attendance()
  to authenticated;
