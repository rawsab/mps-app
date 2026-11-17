-- Private coaching notes are staff-only (PRD §4, FR-11, NFR-01). Run with: pnpm test:db
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  if uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
  end if;
end $$;
create function pg_temp.reset_role() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;
grant execute on all functions in schema pg_temp to anon, authenticated;

\set admin       '''00000000-0000-4000-a000-000000000001'''
\set coach       '''00000000-0000-4000-a000-000000000002'''
\set coach_other '''00000000-0000-4000-a000-000000000003'''
\set user_a      '''00000000-0000-4000-a000-000000000011'''
\set client_a    '''10000000-0000-4000-b000-000000000001'''
\set client_b    '''10000000-0000-4000-b000-000000000002'''

insert into public.private_coach_notes (client_id, body, author_id) values
  (:client_a, 'Synthetic note: 10% referral discount', :admin),
  (:client_b, 'Synthetic note: prefers morning sessions', :admin);

select pg_temp.act_as(null);
select throws_ok('select count(*) from public.private_coach_notes', '42501', null, 'anon cannot read notes');
select pg_temp.reset_role();

select pg_temp.act_as(:user_a);
select is_empty('select 1 from public.private_coach_notes', 'client cannot read notes about themselves');
select throws_ok(format('insert into public.private_coach_notes (client_id, body) values (%L, ''x'')', :client_a),
  '42501', null, 'client cannot write notes');
select pg_temp.reset_role();

select pg_temp.act_as(:coach);
select results_eq('select client_id from public.private_coach_notes', array[:client_a::uuid], 'assigned coach reads only assigned clients'' notes');
select lives_ok(format('insert into public.private_coach_notes (client_id, body) values (%L, ''Coach note'')', :client_a),
  'assigned coach can add a note');
select is((select author_id from public.private_coach_notes where body = 'Coach note'), :coach::uuid, 'author comes from the token');
select throws_ok(format('insert into public.private_coach_notes (client_id, body) values (%L, ''x'')', :client_b),
  '42501', null, 'coach cannot add notes for an unassigned client');
select throws_ok(format('insert into public.private_coach_notes (client_id, body, author_id) values (%L, ''x'', %L)', :client_a, :admin),
  '42501', null, 'author cannot be forged');
select pg_temp.reset_role();

select pg_temp.act_as(:coach_other);
select is_empty('select 1 from public.private_coach_notes', 'unassigned coach sees no notes');
select pg_temp.reset_role();

select pg_temp.act_as(:admin);
select is((select count(*)::int from public.private_coach_notes where body in ('Synthetic note: 10% referral discount', 'Synthetic note: prefers morning sessions', 'Coach note')), 3, 'admin reads every fixture note');
select throws_ok(format('insert into public.private_coach_notes (client_id, body) values (%L, ''   '')', :client_a),
  '23514', null, 'blank notes are rejected');
select pg_temp.reset_role();

select pg_temp.act_as(:user_a);
select is_empty('select 1 from public.private_coach_notes', 'client still sees nothing after staff writes');
select pg_temp.reset_role();

-- Deletion requires both authorship and current client access.
select pg_temp.act_as(:coach);
select is_empty('delete from public.private_coach_notes where body like ''Synthetic note:%'' returning id', 'coach cannot delete another author''s notes');
select results_eq('delete from public.private_coach_notes where body = ''Coach note'' returning body', array['Coach note']::text[], 'coach can delete their own note');
select is_empty('select id from public.private_coach_notes where body = ''Coach note''', 'deleted note is gone');
select pg_temp.reset_role();
select pg_temp.act_as(:coach_other);
select is_empty('delete from public.private_coach_notes returning id', 'unassigned staff cannot delete notes');
select pg_temp.reset_role();
select pg_temp.act_as(:user_a);
select is_empty('delete from public.private_coach_notes returning id', 'client cannot delete staff notes');
select pg_temp.reset_role();
select pg_temp.act_as(:admin);
select results_eq('delete from public.private_coach_notes where body = ''Synthetic note: 10% referral discount'' returning body', array['Synthetic note: 10% referral discount']::text[], 'admin can delete their own note');
select pg_temp.reset_role();

select * from finish();
rollback;
