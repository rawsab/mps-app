import { describe, expect, it } from 'vitest';
import { fillSlots, foldRows, trendWindow } from '@/domain/activity/trends';

describe('activity trend windows', () => {
  const now = new Date(2026, 10, 20, 15, 30);

  it('covers today by hour, keyed in local time', () => {
    const w = trendWindow('day', now);
    expect(w.bucket).toBe('hour');
    expect(w.slots).toHaveLength(24);
    expect(w.slots[0]?.key).toBe('2026-11-20T00');
    expect(w.slots[23]?.key).toBe('2026-11-20T23');
    expect(w.from).toEqual(new Date(2026, 10, 20));
    expect(w.to).toEqual(new Date(2026, 10, 21));
    expect(w.slots.filter((slot) => slot.tick)).toHaveLength(4);
  });

  it('ends the week and month with today', () => {
    const week = trendWindow('week', now);
    expect(week.slots.map((slot) => slot.key)).toEqual(['2026-11-14', '2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20']);
    expect(week.from).toEqual(new Date(2026, 10, 14));
    const month = trendWindow('month', now);
    expect(month.slots).toHaveLength(30);
    expect(month.slots[0]?.key).toBe('2026-10-22');
    expect(month.slots.at(-1)!.tick).not.toBe('');
  });

  it('fills missing buckets with zero', () => {
    const { slots } = trendWindow('week', now);
    expect(fillSlots(slots, [{ bucket: '2026-11-20', count: 3 }, { bucket: '2026-11-14', count: 1 }, { bucket: '2026-01-01', count: 9 }]))
      .toEqual([1, 0, 0, 0, 0, 0, 3]);
  });

  it('folds the quieter rows into Other', () => {
    const rows = [5, 4, 3, 2, 1].map((count, i) => ({ key: `c${i}`, label: `C${i}`, count }));
    expect(foldRows(rows, 5, (n) => `${n} others`)).toBe(rows);
    expect(foldRows(rows, 3, (n) => `${n} others`)).toEqual([rows[0], rows[1], { key: 'other', label: '3 others', count: 6 }]);
  });
});
