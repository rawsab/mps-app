import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { useViewer } from '@/app/auth';
import { Alert, Badge, Button, Card, EmptyState, PageHeader, SelectField, Spinner } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { capitalize, formatDate } from '@/lib/format';
import { SERVICE_LABELS, SERVICES } from '@/lib/services';
import {
  friendlyError,
  useAddEnrollment,
  useClient,
  useInviteClient,
  useSetEnrollmentStatus,
  useUpdateClientStatus,
  type ClientRow,
} from './api';
import { statusBadge } from './ClientsTable';

export function ClientDetailPage() {
  const { clientId } = useParams();
  const viewer = useViewer();
  const client = useClient(clientId);
  const isAdmin = viewer.data?.staffRole === 'admin';

  if (client.isPending) return <Spinner label="Loading client" />;
  if (client.error) return <Alert title="Could not load client">{friendlyError(client.error)}</Alert>;
  if (!client.data) {
    return (
      <EmptyState title="Client not found" action={<Link className="inline-flex min-h-11 items-center text-sm text-gold-fg" to="/coach/clients"><span className="link">Back to clients</span></Link>}>
        The client does not exist or is not assigned to you.
      </EmptyState>
    );
  }
  const c = client.data;

  return (
    <div className="grid gap-5">
      <div>
        <Link to="/coach/clients" className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-muted hover:text-text">
          <span aria-hidden className="arrow-back">←</span>
          <span>Clients</span>
        </Link>
      </div>
      <PageHeader title={c.full_name} subtitle={<span className="break-all">{c.email}</span>} actions={statusBadge(c.status)} />
      <ServicesCard clientId={c.id} enrollments={c.service_enrollments} canEdit={isAdmin} />
      <EmptyState title="Programs">
        Program drafts, the Program and Grid editors, publishing and imports arrive in milestones M3 and M7. Nothing is stored for this
        client yet.
      </EmptyState>
      {isAdmin ? <ClientSettings client={c} /> : null}
    </div>
  );
}

function ClientSettings({ client }: { client: ClientRow }) {
  const invite = useInviteClient();
  const setStatus = useUpdateClientStatus();
  const disabled = client.status === 'disabled';
  const hasAccount = client.auth_user_id !== null;

  return (
    <section aria-labelledby="client-settings" className="mt-4 grid gap-3">
      <h2 id="client-settings" className="text-lg font-semibold">
        Client settings
      </h2>
      <div className="rounded-card border border-line bg-surface">
        <dl className="grid gap-x-6 gap-y-3 p-4 text-sm sm:grid-cols-[10rem_1fr] sm:p-5">
          <dt className="text-muted">Email</dt>
          <dd className="break-all">{client.email}</dd>
          <dt className="text-muted">Time zone</dt>
          <dd>{client.timezone}</dd>
          <dt className="text-muted">Added</dt>
          <dd>{formatDate(client.created_at)}</dd>
        </dl>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 sm:p-5">
          <div className="min-w-0">
            <p className="font-medium">Account access</p>
            <p className="text-sm text-muted">
              {client.status === 'pending' && 'No account yet. You can prepare programs before inviting the client.'}
              {client.status === 'invited' && 'Invitation sent. The client becomes active after first sign-in.'}
              {client.status === 'active' && 'The client has signed in.'}
              {disabled && 'Access disabled. The client cannot read any data, even with an existing session.'}
            </p>
          </div>
          {!disabled && client.status !== 'active' ? (
            <Button onClick={() => invite.mutate(client.id)} busy={invite.isPending}>
              {client.status === 'invited' ? 'Resend invitation' : 'Send invitation'}
            </Button>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-4 sm:p-5">
          <div className="min-w-0">
            <p className={`font-medium ${disabled ? '' : 'text-danger'}`}>{disabled ? 'Reactivate access' : 'Disable access'}</p>
            <p className="text-sm text-muted">
              {disabled
                ? 'Restores access to their published programs and history.'
                : 'Blocks the client from all data immediately. Their records are kept.'}
            </p>
          </div>
          <Button
            variant={disabled ? 'secondary' : 'danger'}
            busy={setStatus.isPending}
            onClick={() => setStatus.mutate({ id: client.id, status: disabled ? (hasAccount ? 'active' : 'pending') : 'disabled' })}
          >
            {disabled ? 'Reactivate' : 'Disable'}
          </Button>
        </div>
      </div>
      {invite.isSuccess ? <Alert tone="success">Invitation request accepted by the server ({invite.data?.status}).</Alert> : null}
      {invite.error ? <Alert title="Invitation not sent">{friendlyError(invite.error)}</Alert> : null}
      {setStatus.error ? <Alert title="Status not changed">{friendlyError(setStatus.error)}</Alert> : null}
    </section>
  );
}

function ServicesCard({
  clientId,
  enrollments,
  canEdit,
}: {
  clientId: string;
  enrollments: { id: string; service: ServiceKind; status: string; starts_on: string; ends_on: string | null }[];
  canEdit: boolean;
}) {
  const add = useAddEnrollment();
  const setStatus = useSetEnrollmentStatus();
  const live = enrollments.filter((e) => e.status !== 'ended');
  const available = SERVICES.filter((s) => !live.some((e) => e.service === s));
  const [service, setService] = useState<ServiceKind | ''>('');

  return (
    <Card>
      <h2 className="mb-3 text-lg font-semibold">Services</h2>
      {enrollments.length === 0 ? <p className="text-sm text-muted">No services assigned.</p> : null}
      <ul className="grid gap-2">
        {enrollments.map((e) => (
          <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3">
            <div>
              <p className="font-medium">{SERVICE_LABELS[e.service]}</p>
              <p className="text-xs text-muted">
                From {formatDate(e.starts_on)}
                {e.ends_on ? ` to ${formatDate(e.ends_on)}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={e.status === 'active' ? 'gold' : 'neutral'}>{capitalize(e.status)}</Badge>
              {canEdit && e.status !== 'ended' ? (
                <>
                  <Button variant="ghost" onClick={() => setStatus.mutate({ id: e.id, status: e.status === 'paused' ? 'active' : 'paused' })}>
                    {e.status === 'paused' ? 'Resume' : 'Pause'}
                  </Button>
                  <Button variant="ghost" onClick={() => setStatus.mutate({ id: e.id, status: 'ended' })}>
                    End
                  </Button>
                </>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit && available.length ? (
        <form
          className="mt-4 flex flex-wrap items-end gap-2"
          onSubmit={(ev) => {
            ev.preventDefault();
            if (service) add.mutate({ clientId, service }, { onSuccess: () => setService('') });
          }}
        >
          <SelectField label="Add service" value={service} onChange={(ev) => setService(ev.target.value as ServiceKind)} className="min-w-56">
            <option value="">Choose a service</option>
            {available.map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <Button type="submit" disabled={!service} busy={add.isPending}>
            Add
          </Button>
        </form>
      ) : null}
      {add.error ? <div className="mt-3"><Alert>{friendlyError(add.error)}</Alert></div> : null}
      {setStatus.error ? <div className="mt-3"><Alert>{friendlyError(setStatus.error)}</Alert></div> : null}
    </Card>
  );
}
