import type { GridColumnKey, GridRow } from '@/domain/programs/grid';

/** Shared by the coach's editable grid and the client's read-only spreadsheet. */
export const GRID_COLUMN_WIDTHS: Record<GridColumnKey, string> = {
  day: 'min-w-40', section: 'min-w-32', order: 'min-w-12', name: 'min-w-56', muscles: 'min-w-44', sets: 'min-w-20',
  effort: 'min-w-36', perSide: 'min-w-24', loadMode: 'min-w-32', load: 'min-w-28',
  unit: 'min-w-20', rir: 'min-w-24', rpe: 'min-w-24', notes: 'min-w-64',
};

export type CellSpan = { start: number; length: number };
export type GridRowSpans = { day: CellSpan; section: CellSpan };

/** Group contiguous identities, never merely equal labels from different days or sections. */
export function gridRowSpans(rows: GridRow[]): GridRowSpans[] {
  const groups: GridRowSpans[] = rows.map((_, index) => ({ day: { start: index, length: 1 }, section: { start: index, length: 1 } }));
  for (const column of ['day', 'section'] as const) {
    let start = 0;
    while (start < rows.length) {
      const first = rows[start]!;
      let end = start + 1;
      while (end < rows.length && rows[end]!.weekId === first.weekId && rows[end]!.dayId === first.dayId && (column === 'day' || rows[end]!.sectionId === first.sectionId)) end++;
      const span = { start, length: end - start };
      for (let index = start; index < end; index++) groups[index]![column] = span;
      start = end;
    }
  }
  return groups;
}

/** Physical cell indexes change with rowSpan; keyboard/clipboard columns remain logical. */
export function gridCellOwner(groups: GridRowSpans[], row: number, column: GridColumnKey) {
  return column === 'day' ? groups[row]?.day.start ?? row : column === 'section' ? groups[row]?.section.start ?? row : row;
}
