-- M3 step 5 (FR-03, FR-04, PRD §4): the client's read-only Training view.
--
-- Both readers are security invoker, so existing RLS decides visibility: a client sees only their
-- own programs with a current revision, and only published revisions. They read the current
-- revision pointer and never a draft, even when the caller is staff (so staff get the same
-- published view the client sees). get_program_draft stays staff-only.

-- The signed-in client's current published programs, newest publish first. Archived programs are
-- hidden from the list; their history is kept (decision 0008).
create or replace function public.list_published_programs()
returns jsonb language sql stable set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'programId', p.id,
      'service', p.service,
      'revisionNumber', r.revision_number,
      'publishedAt', r.published_at,
      'title', r.title,
      'programTheme', r.program_theme,
      'weekCount', (select count(*) from public.program_weeks w where w.revision_id = r.id))
    order by r.published_at desc), '[]'::jsonb)
  from public.programs p
  join public.program_revisions r on r.id = p.current_revision_id and r.status = 'published'
  where p.client_id = (select private.current_client_id())
    and p.archived_at is null;
$$;

-- One program's current published revision as a ProgramDraft document. Unknown, unpublished and
-- other clients' programs are indistinguishable (42501).
create or replace function public.get_published_program(p_program_id uuid)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  program public.programs;
  rev public.program_revisions;
begin
  select * into program from public.programs where id = p_program_id;
  if found then
    select * into rev from public.program_revisions
    where id = program.current_revision_id and status = 'published';
  end if;
  if rev.id is null then
    raise exception 'program not found' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'programId', program.id,
    'service', program.service,
    'revisionId', rev.id,
    'revisionNumber', rev.revision_number,
    'publishedAt', rev.published_at,
    'archivedAt', program.archived_at,
    'document', private.revision_document(rev.id));
end;
$$;

revoke all on function public.list_published_programs(), public.get_published_program(uuid)
  from public, anon, authenticated;
grant execute on function public.list_published_programs(), public.get_published_program(uuid)
  to authenticated;
