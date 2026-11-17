# 0032 — Nutrition draft autosave

Date: 2026-11-17 · Status: implemented, manual interaction verification pending

- Nutrition's manual Save draft button was inconsistent with mesocycle and personal training. Program details now autosave one second after the last change, matching the training editor.
- All program editors share `DraftSaveIndicator`, preserving the existing Unsaved changes / Saving… / All changes saved / Not saved / Conflict presentation and Retry action.
- Saves are serialized using the current revision's optimistic lock. Each request carries the document it actually submitted. A completed request advances the saved baseline and version but does not replace edits typed while it was in flight; those changes queue for a subsequent save. Inputs remain enabled during autosave.
- Incomplete but valid drafts (e.g. blank Program Style or missing calorie baselines) save privately. Invalid field values remain visible and block autosave until corrected. Save errors stop automatic retries, keep edits, and offer Retry; conflicts require explicitly reloading the saved revision. Existing unsaved-navigation and tab-close guards remain.
- Publish is still deliberate: autosave protects work in progress, whereas Publish makes a validated revision visible to the client. Publish review waits for pending changes to finish saving and blocks on validation or save errors. A published program's existing revision stays active until that explicit action succeeds.
- No database or client logging behavior changed. Verification: typecheck, existing unit suite and production build. No browser automation or screenshots.

Manual checks:

1. Edit a nutrition Program Style or baseline field, wait about one second, confirm All changes saved, then reload.
2. Keep typing while Saving… is visible; confirm the latest text remains and eventually saves.
3. Confirm incomplete valid drafts save, the client still sees only the previous published revision, and Publish waits for autosave before making changes visible.
