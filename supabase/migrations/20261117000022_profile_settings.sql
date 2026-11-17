-- FR-01 / NFR-01: editable personal details and private profile pictures.
alter table public.profiles
  add column date_of_birth date check (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date),
  add column phone_number text check (char_length(phone_number) <= 40),
  add column avatar_path text;

-- A user may reference only their own object; arbitrary URLs and other users' paths are rejected.
alter table public.profiles add constraint profiles_avatar_path_own check (
  avatar_path is null or (
    split_part(avatar_path, '/', 1) = auth_user_id::text
    and avatar_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$'
  )
);
grant update (date_of_birth, phone_number, avatar_path) on public.profiles to authenticated;

-- Personal details should not become visible to unrelated coaches.
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (
  auth_user_id = (select auth.uid()) or (select private.is_admin()) or exists (
    select 1 from public.clients c
    where c.auth_user_id = profiles.auth_user_id and private.staff_can_access_client(c.id)
  )
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profile-photos', 'profile-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

-- Own photos only for this increment. Shared client/notification displays follow separately.
-- storage.objects already has RLS and Storage's standard authenticated grants.
create policy profile_photos_select on storage.objects for select to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy profile_photos_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|png|webp)$');
create policy profile_photos_delete on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- No update policy: every replacement uses a fresh path, avoiding stale cached pictures.
