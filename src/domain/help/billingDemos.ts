import type { BillingSummary, Charge, ChargeStatus } from '@/domain/billing/billing';
import { typing, type DemoFrame, type DemoScript } from './demo';

/*
 * The payment demo for Help (decision 0057, demo 9). Payments are applied only in the database
 * (`private.apply_credit`, decision 0053): to open charges oldest first, by month and then date, with
 * anything left over kept as credit and applied to the next charge. This is a copy of that rule for
 * a fictional client's charges, so a test can check the picture against it. Change both together.
 */

const status = (amount: number, paid: number): ChargeStatus => (paid >= amount ? 'paid' : paid > 0 ? 'part_paid' : 'unpaid');

/** Charges after `credit` cents are applied, oldest first, and the credit left over. */
export function applyCredit(charges: Charge[], credit: number): { charges: Charge[]; creditCents: number } {
  let left = credit;
  const order = [...charges].filter((c) => c.status !== 'void')
    .sort((a, b) => a.period.localeCompare(b.period) || a.occurredOn.localeCompare(b.occurredOn));
  const paid = new Map<string, number>();
  for (const charge of order) {
    if (left <= 0) break;
    const take = Math.min(left, charge.amountCents - charge.paidCents);
    if (take <= 0) continue;
    paid.set(charge.id, charge.paidCents + take);
    left -= take;
  }
  return {
    charges: charges.map((c) => (paid.has(c.id) ? { ...c, paidCents: paid.get(c.id)!, status: status(c.amountCents, paid.get(c.id)!) } : c)),
    creditCents: left,
  };
}

export const DEMO_PERIOD = '2026-11-01';

/** As `get_client_billing` sums them: outstanding less credit, and what's owed from earlier months. */
export function demoSummary(charges: Charge[], creditCents: number): BillingSummary {
  const open = charges.filter((c) => c.status !== 'void');
  const outstanding = open.reduce((sum, c) => sum + c.amountCents - c.paidCents, 0);
  const earlier = open.filter((c) => c.period < DEMO_PERIOD && c.paidCents < c.amountCents);
  return {
    outstandingCents: outstanding,
    creditCents,
    balanceCents: outstanding - creditCents,
    carriedOverCents: earlier.reduce((sum, c) => sum + c.amountCents - c.paidCents, 0),
    oldestUnpaidPeriod: [...earlier].sort((a, b) => a.period.localeCompare(b.period))[0]?.period ?? null,
  };
}

const programming = (id: string, period: string, label: string): Charge => ({
  id, kind: 'programming', period, occurredOn: period, label, meetingId: null, amountCents: 30000, paidCents: 0, status: 'unpaid', voidedAt: null, voidReason: null,
  lines: [
    { id: `${id}-meso`, kind: 'service', service: 'mesocycle', label: 'Mesocycle programming', amountCents: 20000 },
    { id: `${id}-nutrition`, kind: 'service', service: 'nutrition', label: 'Nutrition programming', amountCents: 20000 },
    { id: `${id}-bundle`, kind: 'bundle_discount', service: null, label: 'Bundle discount (Mesocycle + Nutrition)', amountCents: -10000 },
  ],
});
const session = (id: string, date: string): Charge => ({
  id, kind: 'session', period: `${date.slice(0, 7)}-01`, occurredOn: date, label: 'Personal training · 60 min', meetingId: id, amountCents: 10000, paidCents: 0,
  status: 'unpaid', voidedAt: null, voidReason: null, lines: [{ id: `${id}-line`, kind: 'session', service: 'personal_training', label: 'Personal training · 60 min', amountCents: 10000 }],
});

export const BILLING_DEMO_CHARGES: Charge[] = [
  session('oct-session', '2026-10-27'),
  programming('oct', '2026-10-01', 'October 2026 programming'),
  programming('nov', '2026-11-01', 'November 2026 programming'),
];
/** Charged after the payment, when the next session's attendance is recorded. */
export const NEXT_SESSION = session('nov-session', '2026-11-24');

export type BillingDemoState = {
  charges: Charge[];
  creditCents: number;
  /** The Record a payment dialog, with the amount typed so far. */
  dialog?: { amount: string } | null;
  changed?: string[];
  /** The whole window faded out, between one loop's end and the next one's start. */
  faded?: boolean;
};

export const RECORD_PAYMENT_TARGET = 'billing-record-payment';
export const DIALOG_SAVE_TARGET = 'billing-dialog-save';
export const BALANCE_TARGET = 'billing-balance';
export const chargeTarget = (id: string) => `charge:${id}`;

function paymentToOldest(): DemoScript<BillingDemoState> {
  const start: BillingDemoState = { charges: BILLING_DEMO_CHARGES, creditCents: 0 };
  const paid = applyCredit(BILLING_DEMO_CHARGES, 75000);
  // The picture fills in month by month, oldest first, as the rule applies it.
  const october = { ...paid, charges: paid.charges.map((c) => (c.period === DEMO_PERIOD ? BILLING_DEMO_CHARGES.find((o) => o.id === c.id)! : c)), creditCents: 0 };
  const next = applyCredit([...paid.charges, NEXT_SESSION], paid.creditCents);
  const opening = 'Riley sent $750. Select Record payment and enter it.';
  type Frame = DemoFrame<BillingDemoState>;
  const frames: Frame[] = [
    // The last loop's end fades out, then the window fades back in at the start.
    { state: { ...next, faded: true }, ms: 350, caption: 'Riley owes $700. October is overdue.' },
    { state: { ...start, faded: true }, ms: 150, caption: 'Riley owes $700. October is overdue.' },
    { state: start, ms: 2400, caption: 'Riley owes $700. October is overdue.', pointer: { target: BALANCE_TARGET } },
    { state: start, ms: 900, caption: opening, pointer: { target: RECORD_PAYMENT_TARGET } },
    { state: start, ms: 400, caption: opening, pointer: { target: RECORD_PAYMENT_TARGET, press: true } },
    { state: { ...start, dialog: { amount: '' } }, ms: 700, caption: opening },
    ...typing<BillingDemoState>('750', 160, (amount) => ({ state: { ...start, dialog: { amount } }, caption: opening })),
    { state: { ...start, dialog: { amount: '750' } }, ms: 700, caption: opening, pointer: { target: DIALOG_SAVE_TARGET } },
    { state: { ...start, dialog: { amount: '750' } }, ms: 400, caption: opening, pointer: { target: DIALOG_SAVE_TARGET, press: true } },
    { state: { ...october, changed: ['oct-session', 'oct'] }, ms: 2600, caption: 'It pays the oldest charges first: October.', pointer: { target: chargeTarget('oct') } },
    { state: { ...paid, changed: ['nov'] }, ms: 2400, caption: 'Then November.', pointer: { target: chargeTarget('nov') } },
    { state: paid, ms: 2800, caption: 'The $50 left over becomes credit.', pointer: { target: BALANCE_TARGET } },
    { state: { ...next, changed: ['nov-session'] }, ms: 3400, caption: 'The next session charge uses the credit, so $50 is left to pay on it.', pointer: { target: chargeTarget('nov-session') } },
  ];
  return {
    id: 'payment-oldest-first',
    description: 'A client owes $700 across October and November. A $750 payment pays October first, then November, and the $50 left over becomes credit. The next session charge then uses that credit, leaving $50 to pay.',
    frames,
  };
}

export const BILLING_DEMOS = {
  'payment-oldest-first': paymentToOldest(),
} satisfies Record<string, DemoScript<BillingDemoState>>;

export type BillingDemoName = keyof typeof BILLING_DEMOS;
