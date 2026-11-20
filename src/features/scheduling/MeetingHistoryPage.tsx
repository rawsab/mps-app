import { Link, useParams } from 'react-router';
import { Alert, Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { friendlyError, useClient } from '@/features/clients/api';
import { schedulingError, useMeetingContext, usePastMeetings } from './api';
import { MeetingRow } from './MeetingsCard';
import { zoneLabel } from './time';

/**
 * Every started meeting for one client, newest first, a page at a time (decision 0047). Modelled on
 * the activity history page. Rows open the meeting on the client page, so editing stays in one dialog.
 */
export function MeetingHistoryPage() {
  const { clientId } = useParams();
  const client = useClient(clientId);
  const context = useMeetingContext(clientId!);
  const past = usePastMeetings(clientId!);
  const back = (
    <Link to={`/coach/clients/${clientId}`} className="-my-3 mb-1 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text">
      <span aria-hidden className="arrow-back">←</span>
      <span>{client.data?.full_name ?? 'Client'}</span>
    </Link>
  );

  if (client.isPending || context.isPending) return <div>{back}<Spinner label="Loading meetings" /></div>;
  if (client.error) return <div>{back}<Alert title="Could not load client">{friendlyError(client.error)}</Alert></div>;
  if (!client.data) {
    return <EmptyState title="Client not found" action={<Link className="inline-flex min-h-11 items-center text-sm text-gold-fg" to="/coach/clients"><span className="link">Back to clients</span></Link>}>
      The client does not exist or is not assigned to you.
    </EmptyState>;
  }
  if (context.error) return <div>{back}<Alert title="Could not load meetings">{schedulingError(context.error)}</Alert></div>;
  const c = client.data;
  const timeZone = context.data.timezone;
  const rows = past.data?.pages.flat() ?? [];

  return (
    <div>
      {back}
      <PageHeader title="Past meetings" subtitle={`${c.full_name} · Times in ${zoneLabel(timeZone)}`} />
      {past.isPending ? <Spinner label="Loading past meetings" /> : null}
      <Alert visible={!!past.error} title="Could not load past meetings">{schedulingError(past.error)}</Alert>
      {past.data && rows.length === 0 ? <p className="text-sm text-muted">No past meetings yet.</p> : null}
      {rows.length ? (
        <ul className="divide-y divide-line">
          {rows.map((meeting) => (
            <MeetingRow key={meeting.id} meeting={meeting} timeZone={timeZone}
              to={`/coach/clients/${c.id}?${new URLSearchParams({ session: meeting.id })}`} />
          ))}
        </ul>
      ) : null}
      {past.hasNextPage ? (
        <div className="mt-4">
          <Button variant="secondary" busy={past.isFetchingNextPage} onClick={() => void past.fetchNextPage()}>Load more</Button>
        </div>
      ) : null}
    </div>
  );
}
