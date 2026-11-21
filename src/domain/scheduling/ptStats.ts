import { addDays, mondayOf, zonedDateTime } from './pattern';

// Personal training stats for the client's dashboard (decision 0052). Only recorded attendance
// counts: a past session nobody recorded is "Past" and is left out of every number.

export type PtSessionLike = {
  startsAt: string;
  durationMinutes: number;
  status: 'scheduled' | 'completed' | 'cancelled' | 'late_cancelled' | 'no_show';
  services: string[];
};

export type PtOutcome = 'upcoming' | 'in_progress' | 'attended' | 'no_show' | 'late_cancelled' | 'cancelled' | 'past';

export const isPtSession = (meeting: Pick<PtSessionLike, 'services'>) => meeting.services.includes('personal_training');

export function ptOutcome(meeting: PtSessionLike, now: number): PtOutcome {
  if (meeting.status === 'completed') return 'attended';
  if (meeting.status === 'no_show') return 'no_show';
  if (meeting.status === 'late_cancelled') return 'late_cancelled';
  if (meeting.status === 'cancelled') return 'cancelled';
  const start = new Date(meeting.startsAt).getTime();
  if (start > now) return 'upcoming';
  return start + meeting.durationMinutes * 60_000 > now ? 'in_progress' : 'past';
}

export type PtWeek = { weekOf: string; count: number };

export type PtStats = {
  completed: number;
  thisMonth: number;
  /** Weeks in a row with at least one attended session. The current week only adds to it, never breaks it. */
  streak: number;
  /** Attended out of attended + no-show + late-cancelled; null until one of those exists. */
  attendanceRate: number | null;
  /** Attended sessions per week (Monday start), oldest first, ending with the current week. */
  weekly: PtWeek[];
};

/** Weeks and months follow the client's time zone. Pass PT sessions only. */
export function ptStats(sessions: PtSessionLike[], now: Date, timeZone: string, weeks = 12): PtStats {
  const today = zonedDateTime(now, timeZone).date;
  const thisWeek = mondayOf(today);
  const attendedWeeks = new Map<string, number>();
  let completed = 0;
  let thisMonth = 0;
  let missed = 0;
  for (const session of sessions) {
    if (session.status === 'no_show' || session.status === 'late_cancelled') missed += 1;
    if (session.status !== 'completed') continue;
    completed += 1;
    const date = zonedDateTime(session.startsAt, timeZone).date;
    if (date.slice(0, 7) === today.slice(0, 7)) thisMonth += 1;
    const week = mondayOf(date);
    attendedWeeks.set(week, (attendedWeeks.get(week) ?? 0) + 1);
  }

  let streak = 0;
  let week = attendedWeeks.has(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (attendedWeeks.has(week)) {
    streak += 1;
    week = addDays(week, -7);
  }

  const weekly = Array.from({ length: weeks }, (_, index) => {
    const weekOf = addDays(thisWeek, -7 * (weeks - 1 - index));
    return { weekOf, count: attendedWeeks.get(weekOf) ?? 0 };
  });

  return { completed, thisMonth, streak, attendanceRate: completed + missed ? completed / (completed + missed) : null, weekly };
}
