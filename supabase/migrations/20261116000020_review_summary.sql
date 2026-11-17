-- Clients-page "To review" summary (FR-07, FR-08, NFR-01; decision 0025).
--
-- Each session gets a kind: completed, skipped, logged (in progress with sets or feedback) or
-- started (opened, nothing logged). Opening a day isn't something to review, so a started session
-- stays listed in Reviews but is never unread; the sidebar badge, the summary and the dots agree.

create or replace function private.activity_kind(a private.session_activity_row)
returns text language sql immutable set search_path = ''
as $$
  select case
    when a.status = 'completed' then 'completed'
    when a.status = 'skipped' then 'skipped'
    when a.set_count > 0 or a.feedback_count > 0 then 'logged'
    else 'started'
  end;
$$;

create or replace function private.staff_activity()
returns table (a private.session_activity_row, client_id uuid, client_name text, client_activity_at timestamptz, id uuid, unread boolean)
language sql stable set search_path = ''
as $$
  select sa::private.session_activity_row, sa.client_id, sa.client_name, sa.client_activity_at, sa.id,
    private.activity_kind(sa::private.session_activity_row) <> 'started'
      and sa.client_activity_at > coalesce(greatest(r.read_through, seen.seen_at), '-infinity'::timestamptz)
  from private.session_activity(null) sa
  left join public.staff_activity_reads r on r.staff_id = (select auth.uid())
  left join public.staff_activity_seen seen on seen.staff_id = (select auth.uid()) and seen.session_id = sa.id
  where sa.client_activity_at is not null;
$$;

-- Unread items by kind. `unread` is the total, the same number as count_unread_activity().
create or replace function public.get_review_summary()
returns jsonb language plpgsql stable set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'staff only' using errcode = '42501';
  end if;
  return (
    select jsonb_build_object(
      'unread', count(*),
      'completed', count(*) filter (where k = 'completed'),
      'logged', count(*) filter (where k = 'logged'),
      'skipped', count(*) filter (where k = 'skipped'))
    from (select private.activity_kind(x.a) as k from private.staff_activity() x where x.unread) u
  );
end;
$$;

revoke all on function private.activity_kind(private.session_activity_row) from public, anon, authenticated;
grant execute on function private.activity_kind(private.session_activity_row) to authenticated;
revoke all on function public.get_review_summary() from public, anon, authenticated;
grant execute on function public.get_review_summary() to authenticated;
