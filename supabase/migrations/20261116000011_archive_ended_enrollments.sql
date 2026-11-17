-- FR-04: hide ended services without deleting their linked program/history records.
-- Existing enrollment RLS restricts management to admins; read access is unchanged.
alter table public.service_enrollments
  add column archived_at timestamptz,
  add constraint service_enrollments_archive_ended_only check (archived_at is null or status = 'ended');
grant update (archived_at) on public.service_enrollments to authenticated;
