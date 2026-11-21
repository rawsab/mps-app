import { useState } from 'react';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { Checkbox, SegmentedControl } from '@/components/controls';
import { ConfirmDialog, Dialog, DialogBody } from '@/components/Dialog';
import { CalendarIcon, ExtraHoursIcon, PlusIcon, TimeOffIcon } from '@/components/icons';
import { Alert, Button, Card, SectionHeading, TextAreaField, TextField } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';
import { exceptionFields, exceptionInstants, type ExceptionFields } from '@/domain/scheduling/availability';
import {
  schedulingError, useMyAvailability, useRemoveAvailabilityException, useSaveAvailabilityException, type AvailabilityException, type Overlap,
} from './api';
import { sessionDay, sessionMoment, sessionRange, todayIn } from './time';

type Kind = AvailabilityException['kind'];
const KIND_LABEL: Record<Kind, string> = { time_off: 'Time off', extra_hours: 'Extra hours' };

/** "Mon, Dec 7 – Sun, Dec 13", "Mon, Dec 7", or "Sat, Nov 28 · 10:00 AM – 1:00 PM", in the coach's zone. */
export function exceptionLabel(exception: AvailabilityException, timeZone: string) {
  if (exception.allDay) {
    const { fromDate, toDate } = exceptionFields(exception, timeZone);
    const day = (date: string) => new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${date}T00:00:00Z`));
    return fromDate === toDate ? `${day(fromDate)} · All day` : `${day(fromDate)} – ${day(toDate)}`;
  }
  const minutes = Math.round((Date.parse(exception.endsAt) - Date.parse(exception.startsAt)) / 60_000);
  return `${sessionDay(exception.startsAt, timeZone)} · ${sessionRange(exception.startsAt, minutes, timeZone)}`;
}

/**
 * The Meetings page's upcoming time off and extra hours (decision 0050). Clients never see these,
 * only the open times left after them.
 */
export function AvailabilityExceptions({ timeZone, onSaved }: { timeZone: string; onSaved: (message: string) => void }) {
  const availability = useMyAvailability();
  const [editing, setEditing] = useState<AvailabilityException | Kind | null>(null);
  const [removing, setRemoving] = useState<AvailabilityException | null>(null);
  const remove = useRemoveAvailabilityException();
  const now = Date.now();
  const upcoming = (availability.data?.exceptions ?? []).filter((x) => Date.parse(x.endsAt) > now);

  return (
    <section aria-labelledby="availability-exceptions" className="min-w-0">
      <SectionHeading id="availability-exceptions" icon={<CalendarIcon />} className="mb-3">Time off &amp; extra hours</SectionHeading>
      {availability.isPending ? (
        <LoadingRegion label="Loading time off" className="grid lg:grid-cols-2 lg:gap-x-9">
          {['w-14', 'w-20'].map((width, index) => (
            <div key={width} className={`min-w-0 ${index ? 'mt-6 border-t border-line pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0' : ''}`}>
              <div className="mb-2 flex min-h-11 items-center"><SkeletonText size="xs" width={width} /></div>
              <Skeleton className="h-12" />
            </div>
          ))}
        </LoadingRegion>
      ) : null}
      <Alert visible={!!availability.error} title="Could not load time off">{schedulingError(availability.error)}</Alert>
      {availability.data ? (
        // Side by side with a divider on wide screens, stacked on phones (like To-dos and Record attendance).
        <div className="grid lg:grid-cols-2 lg:gap-x-9">
          {(['time_off', 'extra_hours'] as const).map((kind, index) => {
            const rows = upcoming.filter((x) => x.kind === kind);
            return (
              <div key={kind} className={`min-w-0 ${index ? 'mt-6 border-t border-line pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0' : ''}`}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-xs font-medium text-muted">{KIND_LABEL[kind]}</h3>
                  <Button variant="ghost" className="-mr-3" onClick={() => setEditing(kind)}>
                    <PlusIcon />{kind === 'time_off' ? 'Add time off' : 'Add extra hours'}
                  </Button>
                </div>
                {rows.length ? (
                  <ul className="grid gap-2">
                    {rows.map((exception) => (
                      <li key={exception.id}>
                        <Card as="div" padding="sm" fill="page" className="flex min-w-0 items-center gap-3">
                          {/* Softened danger / success, so the kind reads at a glance without shouting. */}
                          <span className={kind === 'time_off' ? 'text-danger/70' : 'text-success/70'}>{kind === 'time_off' ? <TimeOffIcon /> : <ExtraHoursIcon />}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium">{exceptionLabel(exception, timeZone)}</span>
                            {exception.note ? <span className="mt-1 block break-words text-xs text-muted">{exception.note}</span> : null}
                          </span>
                          {/* Pulled into the padding so the 44px target doesn't make the card taller than its text. */}
                          <div className="-my-2.5 -mr-2">
                            <ActionsMenu label={`Options for ${KIND_LABEL[kind].toLowerCase()} ${exceptionLabel(exception, timeZone)}`}>
                              <ActionItem onClick={() => setEditing(exception)}>Edit</ActionItem>
                              <ActionItem danger onClick={() => setRemoving(exception)}>Remove</ActionItem>
                            </ActionsMenu>
                          </div>
                        </Card>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted">
                    {kind === 'time_off' ? 'No time off coming up. Add holidays or appointments here.' : 'No extra hours coming up. Add times outside your usual week.'}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      ) : null}
      {editing ? (
        <ExceptionDialog exception={typeof editing === 'string' ? null : editing} initialKind={typeof editing === 'string' ? editing : editing.kind} timeZone={timeZone} onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); onSaved(message); }} />
      ) : null}
      {removing ? (
        <ConfirmDialog title={`Remove ${KIND_LABEL[removing.kind].toLowerCase()}?`} tone="danger" confirmLabel="Remove" pending={remove.isPending}
          description={exceptionLabel(removing, timeZone)} onClose={() => { remove.reset(); setRemoving(null); }}
          onConfirm={() => remove.mutate(removing.id, { onSuccess: () => { setRemoving(null); onSaved(`${KIND_LABEL[removing.kind]} removed.`); } })}>
          <DialogBody className="grid gap-4">
            <Alert visible={!!remove.error}>{schedulingError(remove.error)}</Alert>
            <p className="text-sm text-muted">{removing.kind === 'time_off' ? 'Clients will be able to pick these times again.' : 'Clients will no longer be able to pick these times.'}</p>
          </DialogBody>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function ExceptionDialog({ exception, initialKind, timeZone, onClose, onSaved }: {
  exception: AvailabilityException | null; initialKind: Kind; timeZone: string; onClose: () => void; onSaved: (message: string) => void;
}) {
  // Chosen once, so a retried save updates the same row.
  const [id] = useState(() => exception?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<Kind>(initialKind);
  const [fields, setFields] = useState<ExceptionFields>(() => exception ? exceptionFields(exception, timeZone) : (() => {
    const today = todayIn(timeZone);
    return { allDay: initialKind === 'time_off', fromDate: today, toDate: today, startTime: '09:00', endTime: '17:00' };
  })());
  const [note, setNote] = useState(exception?.note ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const [overlaps, setOverlaps] = useState<Overlap[] | null>(null);
  const save = useSaveAvailabilityException();
  const set = (patch: Partial<ExceptionFields>) => setFields((current) => ({ ...current, ...patch }));
  const savedMessage = `${KIND_LABEL[kind]} ${exception ? 'saved' : 'added'}.`;

  function submit() {
    const range = exceptionInstants(fields, timeZone);
    if ('problem' in range) { setProblem(range.problem); return; }
    setProblem(null);
    save.mutate({ id, kind, ...range, allDay: fields.allDay, note }, {
      onSuccess: (result) => { if (result.overlaps.length) setOverlaps(result.overlaps); else onSaved(savedMessage); },
    });
  }

  if (overlaps) {
    return (
      <Dialog title={`${KIND_LABEL[kind]} saved`} onClose={() => onSaved(savedMessage)} footer={<Button onClick={() => onSaved(savedMessage)}>Done</Button>}>
        <DialogBody className="grid gap-4">
          <p className="text-sm">{overlaps.length === 1 ? 'This meeting is still scheduled during it.' : `These ${overlaps.length} meetings are still scheduled during it.`} Move or cancel them from the calendar if needed.</p>
          <ul className="grid gap-1 text-sm">
            {overlaps.map((meeting) => <li key={meeting.id}>{meeting.clientName} · <span className="text-muted">{sessionMoment(meeting.startsAt, timeZone)}</span></li>)}
          </ul>
        </DialogBody>
      </Dialog>
    );
  }

  return (
    <Dialog title={exception ? `Edit ${KIND_LABEL[kind].toLowerCase()}` : 'Add time off or extra hours'} onClose={onClose}
      description={kind === 'time_off' ? 'Clients can’t pick times during time off. Meetings already booked stay as they are.' : 'Clients can pick times during extra hours, as well as your usual week.'}
      footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={save.isPending} onClick={submit}>Save</Button>
      </>}>
      <DialogBody className="grid gap-4">
        <Alert visible={!!save.error}>{schedulingError(save.error)}</Alert>
        <SegmentedControl label="Kind" size="md" value={kind} onChange={setKind} optionClassName="flex-1"
          options={[{ value: 'time_off', label: KIND_LABEL.time_off }, { value: 'extra_hours', label: KIND_LABEL.extra_hours }]} />
        <Checkbox label="All day" checked={fields.allDay} onChange={(event) => set({ allDay: event.target.checked })} />
        {fields.allDay ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField label="First day" type="date" value={fields.fromDate}
              onChange={(event) => set({ fromDate: event.target.value, toDate: event.target.value > fields.toDate ? event.target.value : fields.toDate })} />
            <TextField label="Last day" type="date" value={fields.toDate} min={fields.fromDate} onChange={(event) => set({ toDate: event.target.value })} />
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-3">
            <TextField label="Date" type="date" value={fields.fromDate} onChange={(event) => set({ fromDate: event.target.value, toDate: event.target.value })} />
            <TextField label="From" type="time" step={900} value={fields.startTime} onChange={(event) => set({ startTime: event.target.value })} />
            <TextField label="To" type="time" step={900} value={fields.endTime} onChange={(event) => set({ endTime: event.target.value })} />
          </div>
        )}
        <Alert visible={!!problem}>{problem}</Alert>
        <TextAreaField label="Note (optional)" rows={2} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)}
          hint="Only staff see this. Clients just see fewer open times." />
      </DialogBody>
    </Dialog>
  );
}
