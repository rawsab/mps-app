import type { ReactNode } from 'react';
import { ToggleButton } from '@/components/controls';
import { CheckIcon, CrossIcon } from '@/components/icons';
import { Badge, Button } from '@/components/ui';
import {
  ATTENDANCE_ROWS, CALENDAR_ADD_TARGET, CALENDAR_CLIENT_TARGET, CALENDAR_DEMO_CLIENTS, CALENDAR_DEMO_DAYS, CALENDAR_DEMO_HOURS, CALENDAR_DEMO_POINTS,
  DEMO_NOW, DEMO_TIME_ZONE, MEETING_DEMOS, PATTERN_ROW_TARGET, SET_UP_TARGET, UNDO_NOTICE_TARGET, attendanceTarget, calendarDemoInstant,
  calendarOptionTarget, calendarPointTarget, dayToggleTarget, startTarget,
  type AttendanceDemoState, type CalendarCreateState, type PatternDemoState,
} from '@/domain/help/meetingDemos';
import { clockTime } from '@/domain/scheduling/calendarCreate';
import { groupAttendanceByDay } from '@/domain/scheduling/attendance';
import { WEEKDAYS, describePattern, formatClock, isoWeekday, weekdayName, weekdayShort } from '@/domain/scheduling/pattern';
import { attendanceMessage, sessionDay, sessionMoment, sessionRange, sessionTime } from '@/features/scheduling/time';
import { formatDate } from '@/lib/format';
import { DemoPlayer } from './DemoPlayer';

/** Recording attendance with Undo: `<AttendanceDemo />`. */
export function AttendanceDemo() {
  return <DemoPlayer script={MEETING_DEMOS['attendance-undo']} render={(state) => <AttendancePicture state={state} />} />;
}

/** A repeating pattern filling its next meetings: `<PatternDemo />`. */
export function PatternDemo() {
  const script = MEETING_DEMOS['repeating-pattern'];
  // Every day the demo adds, so each row is drawn from the start and can unfold when its day is chosen.
  // The pattern the demo saves. The Meetings card always draws it, so it doesn't empty while fading out.
  const saved = script.frames.at(-1)!.state.saved!;
  const days = saved.slots;
  // The dialog at its tallest, with every day open, sizes the picture. The dialog stays centred in it
  // and grows from the middle as days are added.
  const tallest = script.frames.reduce((a, b) => (b.state.slots.length > a.state.slots.length ? b : a)).state;
  return <DemoPlayer script={script} render={(state) => (
    <div className="grid">
      {/* The real picture comes first, so the pointer finds its targets rather than the sizer's. */}
      <div className="grid [grid-area:1/1]"><PatternPicture state={state} days={days} saved={saved} /></div>
      <div aria-hidden className="pointer-events-none opacity-0 [grid-area:1/1]"><PatternPicture state={tallest} days={days} saved={saved} /></div>
    </div>
  )} />;
}

const ROUND_BUTTON = 'inline-flex size-9 items-center justify-center rounded-card';

/**
 * The Meetings page's Record attendance list, drawn from a demo frame with the page's own grouping by
 * day, labels and notice text. The notice sits at the bottom of the picture instead of the window.
 */
