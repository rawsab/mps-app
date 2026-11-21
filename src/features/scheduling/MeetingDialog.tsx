import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { Alert, Badge, Button, Spinner, TextAreaField, TextField } from '@/components/ui';
import { addDays, zonedDateTime, zonedToInstant } from '@/domain/scheduling/pattern';
import type { ProgramRow } from '@/features/programs/api';
import {
  schedulingError, useAddMeeting, useCancelMeeting, useMeeting, useReinstateMeeting, useRespondToRequest, useSaveMeetingNotes, useUpdateMeeting,
  type Meeting, type MeetingContext, type MeetingSchedule, type MeetingTopic, type Overlap, type ProgramChoice,
} from './api';
import { MeetingBillingSection } from '@/features/billing/MeetingBilling';
import { AttendanceSection, ResourcesSection, SharedNotesField } from './MeetingRecord';
import { MinutesField } from './MinutesField';
import { defaultTopic, MeetingTopicFields, topicLabel } from './MeetingTopic';
import { sessionDay, sessionMoment, sessionRange, sessionTime, todayIn, zoneLabel } from './time';
import type { SavedOptions } from '@/components/Toast';

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

type When = { date: string; time: string; duration: string };

function parseWhen(when: When, timeZone: string): { startsAt: Date; durationMinutes: number } | string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(when.date)) return 'Choose a date.';
  if (!TIME.test(when.time)) return 'Choose a start time.';
  if (!/^\d{1,3}$/.test(when.duration) || Number(when.duration) < 5 || Number(when.duration) > 600) return 'A meeting lasts 5 to 600 minutes.';
  return { startsAt: zonedToInstant(when.date, when.time, timeZone), durationMinutes: Number(when.duration) };
}

function overlapNotice(overlaps: Overlap[], timeZone: string): string {
  if (!overlaps.length) return '';
  return ` It overlaps ${overlaps.map((o) => `${o.clientName} at ${sessionTime(o.startsAt, timeZone)}`).join(' and ')}.`;
}

/** `pt`: Personal training lengths are 60 or 40 minutes, so every session has a price. */
function WhenFields({ when, onChange, pt }: { when: When; onChange: (when: When) => void; pt: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <TextField label="Date" type="date" value={when.date} onChange={(event) => onChange({ ...when, date: event.target.value })} />
      <TextField label="Start" type="time" step={300} value={when.time} onChange={(event) => onChange({ ...when, time: event.target.value })} />
      <MinutesField pt={pt} value={when.duration} onChange={(duration) => onChange({ ...when, duration })} />
    </div>
  );
}

const NOTES_HINT = 'The client never sees these.';

