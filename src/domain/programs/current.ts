/**
 * A service's current program (decision 0039), the same rule as `private.current_program_id`:
 * the coach's choice while it isn't archived, else the service's only non-archived program, else none.
 */
export type CurrentProgramEnrollment = { id: string; current_program_id: string | null; current_nutrition_program_id: string | null };
export type ProgramCandidate = { id: string; enrollment_id: string; archived_at: string | null };

export function currentProgramId(enrollment: CurrentProgramEnrollment, programs: ProgramCandidate[]): string | null {
  const live = programs.filter((p) => p.enrollment_id === enrollment.id && !p.archived_at);
  const chosen = enrollment.current_program_id ?? enrollment.current_nutrition_program_id;
  if (chosen && live.some((p) => p.id === chosen)) return chosen;
  return live.length === 1 ? live[0]!.id : null;
}

/** Non-archived programs of the service, for choosing the current one. */
export function programCandidates<T extends ProgramCandidate>(enrollmentId: string, programs: T[]): T[] {
  return programs.filter((p) => p.enrollment_id === enrollmentId && !p.archived_at);
}
