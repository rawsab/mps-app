-- Started sessions count as unread again (decision 0025, revised on owner request): a client
-- opening a workout shows in the clients page's recent items, the Reviews badge and Reviews.
-- Same as migration 00020 without the kind filter; get_review_summary still counts by kind.

create or replace function private.staff_activity()
returns table (a private.session_activity_row, client_id uuid, client_name text, client_activity_at timestamptz, id uuid, unread boolean)
language sql stable set search_path = ''
as $$
  select sa::private.session_activity_row, sa.client_id, sa.client_name, sa.client_activity_at, sa.id,
    sa.client_activity_at > coalesce(greatest(r.read_through, seen.seen_at), '-infinity'::timestamptz)
  from private.session_activity(null) sa
  left join public.staff_activity_reads r on r.staff_id = (select auth.uid())
  left join public.staff_activity_seen seen on seen.staff_id = (select auth.uid()) and seen.session_id = sa.id
  where sa.client_activity_at is not null;
$$;

-- The summary's total stays the badge total, so started sessions get their own count.
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
      'skipped', count(*) filter (where k = 'skipped'),
      'started', count(*) filter (where k = 'started'))
    from (select private.activity_kind(x.a) as k from private.staff_activity() x where x.unread) u
  );
end;
$$;
