import { nextFocus } from '@/domain/scheduling/attendance';
import { addDays, cycleWeekOf, isoWeekday, mondayOf, zonedToInstant, type PatternSlot } from '@/domain/scheduling/pattern';
import { clockTime, DEFAULT_MINUTES, dragRange, snapDown } from '../scheduling/calendarCreate';
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
  /** Every row hidden: the list fades out before a loop restarts, then each row fades in. */
  faded?: boolean;
  /** The notice at the bottom, with Undo. Kept while hidden (`shown: false`), so it fades out with its text. */
  notice?: { id: string; status: AttendanceStatus; shown: boolean } | null;
  /** Room is kept below the list for the notice, so the list sits higher. Without it the list is centred. */
  room?: boolean;
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
  const notice = (id: string, status: AttendanceStatus, shown = true) => ({ id, status, shown });
  const sam = attendanceTarget('sam', 'completed');
  const averyNoShow = attendanceTarget('avery', 'no_show');
  const averyDone = attendanceTarget('avery', 'completed');
  // A recorded row fades, then folds away while the rows below glide up. The pointer waits on the
  // button it pressed until they have settled, so it never aims at a row that's still moving.
  const fold = 435;
  const frames: Frame[] = [
    // The rows left at the end fade out, all four unfold while hidden, then fade in one after another.
    { state: { rows: without('sam', 'avery'), faded: true }, ms: 200, caption: 'Past meetings without attendance wait here, newest first.' },
    { state: { rows: all, faded: true }, ms: 300, caption: 'Past meetings without attendance wait here, newest first.' },
    { state: { rows: all }, ms: 1850, caption: 'Past meetings without attendance wait here, newest first.' },
    { state: { rows: all }, ms: 825, caption: 'Sam came, so select the tick.', pointer: { target: sam } },
    { state: { rows: all, leaving: 'sam' }, ms: 350, caption: 'Sam came, so select the tick.', pointer: { target: sam, press: true } },
    { state: { rows: without('sam'), notice: notice('sam', 'completed'), room: true }, ms: fold, caption: 'The row leaves, and a notice confirms it.', pointer: { target: sam } },
    { state: { rows: without('sam'), notice: notice('sam', 'completed'), room: true }, ms: 1700, caption: 'The row leaves, and a notice confirms it.', pointer: { target: after('sam', 'completed') } },
    { state: { rows: without('sam'), notice: notice('sam', 'completed'), room: true }, ms: 825, caption: 'Avery came too, but the cross gets pressed by mistake.', pointer: { target: averyNoShow } },
    // The notice stays until the next one replaces it, as on the page.
    { state: { rows: without('sam'), leaving: 'avery', notice: notice('sam', 'completed'), room: true }, ms: 350, caption: 'Avery came too, but the cross gets pressed by mistake.', pointer: { target: averyNoShow, press: true } },
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'no_show'), room: true }, ms: fold, caption: 'Now Avery is marked as a no-show.', pointer: { target: averyNoShow } },
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'no_show'), room: true }, ms: 1175, caption: 'Now Avery is marked as a no-show.', pointer: { target: UNDO_NOTICE_TARGET } },
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'no_show'), room: true }, ms: 350, caption: 'Select Undo straight away.', pointer: { target: UNDO_NOTICE_TARGET, press: true } },
    { state: { rows: without('sam'), restored: 'avery', notice: notice('avery', 'no_show', false), room: true }, ms: 2000, caption: 'Avery’s meeting comes back, with nothing recorded.', pointer: { target: averyDone } },
    { state: { rows: without('sam'), leaving: 'avery', notice: notice('avery', 'no_show', false), room: true }, ms: 350, caption: 'This time, the tick.', pointer: { target: averyDone, press: true } },
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'completed'), room: true }, ms: fold, caption: 'Two meetings left. To fix one later, open the meeting and change its Status.', pointer: { target: averyDone } },
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'completed'), room: true }, ms: 2000, caption: 'Two meetings left. To fix one later, open the meeting and change its Status.', pointer: { target: after('avery', 'completed', without('sam').map((row) => row.id)) } },
    // The last notice goes, and the list settles back into the middle.
    { state: { rows: without('sam', 'avery'), notice: notice('avery', 'completed', false) }, ms: 1300, caption: 'The notice goes away after a few seconds.' },
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
    { state: state([]), ms: 250, caption: 'Repeat meetings opens the pattern. Choose the days first.', pointer: { target: dayToggleTarget(TUESDAY), press: true } },
    { state: state([tue], { changed: dates([tue]) }), ms: 850, caption: 'Tuesday starts at 7:00 AM for 60 minutes. Next meetings fills in.', pointer: { target: dayToggleTarget(THURSDAY) } },
    { state: state([tue]), ms: 250, caption: 'Add Thursday. It copies Tuesday’s time and length.', pointer: { target: dayToggleTarget(THURSDAY), press: true } },
    { state: state([tue, thu], { changed: dates([tue, thu]).filter((d) => !dates([tue]).includes(d)) }), ms: 1250, caption: 'Add Thursday. It copies Tuesday’s time and length.', pointer: { target: startTarget(THURSDAY) } },
    { state: state([tue, thu]), ms: 250, caption: 'Thursdays are in the evening, so change the start.', pointer: { target: startTarget(THURSDAY), press: true } },
    { state: state(final, { changed: dates(final).filter((d) => !dates([tue, thu]).includes(d)) }), ms: 1350, caption: 'Thursdays are in the evening, so change the start.', pointer: { target: startTarget(THURSDAY) } },
    { state: state(final), ms: 600, caption: 'Select Set up meetings.', pointer: { target: SET_UP_TARGET } },
    { state: state(final), ms: 250, caption: 'Select Set up meetings.', pointer: { target: SET_UP_TARGET, press: true } },
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

