import type { ServiceKind } from '@/domain/programs/contract';
import { periodLabel, type BillingSummary, type ClientBilling } from './billing';
import { formatCents } from './money';

// What the client's billing screens say (decision 0055). DOM-free, like the rest of src/domain.

export type BalanceHeadline =
  | { kind: 'owing'; text: string; detail: string | null }
  | { kind: 'credit'; text: string }
  | { kind: 'paid'; text: string };

/** "You owe $500" with "Includes $100 from October" when an earlier month is unpaid; else "Paid up" or credit. */
export function balanceHeadline(summary: BillingSummary, currentPeriod: string): BalanceHeadline {
  if (summary.balanceCents > 0) {
    const oldest = summary.oldestUnpaidPeriod;
    let detail: string | null = null;
    if (summary.carriedOverCents > 0 && oldest) {
      const from = monthName(oldest);
      detail = oldest === previousPeriod(currentPeriod)
        ? `Includes ${formatCents(summary.carriedOverCents)} from ${from}`
        : `Includes ${formatCents(summary.carriedOverCents)} from ${from} onward`;
    }
    return { kind: 'owing', text: `You owe ${formatCents(summary.balanceCents)}`, detail };
  }
  if (summary.balanceCents < 0) return { kind: 'credit', text: `${formatCents(-summary.balanceCents)} in credit` };
  return { kind: 'paid', text: 'Paid up' };
}

export type PriceRow = { label: string; amount: string };

/**
 * The client's prices: each live monthly service, the bundle discount when both apply, then PT
 * rates per session type that have a price. Unpriced rates are left out (null is never $0).
 */
export function clientPrices(rates: ClientBilling['rates'], services: ServiceKind[]): { monthly: PriceRow[]; sessions: PriceRow[] } {
  const monthly: PriceRow[] = [];
  const rate = (key: string) => rates.services.find((r) => r.key === key)?.amountCents ?? null;
  const meso = services.includes('mesocycle') ? rate('mesocycle_month') : null;
  const nutrition = services.includes('nutrition') ? rate('nutrition_month') : null;
  if (meso !== null) monthly.push({ label: 'Mesocycle programming', amount: `${formatCents(meso)}/mo` });
  if (nutrition !== null) monthly.push({ label: 'Nutrition programming', amount: `${formatCents(nutrition)}/mo` });
  const discount = rate('bundle_discount_month');
  if (meso !== null && nutrition !== null && discount) monthly.push({ label: 'Bundle discount', amount: `−${formatCents(discount)}/mo` });

  const sessions = services.includes('personal_training')
    ? rates.sessions.filter((r) => r.amountCents !== null).map((r) => {
      const [format, minutes] = r.sessionType.split('_');
      return {
        label: `${format === 'partner' ? 'Partner session' : 'Session'} · ${minutes} min`,
        amount: r.amountCents === 0 ? 'Complimentary' : formatCents(r.amountCents!),
      };
    })
    : [];
  return { monthly, sessions };
}

const monthName = (period: string) => periodLabel(period).replace(/ \d{4}$/, '');

function previousPeriod(period: string): string {
  const [year, month] = period.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(year, month - 2, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
