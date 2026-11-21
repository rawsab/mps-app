import { useState, type FormEvent } from 'react';
import { Checkbox, IconButton } from '@/components/controls';
import { PlusIcon, TrashIcon } from '@/components/icons';
import { Alert, Button, Card, controlClass, TextField } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';
import {
  DEFAULT_RANGE, describeHours, hoursFromWeek, nextRange, rangeProblem, weekFromHours, weekProblems, type DayRange, type WeekHours,
} from '@/domain/scheduling/availability';
import { weekdayName, WEEKDAYS } from '@/domain/scheduling/pattern';
import { bookingRulesSchema } from '@/features/profile/validation';
import { schedulingError, useMyAvailability, useSaveBookingRules, useSaveWorkingHours, type Availability } from './api';
import { zoneLabel } from './time';

/**
 * Staff Profile settings (decision 0050): weekly working hours and the booking rules that decide
 * which times clients can pick when they ask to reschedule. Time off and extra hours live on the
 * Meetings page.
 */
export function AvailabilityCard() {
  const availability = useMyAvailability();
  return (
    <Card>
      <h2 id="profile-availability" className="mb-1 text-base font-semibold text-text">Availability</h2>
      {availability.isPending ? (
        <LoadingRegion label="Loading availability">
          <SkeletonText width="w-64" className="mb-4" />
          <div className="grid gap-2">{[0, 1, 2, 3, 4, 5, 6].map((day) => <Skeleton key={day} className="h-11" />)}</div>
        </LoadingRegion>
      ) : null}
      <Alert visible={!!availability.error} title="Could not load your availability">{schedulingError(availability.error)}</Alert>
      {availability.data ? <AvailabilityForm availability={availability.data} /> : null}
    </Card>
  );
}

function AvailabilityForm({ availability }: { availability: Availability }) {
  const [week, setWeek] = useState<WeekHours>(() => weekFromHours(availability.hours));
  const [rules, setRules] = useState({
    bookingNoticeHours: String(availability.bookingNoticeHours),
    bookingHorizonDays: String(availability.bookingHorizonDays),
    bookingBufferMinutes: String(availability.bookingBufferMinutes),
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showProblems, setShowProblems] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const saveHours = useSaveWorkingHours();
  const saveRules = useSaveBookingRules();
  const busy = saveHours.isPending || saveRules.isPending;
  const summary = describeHours(availability.hours);
  // Save stays disabled until the hours or rules differ from what's saved.
  const changed = JSON.stringify(week) !== JSON.stringify(weekFromHours(availability.hours))
    || rules.bookingNoticeHours.trim() !== String(availability.bookingNoticeHours)
    || rules.bookingHorizonDays.trim() !== String(availability.bookingHorizonDays)
    || rules.bookingBufferMinutes.trim() !== String(availability.bookingBufferMinutes);

  const setDay = (weekday: number, ranges: DayRange[]) => setWeek((current) => ({ ...current, [weekday]: ranges }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    const parsed = bookingRulesSchema.safeParse(rules);
    setErrors(parsed.success ? {} : Object.fromEntries(parsed.error.issues.map((issue) => [String(issue.path[0]), issue.message])));
    setShowProblems(true);
    if (!parsed.success || weekProblems(week)) return;
    try {
      // The database merges overlapping ranges, so show what it kept.
      setWeek(weekFromHours(await saveHours.mutateAsync(hoursFromWeek(week))));
      await saveRules.mutateAsync(parsed.data);
      setShowProblems(false);
      setMessage({ error: false, text: 'Availability saved.' });
    } catch (error) {
      setMessage({ error: true, text: schedulingError(error) });
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-5" noValidate>
      <p className="text-sm text-muted">
        {summary || 'No working hours yet, so clients can’t pick new times.'} Times are in {zoneLabel(availability.timezone)}.
      </p>
      <Alert visible={!!message} tone={message?.error ? 'error' : 'success'} onDismiss={() => setMessage(null)}>{message?.text}</Alert>
      <fieldset disabled={busy} className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Working hours</legend>
        {/* One line per range: the day, its times, then remove and (on the last range) add. */}
        <ul className="divide-y divide-line">
          {WEEKDAYS.map((weekday) => {
            const ranges = week[weekday] ?? [];
            const day = weekdayName(weekday);
            return (
              <li key={weekday} className="grid gap-x-3 py-1.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:items-start">
                <Checkbox label={day} checked={ranges.length > 0} onChange={(event) => setDay(weekday, event.target.checked ? [{ ...DEFAULT_RANGE }] : [])} />
                <div className="grid gap-1">
                  {ranges.length ? ranges.map((range, index) => {
                    const problem = showProblems ? rangeProblem(range) : null;
                    const errorId = `hours-${weekday}-${index}-error`;
                    const update = (patch: Partial<DayRange>) => setDay(weekday, ranges.map((r, i) => (i === index ? { ...r, ...patch } : r)));
                    const timeInput = (field: 'startTime' | 'endTime', label: string) => (
                      <input type="time" step={900} aria-label={`${day} ${label}`} value={range[field]}
                        aria-invalid={problem ? true : undefined} aria-describedby={problem ? errorId : undefined}
                        onChange={(event) => update({ [field]: event.target.value })}
                        className={`min-h-11 min-w-0 flex-1 px-3 sm:w-32 sm:flex-none ${problem ? 'border-danger' : 'border-line'} ${controlClass}`} />
                    );
                    return (
                      <div key={index}>
                        <div className="flex items-center gap-2">
                          {timeInput('startTime', 'from')}
                          <span aria-hidden className="text-muted">–</span>
                          {timeInput('endTime', 'to')}
                          <IconButton label={`Remove ${day} hours`} tone="danger" onClick={() => setDay(weekday, ranges.filter((_, i) => i !== index))}>
                            <TrashIcon />
                          </IconButton>
                          {index === ranges.length - 1 ? (
                            <IconButton label={`Add more ${day} hours`} onClick={() => setDay(weekday, [...ranges, nextRange(ranges)])}><PlusIcon /></IconButton>
                          ) : null}
                        </div>
                        {problem ? <p id={errorId} className="mt-1 text-sm text-danger">{problem}</p> : null}
                      </div>
                    );
                  }) : <p className="flex min-h-11 items-center text-sm text-muted">Unavailable</p>}
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>
      <fieldset disabled={busy} className="grid min-w-0 gap-5 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Booking rules</legend>
        <TextField label="Notice (hours)" type="text" inputMode="numeric" maxLength={3} value={rules.bookingNoticeHours} error={errors.bookingNoticeHours}
          onChange={(event) => setRules({ ...rules, bookingNoticeHours: event.target.value })} hint="The soonest a client can pick." />
        <TextField label="Look ahead (days)" type="text" inputMode="numeric" maxLength={2} value={rules.bookingHorizonDays} error={errors.bookingHorizonDays}
          onChange={(event) => setRules({ ...rules, bookingHorizonDays: event.target.value })} hint="How far ahead clients can pick." />
        <TextField label="Gap (minutes)" type="text" inputMode="numeric" maxLength={3} value={rules.bookingBufferMinutes} error={errors.bookingBufferMinutes}
          onChange={(event) => setRules({ ...rules, bookingBufferMinutes: event.target.value })} hint="Kept free before and after meetings." />
      </fieldset>
      <Button type="submit" busy={busy} disabled={!changed}>Save availability</Button>
    </form>
  );
}
