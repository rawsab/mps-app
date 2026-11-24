-- Duplicate a training program (owner request, 2026-11-24; decision 0061). The coach's routine for
-- personal training: go through a program with the client, copy it, change the copy, repeat.
--
-- The browser sends the copy's document with fresh node ids (copyProgramDraft), as the editor's
-- Duplicate week does, and save_draft validates it as for any save. With p_replace the source,
-- which must be published and live, is archived and the copy becomes the service's current
-- program, in the same transaction. The copy starts as a draft, so clients see it once published.
create or replace function public.duplicate_program(p_program_id uuid, p_draft jsonb, p_replace boolean default false)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  source public.programs;
  new_id uuid;
begin
  select * into source from public.programs where id = p_program_id for update;
  if not found or not private.staff_can_access_client(source.client_id) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  if p_replace then
    if source.archived_at is not null then
      raise exception 'this program is already archived' using errcode = '55000';
    end if;
    if not exists (select 1 from public.program_revisions where program_id = source.id and status = 'published') then
      raise exception 'only a published program can be archived' using errcode = '55000';
    end if;
    if not private.staff_can_publish_for_client(source.client_id) then
      raise exception 'not allowed to archive for this client' using errcode = '42501';
    end if;
  end if;

  -- create_program refuses an ended service; save_draft checks the document and its service.
  new_id := public.create_program(source.enrollment_id);
  perform public.save_draft(new_id, null, p_draft);

  if p_replace then
    update public.programs set archived_at = now() where id = source.id;
    update public.service_enrollments set current_program_id = new_id where id = source.enrollment_id;
  end if;
  return new_id;
end;
$$;

revoke all on function public.duplicate_program(uuid, jsonb, boolean) from public, anon, authenticated;
grant execute on function public.duplicate_program(uuid, jsonb, boolean) to authenticated;