// ---------------------------------------------------------------------------------------------
// Demo 11: adding a meeting from the calendar (decision 0066)

/** A meeting block on the demo calendar. Minutes are from midnight in the demo time zone. */
export type CalendarDemoMeeting = { id: string; day: string; start: number; minutes: number; clientName: string };

export type CalendarCreateState = {
  /** The faint block under the pointer, or the stretched one while dragging. */
  ghost: { day: string; start: number; minutes: number; dragging: boolean } | null;
  /** The New meeting dialog. Kept while hidden (`shown: false`), so it fades out filled in. */
  dialog: { day: string; start: number; minutes: number; client: string | null; listOpen: boolean; shown: boolean } | null;
  /** Meetings drawn on the calendar. */
  meetings: CalendarDemoMeeting[];
  changed?: string | null;
};

export const CALENDAR_DEMO_DAYS = ['2026-11-30', '2026-12-01', '2026-12-02'];
/** The calendar shows 8:00 AM to noon. */
export const CALENDAR_DEMO_HOURS = { from: 8, to: 12 } as const;
export const CALENDAR_DEMO_CLIENTS = ['Alex Kim', 'Jordan Lee', 'Sam Rivera'];
const CALENDAR_DEMO_MEETINGS: CalendarDemoMeeting[] = [
  { id: 'sam', day: '2026-11-30', start: 9 * 60, minutes: 60, clientName: 'Sam Rivera' },
  { id: 'alex', day: '2026-12-02', start: 10 * 60, minutes: 40, clientName: 'Alex Kim' },
];
export const calendarPointTarget = (day: string, minutes: number) => `calendar-point:${day}:${minutes}`;
export const CALENDAR_CLIENT_TARGET = 'calendar-client';
export const calendarOptionTarget = (name: string) => `calendar-option:${name}`;
export const CALENDAR_ADD_TARGET = 'calendar-add';
/** Where the pointer goes in the demo, so the picture can place an anchor at each. */
export const CALENDAR_DEMO_POINTS = [9 * 60 + 5, 9 * 60 + 50, 10 * 60 + 25];

/** "Tue, Dec 1, 9:00 to 10:30 AM": a demo meeting's instant, for the dialog's heading. */
export const calendarDemoInstant = (day: string, minutes: number) => instant(day, clockTime(minutes));

