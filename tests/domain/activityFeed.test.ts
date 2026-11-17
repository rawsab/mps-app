import { describe, expect, it } from 'vitest';
import { activityDetails, activityKind, activityTitle, activityWhere, groupByDay, relativeTime, type ActivityItem } from '@/domain/activity/feed';

const item = (overrides: Partial<ActivityItem> = {}): ActivityItem => ({
  kind: 'session', id: 's1', programId: 'p1', service: 'mesocycle', programTitle: 'Block one', weekId: 'w2', weekIndex: 1,
  dayId: 'd1', dayIndex: 0, dayLabel: 'W2 Push', status: 'in_progress', performedOn: null, startedAt: '', completedAt: null,
  setCount: 0, feedbackCount: 0, activityAt: '', staffEdited: false, ...overrides,
});
const date = (value: string) => `date:${value}`;

describe('activity wording', () => {
  it('names what the client did', () => {
    expect(activityTitle(item())).toBe('Started a workout');
    expect(activityTitle(item({ setCount: 3 }))).toBe('Logged sets');
    expect(activityTitle(item({ status: 'completed', setCount: 3 }))).toBe('Completed a workout');
    expect(activityTitle(item({ status: 'skipped' }))).toBe('Skipped a workout');
  });

  it('sorts sessions into review kinds; opening a day alone is only "started"', () => {
    expect(activityKind(item())).toBe('started');
    expect(activityKind(item({ setCount: 2 }))).toBe('logged');
    expect(activityKind(item({ feedbackCount: 1 }))).toBe('logged');
    expect(activityKind(item({ status: 'completed' }))).toBe('completed');
    expect(activityKind(item({ status: 'skipped', setCount: 1 }))).toBe('skipped');
    expect(activityTitle(item({ feedbackCount: 1 }))).toBe('Answered Stimulus & Fatigue');
  });

  it('numbers weeks and days by order and keeps the day focus', () => {
    expect(activityWhere(item())).toBe('Block one · Week 2 · Day 1 · Push');
    expect(activityWhere(item({ programTitle: ' ', dayLabel: '' }))).toBe('Untitled program · Week 2 · Day 1');
  });

  it('lists only counts that exist', () => {
    expect(activityDetails(item())).toEqual([]);
    expect(activityDetails(item({ setCount: 1, feedbackCount: 2 }))).toEqual(['1 set logged', 'Stimulus & Fatigue for 2 muscles']);
  });
});

describe('activity times', () => {
  const now = new Date(2026, 10, 17, 15, 0);
  const at = (d: Date) => d.toISOString();

  it('uses short relative times, then a date', () => {
    expect(relativeTime(at(new Date(2026, 10, 17, 14, 59, 30)), now, date)).toBe('just now');
    expect(relativeTime(at(new Date(2026, 10, 17, 14, 15)), now, date)).toBe('45m ago');
    expect(relativeTime(at(new Date(2026, 10, 17, 9, 0)), now, date)).toBe('6h ago');
    expect(relativeTime(at(new Date(2026, 10, 16, 23, 0)), now, date)).toBe('Yesterday');
    expect(relativeTime(at(new Date(2026, 10, 13, 12, 0)), now, date)).toBe('4d ago');
    const old = at(new Date(2026, 10, 1, 12, 0));
    expect(relativeTime(old, now, date)).toBe(`date:${old}`);
  });

  it('groups newest-first items by local day', () => {
    const items = [new Date(2026, 10, 17, 10), new Date(2026, 10, 17, 8), new Date(2026, 10, 16, 20), new Date(2026, 10, 10, 9)]
      .map((d, i) => item({ id: `s${i}`, activityAt: at(d) }));
    expect(groupByDay(items, now, date).map((g) => [g.label, g.items.map((i) => i.id)])).toEqual([
      ['Today', ['s0', 's1']], ['Yesterday', ['s2']], [`date:${items[3]!.activityAt}`, ['s3']],
    ]);
  });
});
