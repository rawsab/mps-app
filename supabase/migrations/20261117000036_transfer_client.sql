-- Transferring a client to another coach (decision 0041, owner request). Admin only, like every
-- other change to a client record. The new primary coach takes over the outgoing primary coach's
-- assignment (and its publish permission); other assigned coaches keep theirs. Future PT sessions
-- and meetings follow through the existing primary-coach triggers (migrations 00030 and 00033).

-- Staff a client can be transferred to, named for a picker. Admin only.
create or replace function public.transfer_coach_options()
returns table (id uuid, name text, role public.staff_role)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'only an administrator can transfer clients' using errcode = '42501';
  end if;
  return query
    select sr.auth_user_id, coalesce(nullif(btrim(p.display_name), ''), u.email::text, 'Unnamed staff member'), sr.role
    from public.staff_roles sr
    left join public.profiles p on p.auth_user_id = sr.auth_user_id
    left join auth.users u on u.id = sr.auth_user_id
    order by 2;
end;
$$;

create or replace function public.transfer_client(p_client_id uuid, p_coach_id uuid)
returns void language plpgsql security definer set search_path = ''
as $$
declare
  c public.clients;
  target public.staff_role;
  publish boolean;
begin
  if not private.is_admin() then
    raise exception 'only an administrator can transfer clients' using errcode = '42501';
  end if;
  select * into c from public.clients where id = p_client_id for update;
  if not found then
    raise exception 'client not found' using errcode = 'P0002';
  end if;
  select role into target from public.staff_roles where auth_user_id = p_coach_id;
  if target is null then
    raise exception 'choose a coach or administrator to transfer to' using errcode = '22023';
  end if;
  if c.primary_coach_id is not distinct from p_coach_id then
    return; -- Already theirs: a retried transfer succeeds.
  end if;

  delete from public.coach_clients where coach_id = c.primary_coach_id and client_id = c.id
  returning can_publish into publish;
  -- Admins see every client already; only a coach needs an assignment row to reach this one.
  if target = 'coach' then
    insert into public.coach_clients (coach_id, client_id, can_publish)
    values (p_coach_id, c.id, coalesce(publish, false))
    on conflict (coach_id, client_id) do update set can_publish = public.coach_clients.can_publish or excluded.can_publish;
  end if;
  update public.clients set primary_coach_id = p_coach_id where id = c.id;
end;
$$;

revoke all on function public.transfer_coach_options() from public, anon, authenticated;
revoke all on function public.transfer_client(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_coach_options() to authenticated;
grant execute on function public.transfer_client(uuid, uuid) to authenticated;
