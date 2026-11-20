import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { ArrowUpRightIcon, CalendarIcon } from '@/components/icons';
import { Alert, Badge, Card, SectionHeading, Spinner } from '@/components/ui';
import { countdown } from '@/domain/scheduling/calendar';
import { photoUrl } from '@/features/profile/api';
import { schedulingError, type Meeting } from '@/features/scheduling/api';
import { topicLabel } from '@/features/scheduling/MeetingTopic';
import { sessionDay, sessionRange } from '@/features/scheduling/time';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import { useNextMeeting } from './api';

/** "Join call" is the primary action from this long before the start until the meeting ends. */
const JOIN_EARLY_MS = 15 * 60_000;

/** The client's next meeting (decision 0042), with the coach's call link. */
export function UpcomingMeeting({ timeZone, now }: { timeZone: string; now: number }) {
  const meetings = useNextMeeting(now);
  const meeting = meetings.next;
  return (
    <section aria-labelledby="home-meeting" className="min-w-0">
      <SectionHeading id="home-meeting" icon={<CalendarIcon />} className="mb-3">Upcoming meeting</SectionHeading>
      {meetings.isPending ? <Spinner label="Loading meetings" /> : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && !meeting ? (
        <Card as="div" padding="sm" className="text-sm text-muted">No meetings scheduled. Your coach will add them here.</Card>
      ) : null}
      {meeting ? <MeetingCard meeting={meeting} timeZone={timeZone} now={now} /> : null}
    </section>
  );
}

function MeetingCard({ meeting, timeZone, now }: { meeting: Meeting; timeZone: string; now: number }) {
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
      {meeting.request?.status === 'pending' ? (
        <p className="mt-2"><Badge tone="gold">{meeting.request.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge></p>
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
      <div className="mt-3">
        {meeting.meetingUrl ? (
          <a href={meeting.meetingUrl} target="_blank" rel="noreferrer"
            className={`btn-motion inline-flex min-h-11 items-center gap-1.5 rounded-card px-4 text-sm font-medium ${joinable ? 'bg-gold font-semibold text-on-gold hover:bg-gold-hover' : 'border border-line bg-surface-raised hover:border-muted/70'}`}>
            Join call<ArrowUpRightIcon />
          </a>
        ) : <p className="text-sm text-muted">Your coach will share the call link.</p>}
      </div>
    </Card>
  );
}

/** Signed URLs last an hour; refreshing every 30 minutes keeps the picture loading. */
function useCoachPhoto(path: string | null) {
  return useQuery({ queryKey: ['coach-photo', path], enabled: !!path, staleTime: 60_000, refetchInterval: 30 * 60_000, queryFn: () => photoUrl(path) });
}
