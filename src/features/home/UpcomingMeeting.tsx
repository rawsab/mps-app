import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { ArrowUpRightIcon, CalendarIcon } from '@/components/icons';
import { ConfirmDialog, DialogBody } from '@/components/Dialog';
import { Alert, Badge, Button, Card, SectionHeading, Spinner } from '@/components/ui';
import { countdown } from '@/domain/scheduling/calendar';
import { canRequestChange, recentRequestOutcome } from '@/domain/scheduling/requests';
import { photoUrl } from '@/features/profile/api';
import { schedulingError, useWithdrawMeetingRequest, type Meeting } from '@/features/scheduling/api';
import { ChangeMeetingDialog, type ChangeKind } from '@/features/scheduling/ChangeMeetingDialog';
import { useMeetingToast } from '@/features/scheduling/useMeetingToast';
import { topicLabel } from '@/features/scheduling/MeetingTopic';
import { sessionDay, sessionMoment, sessionRange } from '@/features/scheduling/time';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import { useNextMeeting } from './api';

/** "Join call" is the primary action from this long before the start until the meeting ends. */
const JOIN_EARLY_MS = 15 * 60_000;

/** The client's next meeting (decision 0042), with the coach's call link. */
export function UpcomingMeeting({ timeZone, now }: { timeZone: string; now: number }) {
  const meetings = useNextMeeting(now);
  const meeting = meetings.next;
  const toast = useMeetingToast();
  const outcome = recentRequestOutcome(meetings.data ?? [], now);
  const [dismissed, dismiss] = useDismissedOutcome();
  return (
    <section aria-labelledby="home-meeting" className="min-w-0">
      <SectionHeading id="home-meeting" icon={<CalendarIcon />} className="mb-3">Upcoming meeting</SectionHeading>
      {toast.element}
      <Alert visible={!!outcome && outcome.request.id !== dismissed} tone={outcome?.request.status === 'accepted' ? 'success' : 'note'} className="mb-3"
        onDismiss={() => outcome && dismiss(outcome.request.id)}>
        {outcome ? <OutcomeText meeting={outcome.meeting} timeZone={timeZone} /> : null}
      </Alert>
      {meetings.isPending ? <Spinner label="Loading meetings" /> : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && !meeting ? (
        <Card as="div" padding="sm" className="text-sm text-muted">No meetings scheduled. Your coach will add them here.</Card>
      ) : null}
      {meeting ? <MeetingCard meeting={meeting} timeZone={timeZone} now={now} onSent={(message) => toast.show(message)} /> : null}
    </section>
  );
}

