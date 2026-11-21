import { Fragment } from 'react';
import { Avatar } from '@/components/Avatar';
import { Link, useParams, useSearchParams } from 'react-router';
import { Chip } from '@/components/controls';
import { Alert, Badge, Button, EmptyState, PageHeader, SectionHeading, Spinner, type BadgeTone } from '@/components/ui';
import { HistoryIcon } from '@/components/icons';
import { activityDetails, activityFacts, activityTitle, activityWhere, groupByDay, relativeTime, type ActivityItem, type RequestActivity, type ReviewItem, type SessionActivity } from '@/domain/activity/feed';
import { friendlyError, useClient, useClientPhoto, type ClientRow } from '@/features/clients/api';
import { formatDate, formatDateTime, formatTime } from '@/lib/format';
import { ActivityTrends } from './ActivityTrends';
import { TREND_RANGES, type TrendRange } from '@/domain/activity/trends';
import { activityLink, READ_FADE_MS, useActivityHistory, useMarkActivityRead, useRecentActivity, useReviews, type ReviewFilter } from './api';

type BadgeSpec = { label: string; tone: BadgeTone };

const STATUS_BADGE: Record<SessionActivity['status'], BadgeSpec> = {
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'neutral' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

/** Pending requests carry no status pill; the request-kind pill is enough. */
const REQUEST_BADGE: Record<RequestActivity['status'], BadgeSpec | null> = {
  pending: null,
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

/** What kind of request it is, ahead of its status (decision 0042). */
function categoryBadge(item: ActivityItem): BadgeSpec | null {
  if (item.kind === 'service_request') return { label: 'Service Request', tone: 'violet' };
  if (item.kind === 'payment_notice') return { label: 'Payment', tone: 'gold' };
  if (item.kind === 'request') return item.requestKind === 'cancel' ? { label: 'Cancellation request', tone: 'danger' } : { label: 'Reschedule request', tone: 'info' };
  return null;
}

const NOTICE_BADGE = { pending: null, confirmed: { label: 'Recorded', tone: 'success' }, dismissed: { label: 'Dismissed', tone: 'neutral' }, settled: { label: 'Paid', tone: 'success' } } as const;

function itemBadge(item: ActivityItem): BadgeSpec | null {
  if (item.kind === 'payment_notice') return NOTICE_BADGE[item.status];
  if (item.kind === 'service_request') return item.status === 'enrolled' ? { label: 'Enrolled', tone: 'success' } : item.status === 'declined' ? { label: 'Declined', tone: 'neutral' } : null;
  if (item.kind === 'request') return REQUEST_BADGE[item.status];
  if (item.kind === 'nutrition') return item.status === 'completed' ? STATUS_BADGE.completed : { label: 'Partial entry', tone: 'neutral' };
  return STATUS_BADGE[item.status];
}

function emptyMessage(client: Pick<ClientRow, 'status'>): string {
  return client.status === 'pending' || client.status === 'invited' ? 'The client hasn’t signed in yet.' : 'No activity yet.';
}

type Review = Pick<ReviewItem, 'clientName' | 'unread'>;

/** Fades and shrinks away, so marking read doesn't snap the client name sideways. */
/** Gold dot for an item this staff member hasn't opened; it shrinks away once read. */
function UnreadDot({ unread }: { unread: boolean }) {
  return <span aria-hidden style={{ transitionDuration: `${READ_FADE_MS}ms` }}
    className={`h-2 shrink-0 rounded-full bg-gold transition-all ease-out motion-reduce:transition-none ${unread ? 'w-2 opacity-100' : '-mr-2 w-0 scale-50 opacity-0'}`} />;
}

/** Client and signed-photo queries are shared across repeated notifications for the same client. */
function ActivityAvatar({ clientId, name }: { clientId: string; name?: string }) {
  const client = useClient(clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
  return <Avatar url={photo.data} name={name ?? client.data?.full_name ?? 'Client'} className="mt-0.5 size-9" />;
}

/**
 * Opening an item marks it seen in Reviews, wherever it was opened from. `compact` is the clients
 * page summary: client and date, then what happened.
 */
export function ActivityRow({ clientId, item, from, review, leaving = false, compact = false }: { clientId: string; item: ActivityItem; from: { backTo: string; backLabel: string }; review?: Review; leaving?: boolean; compact?: boolean }) {
  const markRead = useMarkActivityRead();
  const details = activityDetails(item);
  const badge = itemBadge(item);
  const category = categoryBadge(item);
  const performedOn = item.kind === 'request' || item.kind === 'service_request' || item.kind === 'payment_notice' ? null : item.performedOn;
  // Read items in Reviews recede, and come back to full strength under the pointer or keyboard focus.
  const read = review && !review.unread && !compact;
  // On the Activity page the time and arrow sit on the name line, so the detail card spans the row.
  const inline = !!review && !compact;
  const trailing = (
    <span className={`flex shrink-0 items-center gap-2 text-xs font-normal text-muted ${inline ? 'ml-auto pl-2' : 'pt-0.5'}`}>
      {compact ? null : <time dateTime={item.activityAt} title={formatDateTime(item.activityAt)}>{relativeTime(item.activityAt, new Date(), formatDate)}</time>}
      <span aria-hidden className="group-hover:text-text">→</span>
    </span>
  );
  return (
    // `leaving`: a read item in the Unread filter fades out before the refetch removes it.
    <li style={{ transitionDuration: `${READ_FADE_MS}ms` }}
      className={`transition-opacity motion-reduce:transition-none ${leaving ? 'opacity-0' : read ? 'opacity-60 hover:opacity-100 focus-within:opacity-100' : ''}`}>
      <Link to={activityLink(clientId, item)} state={from} onClick={() => markRead.mutate(item)}
        // Square on the Activity page, so hovered rows meet the dividers edge to edge.
        className={`row-link group flex min-h-14 min-w-0 items-start gap-3 py-3 pl-3 pr-2 hover:bg-surface-raised ${inline ? '' : 'rounded-card'}`}>
        <ActivityAvatar clientId={clientId} name={review?.clientName} />
        <div className="min-w-0 flex-1">
          {review ? <p className="flex items-center gap-2 break-words text-sm font-semibold">
            <UnreadDot unread={review.unread} />
            <span className="min-w-0">
              {review.clientName}
              {compact ? <span className="font-normal text-muted"> · {formatDate(performedOn ?? item.activityAt)}</span>
                : <span className="font-normal text-text/50"> · <time dateTime={item.activityAt} title={formatDateTime(item.activityAt)}>{formatTime(item.activityAt)}</time></span>}
            </span>
            {review.unread ? <span className="sr-only">(unread)</span> : null}
            {inline ? trailing : null}
          </p> : null}
          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${review ? 'mt-1' : ''}`}>
            <span className={review ? 'text-sm' : 'font-medium'}>{activityTitle(item)}</span>
            {category ? <Badge tone={category.tone}>{category.label}</Badge> : null}
            {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
            {item.kind === 'request' && item.late ? (item.requestKind === 'cancel' ? <Badge tone="danger">Late cancellation</Badge> : <Badge tone="gold">Short notice</Badge>) : null}
            {item.staffEdited ? <Badge>Edited by coach</Badge> : null}
          </p>
          {review && !compact ? <FactsCard item={item} /> : null}
          {compact || review ? null : <p className="mt-0.5 break-words text-sm text-muted">{activityWhere(item)}</p>}
          {!compact && !review && (details.length || performedOn) ? (
            <p className="mt-0.5 break-words text-xs text-muted">
              {[...(performedOn ? [`${item.kind === 'nutrition' ? 'Log date' : 'Workout date'} ${formatDate(performedOn)}`] : []), ...details].join(' · ')}
            </p>
          ) : null}
        </div>
        {inline ? null : trailing}
      </Link>
    </li>
  );
}

/** The Activity page's nested card: every labelled fact; notes and replies take the full width. */
function FactsCard({ item }: { item: ActivityItem }) {
  const facts = activityFacts(item, formatDate);
  if (!facts.length) return null;
  return (
    <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-2.5 rounded-card border border-line bg-ink px-3 py-2.5 sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
      {facts.map((fact) => (
        <div key={fact.label} className={`min-w-0 ${fact.long ? 'col-span-full' : ''}`}>
          <dt className="text-[0.6875rem] text-muted">{fact.label}</dt>
          <dd className={`mt-0.5 break-words text-[0.8125rem] ${fact.long ? 'whitespace-pre-wrap' : ''}`}>{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** The client page's latest few items, above Programs. */
export function RecentUpdatesCard({ client }: { client: ClientRow }) {
  const recent = useRecentActivity(client.id, 3);
  const from = { backTo: `/coach/clients/${client.id}`, backLabel: client.full_name };

  return (
    <section className="min-w-0" aria-labelledby="client-recent-updates">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="client-recent-updates" icon={<HistoryIcon />}>Recent updates</SectionHeading>
        {recent.data?.length ? (
          <Link to={`/coach/clients/${client.id}/activity`} className="-my-3 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">View full history</span></Link>
        ) : null}
      </div>
      {recent.isPending ? <Spinner label="Loading recent updates" /> : null}
      <Alert visible={!!recent.error} title="Could not load recent updates">{friendlyError(recent.error)}</Alert>
      {recent.data?.length === 0 ? <p className="text-sm text-muted">{emptyMessage(client)}</p> : null}
      {recent.data?.length ? (
        <ul className="divide-y divide-line">
          {recent.data.map((item) => <ActivityRow key={item.id} clientId={client.id} item={item} from={from} />)}
        </ul>
      ) : null}
    </section>
  );
}

/** Every item, grouped by day, loaded a page at a time. */
export function ClientActivityPage() {
  const { clientId } = useParams();
  const client = useClient(clientId);
  const history = useActivityHistory(clientId!);
  const back = (
    <Link to={`/coach/clients/${clientId}`} className="-my-3 mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text">
      <span aria-hidden className="arrow-back">←</span>
      <span>{client.data?.full_name ?? 'Client'}</span>
    </Link>
  );

  if (client.isPending) return <div>{back}<Spinner label="Loading client" /></div>;
  if (client.error) return <div>{back}<Alert title="Could not load client">{friendlyError(client.error)}</Alert></div>;
  if (!client.data) {
    return <EmptyState title="Client not found" action={<Link className="inline-flex min-h-11 items-center text-sm text-gold-fg" to="/coach/clients"><span className="link">Back to clients</span></Link>}>
      The client does not exist or is not assigned to you.
    </EmptyState>;
  }
  const c = client.data;
  const items = history.data?.pages.flat() ?? [];
  const from = { backTo: `/coach/clients/${c.id}/activity`, backLabel: 'Activity history' };

  return (
    <div>
      {back}
      <PageHeader title="Activity history" subtitle={c.full_name} />
      {history.isPending ? <Spinner label="Loading activity" /> : null}
      <Alert visible={!!history.error} title="Could not load activity">{friendlyError(history.error)}</Alert>
      {history.data && items.length === 0 ? <p className="text-sm text-muted">{emptyMessage(c)}</p> : null}
      {groupByDay(items, new Date(), formatDate).map((group, index) => (
        <Fragment key={`${group.label}-${index}`}>
          <h2 className={`mb-1 text-sm font-medium text-muted ${index === 0 ? '' : 'mt-6'}`}>{group.label}</h2>
          <ul className="divide-y divide-line">
            {group.items.map((item) => <ActivityRow key={item.id} clientId={c.id} item={item} from={from} />)}
          </ul>
        </Fragment>
      ))}
      {history.hasNextPage ? (
        <div className="mt-4">
          <Button variant="secondary" busy={history.isFetchingNextPage} onClick={() => void history.fetchNextPage()}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}

/** Client activity across every visible client, newest first, with this coach's unread state (PRD §6 Reviews). */
export function ReviewsPage() {
  const [params, setParams] = useSearchParams();
  const filter: ReviewFilter = params.get('filter') === 'unread' ? 'unread' : params.get('filter') === 'focused' ? 'focused' : 'all';
  // The filter and trend range live in the URL so the clients page can link straight to Unread.
  const setParam = (key: string, value: string | null) => setParams((current) => {
    const next = new URLSearchParams(current);
    if (value === null) next.delete(key); else next.set(key, value);
    return next;
  }, { replace: true });
  const setFilter = (value: ReviewFilter) => setParam('filter', value === 'all' ? null : value);
  const range: TrendRange = TREND_RANGES.includes(params.get('range') as TrendRange) ? params.get('range') as TrendRange : 'week';
  const unreadOnly = filter === 'unread';
  const reviews = useReviews(filter);
  const markAll = useMarkActivityRead();
  const items = reviews.data?.pages.flat() ?? [];
  const from = { backTo: '/coach/reviews', backLabel: 'Activity' };
  const filters: { value: ReviewFilter; label: string }[] = [{ value: 'all', label: 'All' }, { value: 'focused', label: 'Focused' }, { value: 'unread', label: 'Unread' }];

  return (
    <div>
      <PageHeader title="Activity" subtitle="Workouts, nutrition logs, and meeting and service requests from your clients, newest first."
        actions={<Button variant="secondary" busy={markAll.isPending} disabled={!items.some((item) => item.unread)} onClick={() => markAll.mutate(null)}>Mark all as read</Button>} />
      {/* Half and half on wide screens; the trends stay in view while the feed scrolls. */}
      {/* The divider sits on the feed column, which stretches to the row's full height. */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,13fr)_minmax(0,7fr)] lg:gap-0">
        <div className="min-w-0 lg:border-r lg:border-line lg:pr-8">
          <div role="group" aria-label="Filter activity" className="mb-4 flex flex-wrap gap-1.5">
            {filters.map((option) => <Chip key={option.label} pressed={filter === option.value} onClick={() => setFilter(option.value)}>{option.label}</Chip>)}
          </div>
          <Alert visible={!!markAll.error} className="mb-4" title="Could not mark as read">{friendlyError(markAll.error)}</Alert>
          {reviews.isPending ? <Spinner label="Loading activity" /> : null}
          <Alert visible={!!reviews.error} title="Could not load activity">{friendlyError(reviews.error)}</Alert>
          {reviews.data && items.length === 0 ? <p className="text-sm text-muted">{unreadOnly ? 'You’re all caught up.' : filter === 'focused' ? 'No requests or payments to check.' : 'No client activity yet.'}</p> : null}
          {groupByDay(items, new Date(), formatDate).map((group, index) => (
            <Fragment key={`${group.label}-${index}`}>
              <h2 className={`mb-1 text-sm font-medium text-muted ${index === 0 ? '' : 'mt-6'}`}>{group.label}</h2>
              <ul className="divide-y divide-line">
                {group.items.map((item) => <ActivityRow key={item.id} clientId={item.clientId} item={item} from={from} review={item} leaving={unreadOnly && !item.unread} />)}
              </ul>
            </Fragment>
          ))}
          {reviews.hasNextPage ? (
            <div className="mt-4">
              <Button variant="secondary" busy={reviews.isFetchingNextPage} onClick={() => void reviews.fetchNextPage()}>Load more</Button>
            </div>
          ) : null}
        </div>
        <aside className="min-w-0 lg:sticky lg:top-6 lg:self-start lg:pl-8">
          <ActivityTrends range={range} onRange={(value) => setParam('range', value === 'week' ? null : value)} />
        </aside>
      </div>
    </div>
  );
}
