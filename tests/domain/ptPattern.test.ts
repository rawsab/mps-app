import { describe, expect, it } from 'vitest';
import { anchorFor, cycleWeekOf, describePattern, isoWeekday, mondayOf, zonedDateTime, zonedToInstant } from '@/domain/scheduling/pattern';

describe('PT pattern calendar helpers', () => {
  it('uses ISO weekdays and Monday-based weeks', () => {
    expect(isoWeekday('2026-11-23')).toBe(1);
    expect(isoWeekday('2026-11-29')).toBe(7);
    expect(mondayOf('2026-11-29')).toBe('2026-11-23');
    expect(mondayOf('2026-11-23')).toBe('2026-11-23');
  });

  it('counts cycle weeks from the anchor in both directions, like the database', () => {
    expect(cycleWeekOf('2026-11-25', '2026-11-23', 2)).toBe(1);
    expect(cycleWeekOf('2026-12-02', '2026-11-23', 2)).toBe(2);
    expect(cycleWeekOf('2026-12-09', '2026-11-23', 2)).toBe(1);
    expect(cycleWeekOf('2026-11-18', '2026-11-23', 2)).toBe(2);
    expect(cycleWeekOf('2026-11-11', '2026-11-23', 4)).toBe(3);
    expect(cycleWeekOf('2027-01-06', '2026-11-23', 1)).toBe(1);
  });

  it('finds the anchor that makes a date fall in a chosen week', () => {
    const anchor = anchorFor('2026-11-26', 3);
    expect(anchor).toBe('2026-11-09');
    expect(cycleWeekOf('2026-11-26', anchor, 4)).toBe(3);
  });
});

describe('wall clock and instants', () => {
  it('keeps 07:00 local across daylight saving', () => {
    expect(zonedToInstant('2027-03-09', '07:00', 'America/Toronto').toISOString()).toBe('2027-03-09T12:00:00.000Z');
    expect(zonedToInstant('2027-03-16', '07:00', 'America/Toronto').toISOString()).toBe('2027-03-16T11:00:00.000Z');
    expect(zonedToInstant('2026-11-24', '23:30', 'Asia/Kolkata').toISOString()).toBe('2026-11-24T18:00:00.000Z');
  });

  it('reads a zone’s date and time back, including across midnight', () => {
    expect(zonedDateTime('2026-11-25T03:30:00Z', 'America/Vancouver')).toEqual({ date: '2026-11-24', time: '19:30' });
    expect(zonedDateTime(zonedToInstant('2026-11-24', '07:00', 'Europe/London'), 'Europe/London')).toEqual({ date: '2026-11-24', time: '07:00' });
  });
});

describe('describePattern', () => {
  it('names a single weekly session in full', () => {
    expect(describePattern({ cycleWeeks: 1, slots: [{ cycleWeek: 1, weekday: 2, startTime: '07:00', durationMinutes: 60 }] }, 'en-US').summary)
      .toBe('Every Tuesday at 7:00 AM · 60 min');
  });

  it('lists several weekly sessions in day order', () => {
    expect(describePattern({ cycleWeeks: 1, slots: [
      { cycleWeek: 1, weekday: 4, startTime: '18:00', durationMinutes: 45 },
      { cycleWeek: 1, weekday: 1, startTime: '07:00', durationMinutes: 60 },
    ] }, 'en-US').summary).toBe('Every week · Mon 7:00 AM · 60 min, Thu 6:00 PM · 45 min');
  });

  it('describes every week of a longer cycle, including empty weeks', () => {
    expect(describePattern({ cycleWeeks: 2, slots: [{ cycleWeek: 1, weekday: 3, startTime: '07:00', durationMinutes: 60 }] }, 'en-US'))
      .toEqual({ summary: 'Every 2 weeks', weeks: ['Week 1: Wed 7:00 AM · 60 min', 'Week 2: no sessions'] });
  });
});
