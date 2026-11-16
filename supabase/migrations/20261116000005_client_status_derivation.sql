-- Client status outside "disabled" is derived, not chosen (FR-01, FR-02).
--
-- Reactivating a disabled client used to trust the browser's guess ("has an account, so active"),
-- but invite-client binds the account when the invite is sent, before the client ever signs in.
-- The database now records the first activation and derives every non-disabled status:
--   no bound account          -> pending
--   bound, never activated    -> invited
--   bound and activated once  -> active
-- Staff choose only between disabled and not disabled.

alter table public.clients add column activated_at timestamptz;

-- Every existing active client has activated. Disabled clients with an account are ambiguous;
-- assume they had activated, since disabling was only offered after an account existed.
update public.clients set activated_at = created_at
where status = 'active' or (status = 'disabled' and auth_user_id is not null);

alter table public.clients
  add constraint clients_active_was_activated check (status <> 'active' or activated_at is not null);

create or replace function private.derive_client_status()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.status <> 'disabled' then
    new.status := case
      when new.auth_user_id is null then 'pending'
      when new.activated_at is not null then 'active'
      else 'invited'
    end::public.client_status;
  end if;
  return new;
end;
$$;

revoke all on function private.derive_client_status() from public, anon, authenticated;

create trigger clients_derive_status
  before update of status, auth_user_id, activated_at on public.clients
  for each row execute function private.derive_client_status();

-- First sign-in records the activation; the trigger then makes the status active.
create or replace function public.mark_client_active()
returns void language sql security definer set search_path = ''
as $$
  update public.clients set status = 'active', activated_at = coalesce(activated_at, now())
  where auth_user_id = (select auth.uid()) and status = 'invited';
$$;
revoke all on function public.mark_client_active() from public, anon;
grant execute on function public.mark_client_active() to authenticated;
