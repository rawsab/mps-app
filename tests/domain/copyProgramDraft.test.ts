import { describe, expect, it } from 'vitest';
import { copyProgramDraft } from '@/domain/programs/commands';
import { ProgramDraft } from '@/domain/programs/contract';

const exercise = (id: string, groupId: string | null) => ({
  id, logicalKey: `key-${id}`, name: `Exercise ${id}`, notes: `Notes ${id}`, alternatives: [{ id: `alt-${id}`, name: 'Swap' }], groupId, demoUrl: null, muscles: [],
  prescription: { setCount: { min: 3, max: 3 }, targets: [] },
});

function draft(): ProgramDraft {
  return ProgramDraft.parse({
    schemaVersion: 1, service: 'personal_training', title: 'Session 1', coachNotes: 'Coach only', resources: [{ id: 'r1', title: 'Video', body: '', url: null }],
    sharedSections: [{ id: 'ss1', kind: 'preparation', title: 'Warm-up', instructions: 'Easy', exercises: [exercise('se1', null)] }],
    weeks: [{ id: 'w1', index: 1, label: 'Intro', startDate: '2026-11-23', useSections: true, days: [
      { id: 'd1', label: 'Legs', scheduledDate: '2026-11-24', sections: [{ id: 's1', kind: 'main', title: 'Main', instructions: '', exercises: [exercise('e1', 'g1'), exercise('e2', 'g1')] }] },
    ] }],
  });
}

describe('copyProgramDraft (decision 0061)', () => {
  const ids = () => { let n = 0; return () => `new-${++n}`; };

  it('gives every node a fresh id and keeps the content', () => {
    const source = draft();
    const copy = copyProgramDraft(source, ids());
    const allIds = (d: ProgramDraft) => JSON.stringify(d).match(/"id":"[^"]+"/g) ?? [];
    expect(allIds(copy).every((id) => id.startsWith('"id":"new-'))).toBe(true);
    expect(new Set(allIds(copy)).size).toBe(allIds(copy).length);
    expect(copy.title).toBe('Session 1');
    expect(copy.coachNotes).toBe('Coach only');
    expect(copy.weeks[0]!.label).toBe('Intro');
    expect(copy.weeks[0]!.days[0]!.sections[0]!.exercises.map((e) => [e.name, e.notes, e.logicalKey])).toEqual([
      ['Exercise e1', 'Notes e1', 'key-e1'], ['Exercise e2', 'Notes e2', 'key-e2'],
    ]);
    expect(ProgramDraft.safeParse(copy).success).toBe(true);
    // The source is untouched.
    expect(source).toEqual(draft());
  });

  it('keeps a superset together under a new group id', () => {
    const [a, b] = copyProgramDraft(draft(), ids()).weeks[0]!.days[0]!.sections[0]!.exercises;
    expect(a!.groupId).toBe(b!.groupId);
    expect(a!.groupId).not.toBe('g1');
  });

  it('clears week and day dates for the new slot', () => {
    const week = copyProgramDraft(draft(), ids()).weeks[0]!;
    expect(week.startDate).toBeNull();
    expect(week.days[0]!.scheduledDate).toBeNull();
  });
});
