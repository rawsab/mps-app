-- Activity trends beside the Activity feed (decision 0046). Counts the same items the feed lists
-- (private.all_staff_activity, so the same visibility rules) between two instants: per hour or per
-- day in the viewer's time zone, per kind and per client. Read only; nothing new to secure beyond
-- the staff check and grants.

create or replace function public.get_staff_activity_stats(p_from timestamptz, p_to timestamptz, p_bucket text, p_time_zone text)
returns jsonb language plpgsql stable set search_path = ''
as $$
declare
  fmt text;
begin
  if not private.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to <= p_from or p_to - p_from > interval '400 days' then
    raise exception 'choose a range of up to 400 days' using errcode = '22023';
  end if;
  fmt := case p_bucket when 'hour' then 'YYYY-MM-DD"T"HH24' when 'day' then 'YYYY-MM-DD' end;
  if fmt is null then raise exception 'bucket must be hour or day' using errcode = '22023'; end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_time_zone) then
    raise exception 'unknown time zone' using errcode = '22023';
  end if;

  return (with a as (
      select to_char(x.activity_at at time zone p_time_zone, fmt) as bucket, x.kind,
        (x.item->>'clientId')::uuid as client_id, x.item->>'clientName' as client_name
      from private.all_staff_activity() x
      where x.activity_at >= p_from and x.activity_at < p_to)
    select jsonb_build_object(
      'total', (select count(*) from a),
      'buckets', coalesce((select jsonb_agg(jsonb_build_object('bucket', bucket, 'count', n) order by bucket)
        from (select bucket, count(*) as n from a group by bucket) b), '[]'::jsonb),
      'kinds', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'count', n) order by n desc, kind)
        from (select kind, count(*) as n from a group by kind) k), '[]'::jsonb),
      'clients', coalesce((select jsonb_agg(jsonb_build_object('clientId', client_id, 'clientName', client_name, 'count', n) order by n desc, client_name)
        from (select client_id, max(client_name) as client_name, count(*) as n from a group by client_id) c), '[]'::jsonb)));
end;
$$;

revoke all on function public.get_staff_activity_stats(timestamptz, timestamptz, text, text) from public, anon, authenticated;
grant execute on function public.get_staff_activity_stats(timestamptz, timestamptz, text, text) to authenticated;
