# 0053 — Billing (plan)

Date: 2026-11-20 · Status: **accepted plan, not built** (owner request; open questions answered below) · Builds on 0037, 0039, 0047, 0050

- **Scope change, recorded rather than resolved silently.** PRD §3 lists "Billing, subscriptions" under *Excluded from MVP*. Decision 0037 kept billing out but prepared the meeting model for it: one stable row per session, a generated `meetings.billable`, and frozen attendance statuses. This plan specifies billing. The PRD has not been edited.
- **No payment gateway.** Clients pay by Interac e-Transfer outside the app. A payment exists only once staff record it.

## Simplifications

1. **No invoice entity.** A month is a *statement*, derived from its charges. "Mark invoice paid" becomes "Mark month paid". Invoice numbers, PDFs and sending can come later if needed.
2. **One monthly programming charge per client**, itemized in lines: Mesocycle $200, Nutrition $200, Bundle discount −$100, total $300. A month is paid or unpaid as one unit, and the discount still shows as its own line.
3. **PT sessions are charged when attendance is recorded**, not when scheduled. The existing Record attendance to-do (0048) is then also the "unbilled sessions" to-do.
4. **"Last used price" and "per-client PT price" are the same value.** Each client has one PT rate per session type. Editing it on the pricing card, or setting a price on a session, updates it.
5. **Credits are payments.** Goodwill credits, overpayments and refunds of a voided charge all go through the payment and allocation logic, so there's only one way money offsets charges.

## Money basics

- Integer cents, CAD only. Prices are entered and shown in dollars (`$100`, `$85.50`).
- **Null vs zero.** A $0 session is complimentary and shows as "Complimentary". A missing price is null. It blocks the charge and shows "Needs a price"; it's never treated as $0.
- No tax, and nothing tax-related is displayed. Lines store pre-tax amounts so a tax line can be added later.

## Data model (one migration, RLS + grants + pgTAP as usual)

| Table | Purpose |
|---|---|
| `billing_settings` (single row) | Business time zone (default `America/Toronto`). Admin-editable. |
| `billing_rates` | Defaults, one row per key: `pt_solo_60` 10000, `pt_solo_40` 7000, `pt_partner_60` 12000, `pt_partner_40` 8500, `mesocycle_month` 20000, `nutrition_month` 20000, `bundle_discount_month` 10000. Admin-editable. |
| `client_service_rates` | Per-client overrides for `mesocycle_month`, `nutrition_month` and `bundle_discount_month`. No row means use the default. |
| `client_session_rates` | Per-client PT price per session type (`solo_60`, `partner_40`, …), i.e. the "last used" price. |
| `meetings` + `format` (`solo` \| `partner`, default `solo`) and `price_cents` (nullable, explicit override) | `meeting_schedules` also gets `format`, so generated meetings inherit it. Session type = format + duration. |
| `billing_charges` | What's owed: `client_id`, `kind` (`session` \| `programming` \| `adjustment`), `period` (first of month), `occurred_on`, `meeting_id` (unique among non-void), `amount_cents` (sum of lines), `voided_at`/`void_reason`, `created_by`. |
| `billing_charge_lines` | Itemization: `charge_id`, `service`, `enrollment_id`, `label`, `amount_cents` (negative for discounts). Snapshots taken at creation; rate changes never rewrite them. |
| `billing_payments` | Money received or credited: id chosen by the browser (safe retries, as with requests), `client_id`, `amount_cents > 0`, `received_on`, `method` (`e_transfer` \| `cash` \| `other` \| `credit`), `note` (staff-only), `recorded_by`, `voided_at`/`void_reason`. |
| `billing_allocations` | `payment_id`, `charge_id`, `amount_cents > 0`. A charge's allocations never exceed its amount, and a payment's never exceed the payment. |
| `billing_events` | Audit log, staff-only: who, what, when, before/after. |
| `profiles.etransfer_email` | Optional, staff only. Validated with `z.email()` and in SQL. |

Nothing is ever deleted. Charges and payments are voided with a reason.

## Rules

### Session price

For a billable meeting (tagged Personal training), the price resolves in this order:

