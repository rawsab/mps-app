import type { ReactNode } from 'react';
import { Chip } from '@/components/controls';
import {
  AVAILABILITY_DEMOS, OPEN_TIMES_DAY, PICKER_TARGET, TIMELINE, laneTarget, type AvailabilityDemoName, type OpenTimesDemoState, type OpenTimesLane, type Span,
} from '@/domain/help/availabilityDemos';
import { formatClock } from '@/domain/scheduling/pattern';
import { DemoPlayer } from './DemoPlayer';

/** An availability demo by name, for Help pages: `<AvailabilityDemo name="open-times" />`. */
export function AvailabilityDemo({ name }: { name: AvailabilityDemoName }) {
  return <DemoPlayer script={AVAILABILITY_DEMOS[name]} render={(state) => <OpenTimesPicture state={state} />} />;
}

/** One pixel per minute: 8 AM to 6 PM is 600px. */
const width = (minutes: number) => `${minutes}px`;
const left = (minute: number) => `${minute - TIMELINE.from}px`;
const clock = (minute: number) => formatClock(`${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`);
const hourLabel = (minute: number) => { const h = minute / 60; return `${h % 12 || 12} ${h < 12 ? 'AM' : 'PM'}`; };

const LANES: { lane: OpenTimesLane; label: string }[] = [
  { lane: 'hours', label: 'Working hours' },
  { lane: 'extra', label: 'Extra hours' },
  { lane: 'timeOff', label: 'Time off' },
  { lane: 'meetings', label: 'Meetings' },
  { lane: 'notice', label: 'Notice' },
];

function Bar({ span, className, children }: { span: Span; className: string; children?: ReactNode }) {
  return (
    <span className={`absolute inset-y-1.5 flex items-center overflow-hidden rounded-[4px] border px-1.5 text-xs ${className}`} style={{ left: left(span.from), width: width(span.to - span.from) }}>
      {children}
    </span>
  );
}

/**
 * A day as a timeline: each rule is a lane, added one at a time, and the Open lane at the bottom shows
 * what's left. Every lane is drawn from the first frame and fades in, so the picture never changes size.
 */
function OpenTimesPicture({ state }: { state: OpenTimesDemoState }) {
  const day = OPEN_TIMES_DAY;
  const hours = Array.from({ length: (TIMELINE.to - TIMELINE.from) / 60 + 1 }, (_, i) => TIMELINE.from + i * 60);
  const shown = (lane: OpenTimesLane) => state.lanes.includes(lane);
  const lane = (key: OpenTimesLane) => {
    switch (key) {
      case 'hours': return day.hours.map((s) => <Bar key={s.from} span={s} className="border-gold/50 bg-gold/15">{clock(s.from)}</Bar>);
      case 'extra': return day.extra.map((s) => <Bar key={s.from} span={s} className="border-success/50 bg-success/15">Extra</Bar>);
      case 'timeOff': return day.timeOff.map((s) => <Bar key={s.from} span={s} className="calendar-unavailable border-danger/50 text-danger">Off</Bar>);
      case 'meetings': return day.meetings.map((m) => (
        <span key={m.from}>
          {/* The gap on either side, then the meeting itself. */}
          <Bar span={{ from: m.from - day.gap, to: m.to + day.gap }} className="border-dashed border-muted/60 bg-transparent" />
          <Bar span={m} className="border-gold bg-gold/35 font-medium">{m.label}</Bar>
        </span>
      ));
      case 'notice': return <Bar span={{ from: TIMELINE.from, to: day.earliest }} className="calendar-unavailable border-line text-muted">Too soon</Bar>;
    }
  };

  return (
    <div className="w-[44rem] rounded-card border border-line bg-surface p-4 text-left text-sm text-text shadow-popover">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="font-semibold">Tuesday, November 24</span>
        <span className="text-xs text-muted">Notice 12 hours · Gap 15 minutes · 60 minute session</span>
      </div>
      <div className="grid grid-cols-[6.5rem_600px] gap-x-3">
        <span />
        <span className="relative mb-1 h-4">
          {hours.map((h) => <span key={h} className="absolute -translate-x-1/2 text-[11px] text-muted tabular-nums" style={{ left: left(h) }}>{hourLabel(h)}</span>)}
        </span>
        {LANES.map(({ lane: key, label }) => (
          <Lane key={key} label={label} target={laneTarget(key)} shown={shown(key)} hours={hours}>{lane(key)}</Lane>
        ))}
        <span className="mt-2 flex h-11 items-center border-t border-line pt-2 text-xs font-semibold">Open</span>
        <span className="mt-2 block border-t border-line pt-2">
          <span data-demo-target={laneTarget('open')} className="relative block h-9">
            {state.open.map((s) => <Bar key={`${s.from}-${s.to}`} span={s} className="border-gold/60 bg-gold/10" />)}
            {/* A tick for each start time, once the meeting's length is applied. */}
            {(state.starts ?? []).map((s) => (
              <span key={s} className="help-demo-changed absolute inset-y-2.5 w-0.5 -translate-x-1/2 rounded-full bg-gold" style={{ left: left(s) }} />
            ))}
          </span>
        </span>
      </div>

      <div data-demo-target={PICKER_TARGET} className={`mt-4 rounded-card border border-line bg-ink p-3 transition-opacity duration-300 ${state.picker ? 'opacity-100' : 'opacity-0'}`}>
        <p className="text-xs font-medium text-muted">In the client’s app</p>
        <p className="mt-2 text-sm font-medium">Pick a day</p>
        <span className="mt-1.5 flex gap-1.5">
          <Chip pressed={false}>Mon, Nov 23</Chip><Chip pressed>Tue, Nov 24</Chip><Chip pressed={false}>Wed, Nov 25</Chip>
        </span>
        <p className="mt-3 text-sm font-medium">Time (60 min)</p>
        <span className="mt-1.5 flex flex-wrap gap-1.5">
          {(state.picker ?? []).map((s) => <span key={s} className="rounded-card border border-line bg-surface px-2 py-1 text-xs tabular-nums">{clock(s)}</span>)}
        </span>
      </div>
    </div>
  );
}

function Lane({ label, target, shown, hours, children }: { label: string; target: string; shown: boolean; hours: number[]; children: ReactNode }) {
  return (
    <>
      <span className={`flex h-9 items-center text-xs transition-colors duration-300 ${shown ? 'text-text' : 'text-muted/50'}`}>{label}</span>
      <span data-demo-target={target} className="relative h-9 border-t border-line/60">
        {/* Hour lines, faint, so the bars line up with the labels. */}
        {hours.map((h) => <span key={h} className="absolute inset-y-0 w-px bg-line/50" style={{ left: left(h) }} />)}
        <span className={`absolute inset-0 transition-opacity duration-300 ${shown ? 'opacity-100' : 'opacity-0'}`}>{children}</span>
      </span>
    </>
  );
}
