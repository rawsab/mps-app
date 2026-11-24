import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useViewer } from '@/app/auth';
import { Avatar } from '@/components/Avatar';
import { Dialog } from '@/components/Dialog';
import { STRIP_ITEM, ScrollStripButtons, ScrollStripList, useScrollStrip } from '@/components/ScrollStrip';
import { ArrowUpRightIcon, CautionIcon, PencilIcon, StepIcon } from '@/components/icons';
import { useClient, useClientPhoto } from '@/features/clients/api';
import { programPath } from '@/features/programs/CurrentProgram';
import { SERVICE_SHORT_LABELS } from '@/lib/services';
import { Checkbox, SegmentedControl } from '@/components/controls';
import { Alert, Badge, Card, Button, PageHeader } from '@/components/ui';
import { LoadingRegion, SkeletonText, SkeletonHeader } from '@/components/Skeleton';
import { timeOffOn } from '@/domain/scheduling/availability';
import { meetingConflicts } from '@/domain/scheduling/conflicts';
import { CALENDAR_VIEWS, countdown, dayWindows, layoutDay, stepDate, viewDays, type CalendarView } from '@/domain/scheduling/calendar';
import { addDays, isoWeekday, weekdayShort, zonedDateTime, zonedToInstant } from '@/domain/scheduling/pattern';
import { capitalize } from '@/lib/format';
import {
  schedulingError, useAvailabilityWindows, useMeeting, useMeetingsBetween, useMeetingsNeedingAttendance, useMyAvailability, usePendingMeetingRequests,
  useRecordAttendance, type Meeting,
} from './api';
import { MeetingCardSkeleton, MeetingRowsSkeleton } from './MeetingSkeletons';
import { AvailabilityExceptions } from './AvailabilityExceptions';
import { MeetingDialogHost } from './MeetingDialogHost';
import { RecordAttendance } from './RecordAttendance';
import { topicLabel } from './MeetingTopic';
import { RequestBadge } from './RequestBadge';
import { sessionDay, sessionMoment, sessionRange, sessionTime, todayIn, zoneLabel } from './time';
import { isCancelled, useHideCancelled } from './useHideCancelled';
import { useMeetingToast } from './useMeetingToast';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const UPCOMING_COUNT = 4;
const HOUR_PX = 48;
const MONTH_CHIPS = 3;

/**
 * Opens a meeting's full dialog on this page (`?meeting=`), keeping the calendar's view and date
 * behind it. The dialog links to the client's page.
 */
function useMeetingHref() {
  const [params] = useSearchParams();
  return (id: string) => {
    const next = new URLSearchParams(params);
    next.set('meeting', id);
    return `?${next}`;
  };
}

/** Chip colours by the meeting's first service: Personal training gold, Nutrition green, Mesocycle neutral. */
function chipTone(meeting: Meeting) {
  const service = meeting.services[0];
  return service === 'personal_training' ? 'border-gold bg-gold/15' : service === 'nutrition' ? 'border-success bg-success/10' : 'border-muted bg-surface-raised';
}

/** Re-renders every 30 seconds so the countdown and the "now" line stay current. */
function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/**
 * Pending requests, upcoming meetings, and a month / week / day calendar.
 * Times are in the coach's own time zone.
 */
export function MeetingsPage() {
  const viewer = useViewer();
  if (viewer.isPending) return <LoadingRegion label="Loading meetings"><SkeletonHeader /></LoadingRegion>;
  const timeZone = viewer.data?.timezone ?? 'UTC';
  return <MeetingsPageBody timeZone={timeZone} />;
}

function MeetingsPageBody({ timeZone }: { timeZone: string }) {
  const [params, setParams] = useSearchParams();
  const openMeeting = params.get('meeting');
  const [notice, setNotice] = useState<ReactNode>('');
  const toast = useMeetingToast();
  const closeMeeting = () => setParams((p) => { p.delete('meeting'); return p; }, { replace: true });
  return (
    <div className="grid gap-8">
      <PageHeader title="Meetings" subtitle={`All your clients’ meetings. Times in ${zoneLabel(timeZone)}.`} />
      <Alert visible={!!notice} tone="success" onDismiss={() => setNotice('')} className="-mb-4">{notice}</Alert>
      {toast.element}
      {/* One grid cell, so the to-dos' spacing folds away with them. */}
      <div className="min-w-0">
        <AtAGlance timeZone={timeZone} />
        <MeetingTodos timeZone={timeZone} />
        <MeetingConflicts timeZone={timeZone} />
      </div>
      <MeetingCalendar timeZone={timeZone} />
      <AvailabilityExceptions timeZone={timeZone} onSaved={(message) => toast.show(message)} />
      {openMeeting ? (
        <MeetingDialogHost key={openMeeting} meetingId={openMeeting} onClose={closeMeeting}
          onSaved={(message, options) => { closeMeeting(); if (options?.toast) toast.show(message, options); else setNotice(message); }} />
      ) : null}
    </div>
  );
}

