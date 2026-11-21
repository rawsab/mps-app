import { describe, expect, it } from 'vitest';
import { isPtSession, ptOutcome, ptStats, type PtSessionLike } from '@/domain/scheduling/ptStats';

const ZONE = 'America/Toronto';
// Friday 2026-11-20, 15:00 in Toronto. The current week starts Monday 2026-11-16.
const now = new Date('2026-11-20T20:00:00Z');

const session = (startsAt: string, status: PtSessionLike['status'] = 'completed', services = ['personal_training']): PtSessionLike =>
  ({ startsAt, durationMinutes: 60, status, services });

describe('ptOutcome', () => {
  it('names recorded attendance and cancellations', () => {
    expect(ptOutcome(session('2026-11-18T14:00:00Z'), now.getTime())).toBe('attended');
    expect(ptOutcome(session('2026-11-18T14:00:00Z', 'no_show'), now.getTime())).toBe('no_show');
    expect(ptOutcome(session('2026-11-18T14:00:00Z', 'late_cancelled'), now.getTime())).toBe('late_cancelled');
    expect(ptOutcome(session('2026-11-25T14:00:00Z', 'cancelled'), now.getTime())).toBe('cancelled');
  });

  it('calls an unrecorded session past once it has ended', () => {
    expect(ptOutcome(session('2026-11-25T14:00:00Z', 'scheduled'), now.getTime())).toBe('upcoming');
    expect(ptOutcome(session('2026-11-20T19:30:00Z', 'scheduled'), now.getTime())).toBe('in_progress');
    expect(ptOutcome(session('2026-11-20T18:00:00Z', 'scheduled'), now.getTime())).toBe('past');
  });
});

describe('isPtSession', () => {
  it('keeps meetings tagged personal training, alone or with other services', () => {
    expect(isPtSession({ services: ['personal_training', 'nutrition'] })).toBe(true);
    expect(isPtSession({ services: ['mesocycle'] })).toBe(false);
  });
});

describe('ptStats', () => {
  it('counts attended sessions overall and this month', () => {
    const stats = ptStats([
      session('2026-10-30T14:00:00Z'),
      session('2026-11-02T14:00:00Z'),
      session('2026-11-18T14:00:00Z'),
      session('2026-11-19T14:00:00Z', 'scheduled'),
    ], now, ZONE);
    expect(stats).toMatchObject({ completed: 3, thisMonth: 2 });
  });

  it('uses the client’s time zone for the month', () => {
    // 02:00 UTC on Nov 1 is still Oct 31 in Toronto.
    expect(ptStats([session('2026-11-01T02:00:00Z')], now, ZONE).thisMonth).toBe(0);
  });

  it('rates attendance against no-shows and late cancellations only', () => {
    const stats = ptStats([
      session('2026-11-02T14:00:00Z'),
      session('2026-11-03T14:00:00Z'),
      session('2026-11-04T14:00:00Z'),
      session('2026-11-05T14:00:00Z', 'no_show'),
      session('2026-11-06T14:00:00Z', 'cancelled'),
      session('2026-11-09T14:00:00Z', 'scheduled'),
    ], now, ZONE);
    expect(stats.attendanceRate).toBe(0.75);
  });

  it('has no attendance rate before anything is recorded', () => {
    const stats = ptStats([session('2026-11-18T14:00:00Z', 'scheduled')], now, ZONE);
    expect(stats).toMatchObject({ completed: 0, attendanceRate: null, streak: 0 });
  });

  it('keeps the streak through a current week with no session yet', () => {
    // Weeks of Nov 2 and Nov 9 attended; nothing yet this week.
    const stats = ptStats([session('2026-11-03T14:00:00Z'), session('2026-11-10T14:00:00Z')], now, ZONE);
    expect(stats.streak).toBe(2);
  });

  it('adds the current week once it has a session, and stops at a gap', () => {
    const stats = ptStats([
      session('2026-10-20T14:00:00Z'),
      session('2026-11-03T14:00:00Z'),
      session('2026-11-10T14:00:00Z'),
      session('2026-11-17T14:00:00Z'),
    ], now, ZONE);
    expect(stats.streak).toBe(3);
  });

  it('breaks the streak when last week had no attended session', () => {
    expect(ptStats([session('2026-11-03T14:00:00Z'), session('2026-11-09T14:00:00Z', 'no_show')], now, ZONE).streak).toBe(0);
  });

  it('counts sessions per week for the last 12 weeks, oldest first', () => {
    const stats = ptStats([
      session('2026-08-24T14:00:00Z'),
      session('2026-08-25T14:00:00Z'),
      session('2026-11-16T14:00:00Z'),
      session('2026-11-18T14:00:00Z'),
      session('2026-11-19T14:00:00Z', 'no_show'),
    ], now, ZONE);
    expect(stats.weekly).toHaveLength(12);
    expect(stats.weekly[0]).toEqual({ weekOf: '2026-08-31', count: 0 });
    expect(stats.weekly.at(-1)).toEqual({ weekOf: '2026-11-16', count: 2 });
    expect(stats.weekly.reduce((sum, week) => sum + week.count, 0)).toBe(2);
  });
});
