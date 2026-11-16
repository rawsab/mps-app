-- LOCAL DEVELOPMENT DATA ONLY. People are fictional; every email is on the reserved
-- example.test domain so invitations and password resets can never reach a real inbox.
-- Applied by `supabase db reset`. Never run against a hosted project.
-- All accounts share the password: local-dev-only-password

do $$
declare
  u record;
begin
  for u in
    select * from (values
      -- staff
      ('00000000-0000-4000-a000-000000000001'::uuid, 'matt@example.test',            'Matt Lizmore'),
      ('00000000-0000-4000-a000-000000000002'::uuid, 'priya.nair@example.test',      'Priya Nair'),
      ('00000000-0000-4000-a000-000000000003'::uuid, 'liam.oconnor@example.test',    'Liam O''Connor'),
      -- clients with accounts
      ('00000000-0000-4000-a000-000000000011'::uuid, 'maya.chen@example.test',       'Maya Chen'),
      ('00000000-0000-4000-a000-000000000012'::uuid, 'daniel.okafor@example.test',   'Daniel Okafor'),
      ('00000000-0000-4000-a000-000000000013'::uuid, 'sofia.marquez@example.test',   'Sofia Márquez'),
      ('00000000-0000-4000-a000-000000000014'::uuid, 'aisha.rahman@example.test',    'Aisha Rahman'),
      ('00000000-0000-4000-a000-000000000015'::uuid, 'lucas.silva@example.test',     'Lucas Silva'),
      ('00000000-0000-4000-a000-000000000016'::uuid, 'hannah.kowalski@example.test', 'Hannah Kowalski'),
      ('00000000-0000-4000-a000-000000000017'::uuid, 'grace.liu@example.test',       'Grace Liu'),
      ('00000000-0000-4000-a000-000000000018'::uuid, 'owen.fitzgerald@example.test', 'Owen Fitzgerald'),
      ('00000000-0000-4000-a000-000000000019'::uuid, 'ryan.patel@example.test',      'Ryan Patel')
    ) as t(id, email, display_name)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, email_change, email_change_token_new, recovery_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
      extensions.crypt('local-dev-only-password', extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('display_name', u.display_name),
      now(), now(), '', '', '', ''
    );
    insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id, u.id::text,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
  end loop;
end $$;

insert into public.staff_roles (auth_user_id, role) values
  ('00000000-0000-4000-a000-000000000001', 'admin'),
  ('00000000-0000-4000-a000-000000000002', 'coach'),
  ('00000000-0000-4000-a000-000000000003', 'coach');

