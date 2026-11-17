/**
 * Personal training patterns and wall-clock times (decision 0037). Recurrence itself is computed
 * only in the database (`private.schedule_occurrences`); these helpers label and edit patterns and
 * convert between a time zone's wall clock and UTC instants.
 */

/** One session in a pattern: an ISO weekday (1 = Monday) in a given week of the cycle. */
export type PatternSlot = { cycleWeek: number; weekday: number; startTime: string; durationMinutes: number };

export type PtSchedule = {
  id: string;
  cycleWeeks: number;
  /** The Monday that counts as Week 1. */
  anchorOn: string;
  startsOn: string;
  endsOn: string | null;
  timezone: string;
  replacesId: string | null;
  slots: (PatternSlot & { id?: string })[];
};

export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
const DAY_MS = 86_400_000;

const toUtcDay = (date: string) => Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
const fromUtcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function addDays(date: string, days: number): string {
  return fromUtcDay(toUtcDay(date) + days * DAY_MS);
}

/** ISO weekday of a calendar date: 1 = Monday … 7 = Sunday. */
export function isoWeekday(date: string): number {
  return ((new Date(toUtcDay(date)).getUTCDay() + 6) % 7) + 1;
}

export function mondayOf(date: string): string {
  return addDays(date, 1 - isoWeekday(date));
}

/** Which week of the cycle a date falls in, counting from the anchor Monday (same rule as the database). */
export function cycleWeekOf(date: string, anchorOn: string, cycleWeeks: number): number {
  const weeks = Math.round((toUtcDay(mondayOf(date)) - toUtcDay(anchorOn)) / (7 * DAY_MS));
  return (((weeks % cycleWeeks) + cycleWeeks) % cycleWeeks) + 1;
}

/** The anchor Monday that makes `date`'s week the given week of the cycle. */
export function anchorFor(date: string, week: number): string {
  return addDays(mondayOf(date), -7 * (week - 1));
}

// ---------------------------------------------------------------------------------------------
// Wall clock ⇄ instant

const PARTS = new Map<string, Intl.DateTimeFormat>();
function partsFormat(timeZone: string) {
  let format = PARTS.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    PARTS.set(timeZone, format);
  }
  return format;
}

function wallParts(instant: Date, timeZone: string) {
  const parts = Object.fromEntries(partsFormat(timeZone).formatToParts(instant).map((p) => [p.type, p.value]));
  return { year: Number(parts.year), month: Number(parts.month), day: Number(parts.day), hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second) };
}

/** Minutes the zone is ahead of UTC at an instant. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const p = wallParts(instant, timeZone);
  return Math.round((Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(instant.getTime() / 1000) * 1000) / 60_000);
}

/** The instant a zone's wall clock shows `date` `time` ("2026-11-24", "07:00"). */
export function zonedToInstant(date: string, time: string, timeZone: string): Date {
  const wall = toUtcDay(date) + (Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5))) * 60_000;
  // Two passes settle the offset on either side of a daylight-saving change.
  const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  return new Date(wall - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** A zone's calendar date and "HH:MM" at an instant. */
export function zonedDateTime(instant: Date | string, timeZone: string): { date: string; time: string } {
  const p = wallParts(new Date(instant), timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return { date: `${p.year}-${pad(p.month)}-${pad(p.day)}`, time: `${pad(p.hour)}:${pad(p.minute)}` };
}

// ---------------------------------------------------------------------------------------------
// Labels

const WEEKDAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayName = (weekday: number) => WEEKDAY_NAMES[weekday - 1]!;
export const weekdayShort = (weekday: number) => weekdayName(weekday).slice(0, 3);

/** "7:00 AM" from "07:00", in the viewer's locale. */
export function formatClock(time: string, locale?: string): string {
  return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' })
    .format(new Date(Date.UTC(2000, 0, 1, Number(time.slice(0, 2)), Number(time.slice(3, 5)))));
}

const sortSlots = <T extends PatternSlot>(slots: T[]) =>
  [...slots].sort((a, b) => a.cycleWeek - b.cycleWeek || a.weekday - b.weekday || a.startTime.localeCompare(b.startTime));

function slotLabel(slot: PatternSlot, long: boolean, locale?: string) {
  return `${long ? weekdayName(slot.weekday) : weekdayShort(slot.weekday)} ${formatClock(slot.startTime, locale)} · ${slot.durationMinutes} min`;
}

/**
 * "Every Tuesday at 7:00 AM · 60 min", or one part per week for longer cycles:
 * ["Week 1: Wed 7:00 AM · 60 min", "Week 2: no sessions"].
 */
export function describePattern(schedule: Pick<PtSchedule, 'cycleWeeks' | 'slots'>, locale?: string): { summary: string; weeks: string[] } {
  const slots = sortSlots(schedule.slots);
  if (schedule.cycleWeeks === 1) {
    const days = slots.map((slot) => slotLabel(slot, slots.length === 1, locale));
    return { summary: slots.length === 1 ? `Every ${days[0]!.replace(' ', ' at ')}` : `Every week · ${days.join(', ')}`, weeks: [] };
  }
  const weeks = Array.from({ length: schedule.cycleWeeks }, (_, index) => {
    const inWeek = slots.filter((slot) => slot.cycleWeek === index + 1);
    return `Week ${index + 1}: ${inWeek.length ? inWeek.map((slot) => slotLabel(slot, false, locale)).join(', ') : 'no sessions'}`;
  });
  return { summary: `Every ${schedule.cycleWeeks} weeks`, weeks };
}
