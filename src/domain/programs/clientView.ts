import type { Effort, Load } from '../measurements/load';
import type { NumericRange } from '../measurements/range';
import { addDays } from '../scheduling/pattern';
import type { Exercise, ExercisePrescription, ProgramDraft, ProgramWeek, Section, SetTarget, WorkoutDay } from './contract';
import { dayFocus, dayName, weekTitle } from './labels';

/**
 * Read-only presentation of a published revision for the client Training view (M3 step 5) and,
 * later, the coach's client preview (FR-05). Prescriptions only: nothing here is a logged result.
 * Missing values stay missing: a null target prints nothing, never "0".
 */

const range = (r: NumericRange) => (r.min === r.max ? String(r.min) : `${r.min}–${r.max}`);
const plural = (r: NumericRange, one: string, many: string) => `${range(r)} ${r.min === 1 && r.max === 1 ? one : many}`;

export function formatEffort(effort: Effort): string {
  const text = effort.kind === 'reps' ? plural(effort.reps, 'rep', 'reps') : `${range(effort.seconds)} s`;
  return effort.perSide ? `${text} per side` : text;
}

/** A weight without a known unit prints as the bare number; a unit is never assumed (PRD §10). */
export function formatLoad(load: Load): string | null {
  const weight = (value: string, unit: string | null) => (unit ? `${value} ${unit}` : value);
  switch (load.mode) {
    case 'external':
      return weight(range(load.value), load.unit);
    case 'assisted':
      return `Assisted ${weight(range(load.value), load.unit)}`;
    case 'bodyweight':
      return load.added ? `Bodyweight + ${weight(String(load.added.value), load.added.unit)}` : 'Bodyweight';
    case 'band':
      return `Band: ${load.label}`;
    case 'not_applicable':
      return null;
  }
}

export function formatSetTarget(target: SetTarget): string {
  return [
    target.effort ? formatEffort(target.effort) : null,
    target.load ? formatLoad(target.load) : null,
    target.rir ? `RIR ${range(target.rir)}` : null,
    target.rpe ? `RPE ${range(target.rpe)}` : null,
    ...target.annotations.map((a) => a.trim()).filter(Boolean),
  ].filter(Boolean).join(' · ');
}

export type PrescriptionView = {
  /** "3 sets", "2–3 sets"; null when not prescribed. */
  sets: string | null;
  /** One line when every set shares a target; otherwise one line per set ("Set 2"). */
  lines: { label: string | null; text: string }[];
};

export function prescriptionView(prescription: ExercisePrescription): PrescriptionView {
  const sets = prescription.setCount ? plural(prescription.setCount, 'set', 'sets') : null;
  const texts = prescription.targets.map(formatSetTarget);
  const uniform = texts.every((t) => t === texts[0]);
  const lines = texts.length === 0 ? [] : uniform
    ? (texts[0] ? [{ label: null, text: texts[0] }] : [])
    : texts.map((text, i) => ({ label: `Set ${i + 1}`, text: text || '—' }));
  return { sets, lines };
}

/** Consecutive exercises sharing a group id are performed together as a superset. */
export type ExerciseGroup = { key: string; superset: boolean; exercises: Exercise[] };

export function groupExercises(exercises: Exercise[]): ExerciseGroup[] {
  const groups: ExerciseGroup[] = [];
  for (const exercise of exercises) {
    const last = groups.at(-1);
    if (exercise.groupId && last && last.exercises[0]!.groupId === exercise.groupId) {
      last.exercises.push(exercise);
      last.superset = true;
    } else {
      groups.push({ key: exercise.id, superset: false, exercises: [exercise] });
    }
  }
  return groups;
}

export type DayBlock = { id: string; title: string | null; instructions: string; groups: ExerciseGroup[] };

export type DayView = {
  id: string;
  name: string;
  focus: string;
  scheduledDate: string | null;
  /** Shared every-workout sections, split around the day's own content. */
  before: DayBlock[];
  blocks: DayBlock[];
  after: DayBlock[];
  exerciseCount: number;
};

const block = (section: Section, titled: boolean): DayBlock => ({
  id: section.id,
  title: titled ? section.title.trim() || null : null,
  instructions: section.instructions.trim(),
  groups: groupExercises(section.exercises),
});

export function dayView(program: ProgramDraft, week: ProgramWeek, day: WorkoutDay): DayView {
  // By id: a logged day may be its session's snapshot rather than this week's object.
  const index = week.days.findIndex((d) => d.id === day.id);
  const shared = program.sharedSections.filter((s) => s.exercises.length > 0 || s.instructions.trim());
  // With grouping off the week has no visible sections: the day reads as one exercise list.
  const blocks = week.useSections
    ? day.sections.filter((s) => s.exercises.length > 0 || s.instructions.trim()).map((s) => block(s, true))
    : [{ id: day.id, title: null, instructions: day.sections.map((s) => s.instructions.trim()).filter(Boolean).join('\n\n'),
        groups: groupExercises(day.sections.flatMap((s) => s.exercises)) }].filter((b) => b.groups.length > 0 || b.instructions);
  return {
    id: day.id,
    name: dayName(index),
    focus: dayFocus(day),
    scheduledDate: day.scheduledDate,
    before: shared.filter((s) => s.kind !== 'cooldown').map((s) => block(s, true)),
    blocks,
    after: shared.filter((s) => s.kind === 'cooldown').map((s) => block(s, true)),
    exerciseCount: day.sections.reduce((n, s) => n + s.exercises.length, 0),
  };
}

export type WeekSummary = { id: string; name: string; startDate: string | null; days: { id: string; name: string; focus: string }[] };

export function weekSummaries(program: ProgramDraft): WeekSummary[] {
  return program.weeks.map((week, w) => ({
    id: week.id,
    name: weekTitle(program, week, w),
    startDate: week.startDate,
    days: week.days.map((day, d) => ({ id: day.id, name: dayName(d), focus: dayFocus(day) })),
  }));
}

/** Dated weeks cover seven days. An explicit workout date can also identify its week. */
function weekOnDate(weeks: ProgramWeek[], date: string): ProgramWeek | undefined {
  return weeks.find((w) => w.startDate && w.startDate <= date && date < addDays(w.startDate, 7))
    ?? weeks.find((w) => w.days.some((day) => day.scheduledDate === date));
}

/** Resolves a requested week/day, using the supplied date before falling back to the first week. */
export function locateDay(program: ProgramDraft, weekId: string | null, dayId: string | null, today?: string): { week: ProgramWeek; day: WorkoutDay | null } | null {
  const week = program.weeks.find((w) => w.id === weekId) ?? (today ? weekOnDate(program.weeks, today) : undefined) ?? program.weeks[0];
  if (!week) return null;
  return { week, day: week.days.find((d) => d.id === dayId) ?? week.days[0] ?? null };
}
