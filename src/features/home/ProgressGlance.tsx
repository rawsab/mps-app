import { Link } from 'react-router';
import { ProgressIcon } from '@/components/icons';
import { Alert, SectionTitle, Spinner } from '@/components/ui';
import { activeNutritionProgram, trainingProgress } from '@/domain/clientHome';
import { nutritionWeeks } from '@/domain/nutritionProgram';
import { nutritionError } from '@/features/nutrition/api';
import { useNutritionProgram, useNutritionPrograms } from '@/features/nutrition/programApi';
import { NutritionTrendChart } from '@/features/nutrition/NutritionTrendChart';
import { trainingErrorMessage } from '@/features/training/api';
import { useCurrentMesocycle } from './api';

/** A short look at progress (decision 0042): nutrition trends and mesocycle completion. The Progress page has the rest. */
export function ProgressGlance({ clientId, nutrition, mesocycle, today }: { clientId: string; nutrition: boolean; mesocycle: boolean; today: string }) {
  return (
    <section aria-labelledby="home-progress" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="home-progress" className="flex items-center gap-2 text-lg font-semibold"><SectionTitle icon={<ProgressIcon />}>Progress</SectionTitle></h2>
        <Link to="/progress" className="-my-3 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">View all progress</span></Link>
      </div>
      <div className="grid gap-6">
        {mesocycle ? <MesocycleProgress today={today} /> : null}
        {nutrition ? <NutritionProgress clientId={clientId} today={today} /> : null}
      </div>
    </section>
  );
}

function MesocycleProgress({ today }: { today: string }) {
  const meso = useCurrentMesocycle(true);
  if (meso.isPending) return <Spinner small label="Loading training progress" />;
  if (meso.error) return <Alert title="Training progress unavailable">{trainingErrorMessage(meso.error)}</Alert>;
  if (!meso.program || !meso.sessions) return null;
  const p = trainingProgress(meso.program, meso.sessions, today);
  const share = p.total ? p.completed / p.total : 0;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">Mesocycle</h3>
        <p className="text-sm text-muted">Week {p.week} of {p.weekCount}</p>
      </div>
      <div role="progressbar" aria-label="Workouts completed" aria-valuemin={0} aria-valuemax={p.total} aria-valuenow={p.completed}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-line">
        <div className="h-full rounded-full bg-gold" style={{ width: `${Math.round(share * 100)}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-muted">{p.completed} of {p.total} workouts completed</p>
    </div>
  );
}

function NutritionProgress({ clientId, today }: { clientId: string; today: string }) {
  const programs = useNutritionPrograms(clientId);
  const program = programs.data ? activeNutritionProgram(programs.data, today) ?? programs.data.find((p) => p.is_current && !p.archived_at) : undefined;
  const detail = useNutritionProgram(program?.id, true);
  if (programs.isPending || (program && detail.isPending)) return <Spinner small label="Loading nutrition progress" />;
  const error = programs.error ?? detail.error;
  if (error) return <Alert title="Nutrition progress unavailable">{nutritionError(error)}</Alert>;
  if (!detail.data) return null;
  const d = detail.data;
  return <NutritionTrendChart weeks={nutritionWeeks(d.revision, d.weights, d.entries, d.today)} today={d.today} weightUnit={d.revision.weight_unit} />;
}
