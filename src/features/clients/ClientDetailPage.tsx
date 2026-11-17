import { Avatar } from '@/components/Avatar';
import { ActionsMenu, actionItemClass } from '@/components/ActionsMenu';
import { ArchiveIcon, TrashIcon } from '@/components/icons';
import { Dialog } from '@/components/Dialog';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';
import { AnimatedDisclosure } from '@/components/AnimatedDisclosure';
import { useViewer } from '@/app/auth';
import { Alert, Badge, Button, EmptyState, PageHeader, SelectField, Spinner, TextAreaField } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { RecentUpdatesCard } from '@/features/activity/ActivityViews';
import { ProgramsCard } from '@/features/programs/ProgramsCard';
import { capitalize, formatDate } from '@/lib/format';
import { SERVICE_LABELS, SERVICES } from '@/lib/services';
import {
  friendlyError,
  NoteBody,
  useAddClientNote,
  useAddEnrollment,
  useArchiveEnrollment,
  useClient,
  useClientNotes,
  useClientPhoto,
  useDeleteClientNote,
  useInviteClient,
  useSetEnrollmentStatus,
  useUpdateClientStatus,
  type ClientRow,
  type EnrollmentRow,
} from './api';
import { statusBadge } from './ClientsTable';

export function ClientDetailPage() {
  const { clientId } = useParams();
  const viewer = useViewer();
  const client = useClient(clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
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
      <PageHeader leading={<Avatar url={photo.data} name={c.full_name} className="size-14 sm:size-16" />} title={c.full_name} subtitle={<span className="break-all">{c.email}</span>} actions={statusBadge(c.status)} />
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="grid min-w-0 gap-8"><RecentUpdatesCard client={c} /><ProgramsCard clientId={c.id} enrollments={c.service_enrollments} /></div>
        <div className="grid min-w-0 gap-8 lg:border-l lg:border-line lg:pl-6">
          <ServicesCard clientId={c.id} enrollments={c.service_enrollments} canEdit={isAdmin} />
          <NotesCard clientId={c.id} />
        </div>
      </div>
      {isAdmin ? <ClientSettings client={c} /> : null}
    </div>
  );
}

function ClientSettings({ client }: { client: ClientRow }) {
  const invite = useInviteClient();
  const setStatus = useUpdateClientStatus();
  const disabled = client.status === 'disabled';

  return (
    <AnimatedDisclosure label="Client settings" className="mt-4 border-t border-line pt-3">
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
            // Any non-disabled value reactivates; the database derives pending, invited or active.
            onClick={() => setStatus.mutate({ id: client.id, status: disabled ? 'pending' : 'disabled' })}
          >
            {disabled ? 'Reactivate' : 'Disable'}
          </Button>
        </div>
      </div>
      <Alert visible={!!invite.isSuccess} tone="success">Invitation request accepted by the server ({invite.data?.status}).</Alert>
      <Alert visible={!!invite.error} title="Invitation not sent">{friendlyError(invite.error)}</Alert>
      <Alert visible={!!setStatus.error} title="Status not changed">{friendlyError(setStatus.error)}</Alert>
    </AnimatedDisclosure>
  );
}

function ServicesCard({
  clientId,
  enrollments,
  canEdit,
}: {
  clientId: string;
  enrollments: EnrollmentRow[];
  canEdit: boolean;
}) {
  const add = useAddEnrollment();
  const setStatus = useSetEnrollmentStatus();
  const archive = useArchiveEnrollment();
  const visible = enrollments.filter((enrollment) => !enrollment.archived_at);
  const live = enrollments.filter((e) => e.status !== 'ended');
  const available = SERVICES.filter((s) => !live.some((e) => e.service === s));
  const [service, setService] = useState<ServiceKind | ''>('');

  return (
    <section className="min-w-0">
      <h2 className="mb-3 text-lg font-semibold">Services</h2>
      {visible.length === 0 ? <p className="text-sm text-muted">No services to show.</p> : null}
      <ul className="divide-y divide-line">
        {visible.map((enrollment) => (
          <li key={enrollment.id} className="py-2">
            <div className="flex min-h-11 items-center gap-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium">{SERVICE_LABELS[enrollment.service]}</p>
                <p className="text-xs text-muted">
                  From {formatDate(enrollment.starts_on)}
                  {enrollment.ends_on ? ` to ${formatDate(enrollment.ends_on)}` : ''}
                </p>
              </div>
              <Badge tone={enrollment.status === 'active' ? 'gold' : 'neutral'}>{capitalize(enrollment.status)}</Badge>
              {canEdit ? enrollment.status === 'ended' ? (
                <button type="button" aria-label={`Archive ended ${SERVICE_LABELS[enrollment.service]} service`} title="Archive service"
                  disabled={archive.isPending} onClick={() => archive.mutate(enrollment.id)}
                  className="flex size-11 shrink-0 items-center justify-center rounded-card text-muted transition-colors hover:bg-surface-raised hover:text-text disabled:opacity-40">
                  <ArchiveIcon />
                </button>
              ) : <ActionsMenu label={`Options for ${SERVICE_LABELS[enrollment.service]}`}>
                <button type="button" className={actionItemClass} disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: enrollment.id, status: enrollment.status === 'paused' ? 'active' : 'paused' })}>
                  {enrollment.status === 'paused' ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className={`${actionItemClass} text-danger`} disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: enrollment.id, status: 'ended' })}>End</button>
              </ActionsMenu> : null}
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
          <SelectField label="Add service" value={service} onChange={(ev) => setService(ev.target.value as ServiceKind)} className="min-w-0 flex-1 basis-44">
            <option value="">Choose a service</option>
            {available.map((s) => (
              <option key={s} value={s}>
                {SERVICE_LABELS[s]}
              </option>
            ))}
          </SelectField>
          <Button type="submit" disabled={!service} busy={add.isPending}>
            Add service
          </Button>
        </form>
      ) : null}
      <Alert visible={!!add.error} className="mt-3">{friendlyError(add.error)}</Alert>
      <Alert visible={!!archive.error} className="mt-3" title="Could not archive service">{friendlyError(archive.error)}</Alert>
      <Alert visible={!!setStatus.error} className="mt-3">{friendlyError(setStatus.error)}</Alert>
    </section>
  );
}

