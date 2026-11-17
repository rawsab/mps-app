import { describe, expect, it } from 'vitest';
import { upcomingByDay, type UpcomingSession } from '@/domain/scheduling/upcoming';

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
});
