import { describe, expect, it } from 'vitest';
import { gridCellOwner, gridRowSpans } from '@/features/programs/gridTableLayout';
import type { GridRow } from '@/domain/programs/grid';

function row(id: string, dayId: string | null, sectionId: string, weekId: string | null = 'w1'): GridRow {
  return {
    exerciseId: id, dayId, sectionId, weekId, dayLabel: 'Day 1', sectionLabel: 'Main', position: 1,
    exercise: { id, name: id, logicalKey: id, groupId: null, demoUrl: null, muscles: [], notes: '', alternatives: [], prescription: { setCount: null, targets: [] } },
  };
}

describe('merged grid labels (FR-06, NFR-06)', () => {
  it('spans a day across its sections and sections across their exercises', () => {
    const spans = gridRowSpans([row('a', 'd1', 's1'), row('b', 'd1', 's1'), row('c', 'd1', 's2'), row('d', 'd2', 's3')]);
    expect(spans.map((span) => span.day)).toEqual([{ start: 0, length: 3 }, { start: 0, length: 3 }, { start: 0, length: 3 }, { start: 3, length: 1 }]);
    expect(spans.map((span) => span.section)).toEqual([{ start: 0, length: 2 }, { start: 0, length: 2 }, { start: 2, length: 1 }, { start: 3, length: 1 }]);
  });

  it('keeps different days and sections with identical labels separate', () => {
    const spans = gridRowSpans([row('a', 'd1', 's1'), row('b', 'd1', 's2'), row('c', 'd2', 's3')]);
    expect(spans[0]!.day.length).toBe(2);
    expect(spans[2]!.day).toEqual({ start: 2, length: 1 });
    expect(spans.map((span) => span.section.length)).toEqual([1, 1, 1]);
  });

  it('resolves covered cells without shifting logical exercise/target columns', () => {
    const spans = gridRowSpans([row('a', 'd1', 's1'), row('b', 'd1', 's1'), row('c', 'd1', 's2')]);
    expect(gridCellOwner(spans, 1, 'day')).toBe(0);
    expect(gridCellOwner(spans, 1, 'section')).toBe(0);
    expect(gridCellOwner(spans, 2, 'day')).toBe(0);
    expect(gridCellOwner(spans, 2, 'section')).toBe(2);
    for (const column of ['order', 'name', 'sets', 'notes'] as const) expect(gridCellOwner(spans, 1, column)).toBe(1);
  });

  it('shows shared preparation once and retains individual section spans', () => {
    const spans = gridRowSpans([row('a', null, 'prep1', null), row('b', null, 'prep1', null), row('c', null, 'prep2', null)]);
    expect(spans.every((span) => span.day.start === 0 && span.day.length === 3)).toBe(true);
    expect(spans[2]!.section).toEqual({ start: 2, length: 1 });
  });

  it('only merges contiguous rows and handles an empty week', () => {
    const spans = gridRowSpans([row('a', 'd1', 's1'), row('b', 'd2', 's2'), row('c', 'd1', 's1')]);
    expect(spans.map((span) => span.day.length)).toEqual([1, 1, 1]);
    expect(gridRowSpans([])).toEqual([]);
  });
});

describe('merged-cell pointer coordinates', () => {
  it('finds the logical exercise row within the vertical span of a Day cell', async () => {
    const { gridPointAtCell } = await import('@/features/programs/useGridDragSelection');
    const body = ['a', 'b', 'c'].map((id, index) => ({
      rowIndex: index + 1, dataset: { gridExercise: id },
      getBoundingClientRect: () => ({ top: 30 + index * 50, bottom: 80 + index * 50 }),
    }));
    const cell = {
      rowSpan: 3, parentElement: body[0], dataset: { gridColumnIndex: '0' }, cellIndex: 0,
      closest: () => ({ rows: [null, ...body] }),
    } as unknown as HTMLTableCellElement;
    expect(gridPointAtCell(cell, 45)).toEqual({ exerciseId: 'a', column: 0 });
    expect(gridPointAtCell(cell, 100)).toEqual({ exerciseId: 'b', column: 0 });
    expect(gridPointAtCell(cell, 150)).toEqual({ exerciseId: 'c', column: 0 });
  });

  it('uses the logical column even when merged cells reduce the physical cell index', async () => {
    const { gridPointAtCell } = await import('@/features/programs/useGridDragSelection');
    const cell = {
      rowSpan: 1, parentElement: { dataset: { gridExercise: 'second-exercise' } },
      dataset: { gridColumnIndex: '4' }, cellIndex: 2, closest: () => null,
    } as unknown as HTMLTableCellElement;
    expect(gridPointAtCell(cell, 100)).toEqual({ exerciseId: 'second-exercise', column: 4 });
  });
});
