import { addDays, isoWeekday, mondayOf } from './pattern';

/**
 * The coach's Meetings calendar (decision 0040): month, week and day views over calendar dates
 * ("YYYY-MM-DD") in the coach's time zone. Weeks start on Monday, like patterns.
 */
export type CalendarView = 'month' | 'week' | 'day';
export const CALENDAR_VIEWS: CalendarView[] = ['month', 'week', 'day'];

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * "2 days, 3 hours, 15 minutes" until `start`, leaving out zero parts. "less than a minute" inside
 * the last minute; null once it has started.
 */
export function countdown(now: number, start: number): string | null {
  if (start <= now) return null;
  const minutes = Math.floor((start - now) / 60_000);
  if (minutes === 0) return 'less than a minute';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  return [days ? plural(days, 'day') : '', hours ? plural(hours, 'hour') : '', rest ? plural(rest, 'minute') : ''].filter(Boolean).join(', ');
}

function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

/** The dates a view shows. Month views fill whole Monday–Sunday weeks around the month. */
export function viewDays(view: CalendarView, date: string): string[] {
  if (view === 'day') return [date];
  if (view === 'week') return Array.from({ length: 7 }, (_, i) => addDays(mondayOf(date), i));
  const first = monthStart(date);
  const last = addDays(first, daysInMonth(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1) - 1);
  const start = mondayOf(first);
  const end = addDays(last, 7 - isoWeekday(last));
  const days: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push(d);
  return days;
}

/** The next or previous month, week or day. Moving months keeps the day where it can (31 Jan → 28 Feb). */
export function stepDate(view: CalendarView, date: string, direction: 1 | -1): string {
  if (view === 'day') return addDays(date, direction);
  if (view === 'week') return addDays(date, 7 * direction);
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7)) - 1 + direction;
  const target = new Date(Date.UTC(year, month, 1));
  const day = Math.min(Number(date.slice(8, 10)), daysInMonth(target.getUTCFullYear(), target.getUTCMonth()));
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), day)).toISOString().slice(0, 10);
}

export type DayEvent = { id: string; start: number; end: number };

/**
 * Side-by-side lanes for overlapping events in one day column (minutes from midnight). Events that
 * overlap, directly or through a chain, share a group and split its width; `lanes` is that group's
 * width.
 */
export function layoutDay(events: DayEvent[]): Map<string, { lane: number; lanes: number }> {
  const sorted = [...events].sort((a, b) => a.start - b.start || b.end - a.end || a.id.localeCompare(b.id));
  const result = new Map<string, { lane: number; lanes: number }>();
  let group: { id: string; lane: number }[] = [];
  let laneEnds: number[] = [];
  let groupEnd = -Infinity;
  const close = () => {
    for (const item of group) result.set(item.id, { lane: item.lane, lanes: laneEnds.length });
    group = [];
    laneEnds = [];
  };
  for (const event of sorted) {
    if (event.start >= groupEnd) close();
    const end = Math.max(event.end, event.start + 1);
    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= event.start);
    if (lane === -1) lane = laneEnds.push(end) - 1;
    else laneEnds[lane] = end;
    group.push({ id: event.id, lane });
    groupEnd = group.length === 1 ? end : Math.max(groupEnd, end);
  }
  close();
  return result;
}
