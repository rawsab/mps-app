import { nextFocus } from '@/domain/scheduling/attendance';
import { addDays, cycleWeekOf, isoWeekday, mondayOf, zonedToInstant, type PatternSlot } from '@/domain/scheduling/pattern';
import type { DemoFrame, DemoScript } from './demo';

/*
 * Meetings demos for Help (decision 0057, demos 7 and 8): recording attendance with Undo, and a
 * repeating pattern filling in its next meetings. Fictional clients, in one coach time zone.
 */

export const DEMO_TIME_ZONE = 'America/Toronto';
/** "Now" for the demos: Tuesday, November 24, 2026, 8 PM. */
export const DEMO_NOW = zonedToInstant('2026-11-24', '20:00', DEMO_TIME_ZONE);

const instant = (date: string, time: string) => zonedToInstant(date, time, DEMO_TIME_ZONE).toISOString();

// ---------------------------------------------------------------------------------------------
// Demo 7: Record attendance, with Undo

export type AttendanceStatus = 'completed' | 'no_show';
export type AttendanceDemoRow = { id: string; clientName: string; startsAt: string };

export type AttendanceDemoState = {
  /** Meetings still waiting for attendance, as the Meetings page lists them. */
  rows: AttendanceDemoRow[];
  /** A row fading out after being recorded, still drawn. */
  leaving?: string | null;
  /** A row coming back after Undo. */
  restored?: string | null;
  /** The notice at the bottom, with Undo. */
  notice?: { id: string; status: AttendanceStatus } | null;
};

export const attendanceTarget = (id: string, status: AttendanceStatus) => `attendance:${id}:${status}`;
export const UNDO_NOTICE_TARGET = 'attendance-undo';

export const ATTENDANCE_ROWS: AttendanceDemoRow[] = [
  { id: 'sam', clientName: 'Sam Okafor', startsAt: instant('2026-11-24', '12:00') },
  { id: 'avery', clientName: 'Avery Chen', startsAt: instant('2026-11-24', '07:00') },
  { id: 'riley', clientName: 'Riley Moreau', startsAt: instant('2026-11-23', '18:00') },
  { id: 'jo', clientName: 'Jo Lindqvist', startsAt: instant('2026-11-22', '10:00') },
];

function attendanceWithUndo(): DemoScript<AttendanceDemoState> {
  const all = ATTENDANCE_ROWS;
  const without = (...ids: string[]) => all.filter((row) => !ids.includes(row.id));
  const order = all.map((row) => row.id);
  // The pointer follows focus, which moves to the same button on the next row (as on the page).
  const after = (id: string, status: AttendanceStatus, list = order) => attendanceTarget(nextFocus(list, id)!, status);
  type Frame = DemoFrame<AttendanceDemoState>;
  const frames: Frame[] = [
    { state: { rows: all }, ms: 2200, caption: 'Past meetings without attendance wait here, newest first.' },
    { state: { rows: all }, ms: 900, caption: 'Sam came, so select the tick.', pointer: { target: attendanceTarget('sam', 'completed') } },
    { state: { rows: all, leaving: 'sam' }, ms: 400, caption: 'Sam came, so select the tick.', pointer: { target: attendanceTarget('sam', 'completed'), press: true } },
    { state: { rows: without('sam'), notice: { id: 'sam', status: 'completed' } }, ms: 2400, caption: 'The row leaves, and a notice confirms it.', pointer: { target: after('sam', 'completed') } },
    { state: { rows: without('sam'), notice: { id: 'sam', status: 'completed' } }, ms: 900, caption: 'Avery came too, but the cross gets pressed by mistake.', pointer: { target: attendanceTarget('avery', 'no_show') } },
    { state: { rows: without('sam'), leaving: 'avery' }, ms: 400, caption: 'Avery came too, but the cross gets pressed by mistake.', pointer: { target: attendanceTarget('avery', 'no_show'), press: true } },
    { state: { rows: without('sam', 'avery'), notice: { id: 'avery', status: 'no_show' } }, ms: 1600, caption: 'Now Avery is marked as a no-show.', pointer: { target: UNDO_NOTICE_TARGET } },
    { state: { rows: without('sam', 'avery'), notice: { id: 'avery', status: 'no_show' } }, ms: 400, caption: 'Select Undo straight away.', pointer: { target: UNDO_NOTICE_TARGET, press: true } },
    { state: { rows: without('sam'), restored: 'avery' }, ms: 2200, caption: 'Avery’s meeting comes back, with nothing recorded.', pointer: { target: attendanceTarget('avery', 'completed') } },
    { state: { rows: without('sam'), leaving: 'avery' }, ms: 400, caption: 'This time, the tick.', pointer: { target: attendanceTarget('avery', 'completed'), press: true } },
    { state: { rows: without('sam', 'avery'), notice: { id: 'avery', status: 'completed' } }, ms: 3200, caption: 'Two meetings left. To fix one later, open the meeting and change its Status.', pointer: { target: after('avery', 'completed', without('sam').map((row) => row.id)) } },
  ];
  return {
    id: 'attendance-undo',
    description: 'Four past meetings wait for attendance. One is marked completed and leaves the list. The next is marked as a no-show by mistake, so Undo brings it back, and it is then marked completed.',
    frames,
  };
}

// ---------------------------------------------------------------------------------------------
// Demo 8: A repeating pattern filling its next meetings

export type PatternDemoSlot = Pick<PatternSlot, 'weekday' | 'startTime' | 'durationMinutes'>;
export type PatternPreviewItem = { startsAt: string; durationMinutes: number };

