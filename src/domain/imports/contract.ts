import { z } from 'zod';
import { Effort, Load, WeightUnit } from '../measurements/load';
import { NumericRange, RirRange, RpeRange } from '../measurements/range';
import { ProgramDraft, ServiceKind } from '../programs/contract';

/**
 * Versioned import contracts (roadmap §7 "Normalized import contract").
 * The browser produces a NormalizedImport; the commit endpoint (M7) must revalidate it
 * independently because worker output is untrusted.
 */
export const NORMALIZED_IMPORT_SCHEMA_VERSION = 1 as const;

export const SourceLocation = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('cell'), sheet: z.string(), ref: z.string(), row: z.number().int(), col: z.number().int() }),
  z.object({ kind: z.literal('docx_table_cell'), table: z.number().int(), row: z.number().int(), cell: z.number().int() }),
  z.object({ kind: z.literal('docx_paragraph'), paragraph: z.number().int() }),
  z.object({ kind: z.literal('docx_header_footer'), part: z.string(), paragraph: z.number().int() }),
]);
export type SourceLocation = z.infer<typeof SourceLocation>;

/** Raw evidence exactly as stored in the file. Nothing here is interpreted. */
export const RawValue = z.object({
  /** OOXML cell type (`s`, `n`, `b`, `str`, `inlineStr`, `e`) or `text` for Word content. */
  type: z.string(),
  value: z.string().nullable(),
  /** Formula text if present. Never evaluated. */
  formula: z.string().nullable(),
  /** Number format code applied to the cell, if any (e.g. `m-d`). */
  numberFormat: z.string().nullable(),
});
export type RawValue = z.infer<typeof RawValue>;

export const SourceItemRole = z.enum([
  'metadata',
  'heading',
  'instruction',
  'prescription',
  'result',
  'calculated',
  'ownership',
  'resource',
  'unknown',
]);
export type SourceItemRole = z.infer<typeof SourceItemRole>;

/**
 * Every meaningful source item ends in exactly one of these states (FR-13).
 * `decidedBy: 'profile_rule'` marks a parser proposal that Matt confirms in Review.
 */
export const Disposition = z.discriminatedUnion('status', [
  z.object({ status: z.literal('mapped'), targets: z.array(z.string()).min(1), decidedBy: z.enum(['profile_rule', 'reviewer']) }),
  z.object({ status: z.literal('excluded'), reason: z.string().min(1), decidedBy: z.enum(['profile_rule', 'reviewer']) }),
  z.object({ status: z.literal('unresolved'), issueIds: z.array(z.string()).min(1) }),
]);
export type Disposition = z.infer<typeof Disposition>;

export const SourceItem = z.object({
  id: z.string(),
  location: SourceLocation,
  raw: RawValue,
  /** Display text where the profile could derive it (e.g. the m-d rendering of a date cell). */
  displayText: z.string().nullable(),
  role: SourceItemRole,
  disposition: Disposition,
});
export type SourceItem = z.infer<typeof SourceItem>;

export const IssueCode = z.enum([
  'RIR_DATE_CONVERTED',
  'RANGE_UNRECOGNIZED',
  'LOAD_UNIT_UNKNOWN',
  'LOAD_ANNOTATION',
  'LOAD_UNRECOGNIZED',
  'BAND_LOAD',
  'EXERCISE_ALTERNATIVE',
  'PER_SET_TARGETS_AMBIGUOUS',
  'SET_COUNT_CONFLICT',
  'HISTORY_DATE_REQUIRED',
  'HEADER_DATE_MISMATCH',
  'NUTRITION_TARGET_DATES',
  'LEGACY_CALCULATION_DISCREPANCY',
  'TIME_WITHOUT_DATE',
  'UNRECOGNIZED_CONTENT',
  'UNSUPPORTED_LAYOUT',
]);
export type IssueCode = z.infer<typeof IssueCode>;

export const ImportIssue = z.object({
  id: z.string(),
  code: IssueCode,
  /** `blocking` items stop the final commit until resolved or excluded (FR-14). */
  severity: z.enum(['blocking', 'warning', 'info']),
  message: z.string(),
  sourceItemIds: z.array(z.string()),
  /** A proposed interpretation, clearly marked as a proposal, never applied silently. */
  proposal: z.string().nullable(),
});
export type ImportIssue = z.infer<typeof ImportIssue>;

