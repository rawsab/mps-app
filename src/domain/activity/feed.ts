import { dayHeading, weekName } from '../programs/labels';
import type { SessionStatus } from '../training/volume';

/** One training session in a client's activity feed (migration 00018, decision 0023). */
export type SessionActivity = {
  kind: 'session';
  id: string;
  programId: string;
  service: 'mesocycle' | 'personal_training';
  programTitle: string;
  weekId: string;
  weekIndex: number;
  dayId: string;
  dayIndex: number;
  dayLabel: string;
  status: SessionStatus;
  performedOn: string | null;
  startedAt: string;
  completedAt: string | null;
  setCount: number;
  feedbackCount: number;
  activityAt: string;
  staffEdited: boolean;
};

export type ActivityItem = SessionActivity;

/** A Reviews item: timed by the client's own latest change, with this staff member's read state. */
export type ReviewItem = ActivityItem & { clientId: string; clientName: string; unread: boolean };

/** Mirrors private.activity_kind (migration 00020). */
export type ActivityKind = 'completed' | 'logged' | 'skipped' | 'started';

export function activityKind(item: Pick<ActivityItem, 'status' | 'setCount' | 'feedbackCount'>): ActivityKind {
  if (item.status === 'completed' || item.status === 'skipped') return item.status;
  return item.setCount > 0 || item.feedbackCount > 0 ? 'logged' : 'started';
}

export function activityTitle(item: ActivityItem): string {
  switch (activityKind(item)) {
    case 'completed': return 'Completed a workout';
    case 'skipped': return 'Skipped a workout';
    case 'logged': return item.setCount > 0 ? 'Logged sets' : 'Answered Stimulus & Fatigue';
    case 'started': return 'Started a workout';
  }
}

/** "Block one · Week 2 · Day 1 · Push". Numbers follow order, like the editor. */
export function activityWhere(item: ActivityItem): string {
  return [item.programTitle.trim() || 'Untitled program', weekName(item.weekIndex), dayHeading({ label: item.dayLabel }, item.dayIndex)].join(' · ');
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Facts worth a glance; nothing is listed for counts the client hasn't produced. */
export function activityDetails(item: ActivityItem): string[] {
  const details: string[] = [];
  if (item.setCount > 0) details.push(`${plural(item.setCount, 'set')} logged`);
  if (item.feedbackCount > 0) details.push(`Stimulus & Fatigue for ${plural(item.feedbackCount, 'muscle')}`);
  return details;
}

/** "just now", "5m ago", "3h ago", "Yesterday", "4d ago", then a date. */
export function relativeTime(at: string, now: Date, formatDate: (value: string) => string): string {
  const then = new Date(at);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60 && localDay(then) === localDay(now)) return `${Math.floor(minutes / 60)}h ago`;
  const days = daysBetween(then, now);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(at);
}

/** Groups newest-first items by the viewer's local day, keeping their order. */
export function groupByDay<T extends { activityAt: string }>(items: T[], now: Date, formatDate: (value: string) => string): { label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const at = new Date(item.activityAt);
    const key = localDay(at);
    const last = groups.at(-1);
    if (last?.key === key) { last.items.push(item); continue; }
    const days = daysBetween(at, now);
    groups.push({ key, label: days === 0 ? 'Today' : days === 1 ? 'Yesterday' : formatDate(item.activityAt), items: [item] });
  }
  return groups.map(({ label, items }) => ({ label, items }));
}

const localDay = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const daysBetween = (from: Date, to: Date) =>
  Math.round((new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime() - new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime()) / 86_400_000);
