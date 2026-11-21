import { describe, expect, it } from 'vitest';
import {
  periodLabel,
  previewSessionPrice,
  sessionTypeLabel,
  statements,
  unpaidCharges,
  type Charge,
  type SessionRate,
} from '@/domain/billing/billing';
import { centsToInput, formatCents, parseDollars } from '@/domain/billing/money';

const charge = (id: string, period: string, amountCents: number, paidCents = 0, status?: Charge['status']): Charge => ({
  id,
  kind: 'session',
  period,
  occurredOn: period,
  label: 'Personal training · 60 min',
  meetingId: null,
  amountCents,
  paidCents,
  status: status ?? (paidCents >= amountCents ? 'paid' : paidCents > 0 ? 'part_paid' : 'unpaid'),
  voidedAt: status === 'void' ? '2026-11-20T00:00:00Z' : null,
  voidReason: null,
  lines: [],
});

describe('formatCents', () => {
  it('shows whole dollars without cents and keeps cents otherwise', () => {
    expect(formatCents(10000)).toBe('$100');
    expect(formatCents(8550)).toBe('$85.50');
    expect(formatCents(0)).toBe('$0');
    expect(formatCents(120000)).toBe('$1,200');
  });

  it('uses a minus sign for discounts and credit', () => {
    expect(formatCents(-10000)).toBe('−$100');
  });
});

describe('parseDollars', () => {
  it('reads what coaches type', () => {
    expect(parseDollars('100')).toBe(10000);
    expect(parseDollars(' $85.5 ')).toBe(8550);
    expect(parseDollars('1,200.00')).toBe(120000);
    expect(parseDollars('0')).toBe(0);
  });

  it('returns null rather than zero for anything that is not an amount', () => {
    expect(parseDollars('')).toBeNull();
    expect(parseDollars('-5')).toBeNull();
    expect(parseDollars('1.234')).toBeNull();
    expect(parseDollars('abc')).toBeNull();
    expect(parseDollars('100001')).toBeNull();
  });

  it('round-trips through the input format', () => {
    expect(centsToInput(8550)).toBe('85.50');
    expect(centsToInput(10000)).toBe('100');
    expect(centsToInput(null)).toBe('');
    expect(parseDollars(centsToInput(8550))).toBe(8550);
  });
});

describe('previewSessionPrice', () => {
  const rates: SessionRate[] = [
    { sessionType: 'solo_60', defaultCents: 10000, customCents: 9000, amountCents: 9000 },
    { sessionType: 'solo_40', defaultCents: 7000, customCents: null, amountCents: 7000 },
    { sessionType: 'solo_45', defaultCents: null, customCents: 8000, amountCents: 8000 },
  ];

  it('prefers the meeting, then the client rate, then the default', () => {
    expect(previewSessionPrice(5000, 'solo_60', rates)).toEqual({ cents: 5000, source: 'meeting' });
    expect(previewSessionPrice(null, 'solo_60', rates)).toEqual({ cents: 9000, source: 'client' });
    expect(previewSessionPrice(null, 'solo_40', rates)).toEqual({ cents: 7000, source: 'default' });
    expect(previewSessionPrice(null, 'solo_45', rates)).toEqual({ cents: 8000, source: 'client' });
  });

  it('keeps a complimentary session at zero and a missing price null', () => {
    expect(previewSessionPrice(0, 'solo_60', rates)).toEqual({ cents: 0, source: 'meeting' });
    expect(previewSessionPrice(null, 'solo_30', rates)).toEqual({ cents: null, source: null });
  });
});

describe('labels', () => {
  it('names session types and months', () => {
    expect(sessionTypeLabel('partner_40')).toBe('Partner personal training · 40 min');
    expect(sessionTypeLabel('solo_60')).toBe('Personal training · 60 min');
    expect(periodLabel('2026-11-01')).toBe('November 2026');
  });
});

describe('statements', () => {
  it('groups charges by month, newest first, leaving void charges out of the totals', () => {
    const result = statements([
      charge('a', '2026-11-01', 10000, 10000),
      charge('b', '2026-11-01', 9000, 4000),
      charge('c', '2026-11-01', 5000, 0, 'void'),
      charge('d', '2026-10-01', 30000, 0),
    ]);
    expect(result.map((s) => s.period)).toEqual(['2026-11-01', '2026-10-01']);
    expect(result[0]!).toMatchObject({ totalCents: 19000, paidCents: 14000, outstandingCents: 5000, status: 'part_paid' });
    expect(result[0]!.voided.map((c) => c.id)).toEqual(['c']);
    expect(result[1]!.status).toBe('unpaid');
    expect(unpaidCharges(result[0]!).map((c) => c.id)).toEqual(['b']);
  });

  it('calls a month with only void charges empty and a fully paid one paid', () => {
    expect(statements([charge('a', '2026-11-01', 5000, 0, 'void')])[0]!.status).toBe('empty');
    expect(statements([charge('a', '2026-11-01', 0, 0)])[0]!.status).toBe('paid');
  });
});
