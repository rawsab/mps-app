-- A meeting's coach name and picture for the client (decision 0042). Run with: pnpm test:db
begin;
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select plan(8);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.act_as(uuid) to authenticated;

-- Grace's meetings belong to her primary coach, Priya. Maya's primary coach is Matt (admin).
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set user_grace  '''00000000-0000-4000-a000-000000000017'''
\set grace       '''10000000-0000-4000-b000-000000000009'''
\set photo       '''00000000-0000-4000-a000-000000000002/44444444-4444-4444-a444-444444444444.png'''

update public.clients set primary_coach_id = :coach where id = :grace;
insert into storage.objects (bucket_id, name) values ('profile-photos', :photo);
update public.profiles set display_name = 'Priya', avatar_path = :photo where auth_user_id = :coach;
insert into public.meetings (client_id, coach_id, services, starts_at, duration_minutes, timezone)
values (:grace, :coach, '{personal_training}', now() + interval '1 day', 45, 'America/Toronto');

select pg_temp.act_as(:user_grace);
select is((public.list_meetings(now(), now() + interval '2 days') -> 0) ->> 'coachName', 'Priya', 'the client sees the coach''s name');
select is((public.list_meetings(now(), now() + interval '2 days') -> 0) ->> 'coachAvatarPath', :photo, 'and the picture path');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 1, 'the client can read their coach''s picture');
select is((select count(*)::int from public.profiles where auth_user_id = :coach), 0, 'the coach''s profile row stays unreadable');
select is(private.is_my_coach(:coach), true, 'Priya is Grace''s coach');

select pg_temp.act_as(:user_a);
select is(private.is_my_coach(:coach), false, 'Priya is not Maya''s coach');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 0, 'another client cannot read the picture');

select pg_temp.act_as(:coach);
select is((public.list_meetings(now(), now() + interval '2 days', :grace) -> 0) ->> 'coachName', 'Priya', 'staff get the same fields');

select * from finish();
rollback;
