import { useEffect, useMemo, useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert, Button, SelectField, TextAreaField, TextField } from '@/components/ui';
import { anchorFor, cycleWeekOf, weekdayName, weekdayShort, WEEKDAYS, type PatternSlot } from '@/domain/scheduling/pattern';
import type { ProgramRow } from '@/features/programs/api';
import { formatDate } from '@/lib/format';
import { schedulingError, useChangePattern, useCreatePattern, usePatternPreview, type MeetingContext, type MeetingSchedule, type MeetingTopic, type PatternInput } from './api';
import { defaultTopic, MeetingTopicFields } from './MeetingTopic';
import { sessionMoment, todayIn, zoneLabel } from './time';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Waits for typing to settle before asking the server for a preview. */
function useSettled(value: string, ms = 300): string {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

type SlotDraft = { cycleWeek: number; weekday: number; startTime: string; duration: string };

/**
 * Creates a repeating pattern, or changes one "from this date on" (`schedule` + `from`). Times are
 * the primary coach's wall clock; the server previews and generates the dates.
 */
export function PatternDialog({ clientId, context, programs, schedule, from, onClose, onSaved }: {
  clientId: string;
  context: MeetingContext;
  programs: ProgramRow[];
  schedule?: MeetingSchedule;
  from?: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const timeZone = context.timezone;
  const today = todayIn(timeZone);
  const create = useCreatePattern(clientId);
  const change = useChangePattern();
  const saving = create.isPending || change.isPending;
  const [cycleWeeks, setCycleWeeks] = useState(schedule?.cycleWeeks ?? 1);
  const [slots, setSlots] = useState<SlotDraft[]>(() => (schedule?.slots ?? []).map((slot) => ({
    cycleWeek: slot.cycleWeek, weekday: slot.weekday, startTime: slot.startTime, duration: String(slot.durationMinutes),
  })));
  const [startsOn, setStartsOn] = useState(from ?? today);
  const [endsOn, setEndsOn] = useState(schedule?.endsOn ?? '');
  // Which week of the cycle the start date falls in. A change keeps the old pattern's rhythm.
  const [startWeek, setStartWeek] = useState(() => (schedule ? cycleWeekOf(from ?? today, schedule.anchorOn, schedule.cycleWeeks) : 1));
  const [topic, setTopic] = useState<MeetingTopic>(() => schedule
    ? { services: schedule.services.filter((s) => context.services.some((live) => live.service === s)), programs: schedule.programs }
    : defaultTopic(context));
  const [notes, setNotes] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const problems = useMemo(() => {
    const list: string[] = [];
    if (!topic.services.length) list.push('Choose what the meetings are about.');
    if (!slots.length) list.push('Choose at least one day.');
    if (slots.some((slot) => !TIME.test(slot.startTime))) list.push('Enter a start time for every day.');
    if (slots.some((slot) => !/^\d{1,3}$/.test(slot.duration) || Number(slot.duration) < 5 || Number(slot.duration) > 600)) list.push('Session lengths are 5 to 600 minutes.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || startsOn < today) list.push(`${schedule ? 'Apply from' : 'Starts on'} must be today or later.`);
    if (schedule && startsOn < schedule.startsOn) list.push(`Choose a date from ${formatDate(schedule.startsOn)}, when this pattern starts.`);
    if (endsOn && endsOn < startsOn) list.push('The end date is before the start date.');
    return list;
  }, [slots, startsOn, endsOn, today, schedule, topic.services.length]);

  const input: PatternInput | null = problems.length ? null : {
    cycleWeeks,
    anchorOn: cycleWeeks > 1 ? anchorFor(startsOn, Math.min(startWeek, cycleWeeks)) : null,
    startsOn,
    endsOn: endsOn || null,
    slots: slots.map<PatternSlot>((slot) => ({ cycleWeek: slot.cycleWeek, weekday: slot.weekday, startTime: slot.startTime, durationMinutes: Number(slot.duration) })),
  };
  // Settle a string: a fresh object every render would restart the timer forever.
  const settled = useSettled(input ? JSON.stringify(input) : '');
  const preview = usePatternPreview(clientId, settled ? JSON.parse(settled) as PatternInput : null);

  function setCycle(weeks: number) {
    setCycleWeeks(weeks);
    setSlots((current) => current.filter((slot) => slot.cycleWeek <= weeks));
    setStartWeek((week) => Math.min(week, weeks));
  }

  function toggleDay(cycleWeek: number, weekday: number) {
    setSlots((current) => {
      if (current.some((slot) => slot.cycleWeek === cycleWeek && slot.weekday === weekday)) {
        return current.filter((slot) => !(slot.cycleWeek === cycleWeek && slot.weekday === weekday));
      }
      // New days copy the most recent time and length, since most clients train at one time.
      const last = current.at(-1);
      return [...current, { cycleWeek, weekday, startTime: last?.startTime ?? '07:00', duration: last?.duration ?? '60' }]
        .sort((a, b) => a.cycleWeek - b.cycleWeek || a.weekday - b.weekday);
    });
  }

  const updateSlot = (target: SlotDraft, patch: Partial<SlotDraft>) =>
    setSlots((current) => current.map((slot) => (slot === target ? { ...slot, ...patch } : slot)));

  function save() {
    if (!input) return setShowErrors(true);
    if (schedule) {
      change.mutate({ ...input, ...topic, scheduleId: schedule.id }, {
        onSuccess: (result) => onSaved(`Repeating meetings changed from ${formatDate(input.startsOn)}.${result.keptMeetings
          ? ` ${result.keptMeetings} ${result.keptMeetings === 1 ? 'meeting you had changed was' : 'meetings you had changed were'} kept as they were.` : ''}`),
      });
    } else {
      create.mutate({ ...input, ...topic, notes }, { onSuccess: () => onSaved('Repeating meetings set up.') });
    }
  }

  const error = create.error ?? change.error;

  return (
    <Dialog wide title={schedule ? 'Change repeating meetings' : 'Set up repeating meetings'}
      description={`Times are in ${zoneLabel(timeZone)}${context.coachName ? `, ${context.coachName}’s time zone` : ''}. Clients see them in their own.`}
      onClose={() => { if (!saving) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={saving} onClick={onClose}>Cancel</Button>
        <Button busy={saving} onClick={save}>{schedule ? 'Save changes' : 'Set up meetings'}</Button>
      </>}>
      <div className="grid gap-5 p-4 sm:p-5">
        <MeetingTopicFields context={context} programs={programs} value={topic} onChange={setTopic} />
        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField label="Repeats" value={cycleWeeks} onChange={(event) => setCycle(Number(event.target.value))}>
            <option value={1}>Every week</option>
            {[2, 3, 4].map((weeks) => <option key={weeks} value={weeks}>Every {weeks} weeks</option>)}
          </SelectField>
          <TextField label={schedule ? 'Apply from' : 'Starts on'} type="date" value={startsOn} min={today} onChange={(event) => setStartsOn(event.target.value)}
            hint={schedule ? 'Earlier meetings stay as they are.' : undefined} />
          <TextField label="Ends on (optional)" type="date" value={endsOn} min={startsOn} onChange={(event) => setEndsOn(event.target.value)} />
        </div>

        {cycleWeeks > 1 ? (
          <SelectField label={`The week of ${formatDate(startsOn || today)} is`} value={Math.min(startWeek, cycleWeeks)} onChange={(event) => setStartWeek(Number(event.target.value))} className="sm:max-w-xs">
            {Array.from({ length: cycleWeeks }, (_, index) => <option key={index} value={index + 1}>Week {index + 1}</option>)}
          </SelectField>
        ) : null}

        {Array.from({ length: cycleWeeks }, (_, index) => index + 1).map((week) => {
          const inWeek = slots.filter((slot) => slot.cycleWeek === week);
          return (
            <fieldset key={week} className="min-w-0">
              <legend className="mb-2 text-sm font-medium">{cycleWeeks > 1 ? `Week ${week}` : 'Days'}</legend>
              <div className="flex flex-wrap gap-1.5">
                {WEEKDAYS.map((weekday) => {
                  const on = inWeek.some((slot) => slot.weekday === weekday);
                  return (
                    <button key={weekday} type="button" aria-pressed={on} aria-label={`${weekdayName(weekday)}${cycleWeeks > 1 ? `, week ${week}` : ''}`}
                      onClick={() => toggleDay(week, weekday)}
                      className={`min-h-11 min-w-12 rounded-card border px-2 text-sm transition-colors ${on ? 'border-gold bg-gold text-on-gold font-semibold' : 'border-line text-muted hover:bg-surface-raised hover:text-text'}`}>
                      {weekdayShort(weekday)}
                    </button>
                  );
                })}
              </div>
              {inWeek.length ? (
                <ul className="mt-3 grid gap-2">
                  {inWeek.map((slot) => (
                    <li key={slot.weekday} className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-3">
                      <span className="pb-3 text-sm font-medium">{weekdayName(slot.weekday)}</span>
                      <TextField label="Start" type="time" step={300} value={slot.startTime} onChange={(event) => updateSlot(slot, { startTime: event.target.value })} />
                      <TextField label="Minutes" type="text" inputMode="numeric" maxLength={3} value={slot.duration} onChange={(event) => updateSlot(slot, { duration: event.target.value })} />
                    </li>
                  ))}
                </ul>
              ) : cycleWeeks > 1 ? <p className="mt-2 text-sm text-muted">No meetings this week.</p> : null}
            </fieldset>
          );
        })}

        <section aria-labelledby="pattern-preview" className="rounded-card border border-line bg-ink p-3 sm:p-4">
          <h3 id="pattern-preview" className="text-sm font-medium">Next meetings</h3>
          {input ? (
            preview.error ? <p className="mt-2 text-sm text-danger">{schedulingError(preview.error)}</p>
              : preview.data?.length ? (
                <ol className="mt-2 grid gap-1 text-sm">
                  {preview.data.map((item) => (
                    <li key={item.startsAt} className="flex flex-wrap gap-x-2">
                      <span>{sessionMoment(item.startsAt, timeZone)}</span>
                      <span className="text-muted">· {item.durationMinutes} min{cycleWeeks > 1 ? ` · Week ${item.cycleWeek}` : ''}</span>
                    </li>
                  ))}
                </ol>
              ) : <p className="mt-2 text-sm text-muted">{preview.isFetching ? 'Checking dates…' : 'No meetings fall within these dates.'}</p>
          ) : <p className="mt-2 text-sm text-muted">Choose days and times to see the dates.</p>}
        </section>

        {schedule ? (
          <p className="text-sm text-muted">{schedule.notes ? 'The pattern’s notes carry over. Edit them from Notes on the pattern.' : 'Add notes from Notes on the pattern.'}</p>
        ) : (
          <TextAreaField label="Notes (optional)" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)}
            hint="Shown on every meeting in this pattern. Private to staff." />
        )}

        <Alert visible={showErrors && problems.length > 0} title="Check the pattern">{problems.join(' ')}</Alert>
        <Alert visible={!!error} title="Not saved">{schedulingError(error)}</Alert>
      </div>
    </Dialog>
  );
}
