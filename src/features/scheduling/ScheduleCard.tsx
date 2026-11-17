import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { useViewer } from '@/app/auth';
import { Dialog } from '@/components/Dialog';
import { PencilIcon, PlusIcon, StopIcon } from '@/components/icons';
import { Alert, Badge, Button, Spinner, TextField } from '@/components/ui';
import { describePattern, type PtSchedule } from '@/domain/scheduling/pattern';
import { formatDate } from '@/lib/format';
import { schedulingError, useClientAppointments, useEndPattern, usePtScheduling, useStopScheduling, type Appointment, type Scheduling } from './api';
import { PatternDialog } from './PatternDialog';
import { NewSessionDialog, SessionDialog } from './SessionDialog';
import { sessionDay, sessionRange, todayIn, zoneLabel } from './time';

const DAY_MS = 86_400_000;
const LIST_DAYS = 31;
const LIST_LIMIT = 8;

type Open =
  | { kind: 'session'; id: string }
  | { kind: 'new' }
  | { kind: 'pattern'; schedule?: PtSchedule; from?: string }
  | { kind: 'end'; schedule: PtSchedule }
  | { kind: 'stop' };

/**
 * Personal training sessions on the coach's client page (decision 0037): repeating patterns, the
 * next month of sessions, and client requests. `focusSessionId` opens one session (links from Reviews).
 */
export function ScheduleCard({ clientId, focusSessionId, onFocusClosed }: { clientId: string; focusSessionId: string | null; onFocusClosed: () => void }) {
  const scheduling = usePtScheduling(clientId);
  const [now] = useState(() => new Date());
  const range = useMemo(() => ({ from: now, to: new Date(now.getTime() + LIST_DAYS * DAY_MS) }), [now]);
  const sessions = useClientAppointments(clientId, range.from, range.to);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState('');
  const [showAll, setShowAll] = useState(false);

  const current: Open | null = focusSessionId ? { kind: 'session', id: focusSessionId } : open;
  const close = () => { if (focusSessionId) onFocusClosed(); setOpen(null); };
  const saved = (message: string) => { close(); setNotice(message); };

  if (scheduling.isPending) return <Spinner label="Loading sessions" />;
  if (scheduling.error) return <Alert title="Could not load sessions">{schedulingError(scheduling.error)}</Alert>;
  const s = scheduling.data;
  const canSchedule = s.service === 'active' && !!s.coachId;
  const list = sessions.data ?? [];
  const visible = showAll ? list : list.slice(0, LIST_LIMIT);

  return (
    <section className="min-w-0" aria-labelledby="client-sessions">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 id="client-sessions" className="text-lg font-semibold">Sessions</h2>
          <p className="text-xs text-muted">Personal training · times in {zoneLabel(s.timezone)}</p>
        </div>
        {canSchedule ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setOpen({ kind: 'new' })}><PlusIcon />Add session</Button>
            <Button variant="secondary" onClick={() => setOpen({ kind: 'pattern' })}>Repeat sessions</Button>
          </div>
        ) : null}
      </div>

      <Alert visible={!!notice} tone="success" onDismiss={() => setNotice('')} className="mb-3">{notice}</Alert>
      <SetupNotices scheduling={s} onStop={() => setOpen({ kind: 'stop' })} />

      {s.schedules.length ? (
        <ul className="mb-4 divide-y divide-line rounded-card border border-line">
          {s.schedules.map((schedule) => {
            const description = describePattern(schedule);
            const today = todayIn(schedule.timezone);
            return (
              <li key={schedule.id} className="flex items-start gap-2 p-3">
                <span aria-hidden className="pt-0.5 text-gold-fg">↻</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium">{description.summary}</p>
                  {description.weeks.map((week) => <p key={week} className="text-muted">{week}</p>)}
                  <p className="mt-0.5 text-xs text-muted">
                    {schedule.startsOn > today ? `Starts ${formatDate(schedule.startsOn)}` : `Since ${formatDate(schedule.startsOn)}`}
                    {schedule.endsOn ? ` · until ${formatDate(schedule.endsOn)}` : ''}
                  </p>
                </div>
                {canSchedule ? (
                  <Button variant="ghost" aria-label="Change repeating sessions" title="Change" className="px-3"
                    onClick={() => setOpen({ kind: 'pattern', schedule, from: schedule.startsOn > today ? schedule.startsOn : today })}><PencilIcon /></Button>
                ) : null}
                <Button variant="ghost" aria-label="Stop repeating sessions" title="Stop repeating" className="px-3"
                  onClick={() => setOpen({ kind: 'end', schedule })}><StopIcon /></Button>
              </li>
            );
          })}
        </ul>
      ) : null}

      <h3 className="mb-1 text-sm font-medium text-muted">Next {LIST_DAYS} days</h3>
      {sessions.isPending ? <Spinner label="Loading sessions" /> : null}
      <Alert visible={!!sessions.error} title="Could not load sessions">{schedulingError(sessions.error)}</Alert>
      {sessions.data && list.length === 0 ? <p className="text-sm text-muted">No sessions in the next {LIST_DAYS} days.</p> : null}
      {visible.length ? (
        <ul className="divide-y divide-line">
          {visible.map((session) => <SessionRow key={session.id} session={session} timeZone={s.timezone} onOpen={() => setOpen({ kind: 'session', id: session.id })} />)}
        </ul>
      ) : null}
      {list.length > LIST_LIMIT ? (
        <Button variant="ghost" className="mt-1" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show fewer' : `Show all ${list.length} sessions`}</Button>
      ) : null}

      {current?.kind === 'session' ? (
        <SessionDialog appointmentId={current.id} scheduling={s} onClose={close} onSaved={saved}
          onChangePattern={(schedule, from) => { if (focusSessionId) onFocusClosed(); setOpen({ kind: 'pattern', schedule, from }); }} />
      ) : null}
      {current?.kind === 'new' ? <NewSessionDialog clientId={clientId} scheduling={s} onClose={close} onSaved={saved} /> : null}
      {current?.kind === 'pattern' ? (
        <PatternDialog clientId={clientId} scheduling={s} {...(current.schedule ? { schedule: current.schedule } : {})} {...(current.from ? { from: current.from } : {})}
          onClose={close} onSaved={saved} />
      ) : null}
      {current?.kind === 'end' ? <EndPatternDialog schedule={current.schedule} onClose={close} onSaved={saved} /> : null}
      {current?.kind === 'stop' ? <StopDialog clientId={clientId} scheduling={s} onClose={close} onSaved={saved} /> : null}
    </section>
  );
}

