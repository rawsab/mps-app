import { describe, expect, it } from 'vitest';
import { countdown, layoutDay, stepDate, viewDays } from '@/domain/scheduling/calendar';

const MIN = 60_000;

describe('countdown', () => {
  it('lists days, hours and minutes, leaving out zero parts', () => {
    expect(countdown(0, (2 * 1440 + 3 * 60 + 15) * MIN)).toBe('2 days, 3 hours, 15 minutes');
    expect(countdown(0, (1440 + 1) * MIN)).toBe('1 day, 1 minute');
    expect(countdown(0, 60 * MIN)).toBe('1 hour');
    expect(countdown(0, 45 * MIN + 59_000)).toBe('45 minutes');
  });

  it('says less than a minute in the last minute and nothing once started', () => {
    expect(countdown(0, 30_000)).toBe('less than a minute');
    expect(countdown(1000, 1000)).toBeNull();
  });
});

describe('calendar views', () => {
  it('fills whole Monday–Sunday weeks around a month', () => {
    const days = viewDays('month', '2026-11-17');
    expect(days[0]).toBe('2026-10-26');
    expect(days.at(-1)).toBe('2026-12-06');
    expect(days).toHaveLength(42);
    expect(viewDays('month', '2027-02-10')).toHaveLength(28);
  });

  it('shows Monday to Sunday for a week and one date for a day', () => {
    expect(viewDays('week', '2026-11-19')).toEqual(['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']);
    expect(viewDays('day', '2026-11-19')).toEqual(['2026-11-19']);
  });

  it('steps by month, week or day, keeping the day of the month where it can', () => {
    expect(stepDate('month', '2027-01-31', 1)).toBe('2027-02-28');
    expect(stepDate('month', '2026-12-15', 1)).toBe('2027-01-15');
    expect(stepDate('month', '2026-01-15', -1)).toBe('2025-12-15');
    expect(stepDate('week', '2026-11-17', -1)).toBe('2026-11-10');
    expect(stepDate('day', '2026-12-31', 1)).toBe('2027-01-01');
  });
});

describe('layoutDay', () => {
  it('puts overlapping meetings side by side and lets separate ones use the full width', () => {
    const layout = layoutDay([
      { id: 'a', start: 420, end: 480 },
      { id: 'b', start: 450, end: 510 },
      { id: 'c', start: 490, end: 520 },
      { id: 'd', start: 600, end: 660 },
    ]);
    expect(layout.get('a')).toEqual({ lane: 0, lanes: 2 });
    expect(layout.get('b')).toEqual({ lane: 1, lanes: 2 });
    expect(layout.get('c')).toEqual({ lane: 0, lanes: 2 });
    expect(layout.get('d')).toEqual({ lane: 0, lanes: 1 });
  });

  it('treats back-to-back meetings as not overlapping', () => {
    const layout = layoutDay([{ id: 'a', start: 420, end: 480 }, { id: 'b', start: 480, end: 540 }]);
    expect(layout.get('b')).toEqual({ lane: 0, lanes: 1 });
  });
});
