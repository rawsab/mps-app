import type { ProgramDraft, WorkoutDay } from '../programs/contract';
import { dayFocus, dayName, weekName } from '../programs/labels';
import { muscleKey } from '../programs/muscles';

/**
 * Mesocycle set totals (decision 0021). Every logged set counts once for each muscle its exercise
 * lists. A set counts once its reps are entered: an empty row is not a performed set. Missing
 * data is never zero: a day nobody logged has no change, not a change of -N.
 */

export type LoggedSet = {
  id: string;
  exerciseId: string;
  setNumber: number;
  loadMode: 'external' | 'assisted' | 'bodyweight' | null;
  loadValue: number | null;
  loadUnit: 'lb' | 'kg' | null;
  reps: number | null;
  /** The exercise's muscles in the session's own revision. */
  muscles: string[];
  updatedAt: string;
  updatedByStaff: boolean;
};

export type SessionStatus = 'in_progress' | 'completed' | 'skipped';

export type TrainingSession = {
  id: string;
  dayId: string;
  revisionId: string;
  status: SessionStatus;
  performedOn: string | null;
  startedAt: string;
  completedAt: string | null;
  notes: string;
  updatedAt: string;
  updatedByStaff: boolean;
  /** The day as prescribed in the session's revision (its target snapshot). */
  useSections: boolean;
  day: WorkoutDay;
  sets: LoggedSet[];
};

export const isPerformed = (set: LoggedSet) => set.reps !== null;

export type MuscleVolume = {
  key: string;
  name: string;
  /** Sum of the maximum prescribed set count of every exercise listing this muscle. */
  planned: number;
  logged: number;
};

export type DayVolume = { muscles: MuscleVolume[]; planned: number; logged: number };

/** Planned and logged sets for one day, per muscle and overall. */
export function dayVolume(day: WorkoutDay, sets: readonly LoggedSet[]): DayVolume {
  const muscles = new Map<string, MuscleVolume>();
  const entry = (name: string) => {
    const key = muscleKey(name);
    if (!muscles.has(key)) muscles.set(key, { key, name, planned: 0, logged: 0 });
    return muscles.get(key)!;
  };
  let planned = 0;
  for (const exercise of day.sections.flatMap((section) => section.exercises)) {
    const count = exercise.prescription.setCount?.max ?? 0;
    planned += count;
    for (const muscle of exercise.muscles) entry(muscle).planned += count;
  }
  const performed = sets.filter(isPerformed);
  for (const set of performed) for (const muscle of set.muscles) entry(muscle).logged += 1;
  return { muscles: [...muscles.values()], planned, logged: performed.length };
}

export type MuscleChange = MuscleVolume & {
  /**
   * Logged sets minus those logged the last earlier day that trained this muscle. Null when this
   * day isn't logged, there is no earlier day, or that day wasn't logged.
   */
  change: number | null;
  comparedTo: { dayId: string; label: string; logged: boolean } | null;
};

type OrderedDay = { id: string; label: string; day: WorkoutDay; session: TrainingSession | null };

/** Program days in week/day order. A logged day is described by its session's snapshot. */
function orderedDays(program: ProgramDraft, sessions: readonly TrainingSession[]): OrderedDay[] {
  const byDay = new Map(sessions.map((session) => [session.dayId, session]));
  return program.weeks.flatMap((week, w) => week.days.map((day, d) => {
    const session = byDay.get(day.id) ?? null;
    const focus = dayFocus(day);
    return { id: day.id, label: `${weekName(w)} · ${dayName(d)}${focus ? ` · ${focus}` : ''}`, day: session?.day ?? day, session };
  }));
}

const trains = (day: WorkoutDay, key: string) =>
  day.sections.some((section) => section.exercises.some((exercise) => exercise.muscles.some((m) => muscleKey(m) === key)));

/** Per-muscle totals for one day with the change since the last earlier day that trained each muscle. */
export function dayMuscleChanges(program: ProgramDraft, sessions: readonly TrainingSession[], dayId: string): { volume: DayVolume; muscles: MuscleChange[] } | null {
  const days = orderedDays(program, sessions);
  const index = days.findIndex((day) => day.id === dayId);
  if (index < 0) return null;
  const current = days[index]!;
  const volume = dayVolume(current.day, current.session?.sets ?? []);
  const muscles = volume.muscles.map((muscle): MuscleChange => {
    const previous = days.slice(0, index).reverse().find((day) => trains(day.day, muscle.key));
    if (!previous) return { ...muscle, change: null, comparedTo: null };
    const comparedTo = { dayId: previous.id, label: previous.label, logged: !!previous.session };
    if (!current.session || !previous.session) return { ...muscle, change: null, comparedTo };
    const before = dayVolume(previous.day, previous.session.sets).muscles.find((m) => m.key === muscle.key)?.logged ?? 0;
    return { ...muscle, change: muscle.logged - before, comparedTo };
  });
  return { volume, muscles };
}

export const formatChange = (change: number | null) => (change === null ? '—' : change > 0 ? `+${change}` : change < 0 ? `−${-change}` : '0');
