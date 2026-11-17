# 0041 — Clients table row menu and client transfer

Date: 2026-11-17 · Status: accepted (owner request)

- Right-clicking a row in the coach's clients table (or pressing the keyboard menu key on its name) opens a menu: **View client**, **See recent updates** (the client's Activity page), **Transfer client**, and **Disable** (or **Reactivate** for a disabled client).
- Transfer and Disable are admin only, like every other change to a client record (`clients_update_admin` policy). Coaches see only the first two items.
- **Transfer client** is greyed out when no staff member other than the client's current primary coach exists. Disable and transfer both confirm in a dialog first.
- Transfer goes through `transfer_client` (migration 00036), not a browser update:
  - It sets `clients.primary_coach_id`. The existing triggers move future PT sessions and meetings to the new coach.
  - The outgoing primary coach's `coach_clients` row is removed. A coach (not an admin, who already sees every client) gets one, keeping the outgoing row's `can_publish`.
  - **Other assigned coaches keep their access.** A transfer replaces the primary coach only. Removing supporting coaches is a separate decision if it's ever wanted.
- `transfer_coach_options()` lists staff (coaches and admins) by display name for the picker. Admin only.
- Verification: 15 assertions in `027_transfer_client.test.sql`.
