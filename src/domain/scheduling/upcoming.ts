import { zonedDateTime } from './pattern';

/**
 * What upcoming lists need from a meeting (decisions 0026, 0039): an id, a UTC start instant and a
 * length. Meetings from `list_meetings` fit as they are.
 */
export type UpcomingSession = {
  id: string;
  /** UTC instant; shown in the viewer's zone. */
  startsAt: string;
  durationMinutes: number;
};

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Sessions still to finish from today through the next `days` days, soonest first, grouped by the
 * viewer's local day ("Today", "Tomorrow", then a weekday and date).
 */
export function upcomingByDay<T extends UpcomingSession>(sessions: T[], now: Date, formatDay: (d: Date) => string, days = 7): { label: string; sessions: T[] }[] {
  const end = startOfDay(now).getTime() + days * DAY_MS;
  const today = startOfDay(now).getTime();
  const groups: { key: number; label: string; sessions: T[] }[] = [];
  const upcoming = sessions
    .filter((s) => new Date(s.startsAt).getTime() + s.durationMinutes * 60_000 > now.getTime() && new Date(s.startsAt).getTime() < end)
    .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || a.id.localeCompare(b.id));
  for (const session of upcoming) {
    const day = startOfDay(new Date(session.startsAt));
    const key = day.getTime();
    const last = groups.at(-1);
    if (last?.key === key) { last.sessions.push(session); continue; }
    const offset = Math.round((key - today) / DAY_MS);
    groups.push({ key, label: offset === 0 ? 'Today' : offset === 1 ? 'Tomorrow' : formatDay(day), sessions: [session] });
  }
  return groups.map(({ label, sessions }) => ({ label, sessions }));
}

/** Whole days from one `YYYY-MM-DD` date to another. */
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/**
 * Like `upcomingByDay`, but days are calendar dates in `timeZone` (the viewer's profile zone)
 * rather than the browser's. `offset` is 0 for today and 1 for tomorrow, for labels. With `days`,
 * only dates fewer than that many days from today are kept.
 */
export function upcomingByZonedDay<T extends UpcomingSession>(sessions: T[], now: number, timeZone: string, days = Infinity): { date: string; offset: number; sessions: T[] }[] {
  const today = zonedDateTime(new Date(now), timeZone).date;
  const groups: { date: string; offset: number; sessions: T[] }[] = [];
  const upcoming = sessions
    .filter((s) => Date.parse(s.startsAt) + s.durationMinutes * 60_000 > now)
    .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.id.localeCompare(b.id));
  for (const session of upcoming) {
    const date = zonedDateTime(session.startsAt, timeZone).date;
    const last = groups.at(-1);
    if (last?.date === date) { last.sessions.push(session); continue; }
    const offset = daysBetween(today, date);
    if (offset >= days) break;
    groups.push({ date, offset, sessions: [session] });
  }
  return groups;
}
