import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useViewer } from '@/app/auth';
import { Avatar } from '@/components/Avatar';
import { Alert, Badge, Button, EmptyState, PageHeader } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';
import { countdown } from '@/domain/scheduling/calendar';
import { upcomingByZonedDay } from '@/domain/scheduling/upcoming';
import { useNextMeeting, useNow } from '@/features/home/api';
import { programServiceIcon, programServiceIconStyle } from '@/features/programs/ProgramsCard';
import { JoinCall, useCoachPhoto } from '@/features/home/UpcomingMeeting';
import { clientProgramPath, SERVICE_SHORT_LABELS } from '@/lib/services';
import { schedulingError, type Meeting } from './api';
import { ChangeButtons, useMeetingChange } from './MeetingRequestControls';
import { topicLabel } from './MeetingTopic';
import { sessionMoment, sessionRange, zoneLabel } from './time';
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
              <div className="grid gap-5">
                {Array.from({ length: count }, (_, j) => (
                  <div key={j} className="border-l-2 border-line pl-4"><SkeletonText width="w-32" /><Skeleton className="mt-2 h-14" /></div>
                ))}
              </div>
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
              <ul className="grid gap-5">
                {day.sessions.map((m) => <MeetingItem key={m.id} meeting={m} timeZone={viewer.timezone} now={now} onSent={(message) => toast.show(message)} />)}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** A labelled fact in a meeting's details box, like the facts on the coach's Activity page. */
function Fact({ label, children, wide = false }: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={`min-w-0 ${wide ? 'col-span-full' : ''}`}>
      <dt className="text-[0.6875rem] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[0.8125rem]">{children}</dd>
    </div>
  );
}

/**
 * One meeting, full width behind a gold rule: the time and actions on one line, then a details box
 * with the coach, topic, programs and any request waiting. A cancelled meeting fades, with a grey
 * rule and no actions.
 */
function MeetingItem({ meeting, timeZone, now, onSent }: { meeting: Meeting; timeZone: string; now: number; onSent: (message: string) => void }) {
  const change = useMeetingChange(meeting, timeZone, onSent);
  const cancelled = meeting.status === 'cancelled' || meeting.status === 'late_cancelled';
  const pending = meeting.request?.status === 'pending' ? meeting.request : null;
  const start = Date.parse(meeting.startsAt);
  const live = !cancelled && start <= now;
  const wait = countdown(now, start);
  const coach = meeting.coachName ?? 'Your coach';
  const photo = useCoachPhoto(meeting.coachAvatarPath);
  const programs = meeting.programs.filter((p) => p.programId);
  return (
    <li className={`min-w-0 border-l-2 pl-4 ${cancelled ? 'border-line opacity-60' : 'border-gold'}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className={`font-semibold tabular-nums ${cancelled ? 'text-muted line-through' : ''}`}>{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</span>
          {live ? <Badge tone="gold">Now</Badge> : null}
          {!cancelled && !live && wait ? <span className="text-sm text-muted">In {wait.split(', ')[0]}</span> : null}
          {meeting.status === 'cancelled' ? <Badge>Cancelled</Badge> : null}
          {meeting.status === 'late_cancelled' ? <Badge tone="danger">Late cancellation</Badge> : null}
          {pending ? <Badge tone="gold">{pending.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge> : null}
        </p>
        {!cancelled ? (
          <div className="-mr-3 ml-auto flex flex-wrap items-center justify-end gap-1">
            {meeting.meetingUrl && meeting.status === 'scheduled' ? <JoinCall meeting={meeting} now={now} /> : null}
            <ChangeButtons meeting={meeting} now={now} onChange={change.change} />
          </div>
        ) : null}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-card border border-line bg-ink px-3 py-2.5 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
        <Fact label="Coach">
          <span className="flex items-center gap-1.5"><Avatar url={photo.data} name={coach} className="size-5 shrink-0" /><span className="min-w-0 truncate">{coach}</span></span>
        </Fact>
        {meeting.services.length ? <Fact label="Topic">{topicLabel(meeting.services)}</Fact> : null}
        <Fact label="Length">{meeting.durationMinutes} min</Fact>
        <Fact label="Repeats">{meeting.scheduleId ? '↻ Repeating' : 'One-off'}</Fact>
        {!cancelled && !meeting.meetingUrl ? <Fact label="Call link">Your coach will share it.</Fact> : null}
        {programs.length ? (
          <Fact label={programs.length === 1 ? 'Program' : 'Programs'} wide={programs.length > 1}>
            {/* Each program in its own box: the service's icon, then the name. */}
            <span className="mt-0.5 flex flex-wrap gap-1.5">
              {programs.map((p) => (
                <Link key={p.service} to={clientProgramPath(p.service, p.programId)} title={p.title ?? undefined}
                  className="flex min-h-9 min-w-0 max-w-full items-center gap-2 rounded-card border border-line bg-surface px-2.5 transition-colors hover:border-muted/70 hover:bg-surface-raised">
                  <span aria-hidden className={`grid size-5 shrink-0 place-items-center rounded-full [&>svg]:size-3 ${programServiceIconStyle(p.service)}`}>{programServiceIcon(p.service)}</span>
                  <span className="sr-only">{SERVICE_SHORT_LABELS[p.service]}: </span>
                  <span className="min-w-0 truncate">{p.title?.trim() || 'Untitled program'}</span>
                </Link>
              ))}
            </span>
          </Fact>
        ) : null}
        {pending && !cancelled ? (
          <Fact label="Your request" wide>
            {/* The button sits in the box's bottom-right corner. Its label is 20px from the right edge
                (12px box padding + 16px button padding - 8px) and the bottom (10px + 12px - 2px). */}
            <span className="flex flex-wrap items-end justify-between gap-x-3">
              <span className="min-w-0">
                <span className="block">
                  {pending.kind === 'cancel' ? 'Cancel this meeting' : pending.preferredStartsAt ? `Move to ${sessionMoment(pending.preferredStartsAt, timeZone)}` : 'Find another time'}
                  <span className="text-muted"> · waiting for {meeting.coachName ?? 'your coach'}</span>
                </span>
                {pending.message ? <span className="mt-0.5 line-clamp-3 block whitespace-pre-wrap text-muted">“{pending.message}”</span> : null}
              </span>
              <Button variant="ghost-gold" className="-mb-0.5 -mr-2 -mt-2 ml-auto" onClick={change.withdraw}>Withdraw request</Button>
            </span>
          </Fact>
        ) : null}
      </dl>
      {change.dialogs}
    </li>
  );
}
