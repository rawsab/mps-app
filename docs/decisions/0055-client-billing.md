# 0055 — Client billing screens (plan)

Date: 2026-11-21 · Status: **accepted plan, not built** (owner answers below) · Builds on 0053 (phases C and D)

Phase C of 0053 plus its "I've sent it" notice from phase D, which the owner moved forward. Billing stays outside the PRD's MVP scope, as recorded in 0053.

## Owner decisions (2026-11-21)

1. **Home card when nothing is owed:** a small "Paid up" line (or "$X in credit") with **View billing**, not hidden. This changes 0053, which hid the card.
2. **Pay amount:** always the full balance. Payments already apply to the oldest charges first.
3. **Prices:** clients see their monthly plan and their PT session rates.
4. **"I've sent it":** built now, not deferred to phase D.

## Client screens

- **Home card.**
  - Owing: "You owe $500", plus "Includes $X from October" when anything is carried over, then **Pay** and **View billing**.
  - Not owing: one quiet line, "Paid up" or "$X in credit", with **View billing**.
  - A pending "I've sent it" notice adds "You told your coach you sent $X on Nov 21".
- **`/billing`**, from the Home card and the profile menu (not a sixth tab). A client with no billing history sees an empty state.
  - Header: the balance with **Pay**, or "Paid up" / "$X in credit".
  - **Your prices:** the plan (e.g. "Nutrition · $200/mo", with the bundle discount when both monthly services are active) and the PT rate per session type (e.g. "60 min · $100"). Only rates that have a price are listed. Rates are read from `get_client_billing.rates`, so custom prices show as the client's own price, with no "custom" label.
  - **This month**, open by default. Each charge shows its date, label and amount, with a status as a badge plus text: Paid, Part paid · $X left, or Unpaid. A monthly charge lists its services and the discount.
  - **Past months** in disclosures, with each month's total and status on its row.
  - **Payments:** date, method and amount. No staff notes, and voided payments are hidden (already enforced by `get_client_billing`).
- **Pay dialog.**
  - The full balance and the coach's e-Transfer email, with a copy button.
  - "Send an Interac e-Transfer for $500 to …. Put your name in the message. Your balance updates once your coach confirms it."
  - No email set: "Your coach hasn't set up e-Transfer yet."
  - **I've sent it** (see below). The dialog never marks anything paid.

## "I've sent it" notice (migration)

- **Table `billing_payment_notices`:** client, amount in cents, sent-on date, optional message, status (`pending`, `confirmed`, `dismissed`), resolved by/at, and the linked payment when confirmed. RLS, explicit grants and pgTAP in the same migration.
- **`report_payment_sent(p_id, p_amount_cents, p_sent_on, p_message)`**, clients only, for their own row. It's idempotent on `p_id`. The amount defaults to the balance and must be more than $0. One pending notice per client: a second one replaces the amount of the first.
- **Coach side.**
  - The Billing page gets a **Payments clients reported** to-do (planned in 0053). Each row has **Record payment**, which opens the payment dialog prefilled with the amount and date, and **Dismiss**.
  - Recording that payment confirms the notice. Dismissing asks for a reason, which the client doesn't see.
  - The notice also appears in Activity / To review, like service requests.
- **The balance doesn't change** until staff record the payment, as in 0053.

## Tests

- Unit tests for new domain logic (Home card wording, price list).
- HTTP: a client reads only their own billing and payment details, can't call staff billing functions, and can report a notice only for themselves.
- pgTAP: notice isolation, idempotency, one pending notice per client, confirm and dismiss.
