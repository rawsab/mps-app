import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { useViewer } from '@/app/auth';
import { MesocycleIcon, NutritionIcon, TrainingIcon } from '@/components/icons';
import { Alert, PageHeader, SectionHeading } from '@/components/ui';
import { LoadingRegion, SkeletonRows } from '@/components/Skeleton';
import type { ServiceKind } from '@/domain/programs/contract';
import { NutritionProgramRow } from '@/features/nutrition/NutritionPages';
import { nutritionError } from '@/features/nutrition/api';
import { useNutritionPrograms } from '@/features/nutrition/programApi';
import { trainingErrorMessage, usePublishedPrograms } from '@/features/training/api';
import { PublishedProgramRow } from '@/features/training/TrainingPages';
import { clientProgramPath, SERVICE_LABELS, SERVICE_SHORT_LABELS } from '@/lib/services';

const ORDER: ServiceKind[] = ['mesocycle', 'personal_training', 'nutrition'];
const ICONS: Record<ServiceKind, ReactNode> = { mesocycle: <MesocycleIcon />, personal_training: <TrainingIcon />, nutrition: <NutritionIcon /> };

/** Current first, keeping the server's order otherwise. */
const currentFirst = <T,>(items: T[], current: (item: T) => boolean) => [...items.filter(current), ...items.filter((i) => !current(i))];

/**
 * The phone tab bar's Services page (decision 0058): each of the client's services with its
 * programs, the current one first and marked Current. Each heading opens the service's own page.
 */
export function ServicesPage() {
  const viewer = useViewer().data!;
  const services = ORDER.filter((s) => viewer.services.includes(s));
  const training = usePublishedPrograms();
  const nutrition = useNutritionPrograms(services.includes('nutrition') ? viewer.client?.id : undefined);

  return (
    <div className="grid gap-8">
      <PageHeader title="Services" />
      {!services.length ? <p className="text-sm text-muted">You don’t have any services yet.</p> : null}
      {services.map((service) => {
        const id = `services-${service}`;
        const heading = (
          <div className="mb-2 flex items-center justify-between gap-3">
            <SectionHeading id={id} icon={ICONS[service]}>{SERVICE_LABELS[service]}</SectionHeading>
            <Link to={clientProgramPath(service)} className="-my-3 inline-flex min-h-11 shrink-0 items-center text-sm text-gold-fg">
              <span className="link">Open {SERVICE_SHORT_LABELS[service]}</span>
            </Link>
          </div>
        );
        if (service === 'nutrition') {
          const programs = nutrition.data ? currentFirst(nutrition.data, (p) => p.is_current && !p.archived_at) : undefined;
          return (
            <section key={service} aria-labelledby={id} className="min-w-0">
              {heading}
              {nutrition.isPending ? <LoadingRegion label="Loading programs"><SkeletonRows count={1} leading="avatar" size="lg" /></LoadingRegion> : null}
              <Alert visible={!!nutrition.error} title="Could not load your programs">{nutritionError(nutrition.error)}</Alert>
              {programs && !programs.length ? <Empty /> : null}
              {programs?.length ? <ul className="divide-y divide-line">{programs.map((p) => <NutritionProgramRow key={p.id} program={p} />)}</ul> : null}
            </section>
          );
        }
        const programs = training.data ? currentFirst(training.data.filter((p) => p.service === service), (p) => p.isCurrent) : undefined;
        return (
          <section key={service} aria-labelledby={id} className="min-w-0">
            {heading}
            {training.isPending ? <LoadingRegion label="Loading programs"><SkeletonRows count={1} leading="avatar" size="lg" /></LoadingRegion> : null}
            <Alert visible={!!training.error} title="Could not load your programs">{trainingErrorMessage(training.error)}</Alert>
            {programs && !programs.length ? <Empty /> : null}
            {programs?.length ? <ul className="divide-y divide-line">{programs.map((p) => <PublishedProgramRow key={p.programId} program={p} />)}</ul> : null}
          </section>
        );
      })}
    </div>
  );
}

function Empty() {
  return <p className="text-sm text-muted">Your coach hasn’t published a program yet. It will appear here once they do.</p>;
}
