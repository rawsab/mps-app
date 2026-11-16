import { useState, type FormEvent } from 'react';
import { useViewer } from '@/app/auth';
import { Alert, Button, Card, EmptyState, PageHeader, Spinner, TextField } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { SERVICE_LABELS, SERVICES } from '@/lib/services';
import { friendlyError, NewClientInput, useClients, useCreateClient } from './api';
import { ClientsTable } from './ClientsTable';

export function ClientsPage() {
  const viewer = useViewer();
  const clients = useClients();
  const [creating, setCreating] = useState(false);
  const isAdmin = viewer.data?.staffRole === 'admin';

  return (
    <div>
      <PageHeader title="Clients" actions={isAdmin && !creating ? <Button onClick={() => setCreating(true)}>New client</Button> : null} />
      {creating ? <NewClientForm onDone={() => setCreating(false)} /> : null}
      {clients.isPending ? <Spinner label="Loading clients" /> : null}
      {clients.error ? <Alert title="Could not load clients">{friendlyError(clients.error)}</Alert> : null}
      {clients.data && clients.data.length === 0 ? (
        <EmptyState title="No clients yet">
          {isAdmin
            ? 'Create a client record to start building or importing their program. Invitations can come later.'
            : 'No clients have been assigned to you.'}
        </EmptyState>
      ) : null}
      {clients.data && clients.data.length > 0 ? <ClientsTable rows={clients.data} /> : null}
    </div>
  );
}

function NewClientForm({ onDone }: { onDone: () => void }) {
  const create = useCreateClient();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<ServiceKind[]>([]);
  const defaultTz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = NewClientInput.safeParse({
      full_name: form.get('full_name'),
      email: form.get('email'),
      timezone: form.get('timezone'),
      services,
    });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    create.mutate(parsed.data, { onSuccess: onDone });
  }

  return (
    <Card className="mb-6">
      <form onSubmit={submit} noValidate className="grid gap-4">
        <h2 className="text-lg font-semibold">New client</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Full name" name="full_name" autoComplete="off" error={errors.full_name} />
          <TextField label="Email" name="email" type="email" autoComplete="off" error={errors.email} hint="Used for the invitation. No email is sent yet." />
          <TextField label="Time zone" name="timezone" defaultValue={defaultTz} error={errors.timezone} hint="Activity dates use the client's time zone." />
        </div>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Services</legend>
          <div className="flex flex-wrap gap-2">
            {SERVICES.map((s) => (
              <label key={s} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-card border border-line px-3 text-sm has-[:checked]:border-gold">
                <input
                  type="checkbox"
                  className="size-4 accent-gold"
                  checked={services.includes(s)}
                  onChange={(e) => setServices((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
                />
                {SERVICE_LABELS[s]}
              </label>
            ))}
          </div>
          {errors.services ? <p className="mt-1 text-sm text-danger">{errors.services}</p> : null}
        </fieldset>
        {create.error ? <Alert title="Client not created">{friendlyError(create.error)}</Alert> : null}
        <div className="flex gap-2">
          <Button type="submit" busy={create.isPending}>
            Create client
          </Button>
          <Button type="button" variant="secondary" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
