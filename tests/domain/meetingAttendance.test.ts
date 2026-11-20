import { describe, expect, it } from 'vitest';
import { groupAttendanceByDay, nextFocus } from '@/domain/scheduling/attendance';

const meeting = (id: string, startsAt: string) => ({ id, startsAt });

describe('groupAttendanceByDay', () => {
  // 2026-11-20 15:00 in Toronto.
  const now = new Date('2026-11-20T20:00:00Z');

  it('puts the newest day and meeting first', () => {
    const days = groupAttendanceByDay([
      meeting('a', '2026-11-17T12:00:00Z'),
      meeting('b', '2026-11-20T14:00:00Z'),
      meeting('c', '2026-11-20T12:00:00Z'),
      meeting('d', '2026-11-19T12:00:00Z'),
    ], 'America/Toronto', now);
    expect(days.map((day) => [day.date, day.relative, day.meetings.map((m) => m.id)])).toEqual([
      ['2026-11-20', 'today', ['b', 'c']],
      ['2026-11-19', 'yesterday', ['d']],
      ['2026-11-17', null, ['a']],
    ]);
  });

  it('uses the coach’s time zone for the day', () => {
    // 03:00 UTC on the 20th is still the 19th in Toronto.
    const [day] = groupAttendanceByDay([meeting('a', '2026-11-20T03:00:00Z')], 'America/Toronto', now);
    expect(day).toMatchObject({ date: '2026-11-19', relative: 'yesterday' });
  });

  it('returns nothing for no meetings', () => {
    expect(groupAttendanceByDay([], 'UTC', now)).toEqual([]);
  });
});

describe('nextFocus', () => {
  it('moves to the next meeting, then the previous, then nowhere', () => {
    expect(nextFocus(['a', 'b', 'c'], 'a')).toBe('b');
    expect(nextFocus(['a', 'b', 'c'], 'c')).toBe('b');
    expect(nextFocus(['a'], 'a')).toBeNull();
    expect(nextFocus(['a'], 'x')).toBeNull();
  });
});
