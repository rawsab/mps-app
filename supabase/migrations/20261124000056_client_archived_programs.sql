-- Clients see their archived training programs (owner request, 2026-11-24; decision 0060).
-- get_published_program already returns an archived program as history; this lists them. Like
-- list_published_programs it runs as the caller, so the programs and revisions policies decide
-- what is listed: the caller's own programs, published at least once. Drafts never appear.
create or replace function public.list_archived_programs()
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'programId', p.id,
      'service', p.service,
      'revisionNumber', r.revision_number,
      'publishedAt', r.published_at,
      'archivedAt', p.archived_at,
      'title', r.title,
      'programTheme', r.program_theme,
      'weekCount', (select count(*) from public.program_weeks w where w.revision_id = r.id),
      'isCurrent', false)
    order by p.archived_at desc), '[]'::jsonb)
  from public.programs p
  join public.program_revisions r on r.id = p.current_revision_id and r.status = 'published'
  where p.client_id = (select private.current_client_id())
    and p.archived_at is not null;
$$;

revoke all on function public.list_archived_programs() from public, anon, authenticated;
grant execute on function public.list_archived_programs() to authenticated;
