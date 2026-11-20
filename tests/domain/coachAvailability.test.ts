import { describe, expect, it } from 'vitest';
import {
  describeHours, exceptionFields, exceptionInstants, hoursFromWeek, mergeRanges, nextRange, rangeProblem, timeOffOn, weekFromHours,
} from '@/domain/scheduling/availability';
import { dayWindows } from '@/domain/scheduling/calendar';

const TORONTO = 'America/Toronto';

describe('working hours', () => {
  it('round-trips between the saved list and the editor week', () => {
    const hours = [{ weekday: 1, startTime: '09:00', endTime: '17:00' }, { weekday: 5, startTime: '10:00', endTime: '16:00' }];
    const week = weekFromHours(hours);
    expect(week[2]).toEqual([]);
    expect(hoursFromWeek(week)).toEqual(hours);
  });

  it('merges overlapping and touching ranges like the database', () => {
    expect(mergeRanges([
      { startTime: '13:00', endTime: '17:00' }, { startTime: '09:00', endTime: '12:00' }, { startTime: '11:00', endTime: '13:00' },
    ])).toEqual([{ startTime: '09:00', endTime: '17:00' }]);
    expect(mergeRanges([{ startTime: '08:00', endTime: '12:00' }, { startTime: '13:00', endTime: '16:00' }])).toHaveLength(2);
  });

  it('needs both times and an end after the start', () => {
    expect(rangeProblem({ startTime: '09:00', endTime: '17:00' })).toBeNull();
    expect(rangeProblem({ startTime: '17:00', endTime: '09:00' })).toBe('End after the start time.');
    expect(rangeProblem({ startTime: '09:00', endTime: '09:00' })).toBe('End after the start time.');
    expect(rangeProblem({ startTime: '', endTime: '09:00' })).toBe('Enter a start and an end time.');
  });

  it('adds the hour after the last range', () => {
    expect(nextRange([{ startTime: '09:00', endTime: '12:00' }])).toEqual({ startTime: '12:00', endTime: '13:00' });
    expect(nextRange([{ startTime: '20:00', endTime: '23:30' }])).toEqual({ startTime: '09:00', endTime: '17:00' });
    expect(nextRange([])).toEqual({ startTime: '09:00', endTime: '17:00' });
  });

  it('describes runs of days with the same hours', () => {
    const hours = [1, 2, 3, 4].map((weekday) => ({ weekday, startTime: '09:00', endTime: '17:00' }))
      .concat({ weekday: 5, startTime: '10:00', endTime: '16:00' });
    expect(describeHours(hours, 'en-US')).toBe('Mon–Thu 9:00 AM–5:00 PM · Fri 10:00 AM–4:00 PM');
    expect(describeHours([{ weekday: 1, startTime: '09:00', endTime: '12:00' }, { weekday: 3, startTime: '09:00', endTime: '12:00' }], 'en-US'))
      .toBe('Mon 9:00 AM–12:00 PM · Wed 9:00 AM–12:00 PM');
    expect(describeHours([])).toBe('');
  });
});

describe('time off and extra hours', () => {
  it('turns whole days into midnight-to-midnight instants in the coach zone', () => {
    expect(exceptionInstants({ allDay: true, fromDate: '2026-12-07', toDate: '2026-12-13', startTime: '', endTime: '' }, TORONTO))
      .toEqual({ startsAt: '2026-12-07T05:00:00.000Z', endsAt: '2026-12-14T05:00:00.000Z' });
  });

  it('keeps wall-clock times across daylight saving', () => {
    expect(exceptionInstants({ allDay: false, fromDate: '2027-03-15', toDate: '2027-03-15', startTime: '09:00', endTime: '10:00' }, TORONTO))
      .toEqual({ startsAt: '2027-03-15T13:00:00.000Z', endsAt: '2027-03-15T14:00:00.000Z' });
  });

  it('refuses backwards ranges', () => {
    expect(exceptionInstants({ allDay: true, fromDate: '2026-12-07', toDate: '2026-12-06', startTime: '', endTime: '' }, TORONTO))
      .toEqual({ problem: 'The last day can’t be before the first.' });
    expect(exceptionInstants({ allDay: false, fromDate: '2026-12-07', toDate: '', startTime: '12:00', endTime: '11:00' }, TORONTO))
      .toEqual({ problem: 'End after the start time.' });
  });

  it('reads saved entries back into the editor', () => {
    expect(exceptionFields({ allDay: true, startsAt: '2026-12-07T05:00:00Z', endsAt: '2026-12-14T05:00:00Z' }, TORONTO))
      .toMatchObject({ allDay: true, fromDate: '2026-12-07', toDate: '2026-12-13' });
    expect(exceptionFields({ allDay: false, startsAt: '2026-11-28T15:00:00Z', endsAt: '2026-11-28T18:00:00Z' }, TORONTO))
      .toEqual({ allDay: false, fromDate: '2026-11-28', toDate: '2026-11-28', startTime: '10:00', endTime: '13:00' });
  });

  it('marks the dates time off touches, not the day it ends at midnight', () => {
    const vacation = [{ kind: 'time_off', startsAt: '2026-12-07T05:00:00Z', endsAt: '2026-12-14T05:00:00Z' }];
    expect(timeOffOn(vacation, '2026-12-07', TORONTO)).toBe(true);
    expect(timeOffOn(vacation, '2026-12-13', TORONTO)).toBe(true);
    expect(timeOffOn(vacation, '2026-12-14', TORONTO)).toBe(false);
    expect(timeOffOn([{ ...vacation[0]!, kind: 'extra_hours' }], '2026-12-07', TORONTO)).toBe(false);
  });
});

describe('dayWindows', () => {
  it('places windows in minutes after local midnight', () => {
    expect(dayWindows([{ startsAt: '2026-11-23T14:00:00Z', endsAt: '2026-11-23T22:00:00Z' }], '2026-11-23', TORONTO))
      .toEqual([{ start: 540, end: 1020 }]);
  });

  it('clips windows that cross midnight and skips other days', () => {
    const late = [{ startsAt: '2026-11-24T03:00:00Z', endsAt: '2026-11-24T07:00:00Z' }];
    expect(dayWindows(late, '2026-11-23', TORONTO)).toEqual([{ start: 1320, end: 1440 }]);
    expect(dayWindows(late, '2026-11-24', TORONTO)).toEqual([{ start: 0, end: 120 }]);
    expect(dayWindows(late, '2026-11-25', TORONTO)).toEqual([]);
  });

  it('uses wall-clock minutes on a daylight-saving day', () => {
    expect(dayWindows([{ startsAt: '2027-03-14T13:00:00Z', endsAt: '2027-03-14T21:00:00Z' }], '2027-03-14', TORONTO))
      .toEqual([{ start: 540, end: 1020 }]);
  });
});
