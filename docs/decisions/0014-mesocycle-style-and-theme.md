# 0014 — Mesocycle Program Style and Program Theme

Date: 2026-11-16 · Status: requested by the owner

## Decision (FR-05, FR-06)

- Mesocycle uses Program Style as its main heading, retaining the existing title field and values. Personal training retains Title. Program Theme is a separate subtitle shown below the style in the editor header and beneath the style in client program listings.
- Both fields are edited in Program details through the existing command/save/undo path. Style retains the 160-character title limit; Theme permits up to 240 characters. Missing Style blocks publication using service-appropriate wording. Theme may be blank, and older draft documents without it remain accepted.
- Migration 00010 stores Theme on each revision as `program_theme`, exposes `programTheme` in draft documents, and saves it transactionally with the rest of the draft. Existing revisions receive an empty theme. Existing RLS, read grants and published-revision immutability cover it; no separate write path is introduced.

## Verification

- Production build/typecheck and 46 targeted contract/command tests pass. Theme is covered by reversible program updates, legacy document parsing and length validation.
- The two affected database suites pass all 74 assertions, including theme round trip, client access to the published theme, published immutability and saves from older documents. Migration 00010 and its corrected invoker-helper read grant are applied locally. No database reset or browser checks ran.
- Manual check: edit a mesocycle's Style and Theme, see the heading/subtitle update, save/reload and Undo; personal-training Title remains unchanged.
