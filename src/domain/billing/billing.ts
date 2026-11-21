// Billing documents as returned by get_client_billing and friends (decision 0053, migration 00051), and the
// small rules the screens need. The database decides every charge; this only labels and groups them.

export type SessionFormat = 'solo' | 'partner';
export type ChargeKind = 'session' | 'programming' | 'adjustment';
export type LineKind = 'session' | 'service' | 'bundle_discount' | 'adjustment';
export type ChargeStatus = 'unpaid' | 'part_paid' | 'paid' | 'void';
export type PaymentMethod = 'e_transfer' | 'cash' | 'other' | 'credit';
export type ServiceRateKey = 'mesocycle_month' | 'nutrition_month' | 'bundle_discount_month';

export type ChargeLine = {
  id: string;
  kind: LineKind;
  service: 'personal_training' | 'mesocycle' | 'nutrition' | null;
  label: string;
  amountCents: number;
};

export type Charge = {
  id: string;
  kind: ChargeKind;
  /** First of the month, `YYYY-MM-DD`. */
  period: string;
  occurredOn: string;
  label: string;
  meetingId: string | null;
  amountCents: number;
  paidCents: number;
  status: ChargeStatus;
  voidedAt: string | null;
  /** Staff only. */
  voidReason: string | null;
  lines: ChargeLine[];
};

export type Payment = {
  id: string;
  amountCents: number;
  allocatedCents: number;
  receivedOn: string;
  method: PaymentMethod;
  recordedAt: string;
  /** Staff only. */
  note: string | null;
  voidedAt: string | null;
  /** Staff only. */
  voidReason: string | null;
  allocations: { chargeId: string; amountCents: number }[];
};

export type BillingSummary = {
  outstandingCents: number;
  creditCents: number;
  /** Outstanding less credit; negative when the client is in credit. */
  balanceCents: number;
  /** Outstanding from months before the current one. */
  carriedOverCents: number;
  oldestUnpaidPeriod: string | null;
};

export type Rate = { defaultCents: number | null; customCents: number | null; amountCents: number | null };
export type ServiceRate = Rate & { key: ServiceRateKey };
export type SessionRate = Rate & { sessionType: string };

export type ClientBilling = {
  clientId: string;
  currentPeriod: string;
  summary: BillingSummary;
  rates: { services: ServiceRate[]; sessions: SessionRate[] };
  /** Live Mesocycle and Nutrition at current rates, less the bundle discount; null without either. */
  planCents: number | null;
  /** Newest first. */
  charges: Charge[];
  /** Newest first. */
  payments: Payment[];
};

export type MeetingBilling = {
  meetingId: string;
  billable: boolean;
  format: SessionFormat;
  sessionType: string;
  priceCents: number | null;
  resolvedPriceCents: number | null;
  priceSource: 'meeting' | 'client' | 'default' | null;
  charge: Charge | null;
};

export const sessionType = (format: SessionFormat, minutes: number) => `${format}_${minutes}`;

/** `Personal training · 60 min`, `Partner personal training · 40 min`. */
export function sessionTypeLabel(type: string): string {
  const [format, minutes] = type.split('_');
  return `${format === 'partner' ? 'Partner personal training' : 'Personal training'} · ${minutes} min`;
}

export const serviceRateLabel: Record<ServiceRateKey, string> = {
  mesocycle_month: 'Mesocycle programming',
  nutrition_month: 'Nutrition programming',
  bundle_discount_month: 'Bundle discount (Mesocycle + Nutrition)',
};

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  e_transfer: 'e-Transfer',
  cash: 'Cash',
  other: 'Other',
  credit: 'Credit',
};

export const chargeStatusLabel: Record<ChargeStatus, string> = {
  unpaid: 'Unpaid',
  part_paid: 'Part paid',
  paid: 'Paid',
  void: 'Void',
};

/**
 * Mirrors `private.session_price` for the meeting dialog's preview: the meeting's own price, else the client's
 * rate for the session type, else the default. Null when none applies ("Needs a price"), never zero.
 */
export function previewSessionPrice(
  priceCents: number | null,
  type: string,
  sessions: SessionRate[],
): { cents: number | null; source: MeetingBilling['priceSource'] } {
  if (priceCents !== null) return { cents: priceCents, source: 'meeting' };
  const rate = sessions.find((r) => r.sessionType === type);
  if (rate?.customCents != null) return { cents: rate.customCents, source: 'client' };
  if (rate?.defaultCents != null) return { cents: rate.defaultCents, source: 'default' };
  return { cents: null, source: null };
}

/** `November 2026` for a `YYYY-MM-01` period. */
export function periodLabel(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-CA', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export type Statement = {
  period: string;
  /** Charges that count (not void), newest first. */
  charges: Charge[];
  voided: Charge[];
  totalCents: number;
  paidCents: number;
  outstandingCents: number;
  status: Exclude<ChargeStatus, 'void'> | 'empty';
};

/** One statement per month, newest first, from `get_client_billing` charges. */
export function statements(charges: Charge[]): Statement[] {
  const byPeriod = new Map<string, Charge[]>();
  for (const charge of charges) {
    const list = byPeriod.get(charge.period) ?? [];
    list.push(charge);
    byPeriod.set(charge.period, list);
  }
  return [...byPeriod.entries()]
    .sort(([a], [b]) => (a < b ? 1 : a > b ? -1 : 0))
    .map(([period, list]) => {
      const open = list.filter((c) => c.status !== 'void');
      const totalCents = open.reduce((sum, c) => sum + c.amountCents, 0);
      const paidCents = open.reduce((sum, c) => sum + c.paidCents, 0);
      const outstandingCents = totalCents - paidCents;
      const status: Statement['status'] =
        open.length === 0 ? 'empty' : outstandingCents <= 0 ? 'paid' : paidCents > 0 ? 'part_paid' : 'unpaid';
      return { period, charges: open, voided: list.filter((c) => c.status === 'void'), totalCents, paidCents, outstandingCents, status };
    });
}

/** Unpaid and part-paid charges in a statement: what "Mark month paid" covers. */
export const unpaidCharges = (statement: Statement) => statement.charges.filter((c) => c.paidCents < c.amountCents);
