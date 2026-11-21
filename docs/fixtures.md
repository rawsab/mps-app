# Fixture manifest

Rule: no real client data in fixtures, screenshots, logs or previews (NFR-07).

| Fixture | Location | Origin | Used by |
|---|---|---|---|
| Mesocycle Sample (Google Drive).xlsx | `samples/` (local only, gitignored) | Supplied template; the owner confirmed it's anonymized ("NAME: Sample"). Contains MPS branding, IP notices and Matt's business contact details. | `tests/imports/samples.test.ts` (skips when absent), `pnpm spike:import` |
| Nutrition Template Sample (Google Drive).xlsx | `samples/` | Same | same |
| Personal Training Document Sample.docx | `samples/` | Same ("Name: Sample") | same |
| Synthetic xlsx/docx variations | built in memory by `tests/imports/fixtures/build.ts` | Generated | `tests/imports/*.test.ts` |
| `public/images/signin-standin.jpg` | sign-in screens | **Stand-in** photograph: Nenad Stojkovic, Wikimedia Commons, CC BY 2.0, cropped to remove a third-party logo. The credit line is on the sign-in screens. Replace it with an MPS photograph from Matt. | `src/features/auth/AuthPages.tsx` |
| Synthetic users and clients | `supabase/seed.sql` | Generated (`@example.test`) | local dev, pgTAP, API tests |

The sample files are MPS intellectual property and carry a notice that restricts redistribution. They are gitignored and were removed from the Git history; keep copies only on your machine. New committed fixtures must be synthetic (`tests/imports/fixtures/build.ts`).

## Corpus still needed (PRD §15.2, roadmap M0.4)

For each family, at least one anonymized **altered-layout** real file:
- **Mesocycle:** a multi-week workbook (Week 2+ on separate sheets or stacked), inserted or renamed columns, reordered days, merged heading cells, an RIR column holding typed ranges.
- **Nutrition:** a workbook where Matt changed the calorie goal mid-program, missing days, a kg variant if any clients use kg.
- **Personal training:** a Google Docs export, a document with more than two days, freeform paragraphs between tables.
- **Invalid inputs:** a password-protected file, an older .xls or .doc, and a file with real formulas that reference other sheets.
