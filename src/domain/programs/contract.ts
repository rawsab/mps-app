import { z } from 'zod';
import { Effort, Load } from '../measurements/load';
import { NumericRange, RirRange, RpeRange } from '../measurements/range';

/**
 * Canonical program document (roadmap §7). Both the Program and Grid editors and import
 * normalization target this contract. It holds prescriptions only — results live elsewhere.
 *
 * Drafts may be incomplete (e.g. an imported structure with no set count yet);
 * `validateForPublish` applies the stricter publish rules.
 */
export const PROGRAM_DRAFT_SCHEMA_VERSION = 1 as const;

export const ServiceKind = z.enum(['personal_training', 'mesocycle', 'nutrition']);
export type ServiceKind = z.infer<typeof ServiceKind>;

const Id = z.string().min(1);

export const SetTarget = z.object({
  effort: Effort.nullable(),
  load: Load.nullable(),
  rir: RirRange.nullable(),
  rpe: RpeRange.nullable(),
  /** Free-text annotations kept verbatim, e.g. "drop set". */
  annotations: z.array(z.string()),
});
export type SetTarget = z.infer<typeof SetTarget>;

export const ExercisePrescription = z
  .object({
    /** Number of working sets. "2-3" is a range; null means not yet prescribed. */
    setCount: NumericRange.nullable(),
    /** One entry applies to every set; otherwise one entry per set up to setCount.max. */
    targets: z.array(SetTarget),
  })
  .superRefine((p, ctx) => {
    if (p.targets.length > 1 && p.setCount && p.targets.length !== p.setCount.max) {
      ctx.addIssue({ code: 'custom', message: 'Per-set targets must match the maximum set count' });
    }
  });
export type ExercisePrescription = z.infer<typeof ExercisePrescription>;

export const Exercise = z.object({
  id: Id,
  /** Stable across revisions so history and progress can follow the same movement. */
  logicalKey: Id,
  name: z.string().min(1),
  /** Explicit alternatives; "A or B" is one slot, not two required exercises (FR-05). */
  alternatives: z.array(z.object({ id: Id, name: z.string().min(1) })),
  groupId: z.string().nullable(),
  demoUrl: z.url().nullable(),
  prescription: ExercisePrescription,
  notes: z.string(),
});
export type Exercise = z.infer<typeof Exercise>;

export const SectionKind = z.enum(['preparation', 'main', 'cooldown', 'other']);

export const Section = z.object({
  id: Id,
  kind: SectionKind,
  title: z.string(),
  instructions: z.string(),
  exercises: z.array(Exercise),
});
export type Section = z.infer<typeof Section>;

export const WorkoutDay = z.object({
  id: Id,
  label: z.string().min(1),
  /** Optional scheduled date (ISO yyyy-mm-dd). Without it, days are sequence-only (FR-03). */
  scheduledDate: z.iso.date().nullable(),
  sections: z.array(Section),
});
export type WorkoutDay = z.infer<typeof WorkoutDay>;

export const ProgramWeek = z.object({
  id: Id,
  index: z.number().int().positive(),
  label: z.string(),
  startDate: z.iso.date().nullable(),
  days: z.array(WorkoutDay),
});
export type ProgramWeek = z.infer<typeof ProgramWeek>;

export const Resource = z.object({
  id: Id,
  title: z.string().min(1),
  body: z.string(),
  url: z.url().nullable(),
});

export const ProgramDraft = z.object({
  schemaVersion: z.literal(PROGRAM_DRAFT_SCHEMA_VERSION),
  service: ServiceKind,
  title: z.string(),
  /** Sections that apply across days, such as a warm-up or mobility circuit. */
  sharedSections: z.array(Section),
  weeks: z.array(ProgramWeek),
  resources: z.array(Resource),
  coachNotes: z.string(),
});
export type ProgramDraft = z.infer<typeof ProgramDraft>;

export type PublishProblem = { path: string; message: string };

/** Publish requires a complete, client-usable program; drafts do not. */
export function validateForPublish(draft: ProgramDraft): PublishProblem[] {
  const problems: PublishProblem[] = [];
  if (draft.title.trim() === '') problems.push({ path: 'title', message: 'Program needs a title' });
  if (draft.service === 'nutrition') {
    problems.push({ path: 'service', message: 'Nutrition uses nutrition targets, not a workout program' });
  }
  if (draft.weeks.length === 0) problems.push({ path: 'weeks', message: 'Program needs at least one week' });
  draft.weeks.forEach((week, w) =>
    week.days.forEach((day, d) =>
      day.sections.forEach((section, s) =>
        section.exercises.forEach((ex, e) => {
          const path = `weeks.${w}.days.${d}.sections.${s}.exercises.${e}`;
          if (!ex.prescription.setCount) problems.push({ path, message: `${ex.name}: set count is missing` });
          if (ex.prescription.targets.length === 0) problems.push({ path, message: `${ex.name}: no target` });
        }),
      ),
    ),
  );
  return problems;
}
