import { describe, expect, it } from 'vitest';
import { dayFocus, dayHeading, dayName, weekName } from '@/domain/programs/labels';
import { applyCommands } from '@/domain/programs/commands';
import { gridRows, gridSheets, planSetDayFocus, planClear } from '@/domain/programs/grid';
import { validateForPublish, type ProgramDraft } from '@/domain/programs/contract';

function draft(): ProgramDraft {
  return {
    schemaVersion: 1, service: 'mesocycle', title: 'Program', coachNotes: '', sharedSections: [], resources: [],
    weeks: [
      { id: 'w1', index: 4, label: 'Custom old week', startDate: null, useSections: false, days: [
        { id: 'd1', label: 'W4 · Day 3 - Legs', scheduledDate: null, sections: [{ id: 's1', title: 'Main', kind: 'main', instructions: '', exercises: [{
          id: 'e1', logicalKey: 'squat', name: 'Squat', notes: '', alternatives: [], groupId: null, demoUrl: null, muscles: [],
          prescription: { setCount: { min: 3, max: 3 }, targets: [{ effort: { kind: 'reps', reps: { min: 8, max: 10 }, perSide: false }, load: null, rir: null, rpe: null, annotations: [] }] },
        }] }] },
        { id: 'd2', label: 'Pull', scheduledDate: null, sections: [] },
      ] },
      { id: 'w2', index: 10, label: 'Another old heading', startDate: null, useSections: false, days: [] },
    ],
  };
}

function apply(doc: ProgramDraft, commands: Parameters<typeof applyCommands>[1]): ProgramDraft {
  const result = applyCommands(doc, commands);
  if (!result.ok) throw new Error(result.error.message);
  return result.draft;
}

describe('automatic numbering and day Focus (FR-05, FR-06)', () => {
  it('extracts descriptive focus without showing legacy week/day prefixes', () => {
    for (const [stored, expected] of [['Day 1', ''], ['W2 · Day 3', ''], ['Day 4 Legs', 'Legs'], ['W1 - Day 2: Pull', 'Pull'], ['Push', 'Push'], ['', '']] as const) {
      expect(dayFocus({ label: stored })).toBe(expected);
    }
    expect(weekName(0)).toBe('Week 1');
    expect(dayName(2)).toBe('Day 3');
    expect(dayHeading({ label: 'Legs' }, 1)).toBe('Day 2 · Legs');
  });

  it('numbers from current position, ignoring custom headings and old indexes', () => {
    const doc = draft();
    expect(gridSheets(doc).map((sheet) => sheet.label)).toEqual(['Week 1', 'Week 2']);
    expect(gridRows(doc)[0]).toMatchObject({ dayLabel: 'Day 1', focus: 'Legs' });
    expect(doc.weeks[0]!.days[0]!.label).toBe('W4 · Day 3 - Legs');
  });

  it('renumbers after day reorder/remove while focus follows the stable day id', () => {
    let doc = draft();
    doc = apply(doc, [{ type: 'move', id: 'd1', parentId: 'w1', index: 1 }]);
    expect(gridRows(doc)[0]).toMatchObject({ dayLabel: 'Day 2', focus: 'Legs', dayId: 'd1' });
    doc = apply(doc, [{ type: 'remove', id: 'd2' }]);
    expect(gridRows(doc)[0]).toMatchObject({ dayLabel: 'Day 1', focus: 'Legs' });
  });

  it('renumbers remaining weeks after remove and preserves their content', () => {
    const doc = apply(draft(), [{ type: 'remove', id: 'w1' }]);
    expect(gridSheets(doc).map((sheet) => [sheet.weekId, sheet.label])).toEqual([['w2', 'Week 1']]);
  });

  it('editing or clearing Focus never changes the generated day number or blocks publish', () => {
    let doc = draft();
    expect(validateForPublish(doc)).toEqual([]);
    doc = apply(doc, planSetDayFocus(doc, 'e1', 'Push').commands);
    expect(gridRows(doc)[0]).toMatchObject({ dayLabel: 'Day 1', focus: 'Push' });
    doc = apply(doc, planClear(doc, [{ exerciseId: 'e1', column: 'day' }]).commands);
    expect(gridRows(doc)[0]).toMatchObject({ dayLabel: 'Day 1', focus: '' });
    expect(validateForPublish(doc)).toEqual([]);
  });
});
