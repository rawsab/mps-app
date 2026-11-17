# 0027 — Profile settings and private profile pictures

Date: 2026-11-17

FR-01 / NFR-01. Both clients and staff edit their own preferred name (the existing `profiles.display_name`), optional date of birth and phone number. Email is displayed read-only from the authenticated session. Clearing optional fields stores null; preferred names do not overwrite coach-managed client full names.

Profile settings lives at `/profile` for clients and `/coach/profile` for staff. The client's header avatar and coach's sidebar avatar link to settings; the collapsed sidebar and mobile drawer retain access. A shared silhouette replaces missing or broken pictures.

Migration 00022 adds the personal fields and avatar path, with own-row writes and path ownership checks. It narrows profile reads from all staff to the owner, administrators and assigned coaches. The private `profile-photos` bucket accepts JPEG, PNG and WebP up to 5 MB; users can read, insert and delete only in their own folder. Signed URLs expire after an hour and the viewer refreshes while active. Replacements upload to a new path before updating the profile and deleting the previous file; failed profile writes clean up the new upload.

Coach-facing client pictures, notification avatars and coach assignment attribution remain a later increment. Shared photo access policies will be added with those views.

Verification: typecheck, 251 unit tests and production build passed; 22 new pgTAP assertions and two real Storage API flows (client and coach) passed. The broader database suite encountered two existing enrollment fixture mismatches in 001_client_isolation (Maya has an additional personal-training enrollment locally); no database reset was performed. Browser checks were not run, following the local manual-verification preference.
