---
name: milestone-check
description: Audit current work against a roadmap milestone (M0–M9) — its tasks, verification list, and exit criteria in docs/modern-physique-systems-implementation-roadmap.md, plus the PRD requirement IDs and acceptance criteria it covers. Use when finishing or reviewing progress on a milestone.
---

Audit milestone `$ARGUMENTS` (e.g. `M2`). If no milestone is given, infer the active one from the code and recent commits and say which you chose.

1. Read the milestone's section in `docs/modern-physique-systems-implementation-roadmap.md` (§9), its row in the §8 overview table, and §15 "Definition of done".
2. For each PRD requirement the milestone covers (§8 "PRD coverage" column), read its FR/NFR section in `docs/modern-physique-systems-prd.md` including its Acceptance line.
3. Inspect the actual code, migrations, policies, and tests. Run the build, type check, and relevant tests if they exist. Do not credit work that exists only as mocks, stubs, or UI without real persistence.
4. Check the cross-cutting invariants in `CLAUDE.md` and roadmap §6 "Mandatory invariants" for anything this milestone touches — especially that every new table/view/function/bucket has RLS policies and direct-API isolation tests.

Report as a checklist grouped by: Tasks, Verification, Exit criteria, PRD acceptance. Mark each item done / partial / missing with a file reference or command output as evidence. End with the blocking gaps in priority order and any Matt-only decisions (PRD §15) still open. Don't fix anything unless asked.
