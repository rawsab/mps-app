# 0003 — Importer boundaries and parser choice

Date: 2026-11-16 · Status: accepted for M1; revisit at M7

## Decision

- **Own a thin OOXML reader** (`src/domain/imports/xlsx.ts`, `docx.ts`) over `fflate` (unzip) and `fast-xml-parser` (`preserveOrder`, `parseTagValue: false`) instead of a general spreadsheet library.
  - It exposes exactly the evidence the PRD needs: raw cell type, stored value, number-format code, formula text (shared formulas resolved to their master), merges, date system, and Word paragraph/table order including headers.
  - Nothing is evaluated: no formulas, macros or external links. Their presence is reported.
  - It is DOM-free, so the same code can run in a Web Worker (M7) and in Node tests.
  - Both libraries are MIT and small. SheetJS's npm build (0.18.5) is stale, and ExcelJS (4.4.0) hasn't been released in about two years. Both convert values more eagerly than this evidence model wants.
- **Preflight before parsing:** extension, ZIP signature, CFB signature (password-protected/legacy files get a specific message), compressed size, entry count, declared and actual expanded size, worksheet count, non-empty cell count, and rejection of any XML with a DOCTYPE. The limits come from PRD FR-12 (`src/domain/imports/limits.ts`). Exceeding one throws `ImportError`; nothing is truncated.
- **Profiles, not a universal parser:** `mps-mesocycle`, `mps-nutrition` and `mps-personal-training` locate structure by heading synonyms and relative position, never by fixed cell addresses.
- **Accounting guarantee:** every non-empty cell, paragraph and table cell is registered as a `SourceItem`. Anything a profile doesn't claim becomes an `UNRECOGNIZED_CONTENT` blocking issue. Profile exclusions carry a reason and `decidedBy: 'profile_rule'` so Matt can review them.
- **Proposals are never applied silently.** A date-converted RIR leaves `rir: null` with a blocking issue proposing the range. Bare loads keep `unit: null`. Logged weights/reps become undated history, never prescriptions.
- The browser output (`NormalizedImport`) is untrusted. The M7 commit function must revalidate it with the same zod contract plus authorization, bounds and idempotency checks.

## Consequences

- The 30-second parse timeout (FR-12) can't be enforced inside a synchronous parse. It belongs to the M7 worker wrapper, which terminates the worker.
- `renderDateSerial` only reproduces simple `m/d/y` formats. That covers the evidence display these templates need, not general Excel formatting.
