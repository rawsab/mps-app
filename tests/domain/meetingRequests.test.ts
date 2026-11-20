import { describe, expect, it } from 'vitest';
import { canRequestChange, insideLateWindow, openTimesByDay, OUTCOME_SHOWN_MS, recentRequestOutcome } from '@/domain/scheduling/requests';

const NOW = Date.parse('2026-11-20T15:00:00Z');
const HOUR = 3_600_000;
const at = (ms: number) => new Date(ms).toISOString();

type Status = 'pending' | 'accepted' | 'declined' | 'withdrawn' | 'expired';
const request = (status: Status, resolvedAt: string | null = null, id: string = status) =>
  ({ id, kind: 'reschedule' as const, status, resolvedAt });
const meeting = (startsAt: string, req: ReturnType<typeof request> | null = null, status = 'scheduled') => ({ status, startsAt, request: req });

describe('canRequestChange', () => {
  it('allows scheduled meetings that have not started and have no open request', () => {
    expect(canRequestChange(meeting(at(NOW + HOUR)), NOW)).toBe(true);
    expect(canRequestChange(meeting(at(NOW + HOUR), request('declined', at(NOW - HOUR))), NOW)).toBe(true);
  });

  it('refuses started, cancelled or already requested meetings', () => {
    expect(canRequestChange(meeting(at(NOW)), NOW)).toBe(false);
    expect(canRequestChange(meeting(at(NOW + HOUR), null, 'cancelled'), NOW)).toBe(false);
    expect(canRequestChange(meeting(at(NOW + HOUR), request('pending')), NOW)).toBe(false);
  });
});

describe('insideLateWindow', () => {
  it('warns only for billable meetings starting inside the window', () => {
    expect(insideLateWindow({ startsAt: at(NOW + 23 * HOUR), billable: true }, NOW, 24)).toBe(true);
    expect(insideLateWindow({ startsAt: at(NOW + 24 * HOUR), billable: true }, NOW, 24)).toBe(false);
    expect(insideLateWindow({ startsAt: at(NOW + HOUR), billable: false }, NOW, 24)).toBe(false);
    expect(insideLateWindow({ startsAt: at(NOW + HOUR), billable: true }, NOW, 0)).toBe(false);
  });
});

describe('openTimesByDay', () => {
  it('groups by the viewer’s calendar date', () => {
    const times = ['2026-11-24T02:00:00Z', '2026-11-24T14:00:00Z', '2026-11-24T15:00:00Z'];
    expect(openTimesByDay(times, 'America/Toronto')).toEqual([
      { date: '2026-11-23', times: ['2026-11-24T02:00:00Z'] },
      { date: '2026-11-24', times: ['2026-11-24T14:00:00Z', '2026-11-24T15:00:00Z'] },
    ]);
    expect(openTimesByDay(times, 'UTC')).toEqual([{ date: '2026-11-24', times }]);
  });
});

describe('recentRequestOutcome', () => {
  it('picks the latest answer from the last week', () => {
    const older = meeting(at(NOW + 48 * HOUR), request('declined', at(NOW - 3 * HOUR), 'a'));
    const newer = meeting(at(NOW + 72 * HOUR), request('accepted', at(NOW - HOUR), 'b'));
    expect(recentRequestOutcome([older, newer], NOW)?.request.id).toBe('b');
  });

  it('dates an expiry from the meeting start', () => {
    const expired = meeting(at(NOW - 2 * HOUR), request('expired'));
    expect(recentRequestOutcome([expired], NOW)?.at).toBe(NOW - 2 * HOUR);
  });

  it('skips pending, withdrawn and old answers', () => {
    expect(recentRequestOutcome([
      meeting(at(NOW + HOUR), request('pending')),
      meeting(at(NOW + HOUR), request('withdrawn', at(NOW - HOUR))),
      meeting(at(NOW + HOUR), request('accepted', at(NOW - OUTCOME_SHOWN_MS - 1))),
      meeting(at(NOW + HOUR)),
    ], NOW)).toBeNull();
  });
});
