import type { DemoFrame, DemoScript } from './demo';

/*
 * The open times demo for Help (decision 0057, demo 10). Open times are only worked out in the
 * database (`private.availability_windows` and `private.open_slots`, decision 0050). This is a
 * one-day copy of the same rule in minutes from midnight, so a test can check the picture against
 * it. Change both if the rule changes.
 */

/** A stretch of one day, in minutes from midnight, `to` exclusive. */
export type Span = { from: number; to: number };

export type AvailabilityDay = {
  hours: Span[];
  extra: Span[];
  timeOff: Span[];
  /** Scheduled meetings, and times other clients' requests are holding. */
  meetings: (Span & { label: string; held?: boolean })[];
  /** Gap (minutes), kept free before and after each meeting. */
  gap: number;
  /** The soonest start: now plus the notice. */
  earliest: number;
  /** The meeting's length in minutes. */
  length: number;
};

/** Overlapping or touching spans merged and sorted. */
export function mergeSpans(spans: Span[]): Span[] {
  const merged: Span[] = [];
  for (const span of [...spans].sort((a, b) => a.from - b.from)) {
    const last = merged.at(-1);
    if (last && span.from <= last.to) last.to = Math.max(last.to, span.to);
    else merged.push({ ...span });
  }
  return merged;
}

/** `spans` with every part covered by `cut` removed. */
export function subtractSpans(spans: Span[], cut: Span[]): Span[] {
  let result = mergeSpans(spans);
  for (const c of cut) {
    result = result.flatMap((s) => [
      ...(c.from > s.from ? [{ from: s.from, to: Math.min(s.to, c.from) }] : []),
      ...(c.to < s.to ? [{ from: Math.max(s.from, c.to), to: s.to }] : []),
    ]).filter((s) => s.to > s.from);
  }
  return result;
}

/** Working hours plus extra hours, minus time off. Time off wins where they overlap. */
export function dayWindows(day: Pick<AvailabilityDay, 'hours' | 'extra' | 'timeOff'>): Span[] {
  return subtractSpans([...day.hours, ...day.extra], day.timeOff);
}

const QUARTER = 15;

/**
 * Start times a client can pick, as `private.open_slots` finds them: every quarter hour where the
 * whole meeting fits in a window, from the soonest time on, clear of each meeting and held time by
 * the gap on both sides. (The look-ahead limit is days away, so a single day never meets it.)
 */
export function dayOpenTimes(day: AvailabilityDay): number[] {
  const starts: number[] = [];
  for (const window of dayWindows(day)) {
    for (let s = Math.ceil(window.from / QUARTER) * QUARTER; s <= window.to - day.length; s += QUARTER) {
      if (s < day.earliest) continue;
      if (day.meetings.some((m) => m.from - day.gap < s + day.length && s < m.to + day.gap)) continue;
      starts.push(s);
    }
  }
  return starts;
}

const at = (hour: number, minute = 0) => hour * 60 + minute;

/** A fictional Tuesday. The coach's notice is 12 hours, and it's Monday at 9:30 PM. */
export const OPEN_TIMES_DAY: AvailabilityDay = {
  hours: [{ from: at(9), to: at(12) }, { from: at(13), to: at(17) }],
  extra: [{ from: at(17), to: at(18) }],
  timeOff: [{ from: at(15), to: at(16) }],
  meetings: [{ from: at(11), to: at(12), label: 'Sam Okafor' }],
  gap: 15,
  earliest: at(9, 30),
  length: 60,
};

/** The timeline's first and last hour. */
export const TIMELINE = { from: at(8), to: at(18) };

export type OpenTimesLane = 'hours' | 'extra' | 'timeOff' | 'meetings' | 'notice';

export type OpenTimesDemoState = {
  /** The lanes drawn so far, in the order they were added. */
  lanes: OpenTimesLane[];
  /** What's still open, after the lanes drawn so far. */
  open: Span[];
  /** Start times marked on the open lane, once the meeting's length is applied. */
  starts: number[] | null;
  /** The client's time picker, with these times. */
  picker: number[] | null;
};

export const laneTarget = (lane: OpenTimesLane | 'open') => `lane:${lane}`;
export const PICKER_TARGET = 'open-times-picker';

/** What's open with only `lanes` taken into account, as spans the meeting could sit in. */
export function openAfter(day: AvailabilityDay, lanes: OpenTimesLane[]): Span[] {
  const has = (lane: OpenTimesLane) => lanes.includes(lane);
  let open = dayWindows({ hours: day.hours, extra: has('extra') ? day.extra : [], timeOff: has('timeOff') ? day.timeOff : [] });
  if (has('meetings')) open = subtractSpans(open, day.meetings.map((m) => ({ from: m.from - day.gap, to: m.to + day.gap })));
  if (has('notice')) open = subtractSpans(open, [{ from: 0, to: day.earliest }]);
  return open;
}

type Frame = DemoFrame<OpenTimesDemoState>;

function openTimes(): DemoScript<OpenTimesDemoState> {
  const day = OPEN_TIMES_DAY;
  const state = (lanes: OpenTimesLane[], extra: Partial<OpenTimesDemoState> = {}): OpenTimesDemoState => ({ lanes, open: openAfter(day, lanes), starts: null, picker: null, ...extra });
  const all: OpenTimesLane[] = ['hours', 'extra', 'timeOff', 'meetings', 'notice'];
  const starts = dayOpenTimes(day);
  const frames: Frame[] = [
    { state: state(['hours']), ms: 2600, caption: 'Start with your working hours for Tuesday: 9 AM to 12 PM, then 1 PM to 5 PM.', pointer: { target: laneTarget('hours') } },
    { state: state(['hours', 'extra']), ms: 2600, caption: 'Extra hours add time. This week you also work 5 PM to 6 PM.', pointer: { target: laneTarget('extra') } },
    { state: state(['hours', 'extra', 'timeOff']), ms: 2600, caption: 'Time off takes time away: 3 PM to 4 PM here.', pointer: { target: laneTarget('timeOff') } },
    { state: state(['hours', 'extra', 'timeOff', 'meetings']), ms: 3000, caption: 'Booked meetings are taken, with your 15 minute gap kept free on each side.', pointer: { target: laneTarget('meetings') } },
    { state: state(all), ms: 3000, caption: 'Your notice is 12 hours. It’s Monday at 9:30 PM, so nothing before 9:30 AM.', pointer: { target: laneTarget('notice') } },
    { state: state(all, { starts }), ms: 2000, caption: 'A 60 minute session can start every 15 minutes where the whole hour fits.', pointer: { target: laneTarget('open') } },
    // The picker unfolds first; the pointer waits until it has settled.
    { state: state(all, { starts, picker: starts }), ms: 450, caption: 'The client picks from these times, shown in their own time zone.', pointer: { target: laneTarget('open') } },
    { state: state(all, { starts, picker: starts }), ms: 3200, caption: 'The client picks from these times, shown in their own time zone.', pointer: { target: PICKER_TARGET } },
  ];
  return {
    id: 'open-times',
    description: 'How a day’s open times are worked out: working hours, plus extra hours, minus time off, minus booked meetings with the gap around them, minus anything sooner than the notice. A 60 minute session can then start every 15 minutes where it fits.',
    frames,
  };
}

export const AVAILABILITY_DEMOS = {
  'open-times': openTimes(),
} satisfies Record<string, DemoScript<OpenTimesDemoState>>;

export type AvailabilityDemoName = keyof typeof AVAILABILITY_DEMOS;
