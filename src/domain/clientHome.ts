import { shiftDate, type NutritionData } from './nutrition';
import type { NutritionProgramSummary } from './nutritionProgram';
import type { ProgramDraft } from './programs/contract';
import { dayHeading, weekName } from './programs/labels';
import { isExerciseLogged, type TrainingSession } from './training/volume';

// Client Home to-dos and progress (FR-03, decision 0042). Pure, so Home and tests share one rule.

/** The non-archived nutrition program whose dates cover `today`. */
export function activeNutritionProgram<T extends Pick<NutritionProgramSummary, 'archived_at' | 'start_date' | 'week_count'>>(programs: T[], today: string): T | undefined {
  return programs.find((p) => !p.archived_at && p.start_date <= today && shiftDate(p.start_date, p.week_count * 7 - 1) >= today);
}

/**
 * Today's daily entry: today's weigh-in and yesterday's calories (consumed and output), so the
 * weigh-in date and the activity date stay distinct. Null values are unanswered, never zero.
 */
export function dailyNutritionStatus(data: Pick<NutritionData, 'today' | 'weights' | 'entries'>) {
  const weighed = data.weights.some((w) => w.measured_on === data.today && w.weight !== null);
  const logged = data.entries.some((n) => n.activity_on === shiftDate(data.today, -1) && n.intake !== null && n.output !== null);
  return { weighed, logged, done: weighed && logged };
}

type Located = { weekId: string; dayId: string; weekIndex: number; label: string; exercises: number; logged: number };

/**
 * The workout to do next. Without a calendar, "next" follows the program order:
 * - a started workout first;
 * - else one finished today (shown as done, so the to-do doesn't jump ahead the moment it's done);
 * - else the first day not yet completed or skipped.
 * Exercises count the day's own exercises (not shared warm-ups), from the logged snapshot when there is
 * one, and use the day view's rule for a logged exercise.
 */
export type NextWorkout =
  | (Located & { state: 'in_progress' | 'not_started' | 'done_today' })
  | { state: 'complete' }
  | null;

export function nextWorkout(program: ProgramDraft, sessions: readonly TrainingSession[], today: string): NextWorkout {
  const byDay = new Map(sessions.map((s) => [s.dayId, s]));
  const days = program.weeks.flatMap((week, w) => week.days.map((day, d) => {
    const session = byDay.get(day.id) ?? null;
    const prescribed = session?.day ?? day;
    const exercises = prescribed.sections.flatMap((s) => s.exercises);
    const logged = exercises.filter((e) => isExerciseLogged(e, session?.sets ?? [])).length;
    return {
      session,
      located: { weekId: week.id, dayId: day.id, weekIndex: w, label: `${weekName(w)} · ${dayHeading(day, d)}`, exercises: exercises.length, logged },
    };
  }));
  if (days.length === 0) return null;
  const started = days.find((d) => d.session?.status === 'in_progress');
  if (started) return { ...started.located, state: 'in_progress' };
  const finishedToday = days.filter((d) => d.session?.status === 'completed' && d.session.performedOn === today).at(-1);
  if (finishedToday) return { ...finishedToday.located, state: 'done_today' };
  const next = days.find((d) => !d.session);
  return next ? { ...next.located, state: 'not_started' } : { state: 'complete' };
}

/** "Week 3 of 6 · 11 of 24 workouts": completed days only; skipped days count as passed, not done. */
export function trainingProgress(program: ProgramDraft, sessions: readonly TrainingSession[], today: string) {
  const total = program.weeks.reduce((n, week) => n + week.days.length, 0);
  const completed = sessions.filter((s) => s.status === 'completed').length;
  const next = nextWorkout(program, sessions, today);
  const week = next && next.state !== 'complete' ? next.weekIndex + 1 : program.weeks.length;
  return { week, weekCount: program.weeks.length, completed, total };
}
