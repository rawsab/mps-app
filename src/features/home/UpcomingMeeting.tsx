import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { ArrowUpRightIcon, CalendarIcon } from '@/components/icons';
import { Alert, Badge, Card, SectionHeading } from '@/components/ui';
import { MeetingCardSkeleton } from '@/features/scheduling/MeetingSkeletons';
import { LoadingRegion } from '@/components/Skeleton';
import type { ServiceKind } from '@/domain/programs/contract';
import { countdown } from '@/domain/scheduling/calendar';
import { recentRequestOutcome } from '@/domain/scheduling/requests';
import { photoUrl } from '@/features/profile/api';
import { schedulingError, type Meeting } from '@/features/scheduling/api';
import { ChangeButtons, PendingRequestNotice, useMeetingChange } from '@/features/scheduling/MeetingRequestControls';
import { useMeetingToast } from '@/features/scheduling/useMeetingToast';
import { topicLabel } from '@/features/scheduling/MeetingTopic';
import { sessionDay, sessionMoment, sessionRange } from '@/features/scheduling/time';
import { clientProgramPath, SERVICE_SHORT_LABELS } from '@/lib/services';
import { useNextMeeting } from './api';

/** "Join call" is the primary action from this long before the start until the meeting ends. */
export const JOIN_EARLY_MS = 15 * 60_000;

/** The client's next meeting (decision 0042), with the coach's call link. `service` narrows it to that service's meetings. */
export function UpcomingMeeting({ timeZone, now, service, title = 'Upcoming meeting' }: { timeZone: string; now: number; service?: ServiceKind; title?: string }) {
  const meetings = useNextMeeting(now, service);
  const meeting = meetings.next;
  const toast = useMeetingToast();
  const outcome = recentRequestOutcome(meetings.data ?? [], now);
  const [dismissed, dismiss] = useDismissedOutcome();
  return (
    <section aria-labelledby="home-meeting" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <SectionHeading id="home-meeting" icon={<CalendarIcon />}>{title}</SectionHeading>
        {/* Every upcoming meeting, across services (decision 0050, phase C). The PT page lists its own. */}
        {service ? null : <Link to="/meetings" className="-my-3 inline-flex min-h-11 shrink-0 items-center text-sm text-gold-fg"><span className="link">All meetings</span></Link>}
      </div>
      {toast.element}
      <Alert visible={!!outcome && outcome.request.id !== dismissed} tone={outcome?.request.status === 'accepted' ? 'success' : 'note'} className="mb-3"
        onDismiss={() => outcome && dismiss(outcome.request.id)}>
        {outcome ? <OutcomeText meeting={outcome.meeting} timeZone={timeZone} /> : null}
      </Alert>
      {meetings.isPending ? <LoadingRegion label="Loading meetings"><MeetingCardSkeleton actions={1} /></LoadingRegion> : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && !meeting ? (
        <Card as="div" padding="sm" className="text-sm text-muted">No {service ? 'sessions' : 'meetings'} scheduled. Your coach will add them here.</Card>
      ) : null}
      {meeting ? <MeetingCard meeting={meeting} timeZone={timeZone} now={now} onSent={(message) => toast.show(message)} /> : null}
    </section>
  );
}

function MeetingCard({ meeting, timeZone, now, onSent }: { meeting: Meeting; timeZone: string; now: number; onSent: (message: string) => void }) {
  const change = useMeetingChange(meeting, timeZone, onSent);
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
      <PendingRequestNotice meeting={meeting} timeZone={timeZone} onWithdraw={change.withdraw} className="mt-3" />
      {programs.length ? (
        <ul className="mt-3 grid gap-1.5">
          {programs.map((p) => (
            <li key={p.service}>
              <Link to={clientProgramPath(p.service, p.programId)} title={p.title ?? undefined}
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
        <ChangeButtons meeting={meeting} now={now} onChange={change.change} className="-mr-3 ml-auto" />
      </div>
      {change.dialogs}
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