-- Ids ending 001–004 are referenced by the policy tests: 001 Maya (client A), 002 Daniel (client B),
-- 003 Sofia (disabled), 004 Ethan (pending, no account).
insert into public.clients (id, auth_user_id, email, full_name, status, primary_coach_id, timezone, created_at, activated_at) values
  ('10000000-0000-4000-b000-000000000001', '00000000-0000-4000-a000-000000000011', 'maya.chen@example.test',
   'Maya Chen', 'active', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-06-03 14:20:00+00', '2026-06-03 14:20:00+00'),
  ('10000000-0000-4000-b000-000000000002', '00000000-0000-4000-a000-000000000012', 'daniel.okafor@example.test',
   'Daniel Okafor', 'active', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-08-19 16:05:00+00', '2026-08-19 16:05:00+00'),
  ('10000000-0000-4000-b000-000000000003', '00000000-0000-4000-a000-000000000013', 'sofia.marquez@example.test',
   'Sofia Márquez', 'disabled', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-03-11 13:45:00+00', '2026-03-11 13:45:00+00'),
  ('10000000-0000-4000-b000-000000000004', null, 'ethan.brooks@example.test',
   'Ethan Brooks', 'pending', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-11-14 18:30:00+00', null),
  ('10000000-0000-4000-b000-000000000005', '00000000-0000-4000-a000-000000000014', 'aisha.rahman@example.test',
   'Aisha Rahman', 'active', '00000000-0000-4000-a000-000000000001', 'America/Vancouver', '2026-07-22 19:10:00+00', '2026-07-22 19:10:00+00'),
  ('10000000-0000-4000-b000-000000000006', '00000000-0000-4000-a000-000000000015', 'lucas.silva@example.test',
   'Lucas Silva', 'invited', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-11-10 15:00:00+00', null),
  ('10000000-0000-4000-b000-000000000007', '00000000-0000-4000-a000-000000000016', 'hannah.kowalski@example.test',
   'Hannah Kowalski', 'active', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-02-02 12:00:00+00', '2026-02-02 12:00:00+00'),
  ('10000000-0000-4000-b000-000000000008', null, 'noah.tremblay@example.test',
   'Noah Tremblay', 'pending', '00000000-0000-4000-a000-000000000001', 'America/Montreal', '2026-11-15 20:40:00+00', null),
  ('10000000-0000-4000-b000-000000000009', '00000000-0000-4000-a000-000000000017', 'grace.liu@example.test',
   'Grace Liu', 'active', '00000000-0000-4000-a000-000000000002', 'America/Toronto', '2026-09-08 17:25:00+00', '2026-09-08 17:25:00+00'),
  ('10000000-0000-4000-b000-000000000010', '00000000-0000-4000-a000-000000000018', 'owen.fitzgerald@example.test',
   'Owen Fitzgerald', 'active', '00000000-0000-4000-a000-000000000001', 'Europe/London', '2026-05-27 09:15:00+00', '2026-05-27 09:15:00+00'),
  ('10000000-0000-4000-b000-000000000011', null, 'zara.ahmed@example.test',
   'Zara Ahmed', 'pending', '00000000-0000-4000-a000-000000000001', 'America/Toronto', '2026-11-12 22:05:00+00', null),
  ('10000000-0000-4000-b000-000000000012', '00000000-0000-4000-a000-000000000019', 'ryan.patel@example.test',
   'Ryan Patel', 'disabled', '00000000-0000-4000-a000-000000000001', 'America/Edmonton', '2026-01-14 15:50:00+00', '2026-01-14 15:50:00+00');

-- Priya (coach) is assigned Maya and Grace only; Liam (coach) has no clients.
insert into public.coach_clients (coach_id, client_id) values
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000001'),
  ('00000000-0000-4000-a000-000000000002', '10000000-0000-4000-b000-000000000009');

insert into public.service_enrollments (client_id, service, status, starts_on, ends_on) values
  ('10000000-0000-4000-b000-000000000001', 'mesocycle',         'active', date '2026-06-08', null),
  ('10000000-0000-4000-b000-000000000001', 'nutrition',         'active', date '2026-06-08', null),
  ('10000000-0000-4000-b000-000000000002', 'personal_training', 'active', date '2026-08-24', null),
  ('10000000-0000-4000-b000-000000000003', 'mesocycle',         'paused', date '2026-03-16', null),
  ('10000000-0000-4000-b000-000000000004', 'nutrition',         'active', date '2026-11-16', null),
  ('10000000-0000-4000-b000-000000000005', 'personal_training', 'active', date '2026-07-27', null),
  ('10000000-0000-4000-b000-000000000005', 'nutrition',         'active', date '2026-09-07', null),
  ('10000000-0000-4000-b000-000000000006', 'mesocycle',         'active', date '2026-11-16', null),
  ('10000000-0000-4000-b000-000000000007', 'mesocycle',         'ended',  date '2026-02-09', date '2026-05-31'),
  ('10000000-0000-4000-b000-000000000007', 'nutrition',         'active', date '2026-02-09', null),
  ('10000000-0000-4000-b000-000000000008', 'personal_training', 'active', date '2026-11-23', null),
  ('10000000-0000-4000-b000-000000000009', 'mesocycle',         'active', date '2026-09-14', null),
  ('10000000-0000-4000-b000-000000000009', 'personal_training', 'active', date '2026-09-14', null),
  ('10000000-0000-4000-b000-000000000010', 'nutrition',         'paused', date '2026-06-01', null),
  ('10000000-0000-4000-b000-000000000011', 'mesocycle',         'active', date '2026-11-23', null),
  ('10000000-0000-4000-b000-000000000011', 'nutrition',         'active', date '2026-11-23', null),
  ('10000000-0000-4000-b000-000000000012', 'personal_training', 'ended',  date '2026-01-19', date '2026-04-30');
