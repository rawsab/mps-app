-- FR-02 / NFR-01: staff may read the current profile picture of clients they can access.
-- Keep the bucket private and all insert/delete permissions restricted to the photo owner.
drop policy profile_photos_select on storage.objects;
create policy profile_photos_select on storage.objects for select to authenticated using (
  bucket_id = 'profile-photos' and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      join public.clients c on c.auth_user_id = p.auth_user_id
      where p.avatar_path = storage.objects.name
        and private.staff_can_access_client(c.id)
    )
  )
);