type PendingRequest = NonNullable<ReturnType<typeof usePendingMeetingRequests>['data']>[number];

/**
 * To-dos (pending reschedule and cancellation requests) beside Record attendance (decision 0048),
 * paired like Next meeting and Upcoming. A side with nothing in it gives the other the full width;
 * with neither, the row folds away and the calendar moves up.
 */
function MeetingTodos({ timeZone }: { timeZone: string }) {
  const requests = usePendingMeetingRequests();
  const attendance = useMeetingsNeedingAttendance();
  const meetingHref = useMeetingHref();
  // Whether Record attendance has anything left on screen. It says so itself once a recorded row has
  // faded and slid away, so the section folds only after that. Until then, the server's list decides.
  const [attendanceEmpty, setAttendanceEmpty] = useState<boolean | null>(null);
  const hasRequests = !!requests.data?.length;
  const noAttendance = attendanceEmpty ?? !attendance.data?.length;
  const both = hasRequests && !noAttendance;
  const empty = !hasRequests && noAttendance;

  if (requests.error) return <Alert className="mt-8" title="Could not load meeting requests">{schedulingError(requests.error)}</Alert>;
  if (attendance.error) return <Alert className="mt-8" title="Could not load meetings that need attendance">{schedulingError(attendance.error)}</Alert>;
  // Nothing until both answer, so an empty row never flashes in; it mounts already in place.
  if (!requests.data || !attendance.data) return null;
  return (
    <div className="collapsible" data-collapsed={empty || undefined} inert={empty}>
      <div className="min-h-0 min-w-0 overflow-hidden">
        {/* No row gap: stacked, Record attendance carries its own top spacing, so it folds away with it. */}
        <div className={`mt-8 grid border-t border-line pt-3 lg:gap-x-9 ${both ? 'lg:grid-cols-2' : ''}`}>
          {hasRequests ? <MeetingRequests requests={requests.data} timeZone={timeZone} /> : null}
          {/*
            Always mounted, so its Undo notice outlives the last row. When it empties it folds away
            smoothly (.collapsible), like the to-dos row, and comes back the same way on Undo.
          */}
          <div className="collapsible min-w-0" data-collapsed={noAttendance || undefined} inert={noAttendance}>
            <div className="min-h-0 min-w-0 overflow-hidden">
              {/* Fills the stretched column, so the divider runs the height of the taller side. */}
              <div className={hasRequests ? 'mt-6 border-t border-line pt-4 lg:mt-0 lg:h-full lg:border-l lg:border-t-0 lg:pl-9 lg:pt-0' : ''}>
                <RecordAttendance meetings={attendance.data} timeZone={timeZone} meetingHref={meetingHref} onEmptyChange={setAttendanceEmpty} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Pending reschedule and cancellation requests, soonest meeting first: one sideways strip of cards
 * with ‹ ›, like the Clients page's service requests. Cards open the meeting.
 */
function MeetingRequests({ requests, timeZone }: { requests: PendingRequest[]; timeZone: string }) {
  const meetingHref = useMeetingHref();
  const strip = useScrollStrip(requests.length);
  return (
    <section aria-labelledby="meeting-todos" className="min-w-0">
      <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
        <h2 id="meeting-todos" className="text-xs font-medium text-muted">
          To-dos<span className="ml-2 text-gold-fg">{requests.length} waiting</span>
        </h2>
        <ScrollStripButtons strip={strip} backLabel="Show earlier requests" forwardLabel="Show more requests" />
      </div>
      <ScrollStripList strip={strip}>
        {requests.map((meeting) => {
          const { request } = meeting;
          return (
            <li key={request.id} className={STRIP_ITEM}>
              <Link to={meetingHref(meeting.id)}
                className="row-link group flex w-full min-w-0 items-start gap-3 rounded-card border border-line px-4 py-3.5 transition-colors hover:bg-surface-raised">
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="min-w-0 truncate text-sm font-medium text-text">{meeting.clientName}</span>
                    <Badge tone="gold">{request.kind === 'reschedule' ? 'Reschedule request' : 'Cancellation request'}</Badge>
                  </span>
                  <span className="mt-1 block text-xs text-muted">{sessionMoment(meeting.startsAt, timeZone)} · {topicLabel(meeting.services)}</span>
                  {request.preferredStartsAt ? <span className="mt-0.5 block text-xs text-muted">Prefers {sessionMoment(request.preferredStartsAt, timeZone)}</span> : null}
                  {request.message.trim() ? <span className="mt-2.5 line-clamp-2 break-words text-xs leading-relaxed text-muted">“{request.message}”</span> : null}
                </span>
                <span aria-hidden className="pt-0.5 text-xs text-muted group-hover:text-text">→</span>
              </Link>
            </li>
          );
        })}
      </ScrollStripList>
    </section>
  );
}

/**
 * The next 100 days of meetings, from the start of the current hour, so every visit within the hour
 * shares one cached query and the page opens on the last answer while it refreshes. Meetings that
 * started earlier still overlap. At a glance and Conflicts share it.
 */
function useComingMeetings() {
  const [from] = useState(() => new Date(Math.floor(Date.now() / HOUR_MS) * HOUR_MS));
  const range = useMemo(() => ({ from, to: new Date(from.getTime() + 100 * DAY_MS) }), [from]);
  return useMeetingsBetween(range.from, range.to);
}

/**
 * Overlapping meetings for the same coach in the next 100 days (decision 0063), one card per
 * conflict with each meeting linking to its dialog. Hidden when there are none.
 */
function MeetingConflicts({ timeZone }: { timeZone: string }) {
  const now = useNow();
  const meetings = useComingMeetings();
  const meetingHref = useMeetingHref();
  const conflicts = useMemo(() => meetingConflicts(meetings.data ?? [], now), [meetings.data, now]);
  // Coach names matter only when the list spans coaches, as it can for an administrator.
  const coaches = new Set(conflicts.map((conflict) => conflict.coachId)).size;
  if (!conflicts.length) return null;
  return (
    <section aria-labelledby="meeting-conflicts" className="mt-8 min-w-0 border-t border-line pt-3">
      <h2 id="meeting-conflicts" className="mb-2 flex items-center gap-2 text-xs font-medium text-muted">
        <span className="text-danger"><CautionIcon /></span>Conflicts
        <span className="text-danger">{conflicts.length} {conflicts.length === 1 ? 'overlap' : 'overlaps'}</span>
      </h2>
      <p className="mb-3 text-xs text-muted">Meetings with the same coach at the same time, in the next 100 days. Move or cancel one to clear it.</p>
      <ul className="grid gap-3 md:grid-cols-2">
        {conflicts.map((conflict) => (
          <li key={conflict.meetings.map((m) => m.id).join(':')} className="min-w-0 rounded-card border border-danger/40 px-4 py-3">
            <p className="text-sm font-medium">
              {sessionDay(conflict.startsAt, timeZone)} · <span className="tabular-nums">{sessionRange(conflict.startsAt, (new Date(conflict.endsAt).getTime() - new Date(conflict.startsAt).getTime()) / 60_000, timeZone)}</span>
            </p>
            {coaches > 1 && conflict.coachName ? <p className="text-xs text-muted">With {conflict.coachName}</p> : null}
            <ul className="mt-2">
              {conflict.meetings.map((meeting) => (
                <li key={meeting.id}>
                  <Link to={meetingHref(meeting.id)} className="row-link group -mx-2 flex min-h-11 min-w-0 items-center gap-3 rounded-card px-2 py-1.5 hover:bg-surface-raised">
                    <span className="w-28 shrink-0 text-sm tabular-nums text-muted">{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{meeting.clientName}</span>
                      <span className="block truncate text-xs text-muted">{meeting.durationMinutes} min · {topicLabel(meeting.services)}</span>
                    </span>
                    <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AtAGlance({ timeZone }: { timeZone: string }) {
  const now = useNow();
  const meetings = useComingMeetings();
  const meetingHref = useMeetingHref();
  const scheduled = (meetings.data ?? []).filter((m) => m.status === 'scheduled');
  const running = scheduled.find((m) => new Date(m.startsAt).getTime() <= now && new Date(m.startsAt).getTime() + m.durationMinutes * 60_000 > now);
  const ahead = scheduled.filter((m) => new Date(m.startsAt).getTime() > now);
  const next = ahead[0];
  const wait = next ? countdown(now, new Date(next.startsAt).getTime()) : null;
  const today = zonedDateTime(new Date(now), timeZone).date;
  const moreToday = ahead.slice(UPCOMING_COUNT).filter((m) => zonedDateTime(m.startsAt, timeZone).date === today).length;

  return (
    <div className="grid gap-6 md:grid-cols-2 md:gap-9">
      <section aria-labelledby="next-meeting" className="min-w-0">
        <h2 id="next-meeting" className="mb-2 text-xs font-medium text-muted">Next meeting</h2>
        {meetings.isPending ? (
          <LoadingRegion label="Loading meetings">
            <SkeletonText size="xl" width="w-44" className="mb-3" />
            <MeetingCardSkeleton actions={2} />
          </LoadingRegion>
        ) : null}
        <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
        {running ? (
          <div role="status" aria-live="polite">
            <p className="text-2xl font-semibold leading-tight text-text">Join meeting with {running.clientName}</p>
            <NextMeetingCard meeting={running} timeZone={timeZone} />
          </div>
        ) : null}
        {meetings.data && next && !running ? (
          <div role="status" aria-live="polite">
            <p className="text-2xl font-semibold leading-tight text-text">{wait === 'less than a minute' ? 'In less than a minute' : `In ${wait}`}</p>
            <NextMeetingCard meeting={next} timeZone={timeZone} />
          </div>
        ) : null}
        {meetings.data && !next ? <p className="text-sm text-muted">No meetings scheduled in the next 100 days.</p> : null}
      </section>
      <section aria-labelledby="upcoming-meetings" className="min-w-0 border-t border-line pt-4 md:border-l md:border-t-0 md:pl-9 md:pt-0">
        <h2 id="upcoming-meetings" className="mb-2 text-xs font-medium text-muted">Upcoming</h2>
        {meetings.isPending ? <LoadingRegion label="Loading upcoming meetings"><MeetingRowsSkeleton count={UPCOMING_COUNT} /></LoadingRegion> : null}
        {meetings.data && ahead.length === 0 ? <p className="text-sm text-muted">Nothing upcoming.</p> : null}
        <ul>
          {ahead.slice(0, UPCOMING_COUNT).map((meeting) => (
            <li key={meeting.id}>
              <Link to={meetingHref(meeting.id)} className="row-link group flex min-h-11 min-w-0 items-center gap-3 rounded-card py-2 pl-2 pr-2 hover:bg-surface-raised">
                <span aria-hidden className="w-1 shrink-0 self-stretch rounded-full bg-gold" />
                <span className="w-24 shrink-0 text-sm">
                  <span className="block font-medium">{sessionDay(meeting.startsAt, timeZone)}</span>
                  <span className="block tabular-nums text-muted">{sessionTime(meeting.startsAt, timeZone)}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{meeting.clientName}</span>
                  <span className="block truncate text-xs text-muted">{meeting.durationMinutes} min · {topicLabel(meeting.services)}</span>
                </span>
                <RequestBadge request={meeting.request} />
                <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
              </Link>
            </li>
          ))}
        </ul>
        {moreToday > 0 ? <p className="mt-1 pl-2 text-xs text-muted">+{moreToday} more {moreToday === 1 ? 'meeting' : 'meetings'} today</p> : null}
      </section>
    </div>
  );
}

const MEETING_STATUS: Record<Meeting['status'], { label: string; tone: 'neutral' | 'gold' | 'danger' | 'success' } | null> = {
  scheduled: null,
  completed: { label: 'Attended', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
  late_cancelled: { label: 'Late cancellation', tone: 'danger' },
  no_show: { label: 'No-show', tone: 'danger' },
};

/** Who, when, what a meeting is about, and its programs; shared by the next-meeting card and the calendar preview. */
function MeetingSummary({ meeting, timeZone }: { meeting: Meeting; timeZone: string }) {
  const client = useClient(meeting.clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
  const programs = meeting.programs.filter((p) => p.programId);
  const notes = [meeting.patternNotes, meeting.notes].filter(Boolean).join('\n\n');
  const status = MEETING_STATUS[meeting.status];
  return (
    <>
      <div className="flex items-start gap-3">
        <Link to={`/coach/clients/${meeting.clientId}`} aria-label={`Open ${meeting.clientName}`} className="shrink-0">
          <Avatar url={photo.data} name={meeting.clientName} className="size-12" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/coach/clients/${meeting.clientId}`} className="font-semibold text-text hover:text-gold-fg">{meeting.clientName}</Link>
          <p className={`text-sm ${status && meeting.status !== 'completed' ? 'text-muted line-through' : ''}`}>{sessionDay(meeting.startsAt, timeZone)} · {sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</p>
          <p className="mt-0.5 text-xs text-muted">
            {[`${meeting.durationMinutes} min`, topicLabel(meeting.services), meeting.scheduleId ? '↻ Repeating' : 'One-off', meeting.billable ? '' : 'Not billed'].filter(Boolean).join(' · ')}
          </p>
        </div>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {status ? <Badge tone={status.tone}>{status.label}</Badge> : null}
          {meeting.request?.status === 'pending' ? <Badge tone="gold">{meeting.request.kind === 'cancel' ? 'Cancellation requested' : 'Reschedule requested'}</Badge> : null}
        </span>
      </div>
      {programs.length ? (
        <ul className="mt-3 grid gap-1.5">
          {programs.map((p) => (
            <li key={p.service}>
              <Link to={programPath(meeting.clientId, { id: p.programId!, service: p.service })} title={p.title ?? undefined}
                className="group flex min-h-10 min-w-0 items-center gap-2 rounded-card border border-line px-3 text-sm transition-colors hover:border-muted/70 hover:bg-surface-raised">
                <span className="shrink-0 text-xs text-muted">{SERVICE_SHORT_LABELS[p.service]}</span>
                <span className="min-w-0 flex-1 truncate">{p.title?.trim() || 'Untitled program'}</span>
                <span className="text-muted group-hover:text-text"><ArrowUpRightIcon /></span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {meeting.cancellationReason ? <p className="mt-3 text-sm text-muted">Cancelled: “{meeting.cancellationReason}”</p> : null}
      {notes ? <p className="mt-3 line-clamp-3 whitespace-pre-wrap break-words text-sm text-muted">{notes}</p> : null}
    </>
  );
}

const joinCall = (meeting: Meeting) => meeting.meetingUrl ? (
  <a href={meeting.meetingUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-card px-4 text-sm font-medium text-gold-fg hover:bg-surface-raised">Join call<ArrowUpRightIcon /></a>
) : null;

/** The next meeting in detail, with links to the meeting, the client page and the call. */

function NextMeetingCard({ meeting, timeZone }: { meeting: Meeting; timeZone: string }) {
  const meetingHref = useMeetingHref();
  return (
    <Card as="div" padding="sm" className="mt-3">
      <MeetingSummary meeting={meeting} timeZone={timeZone} />
      <div className="mt-3 flex flex-wrap gap-2">
        <Link to={meetingHref(meeting.id)} className="inline-flex min-h-11 items-center rounded-card border border-line bg-surface-raised px-4 text-sm font-medium hover:border-muted/70">Open meeting</Link>
        <Link to={`/coach/clients/${meeting.clientId}`} className="inline-flex min-h-11 items-center rounded-card px-4 text-sm font-medium text-muted hover:bg-surface-raised hover:text-text">Client page</Link>
        {joinCall(meeting)}
      </div>
    </Card>
  );
}

/**
 * A calendar meeting's preview. Once a meeting has started without attendance, it can be marked
 * Completed or No-show here (decision 0047); everything else happens in the full meeting dialog,
 * which opens on this page.
 */
function MeetingPreviewDialog({ meeting: snapshot, timeZone, onClose }: { meeting: Meeting; timeZone: string; onClose: () => void }) {
  // The live meeting, so the status updates in place after recording attendance.
  const live = useMeeting(snapshot.id);
  const meeting = live.data ?? snapshot;
  const record = useRecordAttendance();
  const meetingHref = useMeetingHref();
  const canRecord = meeting.status === 'scheduled' && new Date(meeting.startsAt).getTime() <= Date.now() && meeting.request?.status !== 'pending';
  return (
    <Dialog title="Meeting" onClose={() => { if (!record.isPending) onClose(); }} footer={<>
      {joinCall(meeting)}
      {canRecord ? <>
        <Button variant="secondary" className="text-danger!" busy={record.isPending && record.variables?.status === 'no_show'} disabled={record.isPending}
          onClick={() => record.mutate({ id: meeting.id, status: 'no_show' })}>No-Show</Button>
        <Button variant="secondary" busy={record.isPending && record.variables?.status === 'completed'} disabled={record.isPending}
          onClick={() => record.mutate({ id: meeting.id, status: 'completed' })}>Mark Completed</Button>
      </> : null}
      <Link to={meetingHref(meeting.id)} onClick={onClose} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-card bg-gold px-4 text-sm font-semibold text-on-gold hover:bg-gold-hover"><PencilIcon />Edit meeting</Link>
    </>}>
      <div className="grid gap-3 p-4 sm:p-5">
        <MeetingSummary meeting={meeting} timeZone={timeZone} />
        <Alert visible={!!record.error} title="Not recorded">{schedulingError(record.error)}</Alert>
      </div>
    </Dialog>
  );
}

function MeetingCalendar({ timeZone }: { timeZone: string }) {
  const now = useNow();
  const today = todayIn(timeZone);
  // View and date live in the URL so reloads and back/forward keep the place.
  const [params, setParams] = useSearchParams();
  const view: CalendarView = CALENDAR_VIEWS.includes(params.get('view') as CalendarView) ? params.get('view') as CalendarView
    : typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches ? 'day' : 'week';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(params.get('date') ?? '') ? params.get('date')! : today;
  const go = (next: { view?: CalendarView; date?: string }) =>
    setParams((p) => { p.set('view', next.view ?? view); p.set('date', next.date ?? date); return p; }, { replace: true });
  const [hideCancelled, setHideCancelled] = useHideCancelled();
  const [preview, setPreview] = useState<Meeting | null>(null);

  const days = viewDays(view, date);
  const range = useMemo(() => ({
    from: zonedToInstant(days[0]!, '00:00', timeZone),
    to: zonedToInstant(addDays(days.at(-1)!, 1), '00:00', timeZone),
  }), [days[0], days.at(-1), timeZone]);
  const meetings = useMeetingsBetween(range.from, range.to);
  // Shade time outside the coach's availability (decision 0050), once they have set any.
  const availability = useMyAvailability();
  const windows = useAvailabilityWindows(range.from, range.to);
  const shade = !!availability.data && (availability.data.hours.length > 0 || availability.data.exceptions.some((x) => x.kind === 'extra_hours'));
  const available = useMemo(() => shade && windows.data ? new Map(days.map((day) => [day, dayWindows(windows.data, day, timeZone)])) : null,
    [shade, windows.data, days.join(), timeZone]);
  const timeOff = useMemo(() => new Set(days.filter((day) => timeOffOn(availability.data?.exceptions ?? [], day, timeZone))),
    [availability.data, days.join(), timeZone]);
  const visible = (meetings.data ?? []).filter((m) => !hideCancelled || !isCancelled(m));
  const byDay = useMemo(() => {
    const map = new Map<string, Meeting[]>();
    for (const meeting of visible) {
      const day = zonedDateTime(meeting.startsAt, timeZone).date;
      map.set(day, [...(map.get(day) ?? []), meeting]);
    }
    return map;
  }, [visible, timeZone]);

  const title = view === 'month'
    ? new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`))
    : view === 'week'
      ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).formatRange(new Date(`${days[0]}T00:00:00Z`), new Date(`${days[6]}T00:00:00Z`))
      : new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`));

  return (
    <section aria-labelledby="meeting-calendar" className="min-w-0">
      <h2 id="meeting-calendar" className="sr-only">Calendar</h2>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" onClick={() => go({ date: today })}>Today</Button>
        <div className="flex">
          <Button variant="ghost" aria-label={`Previous ${view}`} className="px-1.5!" onClick={() => go({ date: stepDate(view, date, -1) })}><StepIcon direction="previous" /></Button>
          <Button variant="ghost" aria-label={`Next ${view}`} className="px-1.5!" onClick={() => go({ date: stepDate(view, date, 1) })}><StepIcon direction="next" /></Button>
        </div>
        {/* On phones the title moves above the view switcher so it stays on one line. */}
        <p className="hidden min-w-0 flex-1 text-lg font-semibold sm:block" aria-live="polite">{title}</p>
        <Checkbox className="sm:mr-4" label="Hide cancelled" checked={hideCancelled} onChange={(event) => setHideCancelled(event.target.checked)} />
        <div className="flex w-full flex-col gap-1 sm:w-auto">
          <p className="text-lg font-semibold sm:hidden" aria-live="polite">{title}</p>
          <SegmentedControl label="Calendar view" size="md" optionClassName="flex-1 sm:flex-none" value={view} onChange={(option) => go({ view: option })}
            options={CALENDAR_VIEWS.map((option) => ({ value: option, label: capitalize(option) }))} />
        </div>
      </div>
      <Alert visible={!!meetings.error} className="mb-3" title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {view === 'month'
        ? <MonthGrid days={days} month={date.slice(0, 7)} today={today} byDay={byDay} timeOff={timeOff} timeZone={timeZone} onDay={(day) => go({ view: 'day', date: day })} onMeeting={setPreview} />
        : <TimeGrid days={days} today={today} byDay={byDay} available={available} timeZone={timeZone} now={now} onDay={(day) => go({ view: 'day', date: day })} onMeeting={setPreview} />}
      {available && view !== 'month' ? (
        <p className="mt-2 text-xs text-muted">Striped times are outside your availability. Change your week in <Link to="/coach/profile" className="text-gold-fg underline underline-offset-2">Profile settings</Link>.</p>
      ) : null}
      {preview ? <MeetingPreviewDialog meeting={preview} timeZone={timeZone} onClose={() => setPreview(null)} /> : null}
      {/* The grid shows empty days while the first load runs; this only tells screen readers. */}
      {meetings.isFetching && !meetings.data ? <p role="status" className="sr-only">Loading meetings</p> : null}
    </section>
  );
}

function MonthGrid({ days, month, today, byDay, timeOff, timeZone, onDay, onMeeting }: {
  days: string[]; month: string; today: string; byDay: Map<string, Meeting[]>; timeOff: Set<string>; timeZone: string; onDay: (day: string) => void; onMeeting: (meeting: Meeting) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="grid grid-cols-7 border-b border-line bg-surface text-center text-xs text-muted">
        {[1, 2, 3, 4, 5, 6, 7].map((weekday) => <div key={weekday} className="py-2">{weekdayShort(weekday)}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const items = byDay.get(day) ?? [];
          const outside = day.slice(0, 7) !== month;
          return (
            <div key={day} className={`min-h-20 min-w-0 border-line p-1 sm:min-h-28 ${index % 7 ? 'border-l' : ''} ${index >= 7 ? 'border-t' : ''} ${outside ? 'bg-ink/40' : ''}`}>
              <button type="button" onClick={() => onDay(day)} aria-label={`Open ${day}`}
                className={`mb-1 grid size-7 place-items-center rounded-full text-xs tabular-nums hover:bg-surface-raised ${day === today ? 'bg-gold font-semibold text-on-gold hover:bg-gold-hover' : outside ? 'text-muted' : ''}`}>
                {Number(day.slice(8))}
              </button>
              {timeOff.has(day) ? <p className="mb-0.5 truncate px-1 text-[11px] text-muted">Time off</p> : null}
              <ul className="grid gap-0.5">
                {items.slice(0, MONTH_CHIPS).map((meeting) => (
                  <li key={meeting.id}>
                    <button type="button" onClick={() => onMeeting(meeting)} title={`${sessionTime(meeting.startsAt, timeZone)} ${meeting.clientName} · ${topicLabel(meeting.services)}`}
                      className={`block w-full truncate text-left rounded-[4px] border-l-2 px-1 py-0.5 text-[11px] leading-tight hover:brightness-110 ${chipTone(meeting)} ${isCancelled(meeting) ? 'text-muted line-through' : ''}`}>
                      <span className="hidden tabular-nums text-muted sm:inline">{sessionTime(meeting.startsAt, timeZone)} </span>{meeting.clientName}
                    </button>
                  </li>
                ))}
              </ul>
              {items.length > MONTH_CHIPS ? (
                <button type="button" onClick={() => onDay(day)} className="mt-0.5 px-1 text-[11px] text-muted hover:text-text">+{items.length - MONTH_CHIPS} more</button>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Week and day views: a 24-hour grid, meetings placed by start and length, overlaps side by side. */
function TimeGrid({ days, today, byDay, available, timeZone, now, onDay, onMeeting }: {
  days: string[]; today: string; byDay: Map<string, Meeting[]>; available: Map<string, { start: number; end: number }[]> | null; timeZone: string; now: number; onDay: (day: string) => void; onMeeting: (meeting: Meeting) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const nowAt = zonedDateTime(new Date(now), timeZone);
  const nowMinutes = Number(nowAt.time.slice(0, 2)) * 60 + Number(nowAt.time.slice(3, 5));
  const columns = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;
  const hourLabel = (hour: number) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', timeZone: 'UTC' }).format(new Date(Date.UTC(2000, 0, 1, hour)));

  // Open near the current time when today is shown, else at 7 AM.
  useEffect(() => {
    const hour = days.includes(today) ? Math.max(0, Math.floor(nowMinutes / 60) - 1) : 7;
    scroller.current?.scrollTo({ top: hour * HOUR_PX });
  }, [days.join(), today]);

  return (
    <div className="overflow-hidden rounded-card border border-line">
      <div className="grid border-b border-line bg-surface" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((day) => (
          <button key={day} type="button" onClick={() => onDay(day)} className="min-w-0 border-l border-line px-1 py-2 text-center hover:bg-surface-raised">
            <span className="block text-xs text-muted">{weekdayShort(isoWeekday(day))}</span>
            <span className={`mx-auto mt-0.5 grid size-7 place-items-center rounded-full text-sm tabular-nums ${day === today ? 'bg-gold font-semibold text-on-gold' : ''}`}>{Number(day.slice(8))}</span>
          </button>
        ))}
      </div>
      <div ref={scroller} className="max-h-[70vh] overflow-y-auto">
        <div className="grid" style={{ gridTemplateColumns: columns }}>
          <div className="relative" style={{ height: 24 * HOUR_PX }}>
            {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
              <span key={hour} className="absolute right-1.5 -translate-y-1/2 text-[11px] text-muted" style={{ top: hour * HOUR_PX }}>{hourLabel(hour)}</span>
            ))}
          </div>
          {days.map((day) => {
            const items = byDay.get(day) ?? [];
            const placed = items.map((meeting) => {
              const start = zonedDateTime(meeting.startsAt, timeZone);
              const startMin = Number(start.time.slice(0, 2)) * 60 + Number(start.time.slice(3, 5));
              return { meeting, start: startMin, end: Math.min(24 * 60, startMin + meeting.durationMinutes) };
            });
            const lanes = layoutDay(placed.map((p) => ({ id: p.meeting.id, start: p.start, end: p.end })));
            return (
              <div key={day} className={`relative border-l border-line ${available ? 'calendar-unavailable' : ''}`} style={{ height: 24 * HOUR_PX }}>
                {/* Open time shows the page background; the rest stays shaded. */}
                {available?.get(day)?.map((window) => (
                  <div key={window.start} aria-hidden className="absolute inset-x-0 bg-ink"
                    style={{ top: (window.start / 60) * HOUR_PX, height: ((window.end - window.start) / 60) * HOUR_PX }} />
                ))}
                {Array.from({ length: 23 }, (_, i) => i + 1).map((hour) => (
                  <div key={hour} aria-hidden className="absolute inset-x-0 border-t border-line/60" style={{ top: hour * HOUR_PX }} />
                ))}
                {placed.map(({ meeting, start, end }) => {
                  const lane = lanes.get(meeting.id) ?? { lane: 0, lanes: 1 };
                  return (
                    // Opaque page-coloured backing, so the translucent block hides unavailable stripes behind it.
                    <div key={meeting.id} className="absolute rounded-inner bg-ink hover:z-10"
                      style={{
                        top: (start / 60) * HOUR_PX + 1,
                        height: Math.max(((end - start) / 60) * HOUR_PX - 2, 18),
                        left: `calc(${(lane.lane / lane.lanes) * 100}% + 2px)`,
                        width: `calc(${100 / lane.lanes}% - 4px)`,
                      }}>
                      <button type="button" onClick={() => onMeeting(meeting)}
                        title={`${sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)} · ${meeting.clientName} · ${topicLabel(meeting.services)}`}
                        className={`block size-full overflow-hidden rounded-inner border-l-[3px] px-1.5 text-left py-0.5 text-[11px] leading-tight hover:brightness-110 ${chipTone(meeting)} ${isCancelled(meeting) ? 'opacity-60' : ''}`}>
                        <span className={`block truncate font-medium ${isCancelled(meeting) ? 'line-through' : ''}`}>{meeting.clientName}</span>
                        <span className="block truncate text-muted">{sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)}</span>
                        {days.length === 1 ? <span className="block truncate text-muted">{topicLabel(meeting.services)}</span> : null}
                      </button>
                    </div>
                  );
                })}
                {day === today ? (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-20 border-t-2 border-danger" style={{ top: (nowMinutes / 60) * HOUR_PX }}>
                    <span className="absolute -left-1 -top-[5px] size-2 rounded-full bg-danger" />
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
