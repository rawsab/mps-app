import { useMemo, useState } from 'react';
import { useViewer } from '@/app/auth';
import { ColumnTrend } from '@/components/ColumnTrend';
import { Dialog, DialogBody } from '@/components/Dialog';
import { CalendarIcon, HistoryIcon, ProgramIcon, ProgressIcon } from '@/components/icons';
import { Alert, Badge, Button, PageHeader, SectionHeading, Spinner } from '@/components/ui';
import { isPtSession, ptOutcome, ptStats, type PtOutcome } from '@/domain/scheduling/ptStats';
import { useNow } from '@/features/home/api';
import { UpcomingMeeting } from '@/features/home/UpcomingMeeting';
import { schedulingError, useAllPastMeetings, useClientMeetings, type Meeting } from '@/features/scheduling/api';
import { MeetingRow } from '@/features/scheduling/MeetingsCard';
import { ResourceList } from '@/features/scheduling/MeetingRecord';
import { sessionDay, sessionRange } from '@/features/scheduling/time';
import { trainingErrorMessage, usePublishedPrograms } from '@/features/training/api';
import { PublishedProgramRow } from '@/features/training/TrainingPages';

// The client's Personal training dashboard (decision 0052), laid out like Home.

const UPCOMING_DAYS = 28;
const HISTORY_STEP = 10;