/** Adds a one-off meeting. */
export function NewMeetingDialog({ clientId, context, programs, onClose, onSaved }: {
  clientId: string; context: MeetingContext; programs: ProgramRow[]; onClose: () => void; onSaved: (message: ReactNode, options?: SavedOptions) => void;
}) {
  const timeZone = context.timezone;
  const add = useAddMeeting(clientId);
  const [when, setWhen] = useState<When>({ date: addDays(todayIn(timeZone), 1), time: '07:00', duration: '60' });
  const [topic, setTopic] = useState<MeetingTopic>(() => defaultTopic(context));
  const [notes, setNotes] = useState('');
  const [problem, setProblem] = useState('');

  function save() {
    const parsed = parseWhen(when, timeZone);
    if (typeof parsed === 'string') return setProblem(parsed);
    if (!topic.services.length) return setProblem('Choose what the meeting is about.');
    setProblem('');
    add.mutate({ ...parsed, ...topic, notes }, { onSuccess: (meeting) => onSaved(`Meeting added for ${sessionMoment(meeting.startsAt, timeZone)}.${overlapNotice(meeting.overlaps, timeZone)}`) });
  }

  return (
    <Dialog wide title="Add a meeting" description={`A one-off meeting. Times are in ${zoneLabel(timeZone)}.`}
      onClose={() => { if (!add.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={add.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={add.isPending} onClick={save}>Add meeting</Button>
      </>}>
      <div className="grid gap-5 p-4 sm:p-5">
        <WhenFields when={when} onChange={setWhen} pt={topic.services.includes('personal_training')} />
        <MeetingTopicFields context={context} programs={programs} value={topic} onChange={setTopic} />
        <TextAreaField label="Private notes (optional)" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} hint={NOTES_HINT} />
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!add.error} title="Not added">{schedulingError(add.error)}</Alert>
      </div>
    </Dialog>
  );
}

/**
 * One meeting: answer the client's request, change or cancel this meeting only, keep notes,
 * reinstate a cancellation, or hand off to the pattern editor for "this and following".
 */
export function MeetingDialog({ meetingId, context, programs, onClose, onSaved, onChangePattern }: {
  meetingId: string;
  context: MeetingContext;
  programs: ProgramRow[];
  onClose: () => void;
  onSaved: (message: ReactNode, options?: SavedOptions) => void;
  onChangePattern: (schedule: MeetingSchedule, from: string) => void;
}) {
  const meeting = useMeeting(meetingId);
  return meeting.data ? <MeetingDetails meeting={meeting.data} context={context} programs={programs} onClose={onClose} onSaved={onSaved} onChangePattern={onChangePattern} /> : (
    <Dialog title="Meeting" onClose={onClose}>
      <div className="p-4 sm:p-5">
        {meeting.isPending ? <Spinner label="Loading meeting" /> : null}
        <Alert visible={!!meeting.error} title="Could not load the meeting">{schedulingError(meeting.error)}</Alert>
        {meeting.data === null ? <p className="text-sm text-muted">This meeting no longer exists.</p> : null}
      </div>
    </Dialog>
  );
}

const STATUS: Record<Meeting['status'], { label: string; tone: 'neutral' | 'gold' | 'danger' | 'success' }> = {
  scheduled: { label: 'Scheduled', tone: 'gold' },
  completed: { label: 'Attended', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  late_cancelled: { label: 'Late cancellation', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
};

const REQUEST_OUTCOME: Record<'accepted' | 'declined' | 'withdrawn' | 'expired', string> = {
  accepted: 'accepted', declined: 'declined', withdrawn: 'withdrawn by the client', expired: 'expired when the meeting started',
};

const pinnedPrograms = (meeting: Meeting): ProgramChoice =>
  Object.fromEntries(meeting.programs.filter((p) => p.pinned && p.programId).map((p) => [p.service, p.programId!]));

function MeetingDetails({ meeting, context, programs, onClose, onSaved, onChangePattern }: {
  meeting: Meeting;
  context: MeetingContext;
  programs: ProgramRow[];
  onClose: () => void;
  onSaved: (message: ReactNode, options?: SavedOptions) => void;
  onChangePattern: (schedule: MeetingSchedule, from: string) => void;
}) {
  const timeZone = meeting.timezone;
  const start = zonedDateTime(meeting.startsAt, timeZone);
  const update = useUpdateMeeting();
  const cancel = useCancelMeeting();
  const reinstate = useReinstateMeeting();
  const respond = useRespondToRequest();
  const saveNotes = useSaveMeetingNotes();
  const busy = update.isPending || cancel.isPending || reinstate.isPending || respond.isPending || saveNotes.isPending;
  const request = meeting.request;
  const pending = request?.status === 'pending' ? request : null;
  const preferred = pending?.preferredStartsAt ? zonedDateTime(pending.preferredStartsAt, timeZone) : null;
  const [when, setWhen] = useState<When>({ date: preferred?.date ?? start.date, time: preferred?.time ?? start.time, duration: String(meeting.durationMinutes) });
  const [topic, setTopic] = useState<MeetingTopic>({ services: meeting.services, programs: pinnedPrograms(meeting) });
  const [notes, setNotes] = useState(meeting.notes ?? '');
  const [reply, setReply] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState('');
  const started = new Date(meeting.startsAt).getTime() <= Date.now();
  const schedule = context.schedules.find((s) => s.id === meeting.scheduleId);
  const error = update.error ?? cancel.error ?? reinstate.error ?? respond.error ?? saveNotes.error;
  // A started meeting still marked scheduled has no attendance yet.
  const status = started && meeting.status === 'scheduled' ? { label: 'Attendance not recorded', tone: 'neutral' as const } : STATUS[meeting.status];

  function saveChanges() {
    const parsed = parseWhen(when, timeZone);
    if (typeof parsed === 'string') return setProblem(parsed);
    if (!topic.services.length) return setProblem('Choose what the meeting is about.');
    setProblem('');
    update.mutate({ id: meeting.id, ...parsed, ...topic }, {
      onSuccess: (saved) => onSaved(`Meeting saved for ${sessionMoment(saved.startsAt, timeZone)}.${overlapNotice(saved.overlaps, timeZone)}`),
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
      onSuccess: (saved) => onSaved(!accept ? 'Request declined. The meeting stays as it was.'
        : pending.kind === 'cancel' ? (saved.status === 'late_cancelled' ? 'Meeting cancelled as a late cancellation.' : 'Meeting cancelled.')
        : `Meeting moved to ${sessionMoment(saved.startsAt, timeZone)}.`),
    });
  }

  return (
    <Dialog wide title={`${sessionDay(meeting.startsAt, timeZone)} · ${sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}`}
      description={<>
        <Link to={`/coach/clients/${meeting.clientId}`} className="text-gold-fg"><span className="link">{meeting.clientName}</span></Link>
        {` · ${topicLabel(meeting.services)} · ${meeting.scheduleId ? 'Repeating' : 'One-off'} · Times in ${zoneLabel(timeZone)}`}
      </>}
      onClose={() => { if (!busy) onClose(); }}>
      <div className="grid gap-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone={status.tone}>{status.label}</Badge>
          {meeting.modified && meeting.scheduleId ? <Badge>Changed from the pattern</Badge> : null}
          {meeting.billable ? null : <Badge>Not billed</Badge>}
          {meeting.meetingUrl
            ? <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-gold-fg"><span className="link">Meeting link</span></a>
            : <span className="text-muted">No meeting link set.</span>}
        </div>
        {/* The program selector below shows them while the meeting can be changed. */}
        {(meeting.status !== 'scheduled' || pending) && meeting.programs.some((p) => p.programId) ? (
          <p className="text-sm text-muted">
            {meeting.programs.filter((p) => p.programId).map((p) => `${p.title?.trim() || 'Untitled program'}${p.pinned ? '' : ' (current)'}`).join(' · ')}
          </p>
        ) : null}

        {pending ? (
          <section aria-labelledby="meeting-request" className="grid gap-4 rounded-card border border-gold/50 bg-gold/5 p-4">
            <div>
              <h3 id="meeting-request" className="font-medium">
                {meeting.clientName} asked to {pending.kind === 'cancel' ? 'cancel' : 'reschedule'} this meeting
              </h3>
              <p className="mt-0.5 text-xs text-muted">Sent {sessionMoment(pending.createdAt, timeZone)}</p>
              {pending.message ? <p className="mt-2 whitespace-pre-wrap break-words text-sm">“{pending.message}”</p> : null}
              {pending.kind === 'cancel' ? (
                <p className="mt-2 text-sm">{!meeting.billable ? 'This meeting isn’t billed, so a cancellation is never late.'
                  : pending.late ? `Sent less than ${context.lateCancelHours} hours before the meeting, so accepting records a late cancellation.`
                  : 'Sent with enough notice, so accepting records an ordinary cancellation.'}</p>
              ) : (
                <>
                  {preferred ? <p className="mt-2 text-sm">Preferred time: {sessionMoment(pending.preferredStartsAt!, timeZone)}</p> : null}
                  {pending.late ? <p className="mt-2 text-sm">Short notice: sent less than {context.lateCancelHours} hours before the meeting.</p> : null}
                </>
              )}
            </div>
            {pending.kind === 'reschedule' ? (
              started ? <p className="text-sm text-muted">The meeting has started, so this request can only be declined.</p>
                : <WhenFields when={when} onChange={setWhen} pt={meeting.billable} />
            ) : null}
            <TextAreaField label="Reply (optional)" rows={2} maxLength={1000} value={reply} onChange={(event) => setReply(event.target.value)} />
            <div className="flex flex-wrap gap-2">
              {pending.kind === 'cancel' || !started ? (
                <Button busy={respond.isPending && respond.variables?.accept} disabled={busy} onClick={() => answer(true)}>
                  {pending.kind === 'cancel' ? 'Accept cancellation' : 'Move meeting'}
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

        {meeting.status === 'scheduled' && !pending ? (
          <section aria-labelledby="meeting-change" className="grid gap-4">
            <h3 id="meeting-change" className="text-base font-semibold">Change this meeting only</h3>
            <WhenFields when={when} onChange={setWhen} pt={topic.services.includes('personal_training')} />
            <MeetingTopicFields context={context} programs={programs} value={topic} onChange={setTopic} />
            <div className="flex flex-wrap gap-2">
              <Button busy={update.isPending} disabled={busy} onClick={saveChanges}>Save meeting</Button>
              {!cancelling ? <Button variant="danger" disabled={busy} onClick={() => setCancelling(true)}>Cancel meeting</Button> : null}
            </div>
            {cancelling ? (
              <div className="grid gap-3 rounded-card border border-danger/40 p-3">
                <TextAreaField label="Reason (optional)" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
                  hint="The client sees this with the cancellation. A coach cancellation is never late." />
                <div className="flex flex-wrap gap-2">
                  <Button variant="danger" busy={cancel.isPending} disabled={busy}
                    onClick={() => cancel.mutate({ id: meeting.id, reason }, { onSuccess: () => onSaved('Meeting cancelled.') })}>Cancel this meeting</Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setCancelling(false)}>Keep it</Button>
                </div>
              </div>
            ) : null}
            {schedule ? (
              <p className="text-sm text-muted">
                To change every meeting from this date on,{' '}
                <button type="button" className="font-medium text-gold-fg underline underline-offset-2"
                  onClick={() => onChangePattern(schedule, [meeting.occurrenceOn ?? start.date, todayIn(schedule.timezone), schedule.startsOn].sort().at(-1)!)}>
                  change the repeating pattern
                </button>.
              </p>
            ) : null}
          </section>
        ) : null}

        <AttendanceSection meeting={meeting} timeZone={timeZone} onSaved={onSaved} />

        {meeting.billable && meeting.status !== 'cancelled' ? <MeetingBillingSection meetingId={meeting.id} durationMinutes={meeting.durationMinutes} onSaved={onSaved} /> : null}

        {meeting.status === 'cancelled' || meeting.status === 'late_cancelled' ? (
          <section className="grid gap-3">
            <p className="text-sm">
              {meeting.cancelledByClient ? 'Cancelled at the client’s request' : 'Cancelled by staff'}
              {meeting.cancelledAt ? ` on ${sessionMoment(meeting.cancelledAt, timeZone)}` : ''}.
              {meeting.cancellationReason ? ` “${meeting.cancellationReason}”` : ''}
            </p>
            {!started ? (
              <div><Button variant="secondary" busy={reinstate.isPending} disabled={busy}
                onClick={() => reinstate.mutate(meeting.id, { onSuccess: () => onSaved('Meeting reinstated.') })}>Reinstate meeting</Button></div>
            ) : null}
          </section>
        ) : null}

        <section aria-labelledby="meeting-notes" className="grid gap-4 border-t border-line pt-4">
          <h3 id="meeting-notes" className="text-base font-semibold">Notes</h3>
          <SharedNotesField meeting={meeting} onSaved={onSaved} />
          {meeting.patternNotes ? (
            <div className="rounded-card border border-line bg-ink p-3 text-sm">
              <p className="text-xs font-medium text-muted">Repeating pattern notes · Private to staff</p>
              <p className="mt-1 whitespace-pre-wrap break-words">{meeting.patternNotes}</p>
            </div>
          ) : null}
          <div className="grid gap-2">
            <TextAreaField label="Private to staff" rows={3} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)} hint={NOTES_HINT} />
            <div>
              <Button variant="secondary" busy={saveNotes.isPending} disabled={busy || notes.trim() === (meeting.notes ?? '')}
                onClick={() => saveNotes.mutate({ id: meeting.id, notes }, { onSuccess: () => onSaved('Private notes saved.') })}>Save private notes</Button>
            </div>
          </div>
        </section>

        <ResourcesSection meeting={meeting} />

        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!error} title="Not saved">{schedulingError(error)}</Alert>
      </div>
    </Dialog>
  );
}