1. `meetings.price_cents`, if the coach set one.
2. `client_session_rates` for the client and session type.
3. The `billing_rates` default for the session type.
4. Otherwise none, which shows "Needs a price". Only 40- and 60-minute types have defaults.

Setting a price on a session also writes it to `client_session_rates`, so it becomes the client's next default. Scheduled sessions without an explicit price resolve when they're charged, so they pick up the latest rate. One SQL function (`private.session_price`) holds this rule, mirrored in `src/domain/billing/` for the dialog preview, like `current_program_id`.

Meetings not tagged Personal training (Nutrition or Mesocycle check-ins) are never charged; the monthly price covers them.

### Sessions → charges

A trigger on `meetings.status` calls `private.sync_session_charge`. It covers `record_attendance`, `correct_attendance` and request acceptance, so charges can't drift from attendance.

| Status | Charge |
|---|---|
| `scheduled` | None. The meeting shows the expected price. |
| `completed` | Session price. |
| `no_show` | Session price. |
| `late_cancelled` | Session price. |
| `cancelled` | None. |

- A correction to an uncharged status voids the charge. If the charge was paid, its allocations go back to the payment and become credit.
- A correction between two charged statuses keeps the charge.
- Changing the price of a charged, unpaid session edits the charge (audited). If it's paid, the coach is told to void and re-charge.
- If no price resolves, attendance still records and the session goes on the "Needs a price" list. Setting a price creates the charge.
- Period = the session's month in the meeting's time zone.

### Monthly programming

- The hourly pg_cron job (beside `meetings-top-up`) is idempotent. **A service is charged once for every month in which it's active at some point**, from the month it starts (decision 6):
  - Active on the 1st: charged on the 1st, at 00:00 in the business time zone.
  - Started or resumed mid-month: charged that day.
  - Paused for the whole month: not charged.
  - Ended mid-month: already charged, no automatic refund.
  - No proration. The coach edits or credits if needed.
- One `programming` charge per client per month holds a line per service.
  - A service added later in the month is appended to that month's charge if it's still unpaid.
  - Otherwise it gets a second charge ("Nutrition, added Nov 14").
- **Bundle discount.** When a client's month has both Mesocycle and Nutrition lines, a "Bundle discount" line is added automatically: the client's override, else $100. It's capped so the charge can't go below $0. It's added exactly once, to whichever charge completes the pair.
- A rate change applies from the next generated charge. The current month's charge is edited separately if wanted.

### Payments and partial payments

- **Record payment** (amount, date received, method, optional note, optionally which charges).
  - It's allocated to the chosen charges first, then to the oldest unpaid charges.
  - Anything left over is credit.
  - Credit is applied automatically to new charges as they're created.
  - A per-client advisory lock serializes allocation.
- **Mark paid** on a charge or a month is a shortcut: a payment of exactly the remaining amount, allocated there. The dialog defaults to e-Transfer, received today.
- **Partial:** a smaller amount leaves the charge "Part paid · $40 of $100".
- **Void payment** (with a reason): its allocations are removed and the charges reopen.
- **Credit** (goodwill, a discount after the fact): a `credit` payment. It reduces the balance but isn't counted as money received.

### Corrections

- **Edit** a line's amount or label at any time, as long as the charge doesn't drop below what's already been paid. (Changed in phase A from "unpaid charges only": with credit applied automatically, charges are often partly paid.)
- **Void** a charge with a reason. If it was paid, its allocations become credit.
- **Adjustment:** a manual charge with a label and month, for example an opening balance from before the app.

### Balances (one SQL function, used by every screen)

- **Outstanding** = Σ (amount − allocated) over non-void charges.
- **Credit** = Σ unallocated over non-void payments. Normally zero, because credit is auto-applied.
- **Balance due** = outstanding − credit.
- **Carried over** = the outstanding part from months before the current one. It drives the "includes $X from October" message.

## Access

