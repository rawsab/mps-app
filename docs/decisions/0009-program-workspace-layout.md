# 0009 — Program outline and focused workout workspace

Date: 2026-11-16 · Status: accepted by the owner before implementation

## Decision

Apply the relevant taste-skill guidance to the coaching app: aligned edges, open sections, shallow visual nesting, consistent controls, clear labels and keyboard access (FR-04, FR-05, FR-06, NFR-06). Retain the established theme tokens and Hanken Grotesk. Marketing heroes, full-screen sections, palette dealing, photographs, shader effects and animated moments do not fit this editing workflow; the landing-page gate is not an acceptance check for these app routes.

- Program view has a week/day outline and one selected workspace. Program details, shared preparation and resources are separate destinations. On smaller screens the outline becomes a labelled selector. The `item` query parameter preserves the selected destination across Program/Grid switching; a removed destination falls back to the first available workout, week or program details.
- Weeks have settings and a list of workout days. Workouts use section headings and dividers, with aligned prescription rows and expandable exercise details. Supersets have a gold side marker and A1/A2-style labels. Structure and lifecycle operations use labelled action disclosures; actions remain keyboard accessible and removals retain confirmation.
- Publish readiness lives beside Publish and opens a review dialog. Issues navigate to the relevant workout and field. Rejected edits are included and must be addressed before publishing the accepted draft. Existing server save/publish, conflict, recovery and undo/redo paths remain in use.
- Archived programs retain outline navigation, with editing controls disabled in the workspace.
- Individual client pages put Programs first. Services and the three most recent private notes appear alongside on desktop and below on smaller screens. All notes remain available through a disclosure. Client settings collapse separately. Repeated lists use dividers instead of nested cards.
- Shared changes include visible 14px editor labels, described validation errors, accessible editor tabs, skip links, larger context actions and a wider before/after paste review. The attached Grid add-row strip now has a 44px minimum height, superseding the 28px refinement in decision 0007 as explicitly included in the approved plan.

## Verification

- Typecheck, 141 unit tests and production build pass. Navigation tests cover empty/removed destinations, stable-id resolution after reordering and publish/rejected-field destinations.
- Vite retains the existing unsplit bundle warning (about 805 kB minified).
- No browser automation, screenshot analysis or visual gate was run, following the owner's manual-verification preference. Desktop/mobile appearance, focus restoration, view switching with invalid text, menus, supersets, undo/redo and publish issue navigation still need manual UI verification.

## Update (2026-11-16)

- Owner request: Spreadsheet is now the first tab and the default editor view. List View opens with `?view=program`; links without a `view` parameter open Spreadsheet.
