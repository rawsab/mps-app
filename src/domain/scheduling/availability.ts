import { WEEKDAYS, addDays, formatClock, weekdayShort, zonedDateTime, zonedToInstant } from './pattern';

/**
 * A coach's weekly working hours (decision 0050), as wall-clock "HH:MM" ranges in the coach's time
 * zone. Windows and open times are computed only in the database (`private.availability_windows`,
 * `private.open_slots`); these helpers edit, check and label the week.
 */
export type HoursRange = { weekday: number; startTime: string; endTime: string };
export type DayRange = { startTime: string; endTime: string };
/** The editor's week: each weekday's ranges, in the order they were added. */
export type WeekHours = Record<number, DayRange[]>;

export const DEFAULT_RANGE: DayRange = { startTime: '09:00', endTime: '17:00' };

export function weekFromHours(hours: HoursRange[]): WeekHours {
  const week: WeekHours = Object.fromEntries(WEEKDAYS.map((day) => [day, []]));
  for (const range of hours) week[range.weekday]?.push({ startTime: range.startTime, endTime: range.endTime });
  return week;
}

export function hoursFromWeek(week: WeekHours): HoursRange[] {
  return WEEKDAYS.flatMap((weekday) => (week[weekday] ?? []).map((range) => ({ weekday, ...range })));
}

const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Why a range can't be saved, or null. Overlaps are fine: the database merges them. */
export function rangeProblem(range: DayRange): string | null {
  if (!CLOCK.test(range.startTime) || !CLOCK.test(range.endTime)) return 'Enter a start and an end time.';
  if (range.endTime <= range.startTime) return 'End after the start time.';
  return null;
}

export function weekProblems(week: WeekHours): boolean {
  return hoursFromWeek(week).some((range) => rangeProblem(range) !== null);
}

/** Overlapping or touching ranges merged and sorted, as the database stores them. */
export function mergeRanges(ranges: DayRange[]): DayRange[] {
  const sorted = [...ranges].sort((a, b) => a.startTime.localeCompare(b.startTime) || a.endTime.localeCompare(b.endTime));
  const merged: DayRange[] = [];
  for (const range of sorted) {
    const last = merged.at(-1);
    if (last && range.startTime <= last.endTime) {
      if (range.endTime > last.endTime) last.endTime = range.endTime;
    } else merged.push({ ...range });
  }
  return merged;
}

/** A new range for "Add hours": the hour after the day's last range, or the default if that runs past 23:00. */
export function nextRange(ranges: DayRange[]): DayRange {
  const last = ranges.at(-1);
  if (!last || last.endTime >= '23:00') return { ...DEFAULT_RANGE };
  const end = Number(last.endTime.slice(0, 2)) * 60 + Number(last.endTime.slice(3, 5)) + 60;
  return { startTime: last.endTime, endTime: `${String(Math.floor(end / 60)).padStart(2, '0')}:${String(end % 60).padStart(2, '0')}` };
}

/**
 * "Mon–Thu 9:00 AM–5:00 PM · Fri 10:00 AM–4:00 PM". Consecutive days with the same hours share a
 * label; days without hours are left out. Empty when no day has hours.
 */
export function describeHours(hours: HoursRange[], locale?: string): string {
  const week = weekFromHours(hours);
  const label = (day: number) => mergeRanges(week[day] ?? [])
    .map((range) => `${formatClock(range.startTime, locale)}–${formatClock(range.endTime, locale)}`).join(', ');
  const groups: { first: number; last: number; hours: string }[] = [];
  for (const day of WEEKDAYS) {
    const hoursLabel = label(day);
    if (!hoursLabel) continue;
    const last = groups.at(-1);
    if (last && last.last === day - 1 && last.hours === hoursLabel) last.last = day;
    else groups.push({ first: day, last: day, hours: hoursLabel });
  }
  return groups.map((group) => `${weekdayShort(group.first)}${group.last > group.first ? `–${weekdayShort(group.last)}` : ''} ${group.hours}`).join(' · ');
}

/**
 * The editor's view of time off or extra hours, in the coach's zone. All-day entries cover whole
 * dates (`toDate` inclusive); timed ones run from `startTime` to `endTime` on `fromDate`.
 */
export type ExceptionFields = { allDay: boolean; fromDate: string; toDate: string; startTime: string; endTime: string };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function exceptionInstants(fields: ExceptionFields, timeZone: string): { startsAt: string; endsAt: string } | { problem: string } {
  if (!DATE.test(fields.fromDate)) return { problem: 'Choose a date.' };
  if (fields.allDay) {
    if (!DATE.test(fields.toDate)) return { problem: 'Choose the last day.' };
    if (fields.toDate < fields.fromDate) return { problem: 'The last day can’t be before the first.' };
    return {
      startsAt: zonedToInstant(fields.fromDate, '00:00', timeZone).toISOString(),
      endsAt: zonedToInstant(addDays(fields.toDate, 1), '00:00', timeZone).toISOString(),
    };
  }
  const problem = rangeProblem(fields);
  if (problem) return { problem };
  return {
    startsAt: zonedToInstant(fields.fromDate, fields.startTime, timeZone).toISOString(),
    endsAt: zonedToInstant(fields.fromDate, fields.endTime, timeZone).toISOString(),
  };
}

export function exceptionFields(exception: { allDay: boolean; startsAt: string; endsAt: string }, timeZone: string): ExceptionFields {
  const start = zonedDateTime(exception.startsAt, timeZone);
  const end = zonedDateTime(exception.endsAt, timeZone);
  return exception.allDay
    ? { allDay: true, fromDate: start.date, toDate: addDays(end.date, -1), startTime: DEFAULT_RANGE.startTime, endTime: DEFAULT_RANGE.endTime }
    : { allDay: false, fromDate: start.date, toDate: start.date, startTime: start.time, endTime: end.time };
}

/** Whether time off covers any part of a calendar date in the coach's zone (the month view's marker). */
export function timeOffOn(exceptions: { kind: string; startsAt: string; endsAt: string }[], day: string, timeZone: string): boolean {
  return exceptions.some((x) => {
    if (x.kind !== 'time_off') return false;
    const end = zonedDateTime(x.endsAt, timeZone);
    // An end at midnight doesn't touch that date.
    const lastDay = end.time === '00:00' ? addDays(end.date, -1) : end.date;
    return zonedDateTime(x.startsAt, timeZone).date <= day && day <= lastDay;
  });
}
