-- Undo for attendance (decision 0048, owner request): Undo takes back the caller's own latest
-- attendance change instead of logging a correction, so neither the change nor its undo stays in the
-- audit. Only the most recent change on the meeting, made by the caller within the last 15 minutes,
-- can be undone; anything older is corrected as usual (correct_attendance, audited).

-- As migration 00046, plus a transaction-local flag that undo_attendance sets while it reverts a
-- recorded status whose audit row it is deleting.
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
        and (coalesce(current_setting('mps.undoing_attendance', true), '') = new.id::text
          or exists (select 1 from public.meeting_attendance_changes c
            where c.meeting_id = new.id and c.from_status = old.status and c.to_status = new.status and c.changed_at = now())) then
      return new;
    end if;
    raise exception 'attended and no-show sessions cannot be changed' using errcode = '55000';
  end if;
  return new;
end;
$$;

create or replace function public.undo_attendance(p_meeting_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  a public.meetings := private.staff_meeting(p_meeting_id);
  latest public.meeting_attendance_changes;
begin
  select * into latest from public.meeting_attendance_changes where meeting_id = a.id order by seq desc limit 1;
  if not found or latest.to_status <> a.status or latest.changed_by is distinct from (select auth.uid())
      or latest.changed_at < now() - interval '15 minutes' then
    raise exception 'this change can no longer be undone; correct the attendance instead' using errcode = '55000';
  end if;
  delete from public.meeting_attendance_changes where id = latest.id;
  perform set_config('mps.undoing_attendance', a.id::text, true);
  update public.meetings set status = latest.from_status, updated_by = (select auth.uid()) where id = a.id returning * into a;
  perform set_config('mps.undoing_attendance', '', true);
  return private.meeting_document(a);
end;
$$;

revoke all on function public.undo_attendance(uuid) from public, anon, authenticated;
grant execute on function public.undo_attendance(uuid) to authenticated;
