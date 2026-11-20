import { Avatar } from '@/components/Avatar';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { ArchiveIcon, CalendarIcon, ServicesIcon, SettingsIcon, TrashIcon } from '@/components/icons';
import { ConfirmDialog, DialogBody } from '@/components/Dialog';
import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { AnimatedDisclosure } from '@/components/AnimatedDisclosure';
import { useViewer } from '@/app/auth';
import { Alert, Badge, Button, EmptyState, PageHeader, SectionHeading, SectionTitle, SelectField, Spinner, TextAreaField, TextField } from '@/components/ui';
import { IconButton } from '@/components/controls';
import type { ServiceKind } from '@/domain/programs/contract';
import { RecentUpdatesCard } from '@/features/activity/ActivityViews';
import { ProgramsCard } from '@/features/programs/ProgramsCard';
import { MeetingsCard } from '@/features/scheduling/MeetingsCard';
import { CurrentProgramBox } from '@/features/programs/CurrentProgram';
import { useClientPrograms } from '@/features/programs/api';
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
  useArchivedServiceContents,
  useDeleteArchivedService,
  useDeleteClientNote,
  useInviteClient,
  useSetEnrollmentStatus,
  usePendingServiceRequests,
  useUpdateClientStatus,
  type ClientRow,
  type EnrollmentRow,
} from './api';
import { statusBadge } from './ClientsTable';
import { ServiceRequestRows } from './ServiceRequests';

