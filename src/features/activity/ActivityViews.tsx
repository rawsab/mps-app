import { Fragment } from 'react';
import { Avatar } from '@/components/Avatar';
import { Link, useParams, useSearchParams } from 'react-router';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { activityDetails, activityTitle, activityWhere, groupByDay, relativeTime, type ActivityItem, type RequestActivity, type ReviewItem, type SessionActivity } from '@/domain/activity/feed';
import { friendlyError, useClient, useClientPhoto, type ClientRow } from '@/features/clients/api';
import { formatDate, formatDateTime } from '@/lib/format';
import { activityLink, READ_FADE_MS, useActivityHistory, useMarkActivityRead, useRecentActivity, useReviews } from './api';

const STATUS_BADGE: Record<SessionActivity['status'], { label: string; tone: 'neutral' | 'gold' | 'success' }> = {
  completed: { label: 'Completed', tone: 'success' },
  in_progress: { label: 'In progress', tone: 'gold' },
  skipped: { label: 'Skipped', tone: 'neutral' },
};

const REQUEST_BADGE: Record<RequestActivity['status'], { label: string; tone: 'neutral' | 'gold' | 'success' }> = {
  pending: { label: 'Needs a reply', tone: 'gold' },
  accepted: { label: 'Accepted', tone: 'success' },
  declined: { label: 'Declined', tone: 'neutral' },
  withdrawn: { label: 'Withdrawn', tone: 'neutral' },
  expired: { label: 'Expired', tone: 'neutral' },
};

function itemBadge(item: ActivityItem) {
  if (item.kind === 'request') return REQUEST_BADGE[item.status];
  if (item.kind === 'nutrition') return { label: item.status === 'completed' ? 'Complete' : 'Partial entry', tone: item.status === 'completed' ? 'success' as const : 'neutral' as const };
  return STATUS_BADGE[item.status];
}

function emptyMessage(client: Pick<ClientRow, 'status'>): string {
  return client.status === 'pending' || client.status === 'invited' ? 'The client hasn’t signed in yet.' : 'No activity yet.';
}

type Review = Pick<ReviewItem, 'clientName' | 'unread'>;

/** Fades and shrinks away, so marking read doesn't snap the client name sideways. */
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
  const performedOn = item.kind === 'request' ? null : item.performedOn;
  return (
    // `leaving`: a read item in the Unread filter fades out before the refetch removes it.
    <li style={{ transitionDuration: `${READ_FADE_MS}ms` }} className={`transition-opacity motion-reduce:transition-none ${leaving ? 'opacity-0' : ''}`}>
      <Link to={activityLink(clientId, item)} state={from} onClick={() => markRead.mutate(item)}
        className="row-link group flex min-h-14 min-w-0 items-start gap-3 rounded-card py-3 pl-3 pr-2 hover:bg-surface-raised">
        <ActivityAvatar clientId={clientId} name={review?.clientName} />
        <div className="min-w-0 flex-1">
          {review ? <p className="flex items-center gap-2 break-words text-sm font-semibold">
            <UnreadDot unread={review.unread} />
            <span className="min-w-0">
              {review.clientName}
              {compact ? <span className="font-normal text-muted"> · {formatDate(performedOn ?? item.activityAt)}</span> : null}
            </span>
            {review.unread ? <span className="sr-only">(unread)</span> : null}
          </p> : null}
          <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 ${review ? 'mt-1' : ''}`}>
            <span className={review ? 'text-sm' : 'font-medium'}>{activityTitle(item)}</span>
            <Badge tone={badge.tone}>{badge.label}</Badge>
            {item.kind === 'request' && item.late ? <Badge tone="danger">Late cancellation</Badge> : null}
            {item.staffEdited ? <Badge>Edited by coach</Badge> : null}
          </p>
          {compact ? null : <p className="mt-0.5 break-words text-sm text-muted">{activityWhere(item)}</p>}
          {!compact && (details.length || performedOn) ? (
            <p className="mt-0.5 break-words text-xs text-muted">
              {[...(performedOn ? [`${item.kind === 'nutrition' ? 'Log date' : 'Workout date'} ${formatDate(performedOn)}`] : []), ...details].join(' · ')}
            </p>
          ) : null}
        </div>
        <span className="flex shrink-0 items-center gap-2 pt-0.5 text-xs text-muted">
          {compact ? null : <time dateTime={item.activityAt} title={formatDateTime(item.activityAt)}>{relativeTime(item.activityAt, new Date(), formatDate)}</time>}
          <span aria-hidden className="group-hover:text-text">→</span>
        </span>
      </Link>
    </li>
  );
}

/** The client page's latest few items, above Programs. */
export function RecentUpdatesCard({ client }: { client: ClientRow }) {
  const recent = useRecentActivity(client.id, 3);
  const from = { backTo: `/coach/clients/${client.id}`, backLabel: client.full_name };

  return (
    <section className="min-w-0" aria-labelledby="client-recent-updates">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="client-recent-updates" className="text-lg font-semibold">Recent updates</h2>
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
  // The filter lives in the URL so the clients page can link straight to Unread.
  const [params, setParams] = useSearchParams();
  const unreadOnly = params.get('filter') === 'unread';
  const setUnreadOnly = (value: boolean) => setParams(value ? { filter: 'unread' } : {}, { replace: true });
  const reviews = useReviews(unreadOnly);
  const markAll = useMarkActivityRead();
  const items = reviews.data?.pages.flat() ?? [];
  const from = { backTo: '/coach/reviews', backLabel: 'Reviews' };
  const filters = [{ value: false, label: 'All' }, { value: true, label: 'Unread' }];

  return (
    <div>
      <PageHeader title="Reviews" subtitle="Workouts, nutrition logs and session requests from your clients, newest first."
        actions={<Button variant="secondary" busy={markAll.isPending} disabled={!items.some((item) => item.unread)} onClick={() => markAll.mutate(null)}>Mark all as read</Button>} />
      <div role="group" aria-label="Filter reviews" className="mb-4 flex flex-wrap gap-1.5">
        {filters.map((option) => <button key={option.label} type="button" aria-pressed={unreadOnly === option.value} onClick={() => setUnreadOnly(option.value)}
          className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${unreadOnly === option.value ? 'border-gold/50 bg-gold/10 font-medium text-gold-fg' : 'border-line text-muted hover:bg-surface-raised hover:text-text'}`}>{option.label}</button>)}
      </div>
      <Alert visible={!!markAll.error} className="mb-4" title="Could not mark as read">{friendlyError(markAll.error)}</Alert>
      {reviews.isPending ? <Spinner label="Loading reviews" /> : null}
      <Alert visible={!!reviews.error} title="Could not load reviews">{friendlyError(reviews.error)}</Alert>
      {reviews.data && items.length === 0 ? <p className="text-sm text-muted">{unreadOnly ? 'You’re all caught up.' : 'No client activity yet.'}</p> : null}
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
  );
}
