import { zonedDateTime } from './pattern';

/**
 * Client meeting requests (decisions 0037 and 0050): who can ask, when to warn about short notice,
 * open times grouped for the picker, and the latest answer to show on Home.
 */
type RequestLike = { id: string; kind: 'cancel' | 'reschedule'; status: 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired'; resolvedAt: string | null };
type MeetingLike = { status: string; startsAt: string; request: RequestLike | null };

/** A client can ask to move or cancel a scheduled meeting until it starts, one open request at a time. */
export function canRequestChange(meeting: MeetingLike, now: number): boolean {
  return meeting.status === 'scheduled' && Date.parse(meeting.startsAt) > now && meeting.request?.status !== 'pending';
}

/**
 * Inside the coach's late-cancellation window, which only applies to billable meetings. The server
 * fixes lateness when the request is sent; this only decides whether to warn first.
 */
export function insideLateWindow(meeting: { startsAt: string; billable: boolean }, now: number, lateCancelHours: number): boolean {
  return meeting.billable && Date.parse(meeting.startsAt) - now < lateCancelHours * 3_600_000;
}

/** Open start times grouped by calendar date in the viewer's zone, keeping the server's order. */
export function openTimesByDay(times: string[], timeZone: string): { date: string; times: string[] }[] {
  const days: { date: string; times: string[] }[] = [];
  for (const time of times) {
    const date = zonedDateTime(time, timeZone).date;
    const last = days.at(-1);
    if (last?.date === date) last.times.push(time);
    else days.push({ date, times: [time] });
  }
  return days;
}

/** How long an answer stays on Home. */
export const OUTCOME_SHOWN_MS = 7 * 86_400_000;

/**
 * The most recent answered request across the client's meetings, if it came in the last week:
 * accepted, declined, or expired (shown from the meeting's start, since expiry has no answer time).
 * Withdrawals are the client's own doing and aren't shown.
 */
export function recentRequestOutcome<M extends MeetingLike>(meetings: M[], now: number): { meeting: M; request: RequestLike; at: number } | null {
  let latest: { meeting: M; request: RequestLike; at: number } | null = null;
  for (const meeting of meetings) {
    const request = meeting.request;
    if (!request || request.status === 'pending' || request.status === 'withdrawn') continue;
    const at = request.resolvedAt ? Date.parse(request.resolvedAt) : request.status === 'expired' ? Date.parse(meeting.startsAt) : NaN;
    if (!Number.isFinite(at) || at > now || now - at > OUTCOME_SHOWN_MS) continue;
    if (!latest || at > latest.at) latest = { meeting, request, at };
  }
  return latest;
}
