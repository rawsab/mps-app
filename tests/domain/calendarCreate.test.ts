import { describe, expect, it } from 'vitest';
import { clockTime, dragRange, monthDefaultStart, snapDown } from '@/domain/scheduling/calendarCreate';

describe('calendar click-to-create (decision 0066)', () => {
  it('snaps a click down to the 15-minute mark, within the day', () => {
    expect(snapDown(10 * 60 + 14)).toBe(10 * 60);
    expect(snapDown(10 * 60 + 15)).toBe(10 * 60 + 15);
    expect(snapDown(-20)).toBe(0);
    expect(snapDown(24 * 60 + 5)).toBe(23 * 60 + 45);
  });

  it('turns a drag into a start and length, in either direction', () => {
    expect(dragRange(9 * 60 + 5, 10 * 60 + 20)).toEqual({ start: 9 * 60, minutes: 90 });
    expect(dragRange(10 * 60 + 20, 9 * 60 + 5)).toEqual({ start: 9 * 60, minutes: 90 });
    expect(dragRange(9 * 60, 9 * 60)).toEqual({ start: 9 * 60, minutes: 15 });
    expect(dragRange(23 * 60, 25 * 60)).toEqual({ start: 23 * 60, minutes: 60 });
  });

  it('starts month-view meetings at the first open time, else 9:00', () => {
    expect(monthDefaultStart([{ start: 13 * 60, end: 17 * 60 }, { start: 7 * 60 + 30, end: 11 * 60 }])).toBe(7 * 60 + 30);
    expect(monthDefaultStart([])).toBe(9 * 60);
    expect(monthDefaultStart(undefined)).toBe(9 * 60);
  });

  it('formats clock times', () => {
    expect(clockTime(7 * 60 + 5)).toBe('07:05');
    expect(clockTime(0)).toBe('00:00');
  });
});