function calendarCreate(): DemoScript<CalendarCreateState> {
  const day = CALENDAR_DEMO_DAYS[1]!;
  const [hover, middle, end] = CALENDAR_DEMO_POINTS as [number, number, number];
  const client = 'Jordan Lee';
  const base: CalendarCreateState = { ghost: null, dialog: null, meetings: CALENDAR_DEMO_MEETINGS };
  // The same rounding the calendar uses: a click starts at the mark before it, a drag runs mark to mark.
  const click = { day, start: snapDown(hover), minutes: DEFAULT_MINUTES, dragging: false };
  const dragTo = (to: number) => ({ day, ...dragRange(hover, to), dragging: true });
  const range = dragRange(hover, end);
  const dialog = (patch: Partial<NonNullable<CalendarCreateState['dialog']>> = {}) => ({ day, ...range, client: null, listOpen: false, shown: true, ...patch });
  const point = (minutes: number, press = false) => ({ target: calendarPointTarget(day, minutes), press });
  // Drawn hidden until the drag ends, so it fades in rather than popping.
  base.dialog = dialog({ shown: false });
  const added: CalendarDemoMeeting = { id: 'new', day, ...range, clientName: client };
  const drag = 'Press and drag down to set the length.';
  const pick = 'Choose the client.';
  const fill = 'Their form fills in with that time and length. Choose what it’s about, the program and notes as usual.';
  const done = 'Select Add meeting. It’s on the calendar.';
  type Frame = DemoFrame<CalendarCreateState>;
  const frames: Frame[] = [
    { state: { ...base, ghost: click }, ms: 1400, caption: 'Point at an empty time. A faint block shows where a 60 minute meeting would go.', pointer: point(hover) },
    { state: { ...base, ghost: click }, ms: 300, caption: drag, pointer: point(hover, true) },
    { state: { ...base, ghost: dragTo(middle) }, ms: 450, caption: drag, pointer: point(middle, true) },
    { state: { ...base, ghost: dragTo(end) }, ms: 1100, caption: drag, pointer: point(end, true) },
    { state: { ...base, dialog: dialog() }, ms: 1400, caption: 'Let go. New meeting opens with that time and length.', pointer: { target: CALENDAR_CLIENT_TARGET } },
    { state: { ...base, dialog: dialog() }, ms: 250, caption: pick, pointer: { target: CALENDAR_CLIENT_TARGET, press: true } },
    { state: { ...base, dialog: dialog({ listOpen: true }) }, ms: 800, caption: pick, pointer: { target: calendarOptionTarget(client) } },
    { state: { ...base, dialog: dialog({ listOpen: true }) }, ms: 250, caption: pick, pointer: { target: calendarOptionTarget(client), press: true } },
    { state: { ...base, dialog: dialog({ client }) }, ms: 1900, caption: fill, pointer: { target: CALENDAR_ADD_TARGET } },
    { state: { ...base, dialog: dialog({ client }) }, ms: 250, caption: done, pointer: { target: CALENDAR_ADD_TARGET, press: true } },
    { state: { ...base, dialog: dialog({ client, shown: false }), meetings: [...CALENDAR_DEMO_MEETINGS, added], changed: added.id }, ms: 2400, caption: done, pointer: null },
  ];
  return {
    id: 'calendar-create',
    description: 'Adding a meeting from the calendar: in week view, the pointer rests on Tuesday at 9:00 AM and a faint 60 minute block appears. Dragging down to 10:30 AM stretches it to 90 minutes. Letting go opens New meeting with that time. Jordan Lee is chosen as the client, the form fills in, and after Add meeting the 90 minute meeting shows on the calendar.',
    frames,
  };
}

// ---------------------------------------------------------------------------------------------
// Conflicts example (decision 0063): fictional meetings for one coach, two of them overlapping.

const conflictMeeting = (id: string, clientName: string, date: string, time: string, durationMinutes: number) => ({
  id, clientName, startsAt: instant(date, time), durationMinutes, status: 'scheduled',
  coachId: 'demo-coach', coachName: 'Matt', services: ['personal_training' as const],
});

export const CONFLICT_DEMO_MEETINGS = [
  conflictMeeting('c1', 'Jordan Lee', '2026-12-03', '17:00', 60),
  conflictMeeting('c2', 'Sam Rivera', '2026-12-03', '17:30', 40),
  // Back to back with Sam: not a conflict.
  conflictMeeting('c3', 'Alex Kim', '2026-12-03', '18:10', 60),
];

export const MEETING_DEMOS = {
  'attendance-undo': attendanceWithUndo(),
  'repeating-pattern': repeatingPattern(),
  'calendar-create': calendarCreate(),
} as const;

export type MeetingDemoName = keyof typeof MEETING_DEMOS;
