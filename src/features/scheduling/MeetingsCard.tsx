import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useViewer } from '@/app/auth';
import { Dialog } from '@/components/Dialog';
import { PencilIcon, PlusIcon, StopIcon } from '@/components/icons';
import { Alert, Badge, Button, Spinner, TextAreaField, TextField } from '@/components/ui';
import { describePattern } from '@/domain/scheduling/pattern';
import { useClientPrograms } from '@/features/programs/api';
import { formatDate } from '@/lib/format';
import { schedulingError, useClientMeetings, useEndPattern, useMeetingContext, useSavePatternNotes, useStopMeetings, type Meeting, type MeetingContext, type MeetingSchedule } from './api';
import { MeetingDialog, NewMeetingDialog } from './MeetingDialog';
import { topicLabel } from './MeetingTopic';
import { PatternDialog } from './PatternDialog';
import { sessionDay, sessionRange, todayIn, zoneLabel } from './time';
import { isCancelled, useHideCancelled } from './useHideCancelled';

const DAY_MS = 86_400_000;
const LIST_DAYS = 31;
const LIST_LIMIT = 8;
type Open =
  | { kind: 'meeting'; id: string }
  | { kind: 'new' }
  | { kind: 'pattern'; schedule?: MeetingSchedule; from?: string }
  | { kind: 'end'; schedule: MeetingSchedule }
  | { kind: 'notes'; schedule: MeetingSchedule }
  | { kind: 'stop' };

/**
 * Meetings on the coach's client page (decisions 0037, 0039): repeating patterns, the next month,
 * and client requests. `focusMeetingId` opens one meeting (links from Reviews).
 */