const Provenance = z.object({ sourceItemIds: z.array(z.string()).min(1) });

export const HistoricalSet = Provenance.extend({
  setIndex: z.number().int().positive(),
  load: Load.nullable(),
  effort: Effort.nullable(),
  annotations: z.array(z.string()),
  status: z.enum(['performed', 'skipped']),
});

export const HistoricalExercise = z.object({
  /** Index path into the proposed program, e.g. `weeks.0.days.1.sections.0.exercises.3`. */
  exercisePath: z.string(),
  exerciseName: z.string(),
  sets: z.array(HistoricalSet),
});

export const HistoricalSession = Provenance.extend({
  dayPath: z.string(),
  /** Must be supplied or explicitly confirmed by Matt (FR-15); never derived from a received-date header. */
  activityDate: z.iso.date().nullable(),
  startedAtLocalTime: z.string().nullable(),
  endedAtLocalTime: z.string().nullable(),
  exercises: z.array(HistoricalExercise),
  feedback: z.array(
    Provenance.extend({ muscle: z.string(), question: z.string(), score: z.number().int().min(0).max(3) }),
  ),
});
export type HistoricalSession = z.infer<typeof HistoricalSession>;

export const HistoricalBodyweight = Provenance.extend({
  measurementDate: z.iso.date(),
  value: z.number(),
  unit: WeightUnit.nullable(),
});

export const HistoricalNutritionLog = Provenance.extend({
  /** The day the food was eaten — distinct from the weigh-in date (FR-09). */
  activityDate: z.iso.date(),
  intakeKcal: z.number().nullable(),
  outputKcal: z.number().nullable(),
});

export const ProposedNutritionTarget = Provenance.extend({
  maintenanceKcal: z.number().nullable(),
  goalKcal: z.number().nullable(),
  styleLabel: z.string().nullable(),
  effectiveFrom: z.iso.date().nullable(),
});

export const ProfileStatus = z.enum(['recognized', 'needs_review', 'unsupported']);

export const NormalizedImport = z.object({
  schemaVersion: z.literal(NORMALIZED_IMPORT_SCHEMA_VERSION),
  source: z.object({
    fileName: z.string(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    sizeBytes: z.number().int().nonnegative(),
    kind: z.enum(['xlsx', 'docx']),
  }),
  parser: z.object({ name: z.string(), version: z.string() }),
  profile: z.object({ id: z.string(), version: z.string(), status: ProfileStatus, service: ServiceKind.nullable() }),
  program: ProgramDraft.nullable(),
  history: z.object({
    sessions: z.array(HistoricalSession),
    bodyweights: z.array(HistoricalBodyweight),
    nutritionLogs: z.array(HistoricalNutritionLog),
  }),
  nutritionTargets: z.array(ProposedNutritionTarget),
  sourceItems: z.array(SourceItem),
  issues: z.array(ImportIssue),
});
export type NormalizedImport = z.infer<typeof NormalizedImport>;

export function summarize(result: NormalizedImport) {
  const count = (status: string) => result.sourceItems.filter((i) => i.disposition.status === status).length;
  return {
    sourceItems: result.sourceItems.length,
    mapped: count('mapped'),
    excluded: count('excluded'),
    unresolved: count('unresolved'),
    blockingIssues: result.issues.filter((i) => i.severity === 'blocking').length,
    issues: result.issues.length,
    weeks: result.program?.weeks.length ?? 0,
    days: result.program?.weeks.reduce((n, w) => n + w.days.length, 0) ?? 0,
    exercises:
      result.program?.weeks.reduce(
        (n, w) => n + w.days.reduce((m, d) => m + d.sections.reduce((k, s) => k + s.exercises.length, 0), 0),
        0,
      ) ?? 0,
    historicalSessions: result.history.sessions.length,
    bodyweights: result.history.bodyweights.length,
    nutritionLogs: result.history.nutritionLogs.length,
  };
}

/** Commit is blocked while any meaningful item is unresolved or a blocking issue remains (FR-14). */
export function canCommit(result: NormalizedImport): boolean {
  return (
    result.profile.status !== 'unsupported' &&
    result.sourceItems.every((i) => i.disposition.status !== 'unresolved') &&
    result.issues.every((i) => i.severity !== 'blocking')
  );
}

// Re-exported for convenience in profiles.
export { NumericRange, RirRange, RpeRange };