function MeetingCard({ meeting, timeZone, now, onSent }: { meeting: Meeting; timeZone: string; now: number; onSent: (message: string) => void }) {
  const [changing, setChanging] = useState<ChangeKind | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const withdraw = useWithdrawMeetingRequest();
  const pending = meeting.request?.status === 'pending' ? meeting.request : null;
  const start = new Date(meeting.startsAt).getTime();
  const live = start <= now;
  const joinable = start - JOIN_EARLY_MS <= now;
  const wait = countdown(now, start);
  const programs = meeting.programs.filter((p) => p.programId);
  const coach = meeting.coachName ?? 'Your coach';
  const photo = useCoachPhoto(meeting.coachAvatarPath);
  return (
    <Card as="div" padding="sm">
      {/* Who, when and what, laid out like the coach's next-meeting card. */}
      <div className="flex items-start gap-3">
        <Avatar url={photo.data} name={coach} className="size-12 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{coach}</p>
          <p className="text-sm">{sessionDay(meeting.startsAt, timeZone)} · {sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</p>
          <p className="mt-0.5 text-xs text-muted">{[`${meeting.durationMinutes} min`, topicLabel(meeting.services), meeting.scheduleId ? '↻ Repeating' : 'One-off'].join(' · ')}</p>
        </div>
        {live ? <Badge tone="gold">Now</Badge> : wait ? <span className="shrink-0 pt-0.5 text-xs text-muted">In {wait.split(', ')[0]}</span> : null}
      </div>
      {pending ? (
        <div className="mt-3 rounded-card border border-gold/40 bg-gold/5 px-3 py-2.5 text-sm">
          <p className="flex flex-wrap items-center gap-2">
            <Badge tone="gold">{pending.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge>
            <span className="text-muted">Waiting for {meeting.coachName ?? 'your coach'}</span>
          </p>
          {pending.preferredStartsAt ? <p className="mt-1.5">Asked for {sessionMoment(pending.preferredStartsAt, timeZone)}</p> : null}
          {pending.message ? <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-muted">“{pending.message}”</p> : null}
          <Button variant="ghost" className="-ml-3 mt-1" onClick={() => setWithdrawing(true)}>Withdraw request</Button>
        </div>
      ) : null}
      {programs.length ? (
        <ul className="mt-3 grid gap-1.5">
          {programs.map((p) => (
            <li key={p.service}>
              <Link to={`/${p.service === 'nutrition' ? 'nutrition' : 'training'}/${p.programId}`} title={p.title ?? undefined}
                className="group flex min-h-10 min-w-0 items-center gap-2 rounded-card border border-line px-3 text-sm transition-colors hover:border-muted/70 hover:bg-surface-raised">
                <span className="shrink-0 text-xs text-muted">{SERVICE_SHORT_LABELS[p.service]}</span>
                <span className="min-w-0 flex-1 truncate">{p.title?.trim() || 'Untitled program'}</span>
                <span className="text-muted group-hover:text-text"><ArrowUpRightIcon /></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {/* Join on the left; asking to change the meeting sits at the bottom right. */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        {meeting.meetingUrl ? (
          <a href={meeting.meetingUrl} target="_blank" rel="noreferrer"
            className={`btn-motion inline-flex min-h-11 items-center gap-1.5 rounded-card px-4 text-sm font-medium ${joinable ? 'bg-gold font-semibold text-on-gold hover:bg-gold-hover' : 'border border-line bg-surface-raised hover:border-muted/70'}`}>
            Join call<ArrowUpRightIcon />
          </a>
        ) : <p className="text-sm text-muted">Your coach will share the call link.</p>}
        {canRequestChange(meeting, now) ? (
          <div className="-mr-3 ml-auto flex flex-wrap justify-end gap-1">
            <Button variant="ghost" onClick={() => setChanging('reschedule')}>Reschedule</Button>
            <Button variant="ghost" onClick={() => setChanging('cancel')}>Cancel meeting</Button>
          </div>
        ) : null}
      </div>
      {changing ? (
        <ChangeMeetingDialog meeting={meeting} timeZone={timeZone} initialKind={changing} onClose={() => setChanging(null)}
          onSent={(message) => { setChanging(null); onSent(message); }} />
      ) : null}
      {withdrawing && pending ? (
        <ConfirmDialog title="Withdraw your request?" confirmLabel="Withdraw" pending={withdraw.isPending}
          description={pending.kind === 'cancel' ? 'The meeting stays as it is.' : 'The meeting stays at its current time, and any time you asked for is released.'}
          onClose={() => { withdraw.reset(); setWithdrawing(false); }}
          onConfirm={() => withdraw.mutate(pending.id, { onSuccess: () => { setWithdrawing(false); onSent('Request withdrawn.'); } })}>
          <DialogBody><Alert visible={!!withdraw.error}>{schedulingError(withdraw.error)}</Alert></DialogBody>
        </ConfirmDialog>
      ) : null}
    </Card>
  );
}

/** Signed URLs last an hour; refreshing every 30 minutes keeps the picture loading. */
function useCoachPhoto(path: string | null) {
  return useQuery({ queryKey: ['coach-photo', path], enabled: !!path, staleTime: 60_000, refetchInterval: 30 * 60_000, queryFn: () => photoUrl(path) });
}

/** The coach's answer to the client's latest request (decision 0050). */
function OutcomeText({ meeting, timeZone }: { meeting: Meeting; timeZone: string }) {
  const request = meeting.request!;
  const coach = meeting.coachName ?? 'Your coach';
  const when = sessionMoment(meeting.startsAt, timeZone);
  const reply = request.response.trim() ? <span className="mt-1 block text-muted">“{request.response}”</span> : null;
  if (request.status === 'expired') return <>Your reschedule request for the {when} meeting expired when it started, so it went ahead as planned.</>;
  if (request.status === 'declined') {
    return <>{coach} couldn’t {request.kind === 'cancel' ? 'cancel' : 'move'} your {when} meeting, so it stays as planned.{reply}</>;
  }
  if (request.kind === 'cancel') {
    return <>{coach} cancelled your {when} meeting{meeting.status === 'late_cancelled' ? ' as a late cancellation' : ''}.{reply}</>;
  }
  return <>{coach} moved your meeting to {when}.{reply}</>;
}

const DISMISSED_KEY = 'mps.meeting-outcome-dismissed';

/** The answer the client closed, remembered in this browser only. */
function useDismissedOutcome(): [string | null, (id: string) => void] {
  const [dismissed, setDismissed] = useState<string | null>(() => {
    try { return localStorage.getItem(DISMISSED_KEY); } catch { return null; }
  });
  return [dismissed, (id) => {
    setDismissed(id);
    try { localStorage.setItem(DISMISSED_KEY, id); } catch { /* still hidden for this visit */ }
  }];
}
