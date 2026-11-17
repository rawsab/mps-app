-- Deleting archived services (decision 0038, owner request). Admin only, like every enrollment
-- change. Only an ended, archived service can go, and only when nothing hangs off it: programs and
-- nutrition programs already block deletion (on delete restrict), and PT patterns would otherwise
-- cascade into session history, so they block it here too. Browsers still get no DELETE grant.

create or replace function public.delete_archived_service(p_enrollment_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  e public.service_enrollments;
  programs integer;
  nutrition integer;
  patterns integer;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can delete services' using errcode = '42501';
  end if;
  select * into e from public.service_enrollments where id = p_enrollment_id for update;
  if not found then
    return; -- Already gone: a retried delete succeeds.
  end if;
  if e.status <> 'ended' or e.archived_at is null then
    raise exception 'only ended, archived services can be deleted' using errcode = '55000';
  end if;
  select count(*) into programs from public.programs where enrollment_id = e.id;
  select count(*) into nutrition from public.nutrition_programs where enrollment_id = e.id;
  select count(*) into patterns from public.pt_schedules where enrollment_id = e.id;
  if programs + nutrition + patterns > 0 then
    raise exception 'this service still has % linked: delete them first, or keep the service archived',
      concat_ws(', ',
        case when programs > 0 then programs || case when programs = 1 then ' program' else ' programs' end end,
        case when nutrition > 0 then nutrition || case when nutrition = 1 then ' nutrition program' else ' nutrition programs' end end,
        case when patterns > 0 then 'scheduled sessions' end)
      using errcode = 'PT409';
  end if;
  delete from public.service_enrollments where id = e.id;
end;
$$;

revoke all on function public.delete_archived_service(uuid) from public, anon, authenticated;
grant execute on function public.delete_archived_service(uuid) to authenticated;
