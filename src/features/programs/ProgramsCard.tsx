import { NutritionIcon, PlusIcon, ProgressIcon, TrainingIcon } from '@/components/icons';
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { Alert, Badge, Button, Spinner } from '@/components/ui';
import type { EnrollmentRow } from '@/features/clients/api';
import { formatDate } from '@/lib/format';
import { SERVICE_LABELS } from '@/lib/services';
import { programErrorMessage, useClientPrograms, useCreateProgram, type ProgramRow } from './api';

import { ActionsMenu, actionItemClass } from '@/components/ActionsMenu';
import { RemoveProgramDialog } from './RemoveProgramDialog';
import type { ServiceKind } from '@/domain/programs/contract';

type ProgramFilter = 'all' | ServiceKind;
const programFilters: { value: ProgramFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mesocycle', label: 'Mesocycle' },
  { value: 'personal_training', label: 'Personal Training' },
  { value: 'nutrition', label: 'Nutritional' },
];

/** A client's workout programs per training service (FR-04). Nutrition has its own model (M5). */
export function ProgramsCard({ clientId, enrollments }: { clientId: string; enrollments: EnrollmentRow[] }) {
  const programs = useClientPrograms(clientId);
  const create = useCreateProgram();
  const navigate = useNavigate();
  const [removal, setRemoval] = useState<ProgramRow | null>(null);
  const [filter, setFilter] = useState<ProgramFilter>('all');
  const training = enrollments.filter((e) => e.service !== 'nutrition' && e.status !== 'ended');
  const visiblePrograms = useMemo(() => (programs.data?.filter((program) => filter === 'all' || program.service === filter) ?? [])
    .sort((a, b) => programLastEditedAt(b) - programLastEditedAt(a)), [programs.data, filter]);

  return (
    <section className="min-w-0" aria-labelledby="client-programs">
      <h2 id="client-programs" className="text-lg font-semibold">Programs</h2>
      <p className="mb-4 mt-1 text-sm text-muted">Drafts are visible to staff only. The client sees a program once it is published.</p>
      <div role="group" aria-label="Filter programs by type" className="mb-4 flex flex-wrap gap-1.5">
        {programFilters.map((option) => <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)} className={`min-h-9 rounded-full border px-3 text-sm transition-colors ${filter === option.value ? 'border-gold/50 bg-gold/10 font-medium text-gold-fg' : 'border-line text-muted hover:bg-surface-raised hover:text-text'}`}>{option.label}</button>)}
      </div>
      {programs.isPending ? <Spinner label="Loading programs" /> : null}
      {programs.error ? <Alert title="Could not load programs">{programErrorMessage(programs.error)}</Alert> : null}
      {programs.data && visiblePrograms.length > 0 ? (
        <ul className="mb-4 divide-y divide-line">
          {visiblePrograms.map((p) => (
            <li key={p.id} className="flex items-center gap-2 py-2">
              <Link
                to={`/coach/clients/${clientId}/programs/${p.id}`}
                className="row-link group flex min-h-14 min-w-0 flex-1 flex-wrap items-center justify-between gap-2 rounded-card py-3 pl-3 pr-2 hover:bg-surface-raised"
              >
                <span aria-hidden className={`grid size-9 shrink-0 place-items-center rounded-full [&>svg]:size-4 ${programServiceIconStyle(p.service)}`}>{programServiceIcon(p.service)}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{programTitle(p)}</p>
                  {p.service === 'mesocycle' && programTheme(p) ? <p className="mt-0.5 break-words text-sm text-muted">{programTheme(p)}</p> : null}
                  <p className="text-xs text-muted">{SERVICE_LABELS[p.service]} · created {formatDate(p.created_at)}</p>
                </div>
                <span className="flex items-center gap-2">
                  {programBadges(p)}
                  <span aria-hidden className="text-muted group-hover:text-text">
                    →
                  </span>
                </span>
              </Link>
              {!p.archived_at ? <ActionsMenu label={`Options for ${programTitle(p)}`}><button type="button" className={`${actionItemClass} text-danger`} onClick={() => setRemoval(p)}>{p.program_revisions.some((r) => r.status === 'published') ? 'Archive' : 'Delete'} program</button></ActionsMenu> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {programs.data && visiblePrograms.length === 0 ? <p className="mb-4 text-sm text-muted">{filter === 'all' ? 'No programs yet.' : `No ${programFilters.find((option) => option.value === filter)?.label.toLowerCase()} programs yet.`}</p> : null}
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
              <PlusIcon /> New {SERVICE_LABELS[e.service].toLowerCase()} program
            </Button>
          ))}
        </div>
      )}
      {create.error ? (
        <div className="mt-3">
          <Alert title="Program not created">{programErrorMessage(create.error)}</Alert>
        </div>
      ) : null}
      {removal ? <RemoveProgramDialog program={removal} onClose={() => setRemoval(null)} /> : null}
    </section>
  );
}

function programTitle(p: ProgramRow): string {
  const draft = p.program_revisions.find((r) => r.status === 'draft');
  const current = p.program_revisions.find((r) => r.id === p.current_revision_id);
  return (draft?.title || current?.title || '').trim() || 'Untitled program';
}

export function programServiceIcon(service: ServiceKind) {
  if (service === 'nutrition') return <NutritionIcon />;
  if (service === 'mesocycle') return <ProgressIcon />;
  return <TrainingIcon />;
}

export function programServiceIconStyle(service: ServiceKind): string {
  if (service === 'nutrition') return 'bg-success/10 text-success';
  if (service === 'mesocycle') return 'bg-gold/10 text-gold-fg';
  return 'bg-surface-raised text-text';
}

function programLastEditedAt(program: ProgramRow): number {
  return Math.max(
    new Date(program.created_at).getTime(),
    ...program.program_revisions.map((revision) => new Date(revision.updated_at).getTime()),
  );
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

function programTheme(program: ProgramRow): string {
  const revision = program.program_revisions.find((revision) => revision.status === 'draft')
    ?? program.program_revisions.find((revision) => revision.id === program.current_revision_id);
  return revision?.program_theme?.trim() ?? '';
}
