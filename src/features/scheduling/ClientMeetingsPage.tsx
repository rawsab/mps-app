import { useMemo } from 'react';
import { useViewer } from '@/app/auth';
import { ArrowUpRightIcon } from '@/components/icons';
import { Alert, Badge, EmptyState, PageHeader } from '@/components/ui';
import { LoadingRegion, SkeletonText } from '@/components/Skeleton';
import { upcomingByZonedDay } from '@/domain/scheduling/upcoming';
import { useNextMeeting, useNow } from '@/features/home/api';
import { JOIN_EARLY_MS } from '@/features/home/UpcomingMeeting';
import { schedulingError, type Meeting } from './api';
import { ChangeButtons, PendingRequestNotice, useMeetingChange } from './MeetingRequestControls';
import { MeetingListSkeleton } from './MeetingSkeletons';
import { topicLabel } from './MeetingTopic';
import { sessionRange, zoneLabel } from './time';
import { useMeetingToast } from './useMeetingToast';

const longDay = new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
const dayName = (date: string) => longDay.format(new Date(`${date}T00:00:00Z`));

/**
 * The client's upcoming meetings across services, by day in their zone (decision 0050, phase C).
 * Each scheduled one can be rescheduled or cancelled like Home's next meeting. Cancelled meetings
 * stay listed, struck through, so a cancellation never looks like a missing meeting.
 */
export function ClientMeetingsPage() {
  const viewer = useViewer().data!;
  const now = useNow();
  // Home's query (the next 60 days), so both pages share one cache entry.
  const meetings = useNextMeeting(now);
  const toast = useMeetingToast();
  const days = useMemo(() => upcomingByZonedDay(meetings.data ?? [], now, viewer.timezone), [meetings.data, now, viewer.timezone]);

  return (
    <div>
      <PageHeader title="Meetings" subtitle={`The next 60 days. Times are in ${zoneLabel(viewer.timezone)}.`} />
      {toast.element}
      {meetings.isPending ? (
        <LoadingRegion label="Loading meetings" className="grid gap-6">
          {[2, 1].map((count, i) => <div key={i}><SkeletonText size="base" width="w-36" className="mb-2" /><MeetingListSkeleton count={count} /></div>)}
        </LoadingRegion>
      ) : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && !days.length ? <EmptyState title="No upcoming meetings">Your coach will add them here.</EmptyState> : null}
      {days.length ? (
        <div className="grid gap-7">
          {days.map((day) => (
            <section key={day.date} aria-labelledby={`day-${day.date}`}>
              <h2 id={`day-${day.date}`} className="mb-1 text-base font-semibold">
                {day.offset === 0 ? 'Today' : day.offset === 1 ? 'Tomorrow' : dayName(day.date)}
                {day.offset === 0 || day.offset === 1 ? <span className="font-normal text-muted"> · {dayName(day.date)}</span> : null}
              </h2>
              <ul className="divide-y divide-line">
                {day.sessions.map((m) => <MeetingItem key={m.id} meeting={m} timeZone={viewer.timezone} now={now} onSent={(message) => toast.show(message)} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MeetingItem({ meeting, timeZone, now, onSent }: { meeting: Meeting; timeZone: string; now: number; onSent: (message: string) => void }) {
  const change = useMeetingChange(meeting, timeZone, onSent);
  const cancelled = meeting.status === 'cancelled' || meeting.status === 'late_cancelled';
  const start = Date.parse(meeting.startsAt);
  const live = !cancelled && start <= now;
  const joinable = start - JOIN_EARLY_MS <= now;
  const programs = meeting.programs.filter((p) => p.programId).map((p) => p.title?.trim() || 'Untitled program');
  const details = [meeting.coachName ? `With ${meeting.coachName}` : '', `${meeting.durationMinutes} min`, topicLabel(meeting.services), ...programs,
    meeting.scheduleId ? '↻ Repeating' : 'One-off'].filter(Boolean).join(' · ');
  return (
    <li className="flex gap-3 py-3">
      {/* Gold for meetings still to come, faint for cancelled, like the coach's meeting rows. */}
      <span aria-hidden className={`w-1 shrink-0 self-stretch rounded-full ${cancelled ? 'bg-line' : 'bg-gold'}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <div className="min-w-0">
            <p className={`text-sm font-medium tabular-nums ${cancelled ? 'text-muted line-through' : ''}`}>{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</p>
            <p className="text-xs text-muted">{details}</p>
          </div>
          <span className="flex shrink-0 flex-wrap gap-1">
            {live ? <Badge tone="gold">Now</Badge> : null}
            {meeting.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
            {meeting.status === 'late_cancelled' ? <Badge tone="danger">Late cancellation</Badge> : null}
          </span>
        </div>
        <PendingRequestNotice meeting={meeting} timeZone={timeZone} onWithdraw={change.withdraw} className="mt-2" />
        {!cancelled ? (
          <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
            {meeting.meetingUrl && meeting.status === 'scheduled' ? (
              <a href={meeting.meetingUrl} target="_blank" rel="noreferrer"
                className={`btn-motion inline-flex min-h-11 items-center gap-1.5 rounded-card text-sm font-medium ${joinable ? 'bg-gold px-4 font-semibold text-on-gold hover:bg-gold-hover' : 'text-gold-fg'}`}>
                <span className={joinable ? '' : 'link'}>Join call</span><ArrowUpRightIcon />
              </a>
            ) : <span />}
            <ChangeButtons meeting={meeting} now={now} onChange={change.change} className="-mr-3 ml-auto" />
          </div>
        ) : null}
      </div>
      {change.dialogs}
    </li>
  );
}