export function MeetingsCard({ clientId, heading, focusMeetingId, onFocusClosed }: {
  clientId: string; heading: ReactNode; focusMeetingId: string | null; onFocusClosed: () => void;
}) {
  const context = useMeetingContext(clientId);
  const programs = useClientPrograms(clientId);
  const [now] = useState(() => new Date());
  const range = useMemo(() => ({ from: now, to: new Date(now.getTime() + LIST_DAYS * DAY_MS) }), [now]);
  const meetings = useClientMeetings(clientId, range.from, range.to);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [hideCancelled, setHideCancelled] = useHideCancelled();

  const current: Open | null = focusMeetingId ? { kind: 'meeting', id: focusMeetingId } : open;
  const close = () => { if (focusMeetingId) onFocusClosed(); setOpen(null); };
  const saved = (message: string) => { close(); setNotice(message); };

  if (context.isPending) return <Spinner label="Loading meetings" />;
  if (context.error) return <Alert title="Could not load meetings">{schedulingError(context.error)}</Alert>;
  const c = context.data;
  const programRows = programs.data ?? [];
  const canSchedule = c.services.some((s) => s.status === 'active') && !!c.coachId;
  const all = meetings.data ?? [];
  const cancelledCount = all.filter(isCancelled).length;
  const list = hideCancelled ? all.filter((m) => !isCancelled(m)) : all;
  const visible = showAll ? list : list.slice(0, LIST_LIMIT);

  return (
    <section className="min-w-0" aria-labelledby="client-meetings">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="client-meetings" className="text-lg font-semibold">{heading}</h2>
          <p className="text-xs text-muted">Times in {zoneLabel(c.timezone)}</p>
        </div>
        {canSchedule ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOpen({ kind: 'new' })}><PlusIcon />Add meeting</Button>
            <Button variant="secondary" onClick={() => setOpen({ kind: 'pattern' })}>Repeat meetings</Button>
          </div>
        ) : null}
      </div>

      <Alert visible={!!notice} tone="success" onDismiss={() => setNotice('')} className="mb-3">{notice}</Alert>
      <SetupNotices context={c} onStop={() => setOpen({ kind: 'stop' })} />

      {c.schedules.length ? (
        <ul className="mb-4 divide-y divide-line rounded-card border border-line">
          {c.schedules.map((schedule) => {
            const description = describePattern(schedule);
            const today = todayIn(schedule.timezone);
            return (
              <li key={schedule.id} className="flex items-start gap-2 p-3">
                <span aria-hidden className="pt-0.5 text-gold-fg">↻</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium">{description.summary}</span>
                    {schedule.active ? null : <Badge>Paused</Badge>}
                  </p>
                  {description.weeks.map((week) => <p key={week} className="text-muted">{week}</p>)}
                  <p className="mt-0.5 text-xs text-muted">
                    {topicLabel(schedule.services)} · {schedule.startsOn > today ? `starts ${formatDate(schedule.startsOn)}` : `since ${formatDate(schedule.startsOn)}`}
                    {schedule.endsOn ? ` · until ${formatDate(schedule.endsOn)}` : ''}
                    {schedule.active ? '' : ' · none of its services are active'}
                  </p>
                  {schedule.notes ? <p className="mt-1 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted">{schedule.notes}</p> : null}
                </div>
                {canSchedule ? (
                  <Button variant="ghost" aria-label="Change repeating meetings" title="Change" className="px-3"
                    onClick={() => setOpen({ kind: 'pattern', schedule, from: schedule.startsOn > today ? schedule.startsOn : today })}><PencilIcon /></Button>
                ) : null}
                <Button variant="ghost" aria-label={schedule.notes ? 'Edit pattern notes' : 'Add pattern notes'} title="Notes" className="px-3 text-xs"
                  onClick={() => setOpen({ kind: 'notes', schedule })}>Notes</Button>
                <Button variant="ghost" aria-label="Stop repeating meetings" title="Stop repeating" className="px-3"
                  onClick={() => setOpen({ kind: 'end', schedule })}><StopIcon /></Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium text-muted">Next {LIST_DAYS} days</h3>
        {cancelledCount > 0 || hideCancelled ? (
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-muted">
            <input type="checkbox" className="size-4 accent-gold" checked={hideCancelled} onChange={(event) => setHideCancelled(event.target.checked)} />
            Hide cancelled{cancelledCount ? ` (${cancelledCount})` : ''}
          </label>
        ) : null}
      </div>
      {meetings.isPending ? <Spinner label="Loading meetings" /> : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && list.length === 0 ? (
        <p className="text-sm text-muted">{all.length ? 'Only cancelled meetings in the next 31 days.' : `No meetings in the next ${LIST_DAYS} days.`}</p>
      ) : null}
      {visible.length ? (
        <ul className="divide-y divide-line">
          {visible.map((meeting) => <MeetingRow key={meeting.id} meeting={meeting} timeZone={c.timezone} onOpen={() => setOpen({ kind: 'meeting', id: meeting.id })} />)}
        </ul>
      ) : null}
      {list.length > LIST_LIMIT ? (
        <Button variant="ghost" className="mt-1" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : `Show all ${list.length} meetings`}</Button>
      ) : null}

      {current?.kind === 'meeting' ? (
        <MeetingDialog meetingId={current.id} context={c} programs={programRows} onClose={close} onSaved={saved}
          onChangePattern={(schedule, from) => { if (focusMeetingId) onFocusClosed(); setOpen({ kind: 'pattern', schedule, from }); }} />
      ) : null}
      {current?.kind === 'new' ? <NewMeetingDialog clientId={clientId} context={c} programs={programRows} onClose={close} onSaved={saved} /> : null}
      {current?.kind === 'pattern' ? (
        <PatternDialog clientId={clientId} context={c} programs={programRows} {...(current.schedule ? { schedule: current.schedule } : {})} {...(current.from ? { from: current.from } : {})}
          onClose={close} onSaved={saved} />
      ) : null}
      {current?.kind === 'notes' ? <PatternNotesDialog schedule={current.schedule} onClose={close} onSaved={saved} /> : null}
      {current?.kind === 'end' ? <EndPatternDialog schedule={current.schedule} onClose={close} onSaved={saved} /> : null}
      {current?.kind === 'stop' ? <StopDialog clientId={clientId} context={c} onClose={close} onSaved={saved} /> : null}
    </section>
  );
}

/** Things that stop scheduling from working as expected, with where to fix them. */
function SetupNotices({ context: c, onStop }: { context: MeetingContext; onStop: () => void }) {
  const viewer = useViewer();
  const isCoach = !!c.coachId && viewer.data?.userId === c.coachId;
  const coach = c.coachName ?? 'The primary coach';
  const profile = <Link to="/coach/profile" className="text-gold-fg"><span className="link">Profile settings</span></Link>;
  const anyActive = c.services.some((s) => s.status === 'active');
  return (
    <div className="mb-3 grid gap-2 empty:hidden">
      {!anyActive ? (
        <Alert tone="note" title="No active services">
          No new meetings are created while every service is paused or ended.
          {c.futureMeetings > 0 ? <> {c.futureMeetings} future {c.futureMeetings === 1 ? 'meeting is' : 'meetings are'} still scheduled.{' '}
            <button type="button" className="font-medium text-gold-fg underline underline-offset-2" onClick={onStop}>Cancel {c.futureMeetings === 1 ? 'it' : 'them'}</button></> : null}
        </Alert>
      ) : null}
      {anyActive && !c.coachId ? <Alert tone="note">Assign a primary coach before scheduling meetings.</Alert> : null}
      {c.coachId && c.timezone === 'UTC' ? (
        <Alert tone="note">{isCoach ? <>Your time zone is set to UTC. Set yours in {profile} so meetings land at the right local time.</> : `${coach}’s time zone is UTC, so meetings are scheduled in UTC.`}</Alert>
      ) : null}
      {c.coachId && !c.meetingUrl ? (
        <Alert tone="note">{isCoach ? <>Clients won’t see a meeting link until you add one in {profile}.</> : `${coach} hasn’t added a meeting link yet.`}</Alert>
      ) : null}
    </div>
  );
}

function MeetingRow({ meeting, timeZone, onOpen }: { meeting: Meeting; timeZone: string; onOpen: () => void }) {
  const cancelled = meeting.status === 'cancelled' || meeting.status === 'late_cancelled';
  const pending = meeting.request?.status === 'pending' ? meeting.request : null;
  const programs = meeting.programs.filter((p) => p.programId).map((p) => p.title?.trim() || 'Untitled program');
  return (
    <li>
      <button type="button" onClick={onOpen} className="row-link group flex min-h-14 w-full min-w-0 items-center gap-3 rounded-card py-2 pl-2 pr-2 text-left hover:bg-surface-raised">
        <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-full ${cancelled ? 'bg-line' : 'bg-gold'}`} />
        <span className={`w-28 shrink-0 text-sm font-medium ${cancelled ? 'text-muted' : ''}`}>{sessionDay(meeting.startsAt, timeZone)}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm tabular-nums ${cancelled ? 'text-muted line-through' : ''}`}>{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</span>
          <span className="block truncate text-xs text-muted">
            {[topicLabel(meeting.services), ...programs, meeting.scheduleId ? (meeting.modified ? '↻ Changed' : '↻ Repeating') : 'One-off', meeting.notes || meeting.patternNotes ? 'Notes' : ''].filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {pending ? <Badge tone="gold">{pending.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge> : null}
          {meeting.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
          {meeting.status === 'late_cancelled' ? <Badge tone="danger">Late cancellation</Badge> : null}
        </span>
        <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
      </button>
    </li>
  );
}

function PatternNotesDialog({ schedule, onClose, onSaved }: { schedule: MeetingSchedule; onClose: () => void; onSaved: (message: string) => void }) {
  const save = useSavePatternNotes();
  const [notes, setNotes] = useState(schedule.notes ?? '');
  return (
    <Dialog title="Pattern notes" description={`${describePattern(schedule).summary} · ${topicLabel(schedule.services)}`}
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={save.isPending} disabled={notes.trim() === (schedule.notes ?? '')}
          onClick={() => save.mutate({ scheduleId: schedule.id, notes }, { onSuccess: () => onSaved(notes.trim() ? 'Pattern notes saved.' : 'Pattern notes removed.') })}>Save notes</Button>
      </>}>
      <div className="grid gap-3 p-4 sm:p-5">
        <TextAreaField label="Notes" rows={5} maxLength={5000} value={notes} onChange={(event) => setNotes(event.target.value)}
          hint="Shown on every meeting in this pattern. Private to staff. Each meeting can also have its own notes." />
        <Alert visible={!!save.error} title="Not saved">{schedulingError(save.error)}</Alert>
      </div>
    </Dialog>
  );
}

function EndPatternDialog({ schedule, onClose, onSaved }: { schedule: MeetingSchedule; onClose: () => void; onSaved: (message: string) => void }) {
  const end = useEndPattern();
  const today = todayIn(schedule.timezone);
  const earliest = schedule.startsOn > today ? schedule.startsOn : today;
  const [from, setFrom] = useState(earliest);
  return (
    <Dialog title="Stop repeating meetings?" description={`${describePattern(schedule).summary} · ${topicLabel(schedule.services)}`}
      onClose={() => { if (!end.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={end.isPending} onClick={onClose}>Keep repeating</Button>
        <Button variant="danger" busy={end.isPending} disabled={!from || from < earliest}
          onClick={() => end.mutate({ scheduleId: schedule.id, from }, {
            onSuccess: (result) => onSaved(`Repeating meetings stop from ${formatDate(from)}.${result.keptMeetings
              ? ` ${result.keptMeetings} ${result.keptMeetings === 1 ? 'meeting you had changed is' : 'meetings you had changed are'} still scheduled.` : ''}`),
          })}><StopIcon />Stop repeating</Button>
      </>}>
      <div className="grid gap-3 p-4 sm:p-5">
        <TextField label="No meetings from" type="date" value={from} min={earliest} onChange={(event) => setFrom(event.target.value)}
          hint="Meetings before this date stay. Meetings you changed, or that have notes or client requests, stay as they are." />
        <Alert visible={!!end.error} title="Not stopped">{schedulingError(end.error)}</Alert>
      </div>
    </Dialog>
  );
}

function StopDialog({ clientId, context, onClose, onSaved }: { clientId: string; context: MeetingContext; onClose: () => void; onSaved: (message: string) => void }) {
  const stop = useStopMeetings(clientId);
  return (
    <Dialog title="Cancel remaining meetings?"
      description={`Cancels ${context.futureMeetings} future ${context.futureMeetings === 1 ? 'meeting' : 'meetings'} and stops repeating meetings. The client sees them as cancelled by staff.`}
      onClose={() => { if (!stop.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={stop.isPending} onClick={onClose}>Keep them</Button>
        <Button variant="danger" busy={stop.isPending} onClick={() => stop.mutate(undefined, {
          onSuccess: (result) => onSaved(`Cancelled ${result.cancelledMeetings} ${result.cancelledMeetings === 1 ? 'meeting' : 'meetings'}.`),
        })}>Cancel meetings</Button>
      </>}>
      <Alert visible={!!stop.error} className="m-4" title="Not cancelled">{schedulingError(stop.error)}</Alert>
    </Dialog>
  );
}
