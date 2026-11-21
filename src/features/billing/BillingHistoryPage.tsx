import { Link, useParams } from 'react-router';
import { Avatar } from '@/components/Avatar';
import { Alert, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { friendlyError, useClient, useClientPhoto } from '@/features/clients/api';
import { ClientBillingPanel } from './ClientBilling';

/** Every statement for one client, settled past months included: "See statements for previous months". */
export function BillingHistoryPage() {
  const { clientId } = useParams();
  const client = useClient(clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
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

  return (
    <div>
      {back}
      <PageHeader leading={<Avatar url={photo.data} name={c.full_name} className="size-14 sm:size-16" />} title="All statements"
        subtitle={<span className="text-lg font-medium text-text">{c.full_name}</span>} />
      <ClientBillingPanel clientId={c.id} clientName={c.full_name} heading="Billing" allStatements />
    </div>
  );
}