export function PersonalTrainingPage() {
  const viewer = useViewer().data!;
  const now = useNow();
  const clientId = viewer.client?.id;
  const past = useAllPastMeetings(clientId);
  const sessions = useMemo(() => past.data?.filter(isPtSession), [past.data]);
  const [open, setOpen] = useState<Meeting | null>(null);

  return (
    <div className="grid gap-8">
      <PageHeader title="Personal training" />
      <YourProgram />
      <div className="grid gap-6 md:grid-cols-2 md:gap-9">
        <UpcomingMeeting timeZone={viewer.timezone} now={now} service="personal_training" title="Next session" />
        {clientId ? <Upcoming clientId={clientId} timeZone={viewer.timezone} now={now} onOpen={setOpen}
          className="border-t border-line pt-6 md:border-l md:border-t-0 md:pl-9 md:pt-0" /> : null}
      </div>
      <PtProgress sessions={sessions} isPending={past.isPending} error={past.error} timeZone={viewer.timezone} now={now} />
      <History sessions={sessions} isPending={past.isPending} error={past.error} timeZone={viewer.timezone} now={now} onOpen={setOpen} />
      {open ? <SessionDialog meeting={open} timeZone={viewer.timezone} now={now} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** The current PT program first, then any other published PT programs, in the Mesocycle list's rows. */
function YourProgram() {
  const programs = usePublishedPrograms();
  const pt = programs.data?.filter((p) => p.service === 'personal_training') ?? [];
  const current = pt.find((p) => p.isCurrent);
  const others = pt.filter((p) => p !== current);
  return (
    <section aria-labelledby="pt-program" className="min-w-0">
      <SectionHeading id="pt-program" icon={<ProgramIcon />} className="mb-3">Your program</SectionHeading>
      {programs.isPending ? <Spinner label="Loading programs" /> : null}
      <Alert visible={!!programs.error} title="Could not load your programs">{trainingErrorMessage(programs.error)}</Alert>
      {programs.data && !pt.length ? <p className="text-sm text-muted">Your coach hasn’t published a program yet. It will appear here once they do.</p> : null}
      {pt.length ? (
        <ul className="divide-y divide-line">
          {[...(current ? [current] : []), ...others].map((p) => <PublishedProgramRow key={p.programId} program={p} />)}
        </ul>
      ) : null}
    </section>
  );
}

const weekTick = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });

function PtProgress({ sessions, isPending, error, timeZone, now }: { sessions: Meeting[] | undefined; isPending: boolean; error: unknown; timeZone: string; now: number }) {
  const stats = useMemo(() => (sessions ? ptStats(sessions, new Date(now), timeZone) : null), [sessions, now, timeZone]);
  const slots = stats?.weekly.map((week, index) => {
    const label = weekTick.format(new Date(`${week.weekOf}T00:00:00Z`));
    // Every fourth week is labelled, ending on this week, so ticks never crowd at phone width.
    return { key: week.weekOf, label: `Week of ${label}`, tick: (stats.weekly.length - 1 - index) % 4 === 0 ? label : '' };
  });
  const tiles = stats ? [
    { label: 'Sessions completed', value: stats.completed.toLocaleString() },
    { label: 'This month', value: stats.thisMonth.toLocaleString() },
    { label: 'Weekly streak', value: `${stats.streak} ${stats.streak === 1 ? 'week' : 'weeks'}` },
    { label: 'Attendance', value: stats.attendanceRate === null ? '—' : `${Math.round(stats.attendanceRate * 100)}%` },
  ] : [];
  return (
    <section aria-labelledby="pt-progress" className="min-w-0">
      <SectionHeading id="pt-progress" icon={<ProgressIcon />} className="mb-3">Progress</SectionHeading>
      {isPending ? <Spinner label="Loading sessions" /> : null}
      <Alert visible={!!error} title="Could not load your sessions">{schedulingError(error)}</Alert>
      {stats && slots ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-9">
          <div className="self-start">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-5">
              {tiles.map((tile) => (
                <div key={tile.label} className="min-w-0">
                  <dt className="text-sm text-muted">{tile.label}</dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">{tile.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-5 text-xs text-muted">Attendance counts sessions you attended out of those attended, missed or cancelled late. Sessions your coach hasn’t recorded yet aren’t counted.</p>
          </div>
          <div className="min-w-0">
            <h3 className="mb-3 text-sm font-medium">Sessions per week <span className="font-normal text-muted">· last 12 weeks</span></h3>
            <ColumnTrend slots={slots} counts={stats.weekly.map((week) => week.count)} noun="session" caption="Sessions attended per week, last 12 weeks" slotHeading="Week" />
          </div>
        </div>
      ) : null}
    </section>
  );
}

function Upcoming({ clientId, timeZone, now, onOpen, className = '' }: { clientId: string; timeZone: string; now: number; onOpen: (meeting: Meeting) => void; className?: string }) {
  // Fixed when the page opens, so polling never shifts the query key.
  const [range] = useState(() => {
    const from = new Date();
    return { from, to: new Date(from.getTime() + UPCOMING_DAYS * 86_400_000) };
  });
  const meetings = useClientMeetings(clientId, range.from, range.to);
  // Cancelled sessions stay listed, struck through, so a cancellation never looks like a missing session.
  const upcoming = meetings.data?.filter((m) => isPtSession(m) && new Date(m.startsAt).getTime() + m.durationMinutes * 60_000 > now);
  return (
    <section aria-labelledby="pt-upcoming" className={`min-w-0 ${className}`}>
      <SectionHeading id="pt-upcoming" icon={<CalendarIcon />} className="mb-3">Upcoming <span className="text-sm font-normal text-muted">· next 4 weeks</span></SectionHeading>
      {meetings.isPending ? <Spinner label="Loading sessions" /> : null}
      <Alert visible={!!meetings.error} title="Could not load your sessions">{schedulingError(meetings.error)}</Alert>
      {upcoming && !upcoming.length ? <p className="text-sm text-muted">No sessions in the next 4 weeks.</p> : null}
      {upcoming?.length ? (
        <ul className="divide-y divide-line">
          {upcoming.map((m) => <MeetingRow key={m.id} meeting={m} timeZone={timeZone} onOpen={() => onOpen(m)} client />)}
        </ul>
      ) : null}
    </section>
  );
}

/** Ended sessions, newest first. One still under way is the next session above, not history yet. */
function History({ sessions, isPending, error, timeZone, now, onOpen }: {
  sessions: Meeting[] | undefined; isPending: boolean; error: unknown; timeZone: string; now: number; onOpen: (meeting: Meeting) => void;
}) {
  const [shown, setShown] = useState(HISTORY_STEP);
  const ended = sessions?.filter((m) => !['upcoming', 'in_progress'].includes(ptOutcome(m, now)));
  return (
    <section aria-labelledby="pt-history" className="min-w-0">
      <SectionHeading id="pt-history" icon={<HistoryIcon />} className="mb-3">History</SectionHeading>
      {isPending ? <Spinner label="Loading sessions" /> : null}
      <Alert visible={!!error} title="Could not load your sessions">{schedulingError(error)}</Alert>
      {ended && !ended.length ? <p className="text-sm text-muted">Your past sessions will appear here.</p> : null}
      {ended?.length ? (
        <>
          <ul className="divide-y divide-line">
            {ended.slice(0, shown).map((m) => <MeetingRow key={m.id} meeting={m} timeZone={timeZone} onOpen={() => onOpen(m)} client />)}
          </ul>
          {ended.length > shown ? (
            <Button variant="ghost" className="mt-2" onClick={() => setShown((n) => n + HISTORY_STEP)}>
              Show more ({ended.length - shown} left)
            </Button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

const OUTCOME_BADGES: Partial<Record<PtOutcome, { label: string; tone?: 'success' | 'danger' | 'gold' }>> = {
  attended: { label: 'Attended', tone: 'success' },
  no_show: { label: 'No-show', tone: 'danger' },
  late_cancelled: { label: 'Late cancellation', tone: 'danger' },
  cancelled: { label: 'Cancelled' },
  past: { label: 'Past' },
  in_progress: { label: 'Now', tone: 'gold' },
};

/** What the coach shared with one session: notes and resources. Read-only for the client. */
function SessionDialog({ meeting, timeZone, now, onClose }: { meeting: Meeting; timeZone: string; now: number; onClose: () => void }) {
  const badge = OUTCOME_BADGES[ptOutcome(meeting, now)];
  const nothing = !meeting.sharedNotes && !meeting.resources.length;
  return (
    <Dialog title={sessionDay(meeting.startsAt, timeZone)} description={`${sessionRange(meeting.startsAt, meeting.durationMinutes, timeZone)} · ${meeting.durationMinutes} min${meeting.coachName ? ` · with ${meeting.coachName}` : ''}`}
      onClose={onClose} footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <DialogBody className="grid gap-5">
        {badge ? <p><Badge tone={badge.tone}>{badge.label}</Badge></p> : null}
        {meeting.sharedNotes ? (
          <section aria-labelledby="session-notes">
            <h3 id="session-notes" className="mb-1.5 text-base font-semibold">Notes from your coach</h3>
            <p className="whitespace-pre-wrap break-words text-sm">{meeting.sharedNotes}</p>
          </section>
        ) : null}
        {meeting.resources.length ? (
          <section aria-labelledby="session-resources">
            <h3 id="session-resources" className="text-base font-semibold">Resources</h3>
            <ResourceList resources={meeting.resources} />
          </section>
        ) : null}
        {nothing ? <p className="text-sm text-muted">Your coach hasn’t shared notes or resources for this session.</p> : null}
      </DialogBody>
    </Dialog>
  );
}