/** Things that stop scheduling from working as expected, with where to fix them. */
function SetupNotices({ scheduling: s, onStop }: { scheduling: Scheduling; onStop: () => void }) {
  const viewer = useViewer();
  const isCoach = !!s.coachId && viewer.data?.userId === s.coachId;
  const coach = s.coachName ?? 'The primary coach';
  const profile = <Link to="/coach/profile" className="text-gold-fg"><span className="link">Profile settings</span></Link>;
  return (
    <div className="mb-3 grid gap-2 empty:hidden">
      {s.service !== 'active' ? (
        <Alert tone="note" title={s.service === 'paused' ? 'Personal training is paused' : 'Personal training has ended'}>
          No new repeating sessions are created.
          {s.futureSessions > 0 ? <> {s.futureSessions} future {s.futureSessions === 1 ? 'session is' : 'sessions are'} still scheduled.{' '}
            <button type="button" className="font-medium text-gold-fg underline underline-offset-2" onClick={onStop}>Cancel {s.futureSessions === 1 ? 'it' : 'them'}</button></> : null}
        </Alert>
      ) : null}
      {s.service === 'active' && !s.coachId ? <Alert tone="note">Assign a primary coach before scheduling sessions.</Alert> : null}
      {s.coachId && s.timezone === 'UTC' ? (
        <Alert tone="note">{isCoach ? <>Your time zone is set to UTC. Set yours in {profile} so sessions land at the right local time.</> : `${coach}’s time zone is UTC, so sessions are scheduled in UTC.`}</Alert>
      ) : null}
      {s.coachId && !s.meetingUrl ? (
        <Alert tone="note">{isCoach ? <>Clients won’t see a meeting link until you add one in {profile}.</> : `${coach} hasn’t added a meeting link yet.`}</Alert>
      ) : null}
    </div>
  );
}

