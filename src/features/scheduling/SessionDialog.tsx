import { useState } from 'react';
import { Dialog } from '@/components/Dialog';
import { Alert, Badge, Button, Spinner, TextAreaField, TextField } from '@/components/ui';
import { addDays, zonedDateTime, zonedToInstant, type PtSchedule } from '@/domain/scheduling/pattern';
import {
  schedulingError, useAddSession, useCancelSession, useReinstateSession, useRespondToRequest, useUpdateSession,
  usePtAppointment, type Appointment, type Overlap, type Scheduling,
} from './api';
import { sessionDay, sessionMoment, sessionRange, sessionTime, todayIn, zoneLabel } from './time';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type When = { date: string; time: string; duration: string };

function parseWhen(when: When, timeZone: string): { startsAt: Date; durationMinutes: number } | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when.date)) return 'Choose a date.';
  if (!TIME.test(when.time)) return 'Choose a start time.';
  if (!/^\d{1,3}$/.test(when.duration) || Number(when.duration) < 5 || Number(when.duration) > 600) return 'A session lasts 5 to 600 minutes.';
  return { startsAt: zonedToInstant(when.date, when.time, timeZone), durationMinutes: Number(when.duration) };
}

function overlapNotice(overlaps: Overlap[], timeZone: string): string {
  if (!overlaps.length) return '';
  return ` It overlaps ${overlaps.map((o) => `${o.clientName} at ${sessionTime(o.startsAt, timeZone)}`).join(' and ')}.`;
}

function WhenFields({ when, onChange, idPrefix }: { when: When; onChange: (when: When) => void; idPrefix: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3" id={idPrefix}>
      <TextField label="Date" type="date" value={when.date} onChange={(event) => onChange({ ...when, date: event.target.value })} />
      <TextField label="Start" type="time" step={300} value={when.time} onChange={(event) => onChange({ ...when, time: event.target.value })} />
      <TextField label="Minutes" type="text" inputMode="numeric" maxLength={3} value={when.duration} onChange={(event) => onChange({ ...when, duration: event.target.value })} />
    </div>
  );
}

