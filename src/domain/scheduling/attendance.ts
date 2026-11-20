import { addDays, zonedDateTime } from './pattern';

// Record attendance on the Meetings page (decision 0048): meetings without attendance, newest first,
// grouped by the day they happened in the coach's time zone.

export type AttendanceDay<T> = { date: string; relative: 'today' | 'yesterday' | null; meetings: T[] };

export function groupAttendanceByDay<T extends { id: string; startsAt: string }>(meetings: T[], timeZone: string, now: Date): AttendanceDay<T>[] {
  const today = zonedDateTime(now, timeZone).date;
  const yesterday = addDays(today, -1);
  const sorted = [...meetings].sort((a, b) => b.startsAt.localeCompare(a.startsAt) || b.id.localeCompare(a.id));
  const days: AttendanceDay<T>[] = [];
  for (const meeting of sorted) {
    const date = zonedDateTime(meeting.startsAt, timeZone).date;
    const last = days.at(-1);
    if (last?.date === date) last.meetings.push(meeting);
    else days.push({ date, relative: date === today ? 'today' : date === yesterday ? 'yesterday' : null, meetings: [meeting] });
  }
  return days;
}

/**
 * Where focus goes once `id` is recorded and leaves the list: the next meeting in the shown order,
 * else the previous one, else nothing.
 */
export function nextFocus(order: string[], id: string): string | null {
  const index = order.indexOf(id);
  if (index < 0) return null;
  return order[index + 1] ?? order[index - 1] ?? null;
}
