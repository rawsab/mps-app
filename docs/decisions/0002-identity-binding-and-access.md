# 0002 — Client identity binding and access control

Date: 2026-11-16 · Status: accepted

## Decision

- `clients` rows exist before any account (`status = pending`), so programs can be prepared or imported before invitation (FR-01).
- **Binding happens only on the server.** The `invite-client` Edge Function verifies that the caller has the `admin` role (read from the protected `staff_roles` table using the caller's own token), invites the client's stored email through Supabase Auth admin, then sets `clients.auth_user_id` with a compare-and-set (`where auth_user_id is null`). If the bind loses a race, the new auth user is deleted.
- An existing auth account with the same email is **not** auto-linked (409). Linking it needs an explicit operator decision.
- Browsers have no column grant on `clients.auth_user_id`. Even admins can't bind from the client (tested).
- `staff_roles` has no insert/update/delete policy or grant for `authenticated`, so self-promotion isn't possible. Roles are assigned by an operator (SQL/service role) for the MVP.
- A staff account alone grants nothing. Coaches see only clients in `coach_clients`; admins see all.
- `private.current_client_id()` returns a client id only while `status in ('invited','active')`. Disabling a client cuts off reads at the policy layer immediately, even for unexpired tokens (tested over HTTP).
- Helper functions live in a non-exposed `private` schema, are `security definer` with `search_path = ''`, and policies wrap them in `(select …)` for per-statement evaluation.
- Every table ships with RLS and explicit grants in the same migration. Column-level grants limit what each role can update.
- Public sign-up is disabled (`auth.enable_signup = false`). Accounts come only from invitations.

## Consequences

- An invitation is a real outbound email in any hosted environment. Locally it goes to Mailpit (`http://127.0.0.1:54324`). Don't invoke it against a hosted project without authorization.
- Resend SMTP must be configured in the hosted Supabase project before invitations work outside local dev (see docs/setup.md).
- The invite function logs `client_invited`/`client_invite_resent` with ids only. A durable `audit_events` table is planned with roadmap migration step 5.
