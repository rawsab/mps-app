-- Private coaching notes (PRD §4 access matrix, FR-11: stored separately from client-visible
-- content). Pulled forward from roadmap migration step 5 so the New client form can record quick
-- notes (discounts, accessibility needs, reminders). Staff only: clients never read these, not
-- even their own.

create table public.private_coach_notes (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 5000),
  -- Set from the caller's token; not client-writable, so authorship can't be forged.
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index private_coach_notes_client on public.private_coach_notes (client_id, created_at desc);

create trigger private_coach_notes_touch before update on public.private_coach_notes
  for each row execute function private.touch_updated_at();

revoke all on public.private_coach_notes from anon, authenticated;
grant select, delete on public.private_coach_notes to authenticated;
grant insert (client_id, body) on public.private_coach_notes to authenticated;
grant update (body) on public.private_coach_notes to authenticated;

alter table public.private_coach_notes enable row level security;

create policy private_coach_notes_select on public.private_coach_notes for select to authenticated
  using ((select private.staff_can_access_client(client_id)));
create policy private_coach_notes_insert on public.private_coach_notes for insert to authenticated
  with check ((select private.staff_can_access_client(client_id)) and author_id = (select auth.uid()));
create policy private_coach_notes_update on public.private_coach_notes for update to authenticated
  using ((select private.staff_can_access_client(client_id)))
  with check ((select private.staff_can_access_client(client_id)));
create policy private_coach_notes_delete on public.private_coach_notes for delete to authenticated
  using ((select private.staff_can_access_client(client_id)));
