-- FR-02 / NFR-01: assigned staff see only current pictures, without acquiring write access.
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);
set local storage.allow_delete_query = 'true';

\set photo '''00000000-0000-4000-a000-000000000011/33333333-3333-4333-a333-333333333333.png'''
\set old_photo '''00000000-0000-4000-a000-000000000011/44444444-4444-4444-a444-444444444444.png'''
insert into storage.objects (bucket_id, name) values ('profile-photos', :photo), ('profile-photos', :old_photo);
update public.profiles set avatar_path = :photo where auth_user_id = '00000000-0000-4000-a000-000000000011';

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 1, 'assigned coach can read current client photo');
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :old_photo), 0, 'assigned coach cannot read unreferenced photos');
delete from storage.objects where bucket_id = 'profile-photos' and name = :photo;
reset role;
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 1, 'assigned coach cannot delete client photo');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000003","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 0, 'unassigned coach cannot read client photo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000012","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 0, 'another client cannot read photo');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-000000000001","role":"authenticated"}', true);
select is((select count(*)::int from storage.objects where bucket_id = 'profile-photos' and name = :photo), 1, 'administrator can read client photo');
reset role;
select * from finish();
rollback;