function SessionRow({ session, timeZone, onOpen }: { session: Appointment; timeZone: string; onOpen: () => void }) {
  const cancelled = session.status === 'cancelled' || session.status === 'late_cancelled';
  const pending = session.request?.status === 'pending' ? session.request : null;
  return (
    <li>
      <button type="button" onClick={onOpen} className="row-link group flex min-h-14 w-full min-w-0 items-center gap-3 rounded-card py-2 pl-2 pr-2 text-left hover:bg-surface-raised">
        <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-full ${cancelled ? 'bg-line' : 'bg-gold'}`} />
        <span className={`w-28 shrink-0 text-sm font-medium ${cancelled ? 'text-muted' : ''}`}>{sessionDay(session.startsAt, timeZone)}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm tabular-nums ${cancelled ? 'text-muted line-through' : ''}`}>{sessionRange(session.startsAt, session.durationMinutes, timeZone)}</span>
          <span className="block truncate text-xs text-muted">
            {[`${session.durationMinutes} min`, session.scheduleId ? (session.modified ? '↻ Changed' : '↻ Repeating') : 'One-off'].join(' · ')}
          </span>
        </span>
        <span className="flex shrink-0 flex-wrap justify-end gap-1">
          {pending ? <Badge tone="gold">{pending.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge> : null}
          {session.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
          {session.status === 'late_cancelled' ? <Badge tone="danger">Late cancellation</Badge> : null}
        </span>
        <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
      </button>
    </li>
  );
}

function EndPatternDialog({ schedule, onClose, onSaved }: { schedule: PtSchedule; onClose: () => void; onSaved: (message: string) => void }) {
  const end = useEndPattern();
  const today = todayIn(schedule.timezone);
  const earliest = schedule.startsOn > today ? schedule.startsOn : today;
  const [from, setFrom] = useState(earliest);
  return (
    <Dialog title="Stop repeating sessions?" description={describePattern(schedule).summary}
      onClose={() => { if (!end.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={end.isPending} onClick={onClose}>Keep repeating</Button>
        <Button variant="danger" busy={end.isPending} disabled={!from || from < earliest}
          onClick={() => end.mutate({ scheduleId: schedule.id, from }, {
            onSuccess: (result) => onSaved(`Repeating sessions stop from ${formatDate(from)}.${result.keptSessions
              ? ` ${result.keptSessions} ${result.keptSessions === 1 ? 'session you had changed is' : 'sessions you had changed are'} still scheduled.` : ''}`),
          })}><StopIcon />Stop repeating</Button>
      </>}>
      <div className="grid gap-3 p-4 sm:p-5">
        <TextField label="No sessions from" type="date" value={from} min={earliest} onChange={(event) => setFrom(event.target.value)}
          hint="Sessions before this date stay. Sessions you moved or cancelled stay as they are." />
        <Alert visible={!!end.error} title="Not stopped">{schedulingError(end.error)}</Alert>
      </div>
    </Dialog>
  );
}

function StopDialog({ clientId, scheduling, onClose, onSaved }: { clientId: string; scheduling: Scheduling; onClose: () => void; onSaved: (message: string) => void }) {
  const stop = useStopScheduling(clientId);
  return (
    <Dialog title="Cancel remaining sessions?"
      description={`Cancels ${scheduling.futureSessions} future ${scheduling.futureSessions === 1 ? 'session' : 'sessions'} and stops repeating sessions. The client sees them as cancelled by staff.`}
      onClose={() => { if (!stop.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={stop.isPending} onClick={onClose}>Keep them</Button>
        <Button variant="danger" busy={stop.isPending} onClick={() => stop.mutate(undefined, {
          onSuccess: (result) => onSaved(`Cancelled ${result.cancelledSessions} ${result.cancelledSessions === 1 ? 'session' : 'sessions'}.`),
        })}>Cancel sessions</Button>
      </>}>
      <Alert visible={!!stop.error} className="m-4" title="Not cancelled">{schedulingError(stop.error)}</Alert>
    </Dialog>
  );
}
