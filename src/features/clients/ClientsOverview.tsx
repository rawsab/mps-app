import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { AllClear } from '@/components/AllClear';
import { Dialog } from '@/components/Dialog';
import { ScrollStripButtons, useScrollStrip } from '@/components/ScrollStrip';
import { CheckIcon, CopyIcon, InboxIcon, SendIcon } from '@/components/icons';
import { Alert, Button, Spinner } from '@/components/ui';
import { ActivityRow } from '@/features/activity/ActivityViews';
import { useLatestUnread, useUnreadCount } from '@/features/activity/api';
import { schedulingError, useMeetingsToday } from '@/features/scheduling/api';
import { topicLabel } from '@/features/scheduling/MeetingTopic';
import { RequestBadge } from '@/features/scheduling/RequestBadge';
import { MeetingDialogHost } from '@/features/scheduling/MeetingDialogHost';
import { useMeetingToast } from '@/features/scheduling/useMeetingToast';
import { upcomingByDay } from '@/domain/scheduling/upcoming';
import { formatDate } from '@/lib/format';
import { SERVICE_SHORT_LABELS, SERVICES } from '@/lib/services';
import { friendlyError, useInviteClient, usePendingServiceRequests, type ClientRow, type ClientStatus } from './api';
import { ServiceRequestRows } from './ServiceRequests';
import { ALL_STATUSES, clientOverview, STATUS_LABELS } from './clientTable';
import { statusBadge } from './ClientsTable';
import { ChartTooltip } from '@/components/Tooltip';

type FollowUp = 'notInvited' | 'inviteUnaccepted';

/** Theme tokens, so each status keeps its color in light and dark mode. Labels name every bar too. */
const STATUS_BAR_COLORS: Record<ClientStatus, string> = {
  active: 'var(--color-success)',
  invited: 'var(--color-gold)',
  pending: 'var(--color-muted)',
  disabled: 'var(--color-danger)',
};

const FOLLOW_UP_COPY: Record<FollowUp, { title: string; empty: string; description: string; label: (n: number) => string }> = {
  notInvited: {
    title: 'Not invited yet',
    empty: 'Everyone has been invited',
    description: 'These clients have no account yet. You can prepare their programs before inviting them.',
    label: (n) => `${n === 1 ? 'client' : 'clients'} not invited yet`,
  },
  inviteUnaccepted: {
    title: 'Invite not accepted',
    empty: 'No invitations waiting',
    description: 'Invited, but they haven’t signed in yet. Resending sends a fresh link.',
    label: (n) => `${n === 1 ? 'hasn’t' : 'haven’t'} accepted the invite`,
  },
};

/** How many latest unread items the clients page lists. */
const LATEST_REVIEWS = 3;

const SESSION_TIME = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
/** Today's next meetings shown before "+N more today". */
const UPCOMING_LIMIT = 3;

/** Half for client activity (decision 0025), half for today's meetings (decisions 0026, 0039). */
function ActivityAndSessions() {
  return (
    <div className="mb-2 grid min-w-0 gap-x-9 border-b border-line md:grid-cols-2">
      <ToReviewPanel />
      <UpcomingSessionsPanel />
    </div>
  );
}

function ToReviewPanel() {
  const unread = useUnreadCount();
  const latest = useLatestUnread(LATEST_REVIEWS);
  const from = { backTo: '/coach/clients', backLabel: 'Clients' };
  const count = unread.data ?? 0;

  return (
    <section aria-labelledby="clients-to-review" className="min-w-0 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="clients-to-review" className="text-xs font-medium text-muted">
          To review
          {count > 0 ? <Link to="/coach/reviews?filter=unread" className="ml-2 text-gold-fg"><span className="link">{count} unread</span></Link> : null}
        </h2>
        <Link to="/coach/reviews" className="-my-3 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">View all</span></Link>
      </div>
      <Alert visible={!!(unread.error || latest.error)} title="Could not load activity">{friendlyError(unread.error ?? latest.error)}</Alert>
      {latest.isPending ? <Spinner label="Loading activity" /> : null}
      {latest.data?.length === 0 ? <AllClear title="All caught up." detail="No unread workouts or logs from your clients." /> : null}
      {latest.data?.length ? (
        <ul className="min-w-0 divide-y divide-line">
          {latest.data.map((item) => <ActivityRow key={item.id} clientId={item.clientId} item={item} from={from} review={item} compact />)}
        </ul>
      ) : null}
    </section>
  );
}