- **Clients** read their own charges, lines and payments (amount, date, method; no staff notes or void reasons) and their summary. They write nothing, except the optional payment notice (phase D).
- **Staff with access to the client** read and act through security-definer functions with `search_path = ''`, as everywhere else. Admins only: default rates and billing settings.
- **E-transfer email.** Clients get only their primary coach's `etransfer_email`, through `billing_payment_details()`, the same pattern as `meeting_coach_card`. Coach profiles stay private (0027). If no email is set, the Pay dialog says the coach hasn't set up e-Transfer yet.
- Browsers get SELECT only on the tables.

## UI (reusing `src/components/`)

### Coach

- **Sidebar: "Billing"**, after Meetings. "Billing" is plainer than "Finances" and matches what clients see. The page tracks charges and payments, not accounting.
- **`/coach/billing`**
  - Stat row: Outstanding (total, number of clients), From previous months, Received this month, Billed this month.
  - To-dos: Sessions needing a price, and later Payments clients reported (phase D).
  - Client table: name, balance, oldest unpaid month, last payment, plan (e.g. "Meso + Nutrition · $300/mo"). `Chip` filters: Owing · All · In credit.
  - Selecting a client (`?client=…`) opens the shared **ClientBilling** panel beside the table, or full width on phones.
- **ClientBilling** (shared with the client page):
  - Header: balance and **Record payment**.
  - **Pricing:** each service's rate with a Default or Custom `Badge`, PT rates per session type, and the bundle discount. Edited in a `Dialog`, with a "Reset to default" option.
  - **Statements:** one `AnimatedDisclosure` per month, newest first. Each shows its lines with Paid / Part paid / Unpaid badges, **Mark month paid**, and per charge an `ActionsMenu` with Mark paid, Edit and Void.
  - **Payments:** a list with method and note; void from its menu.
- **Client page:** a compact Billing card with the balance, this month's total, the plan, and "Open in Billing".
- **Meeting dialog** (billable meetings): Solo / Partner `SegmentedControl` and a price field with a hint ("Client rate", "Default", "Custom for this session"). Once attended: the charge status and **Mark paid**.
- **Pattern dialog:** Solo / Partner.
- **Profile settings:** an "E-transfer email" `TextField`, with "Clients see this when they pay. Leave blank to use none."
- **Billing settings** (admins; a dialog from the Billing page header): default prices and time zone.

### Client

- **Home:** a balance card when something is owed: "You owe $320", plus "Includes $100 from October" when anything is carried over, then **Pay** and **View billing**. Hidden when nothing is owed.
- **`/billing`:** reached from that card and the profile menu, not a sixth tab (the phone tab bar is already full at 320px).
  - The balance with **Pay**.
  - This month's lines.
  - Past months in disclosures.
  - Payments.
  - Paid and unpaid are distinguished by badge **and** text, not colour alone.
- **Pay dialog:**
  - The amount owed and the coach's e-transfer email, with a copy button.
  - Instructions: "Send an Interac e-Transfer for $320 to … Put your name in the message. Your balance updates once your coach confirms it."
  - It never marks anything paid.
- **Freshness:** coach actions invalidate their React Query keys at once. The client sees changes on their next load or window focus. No realtime subscription.

## Phases

- **A: schema and rules.**
  - The migration above, rates seeded, the meeting trigger, the monthly job, every write function, and pgTAP covering isolation, idempotent generation, the bundle, corrections and allocation limits.
  - `src/domain/billing/` (money formatting, price preview, statement grouping) with unit tests.
- **B: coach screens.** E-transfer email, meeting and pattern price, the ClientBilling panel, the client-page card, the Billing page and settings.
- **C: client screens.** The Home card, `/billing` and the Pay dialog.
- **D: optional.**
  - "I've sent it" in the Pay dialog. It posts a notice to Activity for the coach to check and leaves the balance as it is.
  - CSV export for bookkeeping.
  - Tax lines.

## Phase A (built 2026-11-20)

