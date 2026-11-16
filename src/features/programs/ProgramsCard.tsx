import { Link, useNavigate } from 'react-router';
import { Alert, Badge, Button, Card, Spinner } from '@/components/ui';
import type { EnrollmentRow } from '@/features/clients/api';
import { formatDate } from '@/lib/format';
import { SERVICE_LABELS } from '@/lib/services';
import { programErrorMessage, useClientPrograms, useCreateProgram, type ProgramRow } from './api';

/** A client's workout programs per training service (FR-04). Nutrition has its own model (M5). */
export function ProgramsCard({ clientId, enrollments }: { clientId: string; enrollments: EnrollmentRow[] }) {
  const programs = useClientPrograms(clientId);
  const create = useCreateProgram();
  const navigate = useNavigate();
  const training = enrollments.filter((e) => e.service !== 'nutrition' && e.status !== 'ended');

  return (
    <Card>
      <h2 className="text-lg font-semibold">Programs</h2>
      <p className="mb-3 text-xs text-muted">Drafts are visible to staff only. The client sees a program once it is published.</p>
      {programs.isPending ? <Spinner label="Loading programs" /> : null}
      {programs.error ? <Alert title="Could not load programs">{programErrorMessage(programs.error)}</Alert> : null}
      {programs.data && programs.data.length > 0 ? (
        <ul className="mb-4 grid gap-2">
          {programs.data.map((p) => (
            <li key={p.id}>
              <Link
                to={`/coach/clients/${clientId}/programs/${p.id}`}
                className="row-link group flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-card border border-line p-3 hover:bg-surface-raised"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{programTitle(p)}</p>
                  <p className="text-xs text-muted">{SERVICE_LABELS[p.service]} · created {formatDate(p.created_at)}</p>
                </div>
                <span className="flex items-center gap-2">
                  {programBadges(p)}
                  <span aria-hidden className="text-muted group-hover:text-text">
                    →
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {programs.data && programs.data.length === 0 ? <p className="mb-4 text-sm text-muted">No programs yet.</p> : null}
      {training.length === 0 ? (
        <p className="text-sm text-muted">Add a personal training or mesocycle service to create a program.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {training.map((e) => (
            <Button
              key={e.id}
              variant="secondary"
              busy={create.isPending && create.variables === e.id}
              disabled={create.isPending}
              onClick={() => create.mutate(e.id, { onSuccess: (id) => navigate(`/coach/clients/${clientId}/programs/${id}`) })}
            >
              New {SERVICE_LABELS[e.service].toLowerCase()} program
            </Button>
          ))}
        </div>
      )}
      {create.error ? (
        <div className="mt-3">
          <Alert title="Program not created">{programErrorMessage(create.error)}</Alert>
        </div>
      ) : null}
    </Card>
  );
}

function programTitle(p: ProgramRow): string {
  const draft = p.program_revisions.find((r) => r.status === 'draft');
  const current = p.program_revisions.find((r) => r.id === p.current_revision_id);
  return (draft?.title || current?.title || '').trim() || 'Untitled program';
}

function programBadges(p: ProgramRow) {
  if (p.archived_at) return <Badge>Archived</Badge>;
  const current = p.program_revisions.find((r) => r.id === p.current_revision_id);
  const draft = p.program_revisions.some((r) => r.status === 'draft');
  return (
    <>
      {current ? <Badge tone="gold">Live · rev {current.revision_number}</Badge> : <Badge>Not published</Badge>}
      {draft && current ? <Badge>Draft changes</Badge> : null}
    </>
  );
}
