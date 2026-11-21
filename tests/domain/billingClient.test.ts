import { describe, expect, it } from 'vitest';
import type { BillingSummary, ClientBilling } from '@/domain/billing/billing';
import { balanceHeadline, clientPrices } from '@/domain/billing/client';

const summary = (balanceCents: number, carriedOverCents = 0, oldestUnpaidPeriod: string | null = null): BillingSummary => ({
  outstandingCents: Math.max(balanceCents, 0), creditCents: Math.max(-balanceCents, 0), balanceCents, carriedOverCents, oldestUnpaidPeriod,
});

describe('balanceHeadline', () => {
  it('says what is owed and what carried over from last month', () => {
    expect(balanceHeadline(summary(50000, 10000, '2026-10-01'), '2026-11-01'))
      .toEqual({ kind: 'owing', text: 'You owe $500', detail: 'Includes $100 from October' });
  });

  it('says "onward" when the oldest unpaid month is earlier than last month', () => {
    expect(balanceHeadline(summary(50000, 30000, '2026-09-01'), '2026-11-01'))
      .toMatchObject({ detail: 'Includes $300 from September onward' });
  });

  it('crosses the year for January', () => {
    expect(balanceHeadline(summary(100, 100, '2026-12-01'), '2027-01-01')).toMatchObject({ detail: 'Includes $1 from December' });
  });

  it('has no detail when only this month is owed', () => {
    expect(balanceHeadline(summary(20000, 0, '2026-11-01'), '2026-11-01')).toMatchObject({ detail: null });
  });

  it('reports paid up and credit', () => {
    expect(balanceHeadline(summary(0), '2026-11-01')).toEqual({ kind: 'paid', text: 'Paid up' });
    expect(balanceHeadline(summary(-4000), '2026-11-01')).toEqual({ kind: 'credit', text: '$40 in credit' });
  });
});

describe('clientPrices', () => {
  const rates: ClientBilling['rates'] = {
    services: [
      { key: 'bundle_discount_month', defaultCents: 10000, customCents: null, amountCents: 10000 },
      { key: 'mesocycle_month', defaultCents: 20000, customCents: null, amountCents: 20000 },
      { key: 'nutrition_month', defaultCents: 20000, customCents: 15000, amountCents: 15000 },
    ],
    sessions: [
      { sessionType: 'solo_60', defaultCents: 10000, customCents: null, amountCents: 10000 },
      { sessionType: 'partner_40', defaultCents: null, customCents: 0, amountCents: 0 },
      { sessionType: 'solo_25', defaultCents: null, customCents: null, amountCents: null },
    ],
  };

  it('lists live monthly services, the discount only with both, and priced PT rates', () => {
    expect(clientPrices(rates, ['mesocycle', 'nutrition', 'personal_training'])).toEqual({
      monthly: [
        { label: 'Mesocycle programming', amount: '$200/mo' },
        { label: 'Nutrition programming', amount: '$150/mo' },
        { label: 'Bundle discount', amount: '−$100/mo' },
      ],
      sessions: [
        { label: 'Session · 60 min', amount: '$100' },
        { label: 'Partner session · 40 min', amount: 'Complimentary' },
      ],
    });
  });

  it('leaves out services the client does not have', () => {
    expect(clientPrices(rates, ['nutrition'])).toEqual({ monthly: [{ label: 'Nutrition programming', amount: '$150/mo' }], sessions: [] });
  });
});