- **Migration 00051** (`20261120000051_billing.sql`), applied locally without a reset. `supabase db diff` replays every migration with no drift.
- **Reads:** `get_client_billing`, `billing_overview`, `list_sessions_needing_price`, `get_meeting_billing` and `billing_payment_details` (client only), plus `get_billing_settings`.
- **Writes:** `record_payment`, `mark_charges_paid`, `void_payment`, `void_charge`, `edit_charge_line`, `add_adjustment`, `set_client_service_rate`, `set_client_session_rate`, `set_meeting_billing`, `set_meeting_schedule_format`, `save_etransfer_email`, and `save_billing_settings` (admin).
- **Triggers:** `meetings_billing` (status or services change), `service_enrollments_billing` (a service added or resumed mid-month is charged at once), and format inheritance for generated meetings and "this and following" patterns. pg_cron job `billing-programming` runs hourly at :17.
- **Retries:** payments and adjustments take browser-chosen ids, so a retried request is recorded once. A per-client advisory lock serializes allocation.
- **Changes from the plan:**
  - Edits allowed while the charge stays at or above what's paid (see Corrections).
  - A payment may be dated up to one day after the business "today", so a coach east of Toronto isn't refused around midnight.
  - The pattern's Solo / Partner format is changed by `set_meeting_schedule_format`, like pattern notes, without starting a new pattern. It also updates that pattern's future scheduled meetings.
  - Only the current month is ever charged. A month the job missed entirely (the database was down all month) isn't backfilled; the coach adds an adjustment.
- **Client privacy:** clients read their own rows. Payment notes and void reasons have no column grant and come only through `get_client_billing` for staff. Clients don't see void charges or payments.
- **Domain:** `src/domain/billing/money.ts` (format and parse cents; blank is null, never $0) and `billing.ts` (document types, price preview mirroring `private.session_price`, month statements).
- **Verification:**
  - `039_billing.test.sql`: 73 pgTAP assertions, passing.
  - Full `pnpm test:db`: everything passes except the 3 known `023` failures (local state and a UTC/Toronto date edge; see status.md). `026` and `030` now pass.
  - `pnpm verify`: 377 unit tests (10 new in `tests/domain/billing.test.ts`) and the build pass.
- **Local data:** the hourly job will charge the seeded clients' current month the first time it runs (for example Maya's Mesocycle + Nutrition bundle, $300). Sessions recorded from now on are charged; seeded past sessions aren't, because the trigger only fires on changes.

## Phase B (built 2026-11-20, manual UI checks pending)

- **Billing page** (`/coach/billing`, a sidebar item after Meetings):
  - Tiles: Outstanding (and how many clients owe), From previous months, Billed this month, Received this month (credits excluded).
  - "Sessions that need a price": each row opens the meeting on the client page.
  - A client list filtered Owing · All · In credit, showing balance, an "overdue" badge for carried-over amounts, unpaid since, last paid and the monthly plan.
  - Choosing a client (`?client=`) opens their billing beside the list. On phones the panel replaces the list, with "All clients" to go back.
  - Admins get "Default prices", which edits the seven defaults.
- **ClientBillingPanel** (`src/features/billing/ClientBilling.tsx`), the same component on the Billing page and in a new Billing section on the client page, after Programs:
  - Balance, From previous months, Monthly plan.
  - Pricing: each rate with a Default or Custom badge and a pencil. "Use default" resets it.
  - Statements: one disclosure per month, newest open. Each charge has a status badge and a ⋯ menu with Mark paid, Edit and Void; programming charges list their lines, each editable. "Mark {month} paid" pays what's left on the month.
  - Payments, with void. Unapplied credit is shown.
  - The header has Record payment, and ⋯ has Add a charge and Add a credit.
- **Dialogs** (`BillingDialogs.tsx`):
  - Payments: record, credit and mark paid. Each picks a browser id once per dialog.
  - Price, add charge (month picker, never a future month), edit line (a discount is entered positive), and void (reason required).
  - Amounts are typed in dollars and parsed to cents. Blank is never $0.
- **Meeting dialog:** billable meetings that aren't ordinary cancellations get a Price section with:
  - Solo / Partner.
  - A price field. Blank uses the client's price, shown as the placeholder, with a line saying where it comes from.
  - The charge status, "Waived" when voided.
  - A one-click "Mark $X paid" (e-Transfer, today).
