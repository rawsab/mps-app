import { describe, expect, it } from 'vitest';
import { applyCommands } from '@/domain/programs/commands';
import { sameProgram } from '@/domain/programs/compare';
import { ProgramDraft } from '@/domain/programs/contract';

const doc = () => ProgramDraft.parse({
  schemaVersion: 1, service: 'personal_training', title: 'Session', coachNotes: '', sharedSections: [], resources: [],
  weeks: [{ id: 'w1', index: 1, label: '', startDate: null, useSections: false, days: [] }],
});

describe('sameProgram', () => {
  it('ignores key order and undefined fields', () => {
    const a = doc();
    const reordered = Object.fromEntries(Object.entries(a).reverse()) as ProgramDraft;
    expect(sameProgram(a, reordered)).toBe(true);
    expect(sameProgram(a, { ...a, programTheme: undefined })).toBe(true);
  });

  it('sees a change, and sees it gone once it is reverted', () => {
    const a = doc();
    const changed = applyCommands(a, [{ type: 'updateProgram', patch: { title: 'Session 2' } }]);
    if (!changed.ok) throw new Error(changed.error.message);
    expect(sameProgram(a, changed.draft)).toBe(false);
    const reverted = applyCommands(changed.draft, [{ type: 'updateProgram', patch: { title: 'Session' } }]);
    if (!reverted.ok) throw new Error(reverted.error.message);
    expect(sameProgram(a, reverted.draft)).toBe(true);
  });
});
