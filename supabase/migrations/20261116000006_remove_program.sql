-- FR-04, FR-06, NFR-01: delete unpublished programs; archive programs with history.
-- Existing RLS/grants remain read-only. All writes use this checked function.
create or replace function public.remove_program(p_program_id uuid, p_expected_version integer, p_archive boolean default false)
returns text language plpgsql security definer set search_path = ''
as $$
declare
  program public.programs;
  draft_version integer;
begin
  select * into program from public.programs where id = p_program_id for update;
  if not found or not private.staff_can_access_client(program.client_id) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  select lock_version into draft_version from public.program_revisions
    where program_id = p_program_id and status = 'draft';
  if draft_version is distinct from p_expected_version then
    raise exception 'draft has changed' using errcode = 'PT409',
      detail = jsonb_build_object('currentVersion', draft_version)::text;
  end if;
  if p_archive then
    if not private.staff_can_publish_for_client(program.client_id) then
      raise exception 'not allowed to archive for this client' using errcode = '42501';
    end if;
    update public.programs set archived_at = coalesce(archived_at, now()) where id = p_program_id;
    return 'archived';
  end if;
  if exists (select 1 from public.program_revisions where program_id = p_program_id and status = 'published') then
    raise exception 'Published programs must be archived to preserve history' using errcode = '55000';
  end if;
  delete from public.program_revisions where program_id = p_program_id;
  delete from public.programs where id = p_program_id;
  return 'deleted';
end;
$$;
revoke all on function public.remove_program(uuid, integer, boolean) from public, anon, authenticated;
grant execute on function public.remove_program(uuid, integer, boolean) to authenticated;