/** Today's next few meetings across the coach's clients (decisions 0026, 0039). Rows open the meeting here, without leaving the page. */
function UpcomingSessionsPanel() {
  const meetings = useMeetingsToday();
  const [openMeeting, setOpenMeeting] = useState<string | null>(null);
  const toast = useMeetingToast();
  // Still to finish, never cancelled; the list refetches every minute so finished meetings drop off.
  const today = upcomingByDay((meetings.data ?? []).filter((m) => m.status === 'scheduled'), new Date(), (d) => d.toDateString(), 1)[0]?.sessions ?? [];
  const visible = today.slice(0, UPCOMING_LIMIT);

  return (
    <section aria-labelledby="clients-upcoming" className="min-w-0 border-t border-line py-3 md:border-l md:border-t-0 md:pl-9">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 id="clients-upcoming" className="text-xs font-medium text-muted">Upcoming today</h2>
        <Link to="/coach/meetings" className="-my-3 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">View calendar</span></Link>
      </div>
      {meetings.isPending ? <Spinner label="Loading meetings" /> : null}
      <Alert visible={!!meetings.error} title="Could not load meetings">{schedulingError(meetings.error)}</Alert>
      {meetings.data && today.length === 0 ? <AllClear title="No upcoming meetings." detail="The rest of the day is clear." /> : null}
      {visible.length ? (
        <ul>
          {visible.map((meeting) => (
            <li key={meeting.id}>
              <button type="button" onClick={() => setOpenMeeting(meeting.id)} className="row-link group flex min-h-11 w-full min-w-0 items-center gap-3 rounded-card py-2 pl-2 pr-2 text-left hover:bg-surface-raised">
                <span aria-hidden className="w-1 shrink-0 self-stretch rounded-full bg-gold" />
                <time dateTime={meeting.startsAt} className="w-16 shrink-0 text-sm tabular-nums text-text">{SESSION_TIME.format(new Date(meeting.startsAt))}</time>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{meeting.clientName}</span>
                  <span className="block truncate text-xs text-muted">
                    {[`${meeting.durationMinutes} min`, topicLabel(meeting.services), meeting.scheduleId ? '↻ Repeating' : 'One-off'].join(' · ')}
                  </span>
                </span>
                <RequestBadge request={meeting.request} />
                <span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {today.length > visible.length ? <p className="mb-2 mt-2 text-xs text-muted">+{today.length - visible.length} more today</p> : null}
      {openMeeting ? (
        <MeetingDialogHost key={openMeeting} meetingId={openMeeting} onClose={() => setOpenMeeting(null)}
          onSaved={(message, options) => { setOpenMeeting(null); toast.show(message, options); }} />
      ) : null}
      {toast.element}
    </section>
  );
}

/** Compact roster summary above the client table: services, statuses and invitation follow-ups. */
export function ClientsOverview({ rows, canInvite }: { rows: ClientRow[]; canInvite: boolean }) {
  const overview = useMemo(() => clientOverview(rows), [rows]);
  // The dialog keeps the list it opened with, so a client stays visible after you invite them.
  const [open, setOpen] = useState<{ kind: FollowUp; ids: string[] } | null>(null);

  return (
    <>
    <ActivityAndSessions />
    <div className="mb-5 grid grid-cols-[3fr_4fr] gap-x-4 gap-y-3 sm:grid-cols-[auto_auto] sm:justify-start sm:gap-x-9 lg:justify-stretch lg:grid-cols-[3fr_4fr_minmax(16rem,3fr)]">
      <Panel title="Services">
        <ColumnChart total={overview.total} items={SERVICES.map((s) => ({ label: SERVICE_SHORT_LABELS[s], count: overview.services[s] }))} />
      </Panel>
      <Panel title="Status">
        <ColumnChart total={overview.total} items={ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], count: overview.statuses[s], color: STATUS_BAR_COLORS[s], badge: statusBadge(s) }))} />
      </Panel>
      <Panel title="Follow up" id="clients-follow-up" className="col-span-2 lg:col-span-1">
        {overview.notInvited.length === 0 && overview.inviteUnaccepted.length === 0 ? (
          <div role="status" className="flex items-center gap-3 py-1">
            <span className="text-muted opacity-50"><InboxIcon className="size-11 shrink-0" /></span>
            <div className="min-w-0">
              <p className="text-xl font-semibold leading-tight text-text">All done here.</p>
              <p className="mt-0.5 text-xs text-muted">No invitations left to send, and none waiting to be accepted.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-2">
            {(['notInvited', 'inviteUnaccepted'] as const).map((kind) => {
              const list = overview[kind];
              return (
                <li key={kind}>
                  <FollowUpButton
                    count={list.length}
                    label={list.length === 0 ? FOLLOW_UP_COPY[kind].empty : FOLLOW_UP_COPY[kind].label(list.length)}
                    onClick={() => setOpen({ kind, ids: list.map((r) => r.id) })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {open ? <FollowUpDialog kind={open.kind} ids={open.ids} rows={rows} canInvite={canInvite} onClose={() => setOpen(null)} /> : null}
    </div>
    <ServiceRequestsPanel />
    </>
  );
}

function Panel({ title, id, className = '', children }: { title: string; id?: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`min-w-0 py-3 ${className}`}>
      <h2 id={id} className="mb-2 text-xs font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Pending service requests across the coach's clients (decision 0044): their own row under the
 * charts, scrolling sideways, with ‹ › to reveal more.
 */
function ServiceRequestsPanel() {
  const requests = usePendingServiceRequests();
  const list = requests.data ?? [];
  // While the row folds away after the last answer, it keeps showing the cards it had.
  const lastShown = useRef(list);
  if (list.length) lastShown.current = list;
  const shown = list.length ? list : lastShown.current;
  const empty = list.length === 0;
  const strip = useScrollStrip(shown.length);

  if (requests.error) return <Alert className="mb-5" title="Could not load service requests">{friendlyError(requests.error)}</Alert>;
  // Nothing until the first answer, so an empty list never flashes in; it mounts already in place.
  if (!requests.data) return null;
  return (
    // Hidden with no requests. Answering the last one folds the row and the content below moves up.
    <div className="collapsible" data-collapsed={empty || undefined} inert={empty}>
      <div className="min-h-0 min-w-0 overflow-hidden">
        <section aria-labelledby="clients-service-requests" className="mb-5 w-full min-w-0 max-w-full border-t border-line py-3">
          <div className="mb-2 flex min-h-8 flex-wrap items-center justify-between gap-2">
            <h2 id="clients-service-requests" className="text-xs font-medium text-muted">
              Service requests{list.length ? <span className="ml-2 text-gold-fg">{list.length} waiting</span> : null}
            </h2>
            <ScrollStripButtons strip={strip} backLabel="Show earlier requests" forwardLabel="Show more requests" />
          </div>
          {shown.length ? <ServiceRequestRows requests={shown} showClient strip={strip} /> : null}
        </section>
      </div>
    </div>
  );
}

/**
 * Columns rising from a baseline, scaled to the largest count. Counts sit on top of each column and
 * labels underneath, so color is never the only cue. Bars with a `color` are hatched in it; others are solid gold.
 */
type Column = {
  label: string;
  count: number;
  /** Hatched bar in this color; without it the bar is solid gold. */
  color?: string;
  /** Shown in the tooltip instead of the plain label, e.g. a status pill. */
  badge?: ReactNode;
};

function ColumnChart({ items, total }: { items: Column[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  // The hovered column and the pointer position inside the chart, for the "X/TOTAL" tooltip.
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hovered = hover ? items[hover.index] : undefined;
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={chartRef} className="relative" onPointerLeave={() => setHover(null)}>
      {/* Axes: one vertical line beside the plot and one baseline under it, across the chart's width. */}
      <span aria-hidden className="absolute left-0 top-0 h-20 w-px bg-line" />
      <span aria-hidden className="absolute left-0 right-0 top-20 h-px bg-line" />
      <ul className="flex gap-0.5 px-1 sm:gap-1 sm:px-2">
        {items.map(({ label, count, color }, index) => {
          const description = `${label}: ${count} of ${total} client${total === 1 ? '' : 's'}`;
          return (
            <li
              key={label}
              aria-label={description}
              // The whole column is the hover target, not just the bar.
              onPointerMove={(e) => {
                const box = chartRef.current!.getBoundingClientRect();
                setHover({ index, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
              className="flex min-w-0 flex-1 flex-col items-center sm:w-16 sm:flex-none lg:w-auto lg:flex-1"
            >
              <div aria-hidden className="flex h-20 w-full flex-col items-center justify-end">
                <span className="mb-1 text-xs font-medium tabular-nums text-text">{count}</span>
                <span
                  data-hover={hover?.index === index || undefined}
                  className={`w-full max-w-10 rounded-t-[4px] transition-[height,opacity] duration-300 ${color ? 'bar-hatched' : 'bg-gold opacity-75 data-[hover]:opacity-100'}`}
                  style={{ height: `${(count / max) * 3.5}rem`, ...(color ? { '--bar': color } : {}) } as CSSProperties}
                />
              </div>
              <span aria-hidden className="mt-2 text-center text-[0.6875rem] leading-tight text-muted [overflow-wrap:anywhere] sm:text-xs">
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      {hover && hovered ? (
        <ChartTooltip x={hover.x} y={hover.y - 8}>
          {hovered.badge ?? <span className="text-muted">{hovered.label}</span>}
          <span className="font-medium tabular-nums text-text">
            {hovered.count}/{total}
          </span>
        </ChartTooltip>
      ) : null}
    </div>
  );
}

function FollowUpButton({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  if (count === 0) {
    return (
      <p className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface px-3 text-sm text-muted">
        <span aria-hidden className="w-6 text-center">✓</span>
        {label}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="row-link group flex min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface px-3 text-left text-sm hover:bg-surface-raised"
    >
      <span className="w-6 text-center text-lg font-semibold tabular-nums text-gold-fg">{count}</span>
      <span className="min-w-0 flex-1 text-text">{label}</span>
      <span aria-hidden className="text-muted group-hover:text-text">
        →
      </span>
    </button>
  );
}

function FollowUpDialog({
  kind,
  ids,
  rows,
  canInvite,
  onClose,
}: {
  kind: FollowUp;
  ids: string[];
  rows: ClientRow[];
  canInvite: boolean;
  onClose: () => void;
}) {
  const copy = FOLLOW_UP_COPY[kind];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const clients = ids.map((id) => byId.get(id)).filter((r): r is ClientRow => r !== undefined);
  const [copied, setCopied] = useState(false);

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(clients.map((c) => c.email).join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      title={`${copy.title} (${clients.length})`}
      description={canInvite ? copy.description : `${copy.description} Only admins can send invitations.`}
      onClose={onClose}
      footer={
        <Button variant={copied ? 'primary' : 'secondary'} onClick={copyEmails} aria-live="polite">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy emails'}
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {clients.map((client) => (
          <li key={client.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-surface-raised px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <Link to={`/coach/clients/${client.id}`} className="font-medium text-text">
                <span className="link link--bare">{client.full_name}</span>
              </Link>
              <a href={`mailto:${client.email}`} className="block truncate text-sm text-muted hover:text-text">
                {client.email}
              </a>
              <p className="text-xs text-muted">Added {formatDate(client.created_at)}</p>
            </div>
            {canInvite ? <InviteButton client={client} /> : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Each row owns its request so several invitations can be in flight and report separately. */
function InviteButton({ client }: { client: ClientRow }) {
  const invite = useInviteClient();
  if (invite.isSuccess) {
    return (
      <p role="status" className="text-sm text-success">
        {invite.data?.status === 'resent' ? 'Invitation resent' : 'Invitation sent'}
      </p>
    );
  }
  if (client.status === 'active' || client.status === 'disabled') {
    return <p className="text-sm text-muted">{STATUS_LABELS[client.status]}</p>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" className="min-h-10" busy={invite.isPending} onClick={() => invite.mutate(client.id)}>
        {invite.isPending ? null : <SendIcon />}
        {client.status === 'invited' ? 'Resend invite' : 'Send invite'}
      </Button>
      {invite.error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {friendlyError(invite.error)}
        </p>
      ) : null}
    </div>
  );
}