function AttendancePicture({ state }: { state: AttendanceDemoState }) {
  // Every meeting the demo has stays drawn, so a recorded row can fold away and come back on Undo.
  const days = groupAttendanceByDay(ATTENDANCE_ROWS, DEMO_TIME_ZONE, DEMO_NOW);
  const listed = new Set(state.rows.map((row) => row.id));
  const waiting = state.rows.filter((row) => row.id !== state.leaving).length;
  const noticeRow = state.notice ? ATTENDANCE_ROWS.find((row) => row.id === state.notice!.id) : null;
  return (
    // Fixed height: the list plus the notice's room. Without a notice the list moves down by half
    // that room, so it sits in the middle, and glides up when a notice needs the space.
    <div className="flex w-[36rem] flex-col items-center text-left text-sm text-text">
      <div className={`w-full rounded-card border border-line bg-surface p-4 shadow-popover transition-transform duration-500 ease-[var(--ease-ui)] ${state.room ? 'translate-y-0' : 'translate-y-[1.625rem]'}`}>
        <div className="mb-2 flex min-h-8 items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted">Record attendance<span className="ml-2 text-gold-fg">{waiting} waiting</span></span>
          <Button variant="ghost" className="min-h-9 px-3">Mark all completed</Button>
        </div>
        {/* Room for all four rows, so the pane never changes height. The last row's line is clipped. */}
        <div className="min-h-[13.5rem] overflow-hidden">
          <ul className="-mb-px">
            {days.flatMap((day) => day.meetings).map((row, index) => {
              const day = days.find((d) => d.meetings.includes(row))!;
              const shown = listed.has(row.id) && row.id !== state.leaving && !state.faded;
              return (
                // Folds closed once recorded, so the rows below glide up into its place.
                <li key={row.id} data-open={listed.has(row.id)} className="animated-disclosure-content help-demo-unfold">
                  <div className="min-h-0 overflow-hidden">
                    {/* Fades on its own: out when recorded or before a loop, in one by one as the list appears. */}
                    <div className={`flex items-center gap-2 border-b border-line py-1.5 transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
                      style={{ transitionDelay: shown && state.restored !== row.id ? `${index * 90}ms` : undefined }}>
                      <span className="min-w-0 flex-1 py-0.5">
                        <span className="block text-xs tabular-nums text-muted">
                          {day.relative === 'today' ? 'Today' : day.relative === 'yesterday' ? 'Yesterday' : formatDate(day.date)} · {sessionTime(row.startsAt, DEMO_TIME_ZONE)}
                        </span>
                        <span className="flex items-baseline gap-2"><span className="font-medium">{row.clientName}</span><span className="text-xs text-muted">Personal training</span></span>
                      </span>
                      <span data-demo-target={attendanceTarget(row.id, 'no_show')} className={`${ROUND_BUTTON} text-danger`}><CrossIcon /></span>
                      <span data-demo-target={attendanceTarget(row.id, 'completed')} className={`${ROUND_BUTTON} text-success`}><CheckIcon /></span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      <div className="mt-3 flex h-10 w-full justify-center">
        {state.notice && noticeRow ? (
          <p className={`flex w-[30rem] items-center justify-between gap-x-3 rounded-card border border-line bg-surface-raised px-4 text-xs shadow-lg transition-[opacity,translate] duration-300 ${state.notice.shown ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}>
            {/* Keyed, so a new notice swaps in as the page's does. */}
            <span key={`${state.notice.id}:${state.notice.status}`} className="notice-swap">{attendanceMessage(noticeRow, state.notice.status, DEMO_TIME_ZONE)}</span>
            <span data-demo-target={UNDO_NOTICE_TARGET} className="shrink-0 font-medium text-gold-fg underline underline-offset-2">Undo</span>
          </p>
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children, target }: { label: string; children: ReactNode; target?: string }) {
  return (
    <span className="grid gap-1.5">
      <span className="text-sm font-medium">{label}</span>
      <span data-demo-target={target} className="flex min-h-11 items-center rounded-card border border-line bg-ink px-3 tabular-nums">{children}</span>
    </span>
  );
}

/**
 * Part of the Set up repeating meetings dialog: the cycle, days, each day's start and length, and the
 * Next meetings list. After saving, the client's Meetings card fades in over it with the new pattern.
 */
function PatternPicture({ state, days, saved }: { state: PatternDemoState; days: PatternDemoState['slots']; saved: NonNullable<PatternDemoState['saved']> }) {
  const changed = new Set(state.changed ?? []);
  const summary = describePattern({ cycleWeeks: 1, slots: saved.slots.map((slot) => ({ ...slot, cycleWeek: 1 })) }).summary;
  return (
    <div className="grid w-[34rem] text-left text-sm text-text">
      <div className={`self-center rounded-card border border-line bg-surface shadow-popover transition-opacity duration-300 [grid-area:1/1] ${state.saved ? 'opacity-0' : 'opacity-100'}`}>
        <p className="border-b border-line px-5 py-3 text-base font-semibold">Set up repeating meetings</p>
        <div className="grid gap-4 p-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Repeats">Every week</Field>
            <Field label="Starts on">{formatDate(state.startsOn)}</Field>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium">Days</p>
            <span className="flex gap-1.5">
              {WEEKDAYS.map((weekday) => (
                <span key={weekday} data-demo-target={dayToggleTarget(weekday)}>
                  <ToggleButton pressed={state.slots.some((slot) => slot.weekday === weekday)} className="min-w-12 px-2">{weekdayShort(weekday)}</ToggleButton>
                </span>
              ))}
            </span>
            {/* Each chosen day's row unfolds, so the dialog grows smoothly instead of jumping. */}
            <ul className="mt-1 grid">
              {days.map((day) => {
                const slot = state.slots.find((s) => s.weekday === day.weekday) ?? day;
                return (
                  <li key={day.weekday} data-open={state.slots.some((s) => s.weekday === day.weekday)} className="animated-disclosure-content help-demo-unfold">
                    <div className="min-h-0 overflow-hidden">
                      <div className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3 pt-2">
                        <span className="pb-3 font-medium">{weekdayName(slot.weekday)}</span>
                        <Field label="Start" target={startTarget(slot.weekday)}>{formatClock(slot.startTime)}</Field>
                        <Field label="Minutes">{slot.durationMinutes} min</Field>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <section className="min-h-[11.5rem] rounded-card border border-line bg-ink p-3">
            <p className="text-sm font-medium">Next meetings</p>
            {state.preview.length ? (
              <ol className="mt-2 grid gap-1">
                {state.preview.map((item) => (
                  <li key={item.startsAt} className={`flex gap-x-2 rounded-[4px] ${changed.has(item.startsAt) ? 'help-demo-changed' : ''}`}>
                    <span>{sessionMoment(item.startsAt, DEMO_TIME_ZONE)}</span><span className="text-muted">· {item.durationMinutes} min</span>
                  </li>
                ))}
              </ol>
            ) : <p className="mt-2 text-muted">Choose days and times to see the dates.</p>}
          </section>
          <span className="flex justify-end gap-2">
            <Button variant="secondary">Cancel</Button>
            <span data-demo-target={SET_UP_TARGET}><Button>Set up meetings</Button></span>
          </span>
        </div>
      </div>

      <div className={`self-center rounded-card border border-line bg-surface p-4 shadow-popover transition-opacity duration-300 [grid-area:1/1] ${state.saved ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-lg font-semibold">Meetings</p>
        <div data-demo-target={PATTERN_ROW_TARGET} className="mt-3 flex items-start gap-2 rounded-card border border-line p-4">
          <span aria-hidden className="pt-0.5 text-gold-fg">↻</span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{summary}</span>
            <span className="mt-2 flex items-center gap-2 text-xs text-muted"><Badge tone="gold">Personal training</Badge>Starts {formatDate(state.startsOn)}</span>
          </span>
        </div>
        <ul className="mt-3 divide-y divide-line">
          {saved.preview.slice(0, 3).map((item) => (
            <li key={item.startsAt} className="flex min-h-14 items-center gap-3 py-2 pl-2">
              <span aria-hidden className="w-1 self-stretch rounded-full bg-gold" />
              <span className="w-28 font-medium">{sessionDay(item.startsAt, DEMO_TIME_ZONE)}</span>
              <span className="min-w-0 flex-1">
                <span className="block tabular-nums">{sessionRange(item.startsAt, item.durationMinutes, DEMO_TIME_ZONE)}</span>
                <span className="block text-xs text-muted">Personal training · ↻ Repeating</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Adding a meeting from the calendar by dragging: `<CalendarCreateDemo />` (decision 0066). */
export function CalendarCreateDemo() {
  const script = MEETING_DEMOS['calendar-create'];
  // The dialog filled in sizes the picture, so it never changes height as the client is chosen.
  const full = script.frames.find((frame) => frame.state.dialog?.client)!.state;
  return <DemoPlayer script={script} render={(state) => (
    <div className="grid">
      <div className="grid [grid-area:1/1]"><CalendarCreatePicture state={state} /></div>
      <div aria-hidden className="pointer-events-none opacity-0 [grid-area:1/1]"><CalendarCreatePicture state={full} /></div>
    </div>
  )} />;
}

const DEMO_HOUR_PX = 44;
const fromTop = (minutes: number) => ((minutes - CALENDAR_DEMO_HOURS.from * 60) / 60) * DEMO_HOUR_PX;
const clock = (minutes: number) => formatClock(clockTime(minutes));

/** Part of the Meetings page's week view, with the New meeting dialog over it once the drag ends. */
function CalendarCreatePicture({ state }: { state: CalendarCreateState }) {
  const hours = Array.from({ length: CALENDAR_DEMO_HOURS.to - CALENDAR_DEMO_HOURS.from }, (_, i) => CALENDAR_DEMO_HOURS.from + i);
  const { dialog, ghost } = state;
  const at = dialog ? calendarDemoInstant(dialog.day, dialog.start) : null;
  return (
    <div className="grid w-[36rem] text-left text-sm text-text">
      <div className="self-center overflow-hidden rounded-card border border-line bg-surface shadow-popover [grid-area:1/1]">
        <div className="grid grid-cols-[3.875rem_repeat(3,minmax(0,1fr))] border-b border-line">
          <span />
          {CALENDAR_DEMO_DAYS.map((day) => (
            <span key={day} className="border-l border-line py-2 text-center">
              <span className="block text-xs text-muted">{weekdayShort(isoWeekday(day))}</span>
              <span className="block tabular-nums">{Number(day.slice(8))}</span>
            </span>
          ))}
        </div>
        <div className="grid grid-cols-[3.875rem_repeat(3,minmax(0,1fr))]" style={{ height: hours.length * DEMO_HOUR_PX }}>
          <div className="relative">
            {hours.slice(1).map((hour) => (
              <span key={hour} className="absolute right-1.5 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums text-muted" style={{ top: fromTop(hour * 60) }}>{clock(hour * 60)}</span>
            ))}
          </div>
          {CALENDAR_DEMO_DAYS.map((day) => (
            <div key={day} className="relative border-l border-line">
              {hours.slice(1).map((hour) => <div key={hour} className="absolute inset-x-0 border-t border-line/60" style={{ top: fromTop(hour * 60) }} />)}
              {state.meetings.filter((m) => m.day === day).map((meeting) => (
                <div key={meeting.id} className={`absolute inset-x-0.5 overflow-hidden rounded-inner border-l-[3px] border-gold bg-gold/15 px-1.5 py-0.5 text-[11px] leading-tight ${state.changed === meeting.id ? 'help-demo-changed' : ''}`}
                  style={{ top: fromTop(meeting.start) + 1, height: (meeting.minutes / 60) * DEMO_HOUR_PX - 2 }}>
                  <span className="block truncate font-medium">{meeting.clientName}</span>
                  <span className="block truncate text-muted">{clock(meeting.start)} to {clock(meeting.start + meeting.minutes)}</span>
                </div>
              ))}
              {ghost?.day === day ? (
                <div className={`absolute inset-x-0.5 rounded-inner border border-dashed border-gold px-1.5 py-0.5 text-[11px] leading-tight text-gold-fg transition-[height] duration-200 ${ghost.dragging ? 'bg-gold/20' : 'bg-gold/10'}`}
                  style={{ top: fromTop(ghost.start) + 1, height: (ghost.minutes / 60) * DEMO_HOUR_PX - 2 }}>
                  <span className="tabular-nums">{clock(ghost.start)}</span>{ghost.dragging ? ` · ${ghost.minutes} min` : ''}
                </div>
              ) : null}
              {/* Where the pointer rests and drags to. */}
              {CALENDAR_DEMO_POINTS.map((minutes) => (
                <span key={minutes} data-demo-target={calendarPointTarget(day, minutes)} className="absolute left-1/2 size-px" style={{ top: fromTop(minutes) }} />
              ))}
            </div>
          ))}
        </div>
      </div>

      {dialog && at ? (
        // Its own layer above the calendar, whose meetings and labels are positioned.
        <div className={`relative z-10 self-center justify-self-center w-[32rem] rounded-card border border-line bg-surface shadow-popover transition-opacity duration-300 [grid-area:1/1] ${dialog.shown ? 'opacity-100' : 'opacity-0'}`}>
          <div className="border-b border-line px-5 py-3">
            <p className="text-base font-semibold">New meeting</p>
            <p className="mt-0.5 text-xs text-muted">{sessionDay(at, DEMO_TIME_ZONE)}, {sessionRange(at, dialog.minutes, DEMO_TIME_ZONE)} ({dialog.minutes} min).</p>
          </div>
          <div className="grid gap-4 p-5">
            <div className="relative grid gap-1.5">
              <span className="text-sm font-medium">Client</span>
              <span data-demo-target={CALENDAR_CLIENT_TARGET} className={`flex min-h-11 items-center rounded-card border bg-ink px-3 ${dialog.listOpen ? 'border-gold' : 'border-line'}`}>
                {dialog.client ?? <span className="text-muted">{dialog.listOpen ? 'Search' : ''}</span>}
              </span>
              {dialog.listOpen ? (
                <ul className="absolute inset-x-0 top-full z-10 mt-1.5 rounded-card border border-line bg-surface p-1.5 shadow-popover">
                  {CALENDAR_DEMO_CLIENTS.map((name) => (
                    <li key={name} data-demo-target={calendarOptionTarget(name)} className="flex min-h-9 items-center rounded-inner px-2.5">{name}</li>
                  ))}
                </ul>
              ) : null}
            </div>
            <span className="flex rounded-card border border-line p-0.5 self-start">
              <span className="min-h-10 rounded-inner bg-surface-raised px-3 py-2.5 font-medium leading-none">One meeting</span>
              <span className="min-h-10 rounded-inner px-3 py-2.5 leading-none text-muted">Repeating</span>
            </span>
            {dialog.client ? (
              <div className="grid gap-4">
                <div className="grid grid-cols-3 gap-3">
                  <Field label="Date">{formatDate(dialog.day)}</Field>
                  <Field label="Start">{clock(dialog.start)}</Field>
                  <Field label="Minutes">{dialog.minutes} min</Field>
                </div>
                <div>
                  <p className="mb-2 text-sm font-medium">About</p>
                  <ToggleButton pressed className="px-3">Personal training</ToggleButton>
                </div>
              </div>
            ) : <p className="text-muted">Choose a client to set the time, what it’s about, the program and notes.</p>}
            <span className="flex justify-end gap-2">
              <Button variant="secondary">Cancel</Button>
              <span data-demo-target={CALENDAR_ADD_TARGET}><Button disabled={!dialog.client}>Add meeting</Button></span>
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}
