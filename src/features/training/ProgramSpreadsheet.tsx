import { useMemo } from 'react';
import { SpreadsheetViewport } from '@/components/SpreadsheetViewport';
import { cellText, gridColumns, gridSheets, type GridRow } from '@/domain/programs/grid';
import type { ProgramDraft, ServiceKind } from '@/domain/programs/contract';
import { GRID_COLUMN_WIDTHS, gridRowSpans } from '@/features/programs/gridTableLayout';

/**
 * Read-only spreadsheet of the published program for clients who want to inspect a whole week at once.
 * It reuses the coach grid's columns and cell text, so both read the same targets (FR-06), but has no editing.
 */
export function ProgramSpreadsheet({ program, service, weekId }: { program: ProgramDraft; service: ServiceKind; weekId: string }) {
  const sheets = gridSheets(program).filter((sheet) => sheet.weekId === null || sheet.weekId === weekId);
  const useSections = program.weeks.find((week) => week.id === weekId)?.useSections ?? true;
  return (
    <div className="grid min-w-0 gap-8">
      {sheets.map((sheet) => (
        <section key={sheet.weekId ?? 'shared'} aria-labelledby={`sheet-${sheet.weekId ?? 'shared'}`} className="grid min-w-0 gap-3">
          <h2 id={`sheet-${sheet.weekId ?? 'shared'}`} className="text-lg font-semibold">{sheet.label}</h2>
          {sheet.rows.length
            ? <SheetTable rows={sheet.rows} label={sheet.label} service={service} useSections={sheet.weekId === null || useSections} />
            : <p className="text-sm text-muted">No exercises this week.</p>}
        </section>
      ))}
    </div>
  );
}

function SheetTable({ rows, label, service, useSections }: { rows: GridRow[]; label: string; service: ServiceKind; useSections: boolean }) {
  const columns = gridColumns(service).filter((column) => useSections || column.key !== 'section');
  const spans = useMemo(() => gridRowSpans(rows), [rows]);
  return (
    <div className="min-w-0 overflow-hidden rounded-card border border-line bg-surface">
      <SpreadsheetViewport>
        <table className="w-full border-separate border-spacing-0 text-sm">
          <caption className="sr-only">{label} targets</caption>
          <thead className="sticky top-0 z-10 bg-surface-raised"><tr>
            {columns.map((column) => <th key={column.key} scope="col" className={`${GRID_COLUMN_WIDTHS[column.key]} border-b border-r border-line px-3 py-2 text-left text-xs font-medium text-muted last:border-r-0`}>{column.label}</th>)}
          </tr></thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row.exerciseId}>
                {columns.map((column) => {
                  // Day and Section cells merge down their rows, as in the coach grid.
                  const span = column.key === 'day' ? spans[r]!.day : column.key === 'section' ? spans[r]!.section : { start: r, length: 1 };
                  if (span.start !== r) return null;
                  const Cell = column.key === 'day' || column.key === 'name' ? 'th' : 'td';
                  return (
                    <Cell key={column.key} scope={Cell === 'th' ? (column.key === 'day' ? 'rowgroup' : 'row') : undefined} rowSpan={span.length}
                      className={`${GRID_COLUMN_WIDTHS[column.key]} whitespace-pre-wrap break-words border-b border-r border-line px-3 py-3 text-left align-top font-normal last:border-r-0 ${column.key === 'name' ? 'font-medium' : ''} ${column.key === 'order' ? 'text-muted tabular-nums' : ''}`}>
                      {column.key === 'day' && row.dayId
                        ? <><span className="block font-medium">{row.dayLabel}</span>{row.focus ? <span className="block text-muted">{row.focus}</span> : null}</>
                        : cellText(row, column.key)}
                    </Cell>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </SpreadsheetViewport>
    </div>
  );
}