/** Private coaching notes. Any staff member who can see the client can read and add them (PRD §4). */
function NotesCard({ clientId }: { clientId: string }) {
  const notes = useClientNotes(clientId);
  const viewer = useViewer();
  const remove = useDeleteClientNote(clientId);
  const [deleting, setDeleting] = useState<string | null>(null);
  const add = useAddClientNote(clientId);
  const [draft, setDraft] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string>();

  function submit(e: FormEvent) {
    e.preventDefault();
    const parsed = NoteBody.safeParse(draft);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    setError(undefined);
    add.mutate(parsed.data, { onSuccess: () => setDraft('') });
  }

  return (
    <section className="min-w-0">
      <h2 className="text-lg font-semibold">Notes</h2>
      <p className="mb-3 text-sm text-muted">Private to staff. The client never sees these.</p>
      {notes.isPending ? <Spinner label="Loading notes" /> : null}
      <Alert visible={!!notes.error} title="Could not load notes">{friendlyError(notes.error)}</Alert>
      {notes.data && notes.data.length > 0 ? (
        <ul className="mb-3 divide-y divide-line">
          {(showAll ? notes.data : notes.data.slice(0, 3)).map((n) => (
            <li key={n.id} className="flex items-start gap-3 py-3">
              <div className="min-w-0 flex-1"><p className="whitespace-pre-wrap break-words text-sm text-text">{n.body}</p>
              <p className="mt-1.5 text-xs text-muted">{formatDate(n.created_at)}</p></div>
              {n.author_id === viewer.data?.userId ? <Button variant="ghost" aria-label="Delete note" title="Delete note" disabled={remove.isPending} onClick={() => { remove.reset(); setDeleting(n.id); }}><TrashIcon /></Button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {notes.data && notes.data.length > 3 ? <Button variant="ghost" className="mb-3" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Show recent notes' : `Show all ${notes.data.length} notes`}</Button> : null}
      {notes.data && notes.data.length === 0 ? <p className="mb-4 text-sm text-muted">No notes yet.</p> : null}
      <Alert visible={!!(remove.error && !deleting)} title="Could not delete note">{friendlyError(remove.error)}</Alert>
      {deleting ? <Dialog title="Delete this note?" description="This permanently deletes your note." onClose={() => { if (!remove.isPending) setDeleting(null); }} footer={<>
        <Button variant="secondary" disabled={remove.isPending} onClick={() => setDeleting(null)}>Keep note</Button>
        <Button variant="danger" busy={remove.isPending} onClick={() => remove.mutate(deleting, { onSuccess: () => setDeleting(null) })}><TrashIcon />Delete note</Button>
      </>}><Alert visible={!!remove.error} className="m-4" title="Could not delete note">{friendlyError(remove.error)}</Alert></Dialog> : null}
      <form onSubmit={submit} noValidate className="grid gap-3">
        <TextAreaField label="Add a note" rows={3} maxLength={5000} value={draft} onChange={(e) => setDraft(e.target.value)} error={error} />
        <Alert visible={!!add.error} title="Note not saved">{friendlyError(add.error)}</Alert>
        <div>
          <Button type="submit" variant="secondary" busy={add.isPending}>
            Save note
          </Button>
        </div>
      </form>
    </section>
  );
}
