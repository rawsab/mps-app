import type { ActivityKind } from './feed';

/** The Activity page's trend windows (decision 0046): today by hour, or the last 7 or 30 days by day. */
export type TrendRange = 'day' | 'week' | 'month';
export const TREND_RANGES: TrendRange[] = ['day', 'week', 'month'];

export type TrendSlot = {
  /** Matches the server's bucket: local "YYYY-MM-DDTHH" for hours, "YYYY-MM-DD" for days. */
  key: string;
  /** Tooltip and table label, e.g. "3 PM" or "Wed, Nov 18". */
  label: string;
  /** Axis label, or '' where the axis skips it to stay legible. */
  tick: string;
};

export type TrendWindow = { from: Date; to: Date; bucket: 'hour' | 'day'; slots: TrendSlot[]; caption: string };

const pad = (n: number) => String(n).padStart(2, '0');
const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const HOUR = new Intl.DateTimeFormat(undefined, { hour: 'numeric' });
const WEEKDAY = new Intl.DateTimeFormat(undefined, { weekday: 'short' });
const DAY_LABEL = new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const MONTH_DAY = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });

/** Local-time window ending with today, in the viewer's zone; `now` is injected for tests. */
export function trendWindow(range: TrendRange, now: Date): TrendWindow {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  if (range === 'day') {
    const slots = Array.from({ length: 24 }, (_, h) => {
      const at = new Date(today.getFullYear(), today.getMonth(), today.getDate(), h);
      return { key: `${dayKey(at)}T${pad(h)}`, label: HOUR.format(at), tick: h % 6 === 0 ? HOUR.format(at) : '' };
    });
    return { from: today, to: tomorrow, bucket: 'hour', slots, caption: 'today' };
  }
  const days = range === 'week' ? 7 : 30;
  const slots = Array.from({ length: days }, (_, i) => {
    const at = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1 - i));
    const tick = range === 'week' ? WEEKDAY.format(at) : (days - 1 - i) % 7 === 0 ? MONTH_DAY.format(at) : '';
    return { key: dayKey(at), label: DAY_LABEL.format(at), tick };
  });
  return { from: new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1)), to: tomorrow, bucket: 'day', slots,
    caption: `in the last ${days} days` };
}

/** One count per slot, zero where the server returned nothing. */
export function fillSlots(slots: TrendSlot[], buckets: { bucket: string; count: number }[]): number[] {
  const counts = new Map(buckets.map((b) => [b.bucket, b.count]));
  return slots.map((slot) => counts.get(slot.key) ?? 0);
}

export const KIND_LABELS: Record<ActivityKind, string> = {
  completed: 'Completed workouts',
  logged: 'Logged sets',
  started: 'Started workouts',
  skipped: 'Skipped workouts',
  nutrition: 'Nutrition logs',
  request: 'Meeting requests',
  service_request: 'Service requests',
};

export type TrendRow = { key: string; label: string; count: number };

/** The busiest `limit` rows, with the rest folded into one "Other" row so the chart stays short. */
export function foldRows(rows: TrendRow[], limit: number, otherLabel: (n: number) => string): TrendRow[] {
  if (rows.length <= limit) return rows;
  const rest = rows.slice(limit - 1);
  return [...rows.slice(0, limit - 1), { key: 'other', label: otherLabel(rest.length), count: rest.reduce((sum, row) => sum + row.count, 0) }];
}