- **Patterns:** the pattern dialog has Solo / Partner whenever Personal training is chosen. It's saved after the pattern with `set_meeting_schedule_format`. Partner patterns show a Partner badge.
  - Migration 00052 adds `format` to `schedule_document`. It's otherwise identical to migration 00035's version, notes included.
- **Profile settings:** a Payments card for staff, with the e-transfer email (validated like the database check; blank removes it). The viewer now loads `etransferEmail`.
- **Freshness:** billing mutations refresh billing and meetings. Meeting mutations (attendance in particular) now refresh billing too.
- **Schemas** live in `src/features/billing/schemas.ts`, typed against the domain types. `tests/policies/billing.test.ts` (3 HTTP tests, read-only) parses real responses with them and checks isolation.
- **Verification:**
  - `pnpm verify`: 377 unit tests and the build pass.
  - `039_billing.test.sql`: 74 pgTAP assertions, passing.
  - Full `pnpm test:db`: passes apart from the 3 known `023` failures.
  - `supabase db diff`: no drift.
  - No browser checks.

**Revised the same day (owner feedback):**
- **PT lengths:** the Minutes field is a 60 / 40 dropdown for Personal training, in the add, change and reschedule-answer forms and in pattern slots (`MinutesField`). A meeting that already has another length keeps it as a "no default price" option. Other meetings still take any length.
- **Seed:** PT patterns are now 60 minutes (Daniel) and 40 minutes (Grace), and Daniel's one-off is 60. The local demo rows were updated in place by their seed ids, without a reset.
- **Billing page:**
  - Wide screens open the top client in the list until one is chosen. Phones keep the list.
  - An empty filter shows "Nothing owing" or "No one is in credit".
  - "Sessions that need a price" is collapsible (chevron at the top right, open at first) and shows a count.
- **Panel:**
  - A skeleton in the panel's shape while it loads, with the header buttons kept in place, so switching clients doesn't change the height.
  - Pricing moved from inline rows into "Edit client's prices" in the panel's ⋯ menu. It opens one dialog with every price, grouped Monthly programming / Personal training, each with its default underneath and "Use default" when it differs. Blank or the default amount follows the default. Only changed prices are saved.
  - The Billing page's client rows show the balance alone as a large amount. The selected client's name links to their page (↗), replacing "Open client page".
  - A divider sits under the stat tiles. A statement's "left to pay" amount is large, with a quieter label on the same baseline.
  - Statement months and "Sessions that need a price" expand and collapse with the app's height animation. An open month stops clipping once settled, so its ⋯ menus aren't cut off.
  - A charge's own status badge shows only when it differs from its month's, e.g. one paid charge in a part-paid month.
  - Charge and payment rows are vertically centred on a smaller ⋯ button (`ActionsMenu size="sm"`).

## Owner decisions (2026-11-20)

1. **Partner sessions:** the whole partner price is billed to the client the meeting belongs to, and the partner is only a label. Billing both partners would need meetings with two clients, which is a bigger scheduling change and is deferred.
2. **No-shows and late cancellations** are charged the full session price by default. The coach can void the charge.
3. **Monthly billing** is charged in advance on the 1st, for a full month, with no proration.
4. **Tax:** none charged or displayed. The design leaves room for it: lines hold pre-tax amounts, and a later `tax` line kind plus a tax rate in `billing_settings` add it without changing existing charges.
5. **Permissions:** any coach with access to the client can view billing, record payments, set the client's prices and make corrections. Default prices and billing settings stay admin-only.
6. **Start (owner, revised):** there's no global start date. Coaches add clients and services by hand at go-live, so **billing for a service starts when the service starts**.
   - Monthly: an enrollment is charged from the month of `service_enrollments.starts_on`. It's never charged for a month before the one the enrollment was created in (`created_at`), so a past start date entered for the record doesn't back-bill.
   - Sessions: PT meetings are charged only from the PT enrollment's start, under the same rule.
   - **Opening balances:** anything a client already owes is entered once as an adjustment labelled "Opening balance", dated the previous month. It counts as carried over.
   - `billing_settings.billing_starts_on` is dropped.
