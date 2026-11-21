import { Link } from 'react-router';
import { ProgressIcon } from '@/components/icons';
import { Alert, SectionHeading } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';
import { activeNutritionProgram } from '@/domain/clientHome';
import { nutritionWeeks } from '@/domain/nutritionProgram';
import { nutritionError } from '@/features/nutrition/api';
import { useNutritionProgram, useNutritionPrograms } from '@/features/nutrition/programApi';
import { NutritionTrendChart } from '@/features/nutrition/NutritionTrendChart';
import { trainingErrorMessage } from '@/features/training/api';
import { TrainingProgressBar } from '@/features/training/TrainingProgress';
import { useCurrentMesocycle } from './api';

/** A short look at progress (decision 0042): nutrition trends and mesocycle completion. The Progress page has the rest. */
export function ProgressGlance({ clientId, nutrition, mesocycle, today }: { clientId: string; nutrition: boolean; mesocycle: boolean; today: string }) {
  return (
    <section aria-labelledby="home-progress" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <SectionHeading id="home-progress" icon={<ProgressIcon />}>Progress</SectionHeading>
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
  if (meso.isPending) {
    return (
      <LoadingRegion label="Loading training progress">
        <div className="flex items-baseline justify-between gap-2"><SkeletonText size="base" width="w-24" /><SkeletonText width="w-24" className="w-24" /></div>
        <Skeleton shape="round" className="mt-2 h-1.5" />
        <SkeletonText size="xs" width="w-40" className="mt-1.5" />
      </LoadingRegion>
    );
  }
  if (meso.error) return <Alert title="Training progress unavailable">{trainingErrorMessage(meso.error)}</Alert>;
  if (!meso.program || !meso.sessions) return null;
  return <TrainingProgressBar program={meso.program} sessions={meso.sessions} today={today} />;
}

function NutritionProgress({ clientId, today }: { clientId: string; today: string }) {
  const programs = useNutritionPrograms(clientId);
  const program = programs.data ? activeNutritionProgram(programs.data, today) ?? programs.data.find((p) => p.is_current && !p.archived_at) : undefined;
  const detail = useNutritionProgram(program?.id, true);
  if (programs.isPending || (program && detail.isPending)) {
    return (
      <LoadingRegion label="Loading nutrition progress" className="grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <SkeletonText size="base" width="w-16" className="w-16" />
          <div className="grid w-full grid-cols-2 gap-3 sm:w-80">
            {[0, 1].map((i) => <div key={i}><SkeletonText size="xs" width="w-10" className="mb-1" /><Skeleton className="h-11" /></div>)}
          </div>
        </div>
        {/* NutritionTrendChart's plot height. */}
        <Skeleton className="h-[276px]" />
      </LoadingRegion>
    );
  }
  const error = programs.error ?? detail.error;
  if (error) return <Alert title="Nutrition progress unavailable">{nutritionError(error)}</Alert>;
  if (!detail.data) return null;
  const d = detail.data;
  return <NutritionTrendChart weeks={nutritionWeeks(d.revision, d.weights, d.entries, d.today)} today={d.today} weightUnit={d.revision.weight_unit} />;
}
