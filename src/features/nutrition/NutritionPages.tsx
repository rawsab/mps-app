import { Link, Navigate, useParams } from 'react-router';
import { useViewer } from '@/app/auth';
import { Alert, Badge, Button, EmptyState, PageHeader, Spinner } from '@/components/ui';
import { NutritionIcon } from '@/components/icons';
import { activeNutritionProgram } from '@/domain/clientHome';
import { nutritionWeeks } from '@/domain/nutritionProgram';
import { formatDate } from '@/lib/format';
import { nutritionError, useNutrition } from './api';
import { useNutritionProgram, useNutritionPrograms } from './programApi';
import { NutritionTrendChart } from './NutritionTrendChart';
import { NutritionAtAGlance } from './NutritionSpreadsheet';
import { NutritionProgramPage } from './NutritionProgramPage';

/** Nutrition follows Training: published programs first, then each program's spreadsheet. */
export function NutritionPage({ coach = false }: { coach?: boolean }) {
  const viewer = useViewer();
  const { clientId } = useParams();
  const programs = useNutritionPrograms(coach ? undefined : viewer.data?.client?.id);
  const daily = useNutrition(coach ? undefined : viewer.data?.client?.id);
  if (coach) return <Navigate to={`/coach/clients/${clientId}`} replace />;
  if (programs.isPending || daily.isPending) return <Spinner label="Loading nutrition" />;
  const active = programs.data && daily.data ? activeNutritionProgram(programs.data, daily.data.today) : undefined;
  return <div>
    {active ? <NutritionProgramPage id={active.id} embedded /> : <PageHeader title="Nutrition" />}
    <Alert visible={!!programs.error} title="Could not load programs">{nutritionError(programs.error)}</Alert>
    {programs.error ? <Button variant="secondary" onClick={() => void programs.refetch()}>Retry</Button> : null}
    {programs.data?.length === 0 ? <EmptyState title="No nutritional program yet">Your coach hasn’t published a nutritional program for you. It will appear here once they do.</EmptyState> : null}
    <Alert visible={!!daily.error} title="Daily entry unavailable">{nutritionError(daily.error)}</Alert>
    {daily.error ? <Button variant="secondary" onClick={() => void daily.refetch()}>Retry daily entry</Button> : null}
    {programs.data?.length ? <h2 className={`${active ? 'mt-10' : 'mt-4'} mb-2 text-lg font-semibold`}>Your programs</h2> : null}
    <ul className="divide-y divide-line">{programs.data?.map((p) => <li key={p.id}>
      <Link to={`/nutrition/${p.id}`} className="row-link group flex min-h-16 items-center gap-3 rounded-card px-2 py-3 hover:bg-surface-raised">
        <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-full bg-success/10 text-success [&>svg]:size-4"><NutritionIcon /></span>
        <div className="min-w-0 flex-1"><p className="break-words font-medium">{p.program_style}</p><p className="text-xs text-muted">Nutritional programming · {p.week_count} weeks · Start Date {formatDate(p.start_date)}</p></div>
        {p.is_current && !p.archived_at ? <Badge tone="gold">Current</Badge> : null}{p.archived_at ? <Badge>Archived</Badge> : null}<span aria-hidden className="text-muted group-hover:text-text">→</span>
      </Link>
    </li>)}</ul>
  </div>;
}

export function NutritionProgressPage() {
  const viewer = useViewer();
  const enabled = viewer.data?.services.includes('nutrition');
  const programs = useNutritionPrograms(enabled ? viewer.data?.client?.id : undefined);
  return <div className="grid gap-5"><PageHeader title="Progress" />
    {!enabled ? <EmptyState title="Progress is on the way">Training trends will appear here when exercise history is available.</EmptyState>
      : programs.isPending ? <Spinner label="Loading progress" /> : programs.error ? <Alert>{nutritionError(programs.error)}</Alert>
      : programs.data.length === 0 ? <EmptyState title="No nutrition progress yet">Your program summaries will appear after your coach publishes a nutritional program.</EmptyState>
      : programs.data.map((program) => <ProgramProgress key={program.id} id={program.id} />)}
  </div>;
}
function ProgramProgress({ id }: { id: string }) {
  const query = useNutritionProgram(id, true);
  if (query.isPending) return <Spinner label="Loading program progress" />;
  if (query.error) return <Alert>{nutritionError(query.error)}</Alert>;
  const data = query.data;
  return <section className="grid min-w-0 gap-3"><h2 className="text-lg font-semibold">{data.revision.program_style}</h2>
    <NutritionAtAGlance weeks={nutritionWeeks(data.revision, data.weights, data.entries, data.today)} />
    <NutritionTrendChart weeks={nutritionWeeks(data.revision, data.weights, data.entries, data.today)} today={data.today} weightUnit={data.revision.weight_unit} />
    <Link className="link inline-flex min-h-11 items-center" to={`/nutrition/${id}`}>View spreadsheet →</Link>
  </section>;
}
