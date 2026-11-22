import { describe, expect, it } from 'vitest';
import { upcomingByDay, upcomingByZonedDay, type UpcomingSession } from '@/domain/scheduling/upcoming';

const now = new Date(2026, 10, 17, 12, 0);
const session = (id: string, start: Date, durationMinutes = 60): UpcomingSession => ({
  id, startsAt: start.toISOString(), durationMinutes,
});
const day = (d: Date) => `day:${d.getDate()}`;

describe('upcoming sessions', () => {
  it('keeps sessions still running or ahead within the window, soonest first, grouped by local day', () => {
    const sessions = [
      session('later-today', new Date(2026, 10, 17, 18, 0)),
      session('finished', new Date(2026, 10, 17, 9, 0)),
      session('running', new Date(2026, 10, 17, 11, 30)),
      session('in-3-days', new Date(2026, 10, 20, 9, 0)),
      session('tomorrow', new Date(2026, 10, 18, 7, 0)),
      session('past-window', new Date(2026, 10, 24, 9, 0)),
    ];
    expect(upcomingByDay(sessions, now, day).map((g) => [g.label, g.sessions.map((s) => s.id)])).toEqual([
      ['Today', ['running', 'later-today']], ['Tomorrow', ['tomorrow']], ['day:20', ['in-3-days']],
    ]);
  });

  it('returns nothing when no session is ahead', () => {
    expect(upcomingByDay([session('old', new Date(2026, 10, 10, 9, 0))], now, day)).toEqual([]);
  });

  describe('by day in a named zone', () => {
    const at = (iso: string, id: string, durationMinutes = 60): UpcomingSession => ({ id, startsAt: iso, durationMinutes });
    // 2026-11-17 12:00 in Toronto (UTC-5).
    const noon = Date.parse('2026-11-17T17:00:00Z');

    it("groups by the zone's calendar date, not the browser's, with offsets from today", () => {
      const sessions = [
        at('2026-11-18T04:30:00Z', 'late-tonight'), // 11:30 PM on the 17th in Toronto, the 18th in UTC
        at('2026-11-18T14:00:00Z', 'tomorrow'),
        at('2026-11-17T16:30:00Z', 'running'),
        at('2026-11-17T13:00:00Z', 'finished'),
        at('2026-11-21T15:00:00Z', 'saturday'),
      ];
      expect(upcomingByZonedDay(sessions, noon, 'America/Toronto').map((g) => [g.date, g.offset, g.sessions.map((s) => s.id)])).toEqual([
        ['2026-11-17', 0, ['running', 'late-tonight']], ['2026-11-18', 1, ['tomorrow']], ['2026-11-21', 4, ['saturday']],
      ]);
    });

    it('stops at the day limit and across daylight saving keeps whole-day offsets', () => {
      const sessions = [at('2026-11-23T15:00:00Z', 'in-6-days'), at('2026-11-24T15:00:00Z', 'in-7-days')];
      expect(upcomingByZonedDay(sessions, noon, 'America/Toronto', 7).map((g) => g.offset)).toEqual([6]);
      const march = Date.parse('2027-03-13T17:00:00Z');
      expect(upcomingByZonedDay([at('2027-03-15T13:00:00Z', 'after-dst')], march, 'America/Toronto')[0]?.offset).toBe(2);
    });
  });
});
