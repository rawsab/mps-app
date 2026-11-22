import { useMemo } from 'react';
import { useViewer } from '@/app/auth';
import { Avatar } from '@/components/Avatar';
import { Alert, Badge, Card, EmptyState, PageHeader } from '@/components/ui';
import { LoadingRegion, SkeletonText } from '@/components/Skeleton';
import { countdown } from '@/domain/scheduling/calendar';
import { upcomingByZonedDay } from '@/domain/scheduling/upcoming';
import { useNextMeeting, useNow } from '@/features/home/api';
import { JoinCall, MeetingProgramLinks, useCoachPhoto } from '@/features/home/UpcomingMeeting';
import { schedulingError, type Meeting } from './api';
import { ChangeButtons, PendingRequestNotice, useMeetingChange } from './MeetingRequestControls';
import { MeetingCardSkeleton } from './MeetingSkeletons';
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
          {[2, 1].map((count, i) => (
            <div key={i}>
              <SkeletonText size="base" width="w-36" className="mb-3" />
              <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: count }, (_, j) => <MeetingCardSkeleton key={j} actions={2} />)}</div>
            </div>
          ))}
        </LoadingRegion>
      ) : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && !days.length ? <EmptyState title="No upcoming meetings">Your coach will add them here.</EmptyState> : null}
      {days.length ? (
        <div className="grid gap-7">
          {days.map((day) => (
            <section key={day.date} aria-labelledby={`day-${day.date}`}>
              <h2 id={`day-${day.date}`} className="mb-3 text-base font-semibold">
                {day.offset === 0 ? 'Today' : day.offset === 1 ? 'Tomorrow' : dayName(day.date)}
                {day.offset === 0 || day.offset === 1 ? <span className="font-normal text-muted"> · {dayName(day.date)}</span> : null}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {day.sessions.map((m) => <MeetingCard key={m.id} meeting={m} timeZone={viewer.timezone} now={now} onSent={(message) => toast.show(message)} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/**
 * One meeting as a card: when, then who and what, then any request waiting, with the actions in a
 * footer. A cancelled meeting keeps only its time, details and status, faded.
 */
function MeetingCard({ meeting, timeZone, now, onSent }: { meeting: Meeting; timeZone: string; now: number; onSent: (message: string) => void }) {
  const change = useMeetingChange(meeting, timeZone, onSent);
  const cancelled = meeting.status === 'cancelled' || meeting.status === 'late_cancelled';
  const start = Date.parse(meeting.startsAt);
  const live = !cancelled && start <= now;
  const wait = countdown(now, start);
  const coach = meeting.coachName ?? 'Your coach';
  const photo = useCoachPhoto(meeting.coachAvatarPath);
  return (
    <li className="min-w-0">
      <Card as="div" padding="none" fill={cancelled ? 'page' : 'surface'} className="flex h-full flex-col">
        {/* When: the time leads, with its status or how long until it starts. */}
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <div className="min-w-0">
            <p className={`text-lg font-semibold tabular-nums ${cancelled ? 'text-muted line-through' : ''}`}>{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</p>
            <p className="text-xs text-muted">{meeting.durationMinutes} min · {meeting.scheduleId ? '↻ Repeating' : 'One-off'}</p>
          </div>
          <span className="flex shrink-0 flex-wrap justify-end gap-1 pt-1">
            {meeting.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
            {meeting.status === 'late_cancelled' ? <Badge tone="danger">Late cancellation</Badge> : null}
            {live ? <Badge tone="gold">Now</Badge> : null}
            {!cancelled && !live && wait ? <span className="text-xs text-muted">In {wait.split(', ')[0]}</span> : null}
          </span>
        </div>
        {/* Who and what. */}
        <div className={`flex items-center gap-3 px-4 pt-3 ${cancelled ? 'pb-4 opacity-70' : ''}`}>
          <Avatar url={photo.data} name={coach} className="size-9 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{coach}</p>
            <p className="truncate text-xs text-muted">{topicLabel(meeting.services)}</p>
          </div>
        </div>
        {!cancelled ? (
          <>
            <MeetingProgramLinks meeting={meeting} className="px-4 pt-3" />
            <PendingRequestNotice meeting={meeting} timeZone={timeZone} onWithdraw={change.withdraw} className="mx-4 mt-3" />
            {/* Actions sit at the bottom, so cards in a row line up. */}
            <div className="mt-auto pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-2.5">
                <JoinCall meeting={meeting} now={now} />
                <ChangeButtons meeting={meeting} now={now} onChange={change.change} className="-mr-3 ml-auto" />
              </div>
            </div>
          </>
        ) : null}
      </Card>
      {change.dialogs}
    </li>
  );
}
