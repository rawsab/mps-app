/**
 * Upcoming personal training sessions (decision 0026). Scheduling isn't built yet: this is the
 * shape the clients page reads, kept close to what the scheduling tables will return.
 */
export type UpcomingSession = {
  id: string;
  clientId: string;
  clientName: string;
  /** UTC instant; shown in the viewer's zone. */
  startsAt: string;
  durationMinutes: number;
  /** null for a one-off session, e.g. "Weekly on Tuesday" for a recurring one. */
  recurrence: string | null;
  location: string | null;
};

const DAY_MS = 86_400_000;
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * Sessions still to finish from today through the next `days` days, soonest first, grouped by the
 * viewer's local day ("Today", "Tomorrow", then a weekday and date).
 */
export function upcomingByDay(sessions: UpcomingSession[], now: Date, formatDay: (d: Date) => string, days = 7): { label: string; sessions: UpcomingSession[] }[] {
  const end = startOfDay(now).getTime() + days * DAY_MS;
  const today = startOfDay(now).getTime();
  const groups: { key: number; label: string; sessions: UpcomingSession[] }[] = [];
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
