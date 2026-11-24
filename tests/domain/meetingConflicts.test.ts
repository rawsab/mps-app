import { describe, expect, it } from 'vitest';
import { meetingConflicts, type ConflictCandidate } from '@/domain/scheduling/conflicts';

const at = (time: string) => `2026-12-01T${time}:00.000Z`;
let n = 0;
const meeting = (start: string, minutes: number, extra: Partial<ConflictCandidate> = {}): ConflictCandidate => ({
  id: `m${++n}`, coachId: 'matt', coachName: 'Matt', startsAt: at(start), durationMinutes: minutes, status: 'scheduled', ...extra,
});
const now = new Date(at('08:00')).getTime();
const ids = (list: ReturnType<typeof meetingConflicts>) => list.map((c) => c.meetings.map((m) => m.id));

describe('meeting conflicts (decision 0063)', () => {
  it('finds overlapping meetings for the same coach, with the span they cover', () => {
    const a = meeting('09:00', 60); const b = meeting('09:30', 30);
    const [conflict] = meetingConflicts([b, a], now);
    expect(conflict).toMatchObject({ coachId: 'matt', coachName: 'Matt', startsAt: at('09:00'), endsAt: at('10:00') });
    expect(conflict!.meetings).toEqual([a, b]);
  });

  it('chains overlaps into one conflict', () => {
    const list = [meeting('09:00', 60), meeting('09:30', 60), meeting('10:15', 45), meeting('12:00', 30)];
    expect(ids(meetingConflicts(list, now))).toEqual([[list[0]!.id, list[1]!.id, list[2]!.id]]);
  });

  it('allows back-to-back meetings', () => {
    expect(meetingConflicts([meeting('09:00', 60), meeting('10:00', 60)], now)).toEqual([]);
  });

  it('only compares meetings of the same coach', () => {
    expect(meetingConflicts([meeting('09:00', 60), meeting('09:15', 30, { coachId: 'priya', coachName: 'Priya' })], now)).toEqual([]);
    expect(meetingConflicts([meeting('09:00', 60), meeting('09:15', 30, { coachId: null })], now)).toEqual([]);
  });

  it('ignores cancelled and recorded meetings, and ones already over', () => {
    for (const status of ['cancelled', 'late_cancelled', 'completed', 'no_show']) {
      expect(meetingConflicts([meeting('09:00', 60), meeting('09:15', 30, { status })], now)).toEqual([]);
    }
    expect(meetingConflicts([meeting('06:00', 60), meeting('06:30', 60)], now)).toEqual([]);
    // Still running at `now`, so it still conflicts.
    expect(meetingConflicts([meeting('07:30', 60), meeting('08:15', 30)], now)).toHaveLength(1);
  });

  it('lists conflicts soonest first across coaches', () => {
    const list = [
      meeting('14:00', 60), meeting('14:30', 30),
      meeting('10:00', 60, { coachId: 'priya', coachName: 'Priya' }), meeting('10:30', 30, { coachId: 'priya', coachName: 'Priya' }),
    ];
    expect(meetingConflicts(list, now).map((c) => c.coachName)).toEqual(['Priya', 'Matt']);
  });
});
