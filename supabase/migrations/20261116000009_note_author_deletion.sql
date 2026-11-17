-- FR-11: staff may delete their own notes while retaining assigned-client access checks.
alter policy private_coach_notes_delete on public.private_coach_notes
  using ((select private.staff_can_access_client(client_id)) and author_id = (select auth.uid()));