/** Adds a one-off session for the client. */
export function NewSessionDialog({ clientId, scheduling, onClose, onSaved }: {
  clientId: string; scheduling: Scheduling; onClose: () => void; onSaved: (message: string) => void;
}) {
  const timeZone = scheduling.timezone;
  const add = useAddSession(clientId);
  const [when, setWhen] = useState<When>({ date: addDays(todayIn(timeZone), 1), time: '07:00', duration: '60' });
  const [problem, setProblem] = useState('');

  function save() {
    const parsed = parseWhen(when, timeZone);
    if (typeof parsed === 'string') return setProblem(parsed);
    setProblem('');
    add.mutate(parsed, { onSuccess: (session) => onSaved(`Session added for ${sessionMoment(session.startsAt, timeZone)}.${overlapNotice(session.overlaps, timeZone)}`) });
  }

  return (
    <Dialog title="Add a session" description={`A one-off session. Times are in ${zoneLabel(timeZone)}.`}
      onClose={() => { if (!add.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={add.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={add.isPending} onClick={save}>Add session</Button>
      </>}>
      <div className="grid gap-4 p-4 sm:p-5">
        <WhenFields when={when} onChange={setWhen} idPrefix="new-session" />
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!add.error} title="Not added">{schedulingError(add.error)}</Alert>
      </div>
    </Dialog>
  );
}

/**
 * One session: answer the client's request, change or cancel this session only, reinstate a
 * cancellation, or hand off to the pattern editor for "this and following".
 */
export function SessionDialog({ appointmentId, scheduling, onClose, onSaved, onChangePattern }: {
  appointmentId: string;
  scheduling: Scheduling;
  onClose: () => void;
  onSaved: (message: string) => void;
  onChangePattern: (schedule: PtSchedule, from: string) => void;
}) {
  const session = usePtAppointment(appointmentId);
  return session.data ? <SessionDetails session={session.data} scheduling={scheduling} onClose={onClose} onSaved={onSaved} onChangePattern={onChangePattern} /> : (
    <Dialog title="Session" onClose={onClose}>
      <div className="p-4 sm:p-5">
        {session.isPending ? <Spinner label="Loading session" /> : null}
        <Alert visible={!!session.error} title="Could not load the session">{schedulingError(session.error)}</Alert>
        {session.data === null ? <p className="text-sm text-muted">This session no longer exists.</p> : null}
      </div>
    </Dialog>
  );
}

const STATUS: Record<Appointment['status'], { label: string; tone: 'neutral' | 'gold' | 'danger' | 'success' }> = {
  scheduled: { label: 'Scheduled', tone: 'gold' },
  completed: { label: 'Attended', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  late_cancelled: { label: 'Late cancellation', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
};

const REQUEST_OUTCOME: Record<'accepted' | 'declined' | 'withdrawn' | 'expired', string> = {
  accepted: 'accepted', declined: 'declined', withdrawn: 'withdrawn by the client', expired: 'expired when the session started',
};

function SessionDetails({ session, scheduling, onClose, onSaved, onChangePattern }: {
  session: Appointment;
  scheduling: Scheduling;
  onClose: () => void;
  onSaved: (message: string) => void;
  onChangePattern: (schedule: PtSchedule, from: string) => void;
}) {
  const timeZone = session.timezone;
  const start = zonedDateTime(session.startsAt, timeZone);
  const update = useUpdateSession();
  const cancel = useCancelSession();
  const reinstate = useReinstateSession();
  const respond = useRespondToRequest();
  const busy = update.isPending || cancel.isPending || reinstate.isPending || respond.isPending;
  const request = session.request;
  const pending = request?.status === 'pending' ? request : null;
  const preferred = pending?.preferredStartsAt ? zonedDateTime(pending.preferredStartsAt, timeZone) : null;
  const [when, setWhen] = useState<When>({ date: preferred?.date ?? start.date, time: preferred?.time ?? start.time, duration: String(session.durationMinutes) });
  const [reply, setReply] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const started = new Date(session.startsAt).getTime() <= Date.now();
  const schedule = scheduling.schedules.find((s) => s.id === session.scheduleId);
  const error = update.error ?? cancel.error ?? reinstate.error ?? respond.error;
  const status = STATUS[session.status];

  function saveTime() {
    const parsed = parseWhen(when, timeZone);
    if (typeof parsed === 'string') return setProblem(parsed);
    setProblem('');
    update.mutate({ id: session.id, ...parsed }, {
      onSuccess: (saved) => onSaved(`Session moved to ${sessionMoment(saved.startsAt, timeZone)}.${overlapNotice(saved.overlaps, timeZone)}`),
    });
  }

  function answer(accept: boolean) {
    if (!pending) return;
    let move: { startsAt: Date; durationMinutes: number } | undefined;
    if (accept && pending.kind === 'reschedule') {
      const parsed = parseWhen(when, timeZone);
      if (typeof parsed === 'string') return setProblem(parsed);
      move = parsed;
    }
    setProblem('');
    respond.mutate({ requestId: pending.id, accept, response: reply, ...move }, {
      onSuccess: (saved) => onSaved(!accept ? 'Request declined. The session stays as it was.'
        : pending.kind === 'cancel' ? (saved.status === 'late_cancelled' ? 'Session cancelled as a late cancellation.' : 'Session cancelled.')
        : `Session moved to ${sessionMoment(saved.startsAt, timeZone)}.`),
    });
  }

  return (
    <Dialog title={`${sessionDay(session.startsAt, timeZone)} · ${sessionRange(session.startsAt, session.durationMinutes, timeZone)}`}
      description={`${session.clientName} · ${session.scheduleId ? 'Repeating session' : 'One-off session'} · Times in ${zoneLabel(timeZone)}`}
      onClose={() => { if (!busy) onClose(); }}>
      <div className="grid gap-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={status.tone}>{status.label}</Badge>
          {session.modified && session.scheduleId ? <Badge>Changed from the pattern</Badge> : null}
          {session.meetingUrl
            ? <a href={session.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-gold-fg"><span className="link">Meeting link</span></a>
            : <span className="text-muted">No meeting link set.</span>}
        </div>

        {pending ? (
          <section aria-labelledby="session-request" className="grid gap-4 rounded-card border border-gold/50 bg-gold/5 p-4">
            <div>
              <h3 id="session-request" className="font-medium">
                {session.clientName} asked to {pending.kind === 'cancel' ? 'cancel' : 'reschedule'} this session
              </h3>
              <p className="mt-0.5 text-xs text-muted">Sent {sessionMoment(pending.createdAt, timeZone)}</p>
              {pending.message ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">“{pending.message}”</p> : null}
              {pending.kind === 'cancel' ? (
                <p className="mt-2 text-sm">{pending.late
                  ? `Sent less than ${scheduling.lateCancelHours} hours before the session, so accepting records a late cancellation.`
                  : 'Sent with enough notice, so accepting records an ordinary cancellation.'}</p>
              ) : preferred ? <p className="mt-2 text-sm">Preferred time: {sessionMoment(pending.preferredStartsAt!, timeZone)}</p> : null}
            </div>
            {pending.kind === 'reschedule' ? (
              started ? <p className="text-sm text-muted">The session has started, so this request can only be declined.</p>
                : <WhenFields when={when} onChange={setWhen} idPrefix="reschedule-to" />
            ) : null}
            <TextAreaField label="Reply (optional)" rows={2} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {pending.kind === 'cancel' || !started ? (
                <Button busy={respond.isPending && respond.variables?.accept} disabled={busy} onClick={() => answer(true)}>
                  {pending.kind === 'cancel' ? 'Accept cancellation' : 'Move session'}
                </Button>
              ) : null}
              <Button variant="secondary" busy={respond.isPending && !respond.variables?.accept} disabled={busy} onClick={() => answer(false)}>Decline</Button>
            </div>
          </section>
        ) : request ? (
          <p className="text-sm text-muted">
            The client’s {request.kind === 'cancel' ? 'cancellation' : 'reschedule'} request was {REQUEST_OUTCOME[request.status as keyof typeof REQUEST_OUTCOME]}.
            {request.response ? ` Reply: “${request.response}”` : ''}
          </p>
        ) : null}

        {session.status === 'scheduled' && !pending ? (
          <section aria-labelledby="session-change" className="grid gap-3">
            <h3 id="session-change" className="text-sm font-medium">Change this session only</h3>
            <WhenFields when={when} onChange={setWhen} idPrefix="session-when" />
            <div className="flex flex-wrap gap-2">
              <Button busy={update.isPending} disabled={busy} onClick={saveTime}>Save session</Button>
              {!cancelling ? <Button variant="danger" disabled={busy} onClick={() => setCancelling(true)}>Cancel session</Button> : null}
            </div>
            {cancelling ? (
              <div className="grid gap-3 rounded-card border border-danger/40 p-3">
                <TextAreaField label="Reason (optional)" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
                  hint="The client sees this with the cancellation. A coach cancellation is never late." />
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" busy={cancel.isPending} disabled={busy}
                    onClick={() => cancel.mutate({ id: session.id, reason }, { onSuccess: () => onSaved('Session cancelled.') })}>Cancel this session</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setCancelling(false)}>Keep it</Button>
                </div>
              </div>
            ) : null}
            {schedule ? (
              <p className="text-sm text-muted">
                To change every session from this date on,{' '}
                <button type="button" className="font-medium text-gold-fg underline underline-offset-2"
                  onClick={() => onChangePattern(schedule, [session.occurrenceOn ?? start.date, todayIn(schedule.timezone), schedule.startsOn].sort().at(-1)!)}>
                  change the repeating pattern
                </button>.
              </p>
            ) : null}
          </section>
        ) : null}

        {session.status === 'cancelled' || session.status === 'late_cancelled' ? (
          <section className="grid gap-3">
            <p className="text-sm">
              {session.cancelledByClient ? 'Cancelled at the client’s request' : 'Cancelled by staff'}
              {session.cancelledAt ? ` on ${sessionMoment(session.cancelledAt, timeZone)}` : ''}.
              {session.cancellationReason ? ` “${session.cancellationReason}”` : ''}
            </p>
            {!started ? (
              <div><Button variant="secondary" busy={reinstate.isPending} disabled={busy}
                onClick={() => reinstate.mutate(session.id, { onSuccess: () => onSaved('Session reinstated.') })}>Reinstate session</Button></div>
            ) : null}
          </section>
        ) : null}

        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!error} title="Not saved">{schedulingError(error)}</Alert>
      </div>
    </Dialog>
  );
}
