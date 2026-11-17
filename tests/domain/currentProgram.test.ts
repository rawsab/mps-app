import { describe, expect, it } from 'vitest';
import { currentProgramId } from '@/domain/programs/current';

const enrollment = (chosen: string | null = null, nutrition = false) => ({
  id: 'e1', current_program_id: nutrition ? null : chosen, current_nutrition_program_id: nutrition ? chosen : null,
});
const program = (id: string, archived = false, enrollmentId = 'e1') => ({ id, enrollment_id: enrollmentId, archived_at: archived ? '2026-11-17' : null });

describe('currentProgramId', () => {
  it('uses the coach’s choice while it is live', () => {
    expect(currentProgramId(enrollment('p2'), [program('p1'), program('p2')])).toBe('p2');
    expect(currentProgramId(enrollment('n1', true), [program('n1'), program('n2')])).toBe('n1');
  });

  it('falls back to the only live program, including when the choice was archived', () => {
    expect(currentProgramId(enrollment(), [program('p1')])).toBe('p1');
    expect(currentProgramId(enrollment('p1'), [program('p1', true), program('p2')])).toBe('p2');
  });

  it('has none when several live programs and no choice, or none at all', () => {
    expect(currentProgramId(enrollment(), [program('p1'), program('p2')])).toBeNull();
    expect(currentProgramId(enrollment(), [])).toBeNull();
  });

  it('ignores programs of other services', () => {
    expect(currentProgramId(enrollment(), [program('p1'), program('x', false, 'e2')])).toBe('p1');
  });
});
