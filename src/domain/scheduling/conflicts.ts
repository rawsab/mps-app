/** The parts of a meeting a conflict check needs (decision 0063). */
export type ConflictCandidate = {
  id: string; coachId: string | null; coachName: string | null;
  startsAt: string; durationMinutes: number; status: string;
};

/** Meetings of one coach that overlap in a chain: each overlaps at least one other. */
export type MeetingConflict<T extends ConflictCandidate> = {
  coachId: string; coachName: string | null; startsAt: string; endsAt: string; meetings: T[];
};

const MINUTE_MS = 60_000;
const endOf = (meeting: ConflictCandidate) => new Date(meeting.startsAt).getTime() + meeting.durationMinutes * MINUTE_MS;

/**
 * Overlapping scheduled meetings for the same coach that haven't ended by `now`, soonest first.
 * Cancelled and recorded meetings never conflict, and one ending as the next starts is fine.
 * Overlaps chain: 9:00–10:00, 9:30–10:30 and 10:15–11:00 are one conflict of three.
 */
export function meetingConflicts<T extends ConflictCandidate>(meetings: readonly T[], now: number): MeetingConflict<T>[] {
  const byCoach = new Map<string, T[]>();
  for (const meeting of meetings) {
    if (meeting.status !== 'scheduled' || !meeting.coachId || endOf(meeting) <= now) continue;
    byCoach.set(meeting.coachId, [...(byCoach.get(meeting.coachId) ?? []), meeting]);
  }
  const conflicts: MeetingConflict<T>[] = [];
  for (const [coachId, list] of byCoach) {
    const sorted = [...list].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime() || endOf(a) - endOf(b));
    let group: T[] = [];
    let groupEnd = -Infinity;
    const close = () => {
      if (group.length > 1) {
        conflicts.push({ coachId, coachName: group[0]!.coachName, startsAt: group[0]!.startsAt, endsAt: new Date(groupEnd).toISOString(), meetings: group });
      }
    };
    for (const meeting of sorted) {
      if (new Date(meeting.startsAt).getTime() < groupEnd) {
        group.push(meeting);
        groupEnd = Math.max(groupEnd, endOf(meeting));
      } else {
        close();
        group = [meeting];
        groupEnd = endOf(meeting);
      }
    }
    close();
  }
  return conflicts.sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}