export type PatternDemoState = {
  slots: PatternDemoSlot[];
  startsOn: string;
  /** The dialog's Next meetings list. */
  preview: PatternPreviewItem[];
  /**
   * After Set up meetings: the dialog has closed onto the client's Meetings card, which shows this
   * pattern. Kept apart from the dialog's own fields, so the hidden dialog can reset for the next loop.
   */
  saved: { slots: PatternDemoSlot[]; preview: PatternPreviewItem[] } | null;
  changed?: string[];
};

export const PATTERN_PREVIEW_COUNT = 6;
export const dayToggleTarget = (weekday: number) => `pattern-day:${weekday}`;
export const startTarget = (weekday: number) => `pattern-start:${weekday}`;
export const SET_UP_TARGET = 'pattern-set-up';
export const PATTERN_ROW_TARGET = 'pattern-row';

/**
 * The first meetings a weekly pattern makes from `startsOn`, as the dialog's preview lists them
 * (`preview_meeting_schedule`, six at most).
 */
export function patternPreview(slots: PatternDemoSlot[], startsOn: string, count = PATTERN_PREVIEW_COUNT): PatternPreviewItem[] {
  const items: PatternPreviewItem[] = [];
  if (!slots.length) return items;
  const anchor = mondayOf(startsOn);
  for (let date = startsOn; items.length < count; date = addDays(date, 1)) {
    for (const slot of slots) {
      if (slot.weekday === isoWeekday(date) && cycleWeekOf(date, anchor, 1) === 1 && items.length < count) {
        items.push({ startsAt: instant(date, slot.startTime), durationMinutes: slot.durationMinutes });
      }
    }
  }
  return items;
}

const TUESDAY = 2;
const THURSDAY = 4;

function repeatingPattern(): DemoScript<PatternDemoState> {
  const startsOn = '2026-11-30';
  const state = (slots: PatternDemoSlot[], extra: Partial<PatternDemoState> = {}): PatternDemoState => ({ slots, startsOn, preview: patternPreview(slots, startsOn), saved: null, ...extra });
  // A new day copies the last day's time and length, as the dialog does.
  const tue: PatternDemoSlot = { weekday: TUESDAY, startTime: '07:00', durationMinutes: 60 };
  const thu: PatternDemoSlot = { ...tue, weekday: THURSDAY };
  const thuEvening: PatternDemoSlot = { ...thu, startTime: '18:00' };
  const final = [tue, thuEvening];
  const dates = (slots: PatternDemoSlot[]) => patternPreview(slots, startsOn).map((item) => item.startsAt);
  const saved = { slots: final, preview: patternPreview(final, startsOn) };
  const done = 'The pattern shows on the client’s Meetings card, and its meetings are marked Repeating.';
  type Frame = DemoFrame<PatternDemoState>;
  const frames: Frame[] = [
    { state: state([]), ms: 600, caption: 'Repeat meetings opens the pattern. Choose the days first.', pointer: { target: dayToggleTarget(TUESDAY) } },
    { state: state([]), ms: 300, caption: 'Repeat meetings opens the pattern. Choose the days first.', pointer: { target: dayToggleTarget(TUESDAY), press: true } },
    { state: state([tue], { changed: dates([tue]) }), ms: 1000, caption: 'Tuesday starts at 7:00 AM for 60 minutes. Next meetings fills in.', pointer: { target: dayToggleTarget(THURSDAY) } },
    { state: state([tue]), ms: 300, caption: 'Add Thursday. It copies Tuesday’s time and length.', pointer: { target: dayToggleTarget(THURSDAY), press: true } },
    { state: state([tue, thu], { changed: dates([tue, thu]).filter((d) => !dates([tue]).includes(d)) }), ms: 1600, caption: 'Add Thursday. It copies Tuesday’s time and length.', pointer: { target: startTarget(THURSDAY) } },
    { state: state([tue, thu]), ms: 300, caption: 'Thursdays are in the evening, so change the start.', pointer: { target: startTarget(THURSDAY), press: true } },
    { state: state(final, { changed: dates(final).filter((d) => !dates([tue, thu]).includes(d)) }), ms: 1800, caption: 'Thursdays are in the evening, so change the start.', pointer: { target: startTarget(THURSDAY) } },
    { state: state(final), ms: 600, caption: 'Select Set up meetings.', pointer: { target: SET_UP_TARGET } },
    { state: state(final), ms: 300, caption: 'Select Set up meetings.', pointer: { target: SET_UP_TARGET, press: true } },
    // The dialog fades out as filled in, then resets while hidden, so the next loop opens it empty.
    { state: state(final, { saved }), ms: 500, caption: done, pointer: { target: PATTERN_ROW_TARGET } },
    { state: state([], { saved }), ms: 2200, caption: done, pointer: { target: PATTERN_ROW_TARGET } },
  ];
  return {
    id: 'repeating-pattern',
    description: 'Setting up repeating meetings: Tuesday is chosen at 7:00 AM, then Thursday, whose start is changed to 6:00 PM. The Next meetings list fills in with the dates as each change is made. After Set up meetings, the pattern shows on the client’s Meetings card.',
    frames,
  };
}

export const MEETING_DEMOS = {
  'attendance-undo': attendanceWithUndo(),
  'repeating-pattern': repeatingPattern(),
} as const;

export type MeetingDemoName = keyof typeof MEETING_DEMOS;
