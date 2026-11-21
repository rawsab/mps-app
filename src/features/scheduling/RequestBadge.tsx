import { Badge } from '@/components/ui';
import type { MeetingRequest } from './api';

/** A pending client request on a meeting row: cancellations in red, reschedules in gold. */
export function RequestBadge({ request }: { request: MeetingRequest | null | undefined }) {
  if (request?.status !== 'pending') return null;
  return request.kind === 'cancel'
    ? <Badge tone="danger">Cancellation request</Badge>
    : <Badge tone="gold">Reschedule request</Badge>;
}
