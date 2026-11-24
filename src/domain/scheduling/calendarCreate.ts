/**
 * Where a click or drag on the Meetings calendar lands (decision 0066). Minutes are from midnight
 * on the clicked day, in the viewer's time zone, as the calendar draws them.
 */

export const SNAP_MINUTES = 15;
/** A click makes a 60-minute meeting; the coach changes it in the dialog if needed (owner choice). */
export const DEFAULT_MINUTES = 60;
const DAY_MINUTES = 24 * 60;

const clamp = (minutes: number) => Math.min(DAY_MINUTES, Math.max(0, minutes));

/** The 15-minute mark at or before a point. */
export function snapDown(minutes: number): number {
  return Math.min(DAY_MINUTES - SNAP_MINUTES, Math.floor(clamp(minutes) / SNAP_MINUTES) * SNAP_MINUTES);
}

/**
 * A drag from one point to another, either direction: from the mark at or before the earlier point
 * to the mark at or after the later one, at least 15 minutes, within the day.
 */
export function dragRange(from: number, to: number): { start: number; minutes: number } {
  const start = snapDown(Math.min(from, to));
  const end = Math.max(start + SNAP_MINUTES, Math.ceil(clamp(Math.max(from, to)) / SNAP_MINUTES) * SNAP_MINUTES);
  return { start, minutes: Math.min(end, DAY_MINUTES) - start };
}

/** Month view: the start of the coach's first open time that day, else 9:00. */
export function monthDefaultStart(windows: readonly { start: number; end: number }[] | undefined): number {
  const first = windows?.length ? Math.min(...windows.map((window) => window.start)) : 9 * 60;
  return snapDown(first);
}

/** "HH:MM" for minutes from midnight. */
export function clockTime(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}
