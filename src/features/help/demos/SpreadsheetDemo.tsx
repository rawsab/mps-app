import { useMemo } from 'react';
import { Button } from '@/components/ui';
import { cellText, columnLabel, gridColumns, gridRows } from '@/domain/programs/grid';
import { DEMO_COLUMNS, SPREADSHEET_DEMOS, UNDO_TARGET, cellTarget, type DemoCell, type GridDemoState, type SpreadsheetDemoName } from '@/domain/help/spreadsheetDemos';
import { GRID_COLUMN_WIDTHS } from '@/features/programs/gridTableLayout';
import { DemoPlayer } from './DemoPlayer';

/** A spreadsheet demo by name, for Help pages: `<SpreadsheetDemo name="drag-row" />`. */
export function SpreadsheetDemo({ name }: { name: SpreadsheetDemoName }) {
  return <DemoPlayer script={SPREADSHEET_DEMOS[name]} render={(state) => <DemoGrid state={state} />} />;
}

const inRange = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);

/**
 * A slice of the coach Spreadsheet drawn from a demo frame: the same column labels, widths and cell
 * text as the real grid, with its selection, typing, drag and change states.
 */
function DemoGrid({ state }: { state: GridDemoState }) {
  const rows = useMemo(() => gridRows(state.draft), [state.draft]);
  const columns = gridColumns(state.draft.service);
  const rowIndex = (id: string) => rows.findIndex((row) => row.exerciseId === id);
  const colIndex = (column: DemoCell['column']) => DEMO_COLUMNS.indexOf(column);
  const sel = state.selection;
  const selected = (r: number, c: number) => !!sel && inRange(r, rowIndex(sel.from.exerciseId), rowIndex(sel.to.exerciseId)) && inRange(c, colIndex(sel.from.column), colIndex(sel.to.column));
  const changed = new Set((state.changed ?? []).map(cellTarget));

  return (
    <div className="w-[32rem] overflow-hidden rounded-card border border-line bg-surface text-left text-sm text-text shadow-popover">
      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        <span data-demo-target={UNDO_TARGET}>
          <Button variant="ghost" disabled={!state.canUndo}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" /></svg> Undo
          </Button>
        </span>
        <Button variant="ghost" disabled>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12" /></svg> Redo
        </Button>
        <span className="ml-auto pr-2 text-xs text-muted">Week 1 · Day 1</span>
      </div>
      <table className="w-full border-separate border-spacing-0">
        <thead className="bg-surface-raised">
          <tr>{DEMO_COLUMNS.map((key) => <th key={key} className={`${GRID_COLUMN_WIDTHS[key]} border-b border-r border-line px-3 py-2 text-left text-xs font-medium text-muted last:border-r-0`}>{columnLabel(key, columns)}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((row, r) => {
            const dragged = state.dragging?.exerciseId === row.exerciseId;
            const dropEdge = state.dragging?.over?.exerciseId === row.exerciseId ? state.dragging.over.edge : null;
            return (
              <tr key={row.exerciseId} className={`transition-opacity duration-150 ${dragged ? 'opacity-40' : ''}`}>
                {DEMO_COLUMNS.map((column, c) => {
                  const cell = { exerciseId: row.exerciseId, column };
                  const editing = state.editing && state.editing.exerciseId === row.exerciseId && state.editing.column === column ? state.editing : null;
                  const focus = sel && sel.to.exerciseId === row.exerciseId && sel.to.column === column;
                  return (
                    <td key={column} data-demo-target={cellTarget(cell)}
                      className={`${GRID_COLUMN_WIDTHS[column]} h-11 border-b border-r border-line px-3 align-middle last:border-r-0 [tr:last-child>&]:border-b-0
                        ${column === 'order' ? 'tabular-nums text-muted' : ''} ${column === 'name' ? 'font-medium' : ''}
                        ${selected(r, c) ? 'bg-gold/10' : ''} ${focus || editing ? 'outline-2 -outline-offset-2 outline-gold' : ''} ${editing ? 'bg-ink' : ''}
                        ${changed.has(cellTarget(cell)) ? 'help-demo-changed' : ''}
                        ${dropEdge === 'before' ? 'shadow-[inset_0_2px_0_var(--color-gold)]' : dropEdge === 'after' ? 'shadow-[inset_0_-2px_0_var(--color-gold)]' : ''}`}>
                      {editing ? <>{editing.text}<span className="help-demo-caret ml-px inline-block h-4 w-px translate-y-0.5 bg-text" /></> : cellText(row, column)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
