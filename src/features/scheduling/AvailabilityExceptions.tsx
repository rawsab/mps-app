import { useState } from 'react';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { Checkbox, SegmentedControl } from '@/components/controls';
import { ConfirmDialog, Dialog, DialogBody } from '@/components/Dialog';
import { CalendarIcon, PlusIcon } from '@/components/icons';
import { Alert, Badge, Button, SectionHeading, Spinner, TextAreaField, TextField } from '@/components/ui';
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
  const [editing, setEditing] = useState<AvailabilityException | 'new' | null>(null);
  const [removing, setRemoving] = useState<AvailabilityException | null>(null);
  const remove = useRemoveAvailabilityException();
  const now = Date.now();
  const upcoming = (availability.data?.exceptions ?? []).filter((x) => Date.parse(x.endsAt) > now);

  return (
    <section aria-labelledby="availability-exceptions" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <SectionHeading id="availability-exceptions" icon={<CalendarIcon />}>Time off &amp; extra hours</SectionHeading>
        <Button variant="secondary" onClick={() => setEditing('new')}><PlusIcon />Add</Button>
      </div>
      {availability.isPending ? <Spinner label="Loading time off" /> : null}
      <Alert visible={!!availability.error} title="Could not load time off">{schedulingError(availability.error)}</Alert>
      {availability.data && !upcoming.length ? (
        <p className="text-sm text-muted">Nothing coming up. Add time off for holidays, or extra hours outside your usual week.</p>
      ) : null}
      {upcoming.length ? (
        <ul className="divide-y divide-line rounded-card border border-line">
          {upcoming.map((exception) => (
            <li key={exception.id} className="flex min-w-0 items-center gap-3 py-1 pl-3 pr-1">
              {/* Centred on the menu button, whose 44px target sets the shortest row. */}
              <span className="min-w-0 flex-1 py-1.5">
                <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-sm font-medium">{exceptionLabel(exception, timeZone)}</span>
                  <Badge tone={exception.kind === 'time_off' ? 'neutral' : 'gold-soft'}>{KIND_LABEL[exception.kind]}</Badge>
                </span>
                {exception.note ? <span className="mt-1 block break-words text-xs text-muted">{exception.note}</span> : null}
              </span>
              <ActionsMenu label={`Options for ${KIND_LABEL[exception.kind].toLowerCase()} ${exceptionLabel(exception, timeZone)}`}>
                <ActionItem onClick={() => setEditing(exception)}>Edit</ActionItem>
                <ActionItem danger onClick={() => setRemoving(exception)}>Remove</ActionItem>
              </ActionsMenu>
            </li>
          ))}
        </ul>
      ) : null}
      {editing ? (
        <ExceptionDialog exception={editing === 'new' ? null : editing} timeZone={timeZone} onClose={() => setEditing(null)}
          onSaved={(message) => { setEditing(null); onSaved(message); }} />
      ) : null}
      {removing ? (
        <ConfirmDialog title={`Remove ${KIND_LABEL[removing.kind].toLowerCase()}?`} tone="danger" confirmLabel="Remove" pending={remove.isPending}
          description={exceptionLabel(removing, timeZone)} onClose={() => { remove.reset(); setRemoving(null); }}
          onConfirm={() => remove.mutate(removing.id, { onSuccess: () => { setRemoving(null); onSaved(`${KIND_LABEL[removing.kind]} removed.`); } })}>
          <DialogBody>
            <Alert visible={!!remove.error}>{schedulingError(remove.error)}</Alert>
            <p className="text-sm text-muted">{removing.kind === 'time_off' ? 'Clients will be able to pick these times again.' : 'Clients will no longer be able to pick these times.'}</p>
          </DialogBody>
        </ConfirmDialog>
      ) : null}
    </section>
  );
}

function ExceptionDialog({ exception, timeZone, onClose, onSaved }: {
  exception: AvailabilityException | null; timeZone: string; onClose: () => void; onSaved: (message: string) => void;
}) {
  // Chosen once, so a retried save updates the same row.
  const [id] = useState(() => exception?.id ?? crypto.randomUUID());
  const [kind, setKind] = useState<Kind>(exception?.kind ?? 'time_off');
  const [fields, setFields] = useState<ExceptionFields>(() => exception ? exceptionFields(exception, timeZone) : (() => {
    const today = todayIn(timeZone);
    return { allDay: true, fromDate: today, toDate: today, startTime: '09:00', endTime: '17:00' };
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
        <DialogBody>
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
      <DialogBody>
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
