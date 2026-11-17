begin;
-- Match Storage API deletion transactions; all object rows here roll back.
set local storage.allow_delete_query = 'true';
create extension if not exists pgtap with schema extensions;
select plan(22);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on function pg_temp.act_as(uuid) to authenticated;

\set user_a '''00000000-0000-4000-a000-000000000011'''
\set user_b '''00000000-0000-4000-a000-000000000012'''
\set coach '''00000000-0000-4000-a000-000000000002'''
\set other_coach '''00000000-0000-4000-a000-000000000003'''
\set path_a '''00000000-0000-4000-a000-000000000011/11111111-1111-4111-a111-111111111111.png'''
\set path_b '''00000000-0000-4000-a000-000000000012/22222222-2222-4222-a222-222222222222.png'''

select is((select public from storage.buckets where id = 'profile-photos'), false, 'photos bucket is private');
select is((select file_size_limit from storage.buckets where id = 'profile-photos'), 5242880::bigint, 'bucket caps files at 5 MB');
select is((select allowed_mime_types from storage.buckets where id = 'profile-photos'), array['image/jpeg','image/png','image/webp'], 'bucket permits raster formats only');
insert into storage.objects (bucket_id, name) values ('profile-photos', :path_b);

select pg_temp.act_as(:user_a);
select lives_ok($$update public.profiles set display_name = 'Maya', date_of_birth = '2000-02-29', phone_number = '+1 (416) 555-0123' where auth_user_id = auth.uid()$$, 'client saves own personal details');
select is((select date_of_birth from public.profiles where auth_user_id = auth.uid()), date '2000-02-29', 'birthday persists');
select throws_ok($$update public.profiles set date_of_birth = current_date + 1 where auth_user_id = auth.uid()$$, '23514', null, 'future birthday rejected');
select throws_ok($$update public.profiles set phone_number = repeat('1', 41) where auth_user_id = auth.uid()$$, '23514', null, 'oversized phone rejected');
select throws_ok(format('update public.profiles set avatar_path = %L where auth_user_id = auth.uid()', :path_b), '23514', null, 'cannot reference another user photo');
select lives_ok(format('insert into storage.objects (bucket_id, name) values (''profile-photos'', %L)', :path_a), 'can upload in own folder');
select throws_ok($$insert into storage.objects (bucket_id, name) values ('profile-photos', '00000000-0000-4000-a000-000000000012/33333333-3333-4333-a333-333333333333.png')$$, '42501', null, 'cannot upload into someone else folder');
select lives_ok(format('update public.profiles set avatar_path = %L where auth_user_id = auth.uid()', :path_a), 'can set own photo');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name in (:path_a, :path_b)), 1, 'can read only own photos');
delete from storage.objects where bucket_id = 'profile-photos' and name = :path_b;
update public.profiles set phone_number = 'hijacked' where auth_user_id = :user_b;
select lives_ok('update public.profiles set avatar_path = null, phone_number = null, date_of_birth = null where auth_user_id = auth.uid()', 'can clear photo and optional fields');
select lives_ok(format('delete from storage.objects where bucket_id = ''profile-photos'' and name = %L', :path_a), 'can delete own photo');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :path_a), 0, 'own photo removed');
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :path_b), 1, 'other user photo not deleted');
select is((select phone_number from public.profiles where auth_user_id = :user_b), null::text, 'other user details not changed');

select pg_temp.act_as(:coach);
select lives_ok($$update public.profiles set display_name = 'Priya', date_of_birth = '1990-01-01', phone_number = '+1 416 555 0144' where auth_user_id = auth.uid()$$, 'coach can save own profile');
select is((select count(*)::int from public.profiles where auth_user_id = :user_a), 1, 'assigned coach can read client profile');
select is((select count(*)::int from public.profiles where auth_user_id = :user_b), 0, 'coach cannot read unassigned client profile');
reset role;
select pg_temp.act_as(:other_coach);
select is((select count(*)::int from public.profiles), 1, 'unassigned coach sees own profile only');
reset role;
set local role anon;
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos'), 0, 'anonymous cannot read photos');
reset role;

select * from finish();
rollback;