export function ClientDetailPage() {
  const { clientId } = useParams();
  const viewer = useViewer();
  const client = useClient(clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
  const isAdmin = viewer.data?.staffRole === 'admin';
  // Reviews and Meetings link to a meeting with ?session=; closing it drops the parameter.
  const [params, setParams] = useSearchParams();
  const focusSession = params.get('session');

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
        <div className="grid min-w-0 gap-8">
          <RecentUpdatesCard client={c} />
          {focusSession || c.service_enrollments.some((e) => !e.archived_at) ? (
            <MeetingsCard clientId={c.id} heading={<span className="flex items-center gap-2"><SectionTitle icon={<CalendarIcon />}>Meetings</SectionTitle></span>}
              focusMeetingId={focusSession} onFocusClosed={() => setParams((p) => { p.delete('session'); return p; }, { replace: true })} />
          ) : null}
          <ProgramsCard clientId={c.id} enrollments={c.service_enrollments} />
        </div>
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
    <AnimatedDisclosure label={<SectionTitle icon={<SettingsIcon />}>Client settings</SectionTitle>} className="mt-4 border-t border-line pt-3">
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
  const remove = useDeleteArchivedService();
  const programs = useClientPrograms(clientId);
  const newestFirst = [...enrollments].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const visible = newestFirst.filter((enrollment) => !enrollment.archived_at);
  const archived = newestFirst.filter((enrollment) => enrollment.archived_at);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<EnrollmentRow | null>(null);
  const live = enrollments.filter((e) => e.status !== 'ended');
  const available = SERVICES.filter((s) => !live.some((e) => e.service === s));
  const [service, setService] = useState<ServiceKind | ''>('');
  // Any staff member with access can answer requests, not only admins (decision 0044).
  const requests = usePendingServiceRequests(clientId);

  return (
    <section className="min-w-0">
      <SectionHeading icon={<ServicesIcon />} className="mb-3">Services</SectionHeading>
      {requests.data?.length ? <div className="mb-3"><ServiceRequestRows requests={requests.data} /></div> : null}
      <Alert visible={!!requests.error} className="mb-3" title="Could not load service requests">{friendlyError(requests.error)}</Alert>
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
                <IconButton label={`Archive ended ${SERVICE_LABELS[enrollment.service]} service`} title="Archive service"
                  disabled={archive.isPending} onClick={() => archive.mutate(enrollment.id)}>
                  <ArchiveIcon />
                </IconButton>
              ) : <ActionsMenu label={`Options for ${SERVICE_LABELS[enrollment.service]}`}>
                <ActionItem disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: enrollment.id, status: enrollment.status === 'paused' ? 'active' : 'paused' })}>
                  {enrollment.status === 'paused' ? 'Resume' : 'Pause'}
                </ActionItem>
                <ActionItem danger disabled={setStatus.isPending}
                  onClick={() => setStatus.mutate({ id: enrollment.id, status: 'ended' })}>End</ActionItem>
              </ActionsMenu> : null}
            </div>
            <CurrentProgramBox clientId={clientId} enrollment={enrollment} programs={programs.data ?? []} />
          </li>
        ))}
      </ul>
      {canEdit && archived.length ? (
        <div className="mt-2">
          <Button variant="ghost" aria-expanded={showArchived} onClick={() => setShowArchived((value) => !value)}>
            {showArchived ? 'Hide archived services' : `Show archived services (${archived.length})`}
          </Button>
          {showArchived ? (
            <ul className="divide-y divide-line">
              {archived.map((enrollment) => (
                <li key={enrollment.id} className="flex min-h-11 items-center gap-2 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-muted">{SERVICE_LABELS[enrollment.service]}</p>
                    <p className="text-xs text-muted">
                      From {formatDate(enrollment.starts_on)}{enrollment.ends_on ? ` to ${formatDate(enrollment.ends_on)}` : ''}
                    </p>
                  </div>
                  <Badge>Archived</Badge>
                  <IconButton label={`Delete archived ${SERVICE_LABELS[enrollment.service]} service`} title="Delete service" tone="danger"
                    disabled={remove.isPending} onClick={() => { remove.reset(); setDeleting(enrollment); }}>
                    <TrashIcon />
                  </IconButton>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
      {deleting ? <DeleteServiceDialog enrollment={deleting} onClose={() => setDeleting(null)} /> : null}
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

/**
 * Deletes an archived service. With programs under it, the admin can also delete them, published
 * ones and the client's logged workouts included (decision 0038), after typing the service's name.
 */
function DeleteServiceDialog({ enrollment, onClose }: { enrollment: EnrollmentRow; onClose: () => void }) {
  const remove = useDeleteArchivedService();
  const contents = useArchivedServiceContents(enrollment.id);
  const [withPrograms, setWithPrograms] = useState(false);
  const [typed, setTyped] = useState('');
  const label = SERVICE_LABELS[enrollment.service];
  const linked = contents.data?.programs ?? 0;
  const confirmed = !withPrograms || typed.trim().toLowerCase() === label.toLowerCase();
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

  return (
    <ConfirmDialog title={`Delete archived ${label}?`} description="This permanently removes the service record."
      cancelLabel="Keep service" confirmLabel={<><TrashIcon />{withPrograms ? 'Delete service and programs' : 'Delete service'}</>}
      tone="danger" pending={remove.isPending} disabled={contents.isPending || (linked > 0 && !withPrograms) || !confirmed}
      onConfirm={() => remove.mutate({ id: enrollment.id, deletePrograms: withPrograms }, { onSuccess: onClose })} onClose={onClose}>
      <DialogBody className="grid gap-4">
        {contents.isPending ? <Spinner label="Checking what this service has" /> : null}
        <Alert visible={!!contents.error} title="Could not check the service">{friendlyError(contents.error)}</Alert>
        {contents.data && linked === 0 ? <p className="text-sm text-muted">Nothing else is linked to it.</p> : null}
        {contents.data && linked > 0 ? (
          <>
            <p className="text-sm">
              It still has {plural(linked, 'program')}
              {contents.data.published ? `, ${contents.data.published} published` : ''}
              {contents.data.loggedWorkouts ? `, with ${plural(contents.data.loggedWorkouts, 'logged workout')}` : ''}.
              Keep it archived, or delete the programs with it.
            </p>
            <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-card border border-danger/40 p-3 text-sm">
              <input type="checkbox" className="mt-0.5 size-4 accent-gold" checked={withPrograms} onChange={(event) => setWithPrograms(event.target.checked)} />
              <span>
                <span className="block font-medium text-danger">Also delete its programs</span>
                <span className="block text-muted">Removes the programs, every revision, and the client’s logged workouts and Stimulus & Fatigue answers for them. Daily nutrition logs are kept. This can’t be undone.</span>
              </span>
            </label>
            {withPrograms ? (
              <TextField label={`Type “${label}” to confirm`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />
            ) : null}
          </>
        ) : null}
        <Alert visible={!!remove.error} title="Could not delete service">{friendlyError(remove.error)}</Alert>
      </DialogBody>
    </ConfirmDialog>
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
      {deleting ? <ConfirmDialog title="Delete this note?" description="This permanently deletes your note."
        cancelLabel="Keep note" confirmLabel={<><TrashIcon />Delete note</>} tone="danger" pending={remove.isPending}
        onConfirm={() => remove.mutate(deleting, { onSuccess: () => setDeleting(null) })} onClose={() => setDeleting(null)}>
        <Alert visible={!!remove.error} className="m-4" title="Could not delete note">{friendlyError(remove.error)}</Alert>
      </ConfirmDialog> : null}
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
