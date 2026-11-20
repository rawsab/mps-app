-- Restoring and permanently deleting archived programs (decision 0045). FR-04, FR-06, NFR-01.
--
-- Restore clears archived_at, under the same permission as archiving. The program's service must
-- still be live: an ended service has nothing to restore the program into.
--
-- Delete extends decision 0038's narrow exception from whole services to one archived program:
-- an administrator removes it with its revisions, content, and the client's logged workouts and
-- Stimulus & Fatigue answers for it. Daily nutrition logs belong to the client and are kept.
-- Both functions take either kind of program; ids are UUIDs, so they can't collide.

create or replace function public.restore_program(p_program_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  client uuid;
  enrollment uuid;
  archived timestamptz;
  nutrition boolean := false;
begin
  select client_id, enrollment_id, archived_at into client, enrollment, archived
    from public.programs where id = p_program_id for update;
  if not found then
    select client_id, enrollment_id, archived_at into client, enrollment, archived
      from public.nutrition_programs where id = p_program_id for update;
    nutrition := found;
  end if;
  if client is null or not coalesce(private.staff_can_publish_for_client(client), false) then
    raise exception 'program not found' using errcode = '42501';
  end if;
  if archived is null then
    return; -- Already restored: a retried restore succeeds.
  end if;
  if not exists (select 1 from public.service_enrollments where id = enrollment and status <> 'ended' and archived_at is null) then
    raise exception 'this program''s service has ended, so the program can''t be restored' using errcode = '55000';
  end if;
  if nutrition then
    update public.nutrition_programs set archived_at = null where id = p_program_id;
  else
    update public.programs set archived_at = null where id = p_program_id;
  end if;
end;
$$;

create or replace function public.delete_archived_program(p_program_id uuid)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  p record;
  nutrition boolean := false;
  workouts integer := 0;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can permanently delete programs' using errcode = '42501';
  end if;
  select id, archived_at into p from public.programs where id = p_program_id for update;
  if not found then
    select id, archived_at into p from public.nutrition_programs where id = p_program_id for update;
    if not found then
      return jsonb_build_object('deletedWorkouts', 0); -- Already gone: a retried delete succeeds.
    end if;
    nutrition := true;
  end if;
  if p.archived_at is null then
    raise exception 'archive the program before deleting it permanently' using errcode = '55000';
  end if;

  perform set_config('mps.purging_programs', 'on', true);
  if nutrition then
    update public.nutrition_programs set current_revision_id = null where id = p.id;
    delete from public.nutrition_program_revisions where program_id = p.id;
    delete from public.nutrition_programs where id = p.id;
  else
    -- Same order as delete_archived_service: workouts, the revision pointer, revisions, the program.
    delete from public.training_sessions where program_id = p.id;
    get diagnostics workouts = row_count;
    update public.programs set current_revision_id = null where id = p.id;
    delete from public.program_revisions where program_id = p.id;
    delete from public.programs where id = p.id;
  end if;
  perform set_config('mps.purging_programs', 'off', true);

  -- The pointer has no foreign key; clear it so no stale id is left behind.
  update public.service_enrollments set current_program_id = null where current_program_id = p.id;
  update public.service_enrollments set current_nutrition_program_id = null where current_nutrition_program_id = p.id;
  return jsonb_build_object('deletedWorkouts', workouts);
end;
$$;

revoke all on function public.restore_program(uuid), public.delete_archived_program(uuid) from public, anon, authenticated;
grant execute on function public.restore_program(uuid), public.delete_archived_program(uuid) to authenticated;
