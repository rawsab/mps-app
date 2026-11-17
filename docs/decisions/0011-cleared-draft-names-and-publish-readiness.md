# 0011 — Clear names in drafts; require them at publish

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-04, FR-05, FR-06)

- Delete/Backspace clears selected exercise names, Day labels and Section titles along with prescription cells. A merged label is updated once by stable id, even when the selection spans several of its exercise rows. The operation remains one reversible command batch; exercise identities, grouping, alternatives and unselected content are retained. The derived row number and shared “All days” label have no editable stored value and remain derived.
- Clear operations construct valid empty draft values directly rather than parsing every blank as an ordinary cell edit. Clearing a load or its mode removes that load object, so its required value cannot refuse the batch and leave selected names unchanged. Dependent rejected-cell buffers are discarded along with the cleared values. Clearing Per side switches off the optional flag while retaining unselected reps/time; its blank grid option renders empty rather than “No.”
- Exercise names and day labels may be empty in the canonical draft and local database. Migration 00007 relaxes only their minimum-length checks, retaining maximum lengths, not-null constraints, RLS, grants and published immutability.
- Publishing requires nonblank day labels, section titles and exercise names, including names and prescriptions in shared preparation. The editor opens the readiness list rather than attempting an incomplete publish; the database independently rejects it with PT422. Problem paths link to the exact missing field and reopen its containing disclosures.
- A section's kind is no longer a hidden replacement for a cleared title in Grid. Newly created sections receive their kind's normal label as an actual editable title; existing drafts with blank section titles must have them filled before publishing. No existing draft or published content is rewritten by this migration.
- Day and Section cells are directly editable with double-click, Enter/F2 or typing. Neither has a pencil button. Week headings retain their pencil. Day separators are regular one-pixel rules per the owner's follow-up.

## Verification

- All 165 unit tests, typecheck and production build pass. New coverage includes clear/undo/redo of names and merged labels, retained exercise identities and prescriptions, draft acceptance versus publish readiness, section renaming and issue navigation.
- Applied the local migration without resetting data. All 20 pgTAP assertions in `007_incomplete_draft_names.test.sql` pass: blank/whitespace names round-trip through save, server publication is refused, filling names enables publication, subsequent cleared drafts cannot replace the live revision, authorization remains enforced and published content remains immutable.
- Browser verification remains manual. Check selecting/clearing labels and names, undo/redo, autosave/reload, direct day/section renaming, readiness navigation and publishing after filling the missing fields. The existing large-bundle warning remains.
