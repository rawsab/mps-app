-- Activity trends (decision 0046). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create temp table s (v jsonb) on commit drop;
grant all on s to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000011","role":"authenticated"}', true);
select throws_ok($$select public.get_staff_activity_stats(now() - interval '7 days', now(), 'day', 'UTC')$$, '42501', null, 'clients cannot read activity stats');

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select throws_ok($$select public.get_staff_activity_stats(now(), now() - interval '1 day', 'day', 'UTC')$$, '22023', null, 'the range must run forwards');
select throws_ok($$select public.get_staff_activity_stats(now() - interval '2 years', now(), 'day', 'UTC')$$, '22023', null, 'the range is capped');
select throws_ok($$select public.get_staff_activity_stats(now() - interval '1 day', now(), 'week', 'UTC')$$, '22023', null, 'only hour and day buckets');
select throws_ok($$select public.get_staff_activity_stats(now() - interval '1 day', now(), 'day', 'Mars/Olympus')$$, '22023', null, 'the time zone must exist');

insert into s
  select public.get_staff_activity_stats(now() - interval '399 days', now() + interval '1 day', 'day', 'America/Toronto') as v;
select is((select (v->>'total')::int from s),
  (select count(*)::int from private.all_staff_activity() where activity_at >= now() - interval '399 days' and activity_at < now() + interval '1 day'),
  'the total counts exactly what the feed lists in the range');
select is((select coalesce(sum((b->>'count')::int), 0)::int from s, jsonb_array_elements(v->'buckets') b), (select (v->>'total')::int from s), 'buckets add up to the total');
select is((select coalesce(sum((k->>'count')::int), 0)::int from s, jsonb_array_elements(v->'kinds') k), (select (v->>'total')::int from s), 'kinds add up to the total');
select is((select coalesce(sum((c->>'count')::int), 0)::int from s, jsonb_array_elements(v->'clients') c), (select (v->>'total')::int from s), 'clients add up to the total');
select ok((select bool_and(b->>'bucket' ~ '^\d{4}-\d{2}-\d{2}$') from s, jsonb_array_elements(v->'buckets') b) is not false, 'day buckets are local dates');
select ok((select bool_and(b->>'bucket' ~ '^\d{4}-\d{2}-\d{2}T\d{2}$')
  from jsonb_array_elements(public.get_staff_activity_stats(now() - interval '2 days', now(), 'hour', 'UTC')->'buckets') b) is not false, 'hour buckets are local hours');
select is((public.get_staff_activity_stats(now() + interval '1 day', now() + interval '2 days', 'day', 'UTC')->>'total')::int, 0, 'an empty range counts nothing');
select * from finish();
rollback;
