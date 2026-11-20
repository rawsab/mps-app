import type { ProgramDraft } from '@/domain/programs/contract';
import { trainingProgress } from '@/domain/clientHome';
import type { TrainingSession } from '@/domain/training/volume';

/** Mesocycle week and workouts completed as a thin gold bar, on Home and the program page (decision 0042). */
export function TrainingProgressBar({ program, sessions, today, title = 'Mesocycle', className = '' }: {
  program: ProgramDraft; sessions: readonly TrainingSession[]; today: string; title?: string; className?: string;
}) {
  const p = trainingProgress(program, sessions, today);
  const share = p.total ? p.completed / p.total : 0;
  return (
    <div className={`min-w-0 ${className}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold">{title}</h3>
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
