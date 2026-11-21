import { Link } from 'react-router';
import { CheckCircleIcon, TodoIcon } from '@/components/icons';
import { Alert, SectionHeading, Spinner } from '@/components/ui';
import { activeNutritionProgram, dailyNutritionStatus, nextWorkout } from '@/domain/clientHome';
import { nutritionError, useNutrition } from '@/features/nutrition/api';
import { useNutritionPrograms } from '@/features/nutrition/programApi';
import { trainingErrorMessage } from '@/features/training/api';
import { clientProgramPath } from '@/lib/services';
import { useCurrentMesocycle } from './api';

/** Daily tasks for the client's services (FR-03, decision 0042): nutrition and the next mesocycle workout. */
export function ClientTodos({ clientId, nutrition, mesocycle, today }: { clientId: string; nutrition: boolean; mesocycle: boolean; today: string }) {
  return (
    <section aria-labelledby="home-todos" className="min-w-0">
      <SectionHeading id="home-todos" icon={<TodoIcon />} className="mb-2">Your to-dos</SectionHeading>
      <ul className="divide-y divide-line">
        {nutrition ? <NutritionTodo clientId={clientId} /> : null}
        {mesocycle ? <WorkoutTodo today={today} /> : null}
      </ul>
    </section>
  );
}

/** Done rows stay visible with a green check; open rows link straight to the task. */
function TodoRow({ done, title, detail, to }: { done: boolean; title: string; detail: string; to: string }) {
  const body = <>
    {done
      ? <span className="text-success"><CheckCircleIcon /><span className="sr-only">Done:</span></span>
      : <span aria-hidden className="m-0.5 size-4 shrink-0 rounded-full border-2 border-muted/60" />}
    <span className="min-w-0 flex-1">
      <span className={`block text-sm font-medium ${done ? 'text-muted' : ''}`}>{title}</span>
      <span className="block break-words text-xs text-muted">{detail}</span>
    </span>
  </>;
  return (
    <li>
      {done ? <div className="flex min-h-14 min-w-0 items-center gap-3 py-3 pl-2 pr-2">{body}</div> : (
        <Link to={to} className="row-link group flex min-h-14 min-w-0 items-center gap-3 rounded-card py-3 pl-2 pr-2 hover:bg-surface-raised">
          {body}<span aria-hidden className="text-xs text-muted group-hover:text-text">→</span>
        </Link>
      )}
    </li>
  );
}

const RowStatus = ({ children }: { children: React.ReactNode }) => <li className="py-3">{children}</li>;

function NutritionTodo({ clientId }: { clientId: string }) {
  const daily = useNutrition(clientId);
  const programs = useNutritionPrograms(clientId);
  if (daily.isPending || programs.isPending) return <RowStatus><Spinner small label="Loading nutrition" /></RowStatus>;
  if (daily.error || programs.error) return <RowStatus><Alert title="Nutrition to-do unavailable">{nutritionError(daily.error ?? programs.error)}</Alert></RowStatus>;
  if (!activeNutritionProgram(programs.data, daily.data.today)) return null;
  const status = dailyNutritionStatus(daily.data);
  const missing = [status.weighed ? '' : 'today’s weight', status.logged ? '' : 'yesterday’s calories'].filter(Boolean).join(' and ');
  return <TodoRow done={status.done} title="Daily nutrition entry" to="/nutrition"
    detail={status.done ? 'Today’s weight and yesterday’s calories are saved.' : `Add ${missing}.`} />;
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`;

function WorkoutTodo({ today }: { today: string }) {
  const meso = useCurrentMesocycle(true);
  if (meso.isPending) return <RowStatus><Spinner small label="Loading your next workout" /></RowStatus>;
  if (meso.error) return <RowStatus><Alert title="Workout to-do unavailable">{trainingErrorMessage(meso.error)}</Alert></RowStatus>;
  if (!meso.id || !meso.program || !meso.sessions) return null;
  const next = nextWorkout(meso.program, meso.sessions, today);
  if (!next) return null;
  if (next.state === 'complete') return <TodoRow done title="Next workout" detail="Program complete. Every workout is logged." to={clientProgramPath('mesocycle', meso.id)} />;
  const to = `${clientProgramPath('mesocycle', meso.id)}?${new URLSearchParams({ week: next.weekId, day: next.dayId })}`;
  const progress = next.state === 'done_today' ? 'Completed today'
    : next.state === 'not_started' && next.logged === 0 ? `${plural(next.exercises, 'exercise')} · Not started`
    : `${next.logged} of ${plural(next.exercises, 'exercise')} logged`;
  return <TodoRow done={next.state === 'done_today'} title="Next workout" detail={`${next.label} · ${progress}`} to={to} />;
}
