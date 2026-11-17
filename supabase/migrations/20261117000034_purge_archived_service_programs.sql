-- Deleting an archived service together with its programs (decision 0038, revised on owner request).
--
-- Published revisions are immutable (roadmap invariant): their guards refuse updates and deletes.
-- The owner chose to let an administrator delete an ended, archived service with everything under
-- it: its programs (published or not), their revisions and content, and the client's logged
-- workouts and Stimulus & Fatigue answers for them. Daily nutrition logs belong to the client, not a
-- program, and are kept.
--
-- The exception is narrow: delete_archived_service sets a transaction-local flag, and the guards
-- honour it for DELETE only. Published content still can't be edited, and browsers have no DELETE
-- grant on any of these tables, so only this function can reach the flag's effect.

create or replace function private.purging_programs()
returns boolean language sql stable set search_path = ''
as $$ select coalesce(current_setting('mps.purging_programs', true), '') = 'on' $$;

create or replace function private.guard_revision()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'published' and not private.purging_programs() then
      raise exception 'published revision % is immutable', old.id using errcode = '55000';
    end if;
    return old;
  end if;
  if old.status = 'published' then
    raise exception 'published revision % is immutable', old.id using errcode = '55000';
  end if;
  if new.program_id <> old.program_id or new.client_id <> old.client_id
     or new.revision_number <> old.revision_number then
    raise exception 'revision identity cannot change' using errcode = '55000';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.guard_revision_content()
returns trigger language plpgsql set search_path = ''
as $$
declare
  rev uuid;
  rev_status public.revision_status;
begin
  if tg_op = 'DELETE' and private.purging_programs() then
    return old;
  end if;
  foreach rev in array array_remove(array[
    case when tg_op <> 'INSERT' then old.revision_id end,
    case when tg_op <> 'DELETE' then new.revision_id end], null)
  loop
    select status into rev_status from public.program_revisions where id = rev;
    if rev_status = 'published' then
      raise exception 'content of published revision % is immutable', rev using errcode = '55000';
    end if;
  end loop;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.freeze_nutrition_revision()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' and private.purging_programs() then return old; end if;
  if old.status = 'published' then raise exception 'Published nutrition revisions are immutable' using errcode = '55000'; end if;
  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

-- What deleting the service with its programs would remove, for the confirmation. Admin only.
create or replace function public.archived_service_contents(p_enrollment_id uuid)
returns jsonb language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an administrator can delete services' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'programs', (select count(*) from public.programs where enrollment_id = p_enrollment_id)
      + (select count(*) from public.nutrition_programs where enrollment_id = p_enrollment_id),
    'published', (select count(*) from public.programs where enrollment_id = p_enrollment_id and current_revision_id is not null)
      + (select count(*) from public.nutrition_programs where enrollment_id = p_enrollment_id and current_revision_id is not null),
    'loggedWorkouts', (select count(*) from public.training_sessions s join public.programs p on p.id = s.program_id
      where p.enrollment_id = p_enrollment_id));
end;
$$;

drop function public.delete_archived_service(uuid);

-- p_delete_programs false keeps the old rule: refuse while anything is linked.
create or replace function public.delete_archived_service(p_enrollment_id uuid, p_delete_programs boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  e public.service_enrollments;
  programs integer;
  nutrition integer;
  workouts integer;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can delete services' using errcode = '42501';
  end if;
  select * into e from public.service_enrollments where id = p_enrollment_id for update;
  if not found then
    return jsonb_build_object('deletedPrograms', 0, 'deletedWorkouts', 0); -- Already gone: a retried delete succeeds.
  end if;
  if e.status <> 'ended' or e.archived_at is null then
    raise exception 'only ended, archived services can be deleted' using errcode = '55000';
  end if;
  select count(*) into programs from public.programs where enrollment_id = e.id;
  select count(*) into nutrition from public.nutrition_programs where enrollment_id = e.id;
  if programs + nutrition > 0 and not coalesce(p_delete_programs, false) then
    raise exception 'this service still has % linked: delete them first, or keep the service archived',
      concat_ws(', ',
        case when programs > 0 then programs || case when programs = 1 then ' program' else ' programs' end end,
        case when nutrition > 0 then nutrition || case when nutrition = 1 then ' nutrition program' else ' nutrition programs' end end)
      using errcode = 'PT409';
  end if;

  perform set_config('mps.purging_programs', 'on', true);
  -- Logged workouts first (their sets and feedback cascade), then the pointers that keep revisions
  -- referenced, then revisions (content cascades), then the programs.
  delete from public.training_sessions s using public.programs p where p.id = s.program_id and p.enrollment_id = e.id;
  get diagnostics workouts = row_count;
  update public.programs set current_revision_id = null where enrollment_id = e.id and current_revision_id is not null;
  update public.nutrition_programs set current_revision_id = null where enrollment_id = e.id and current_revision_id is not null;
  delete from public.program_revisions r using public.programs p where p.id = r.program_id and p.enrollment_id = e.id;
  delete from public.nutrition_program_revisions r using public.nutrition_programs p where p.id = r.program_id and p.enrollment_id = e.id;
  delete from public.programs where enrollment_id = e.id;
  delete from public.nutrition_programs where enrollment_id = e.id;
  perform set_config('mps.purging_programs', 'off', true);

  delete from public.service_enrollments where id = e.id;
  return jsonb_build_object('deletedPrograms', programs + nutrition, 'deletedWorkouts', workouts);
end;
$$;

revoke all on function private.purging_programs() from public, anon;
grant execute on function private.purging_programs() to authenticated;
revoke all on function public.archived_service_contents(uuid), public.delete_archived_service(uuid, boolean) from public, anon, authenticated;
grant execute on function public.archived_service_contents(uuid), public.delete_archived_service(uuid, boolean) to authenticated;
