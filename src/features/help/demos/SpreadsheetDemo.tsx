import { useMemo } from 'react';
import { CautionIcon } from '@/components/icons';
import { Badge, Button } from '@/components/ui';
import { cellText, columnLabel, gridColumns, gridRows } from '@/domain/programs/grid';
import {
  APPLY_PASTE_TARGET, DEMO_COLUMNS, PUBLISH_TARGET, READINESS_TARGET, SPREADSHEET_DEMOS, UNDO_TARGET, cellTarget, issueTarget, publishIssues,
  type DemoCell, type GridDemoState, type SpreadsheetDemoName,
} from '@/domain/help/spreadsheetDemos';
import { GRID_COLUMN_WIDTHS } from '@/features/programs/gridTableLayout';
import { DemoPlayer } from './DemoPlayer';

/**
 * Room kept around the grid for popups that float over it and run past its edges, from the first
 * frame, so the demo's size never jumps. The paste review is centred over the grid; the readiness
 * list hangs from its button, so that grid stays at the top.
 */
const ROOM: Partial<Record<SpreadsheetDemoName, string>> = {
  'paste-review': 'min-h-[27rem] justify-center',
  'publish-readiness': 'min-h-[18.5rem] justify-start',
};

/** A spreadsheet demo by name, for Help pages: `<SpreadsheetDemo name="drag-row" />`. */
export function SpreadsheetDemo({ name }: { name: SpreadsheetDemoName }) {
  return <DemoPlayer script={SPREADSHEET_DEMOS[name]} render={(state) => <DemoGrid state={state} room={ROOM[name] ?? ''} />} />;
}

const inRange = (value: number, a: number, b: number) => value >= Math.min(a, b) && value <= Math.max(a, b);

/**
 * A slice of the coach Spreadsheet drawn from a demo frame: the same column labels, widths and cell
 * text as the real grid, with its selection, typing, drag and change states.
 */
function DemoGrid({ state, room }: { state: GridDemoState; room: string }) {
  const rows = useMemo(() => gridRows(state.draft), [state.draft]);
  const columns = gridColumns(state.draft.service);
  const rowIndex = (id: string) => rows.findIndex((row) => row.exerciseId === id);
  const colIndex = (column: DemoCell['column']) => DEMO_COLUMNS.indexOf(column);
  const sel = state.selection;
  const selected = (r: number, c: number) => !!sel && inRange(r, rowIndex(sel.from.exerciseId), rowIndex(sel.to.exerciseId)) && inRange(c, colIndex(sel.from.column), colIndex(sel.to.column));
  const changed = new Set((state.changed ?? []).map(cellTarget));
  const issues = state.publishing ? publishIssues(state.draft) : [];

  return (
    <div className={`relative flex w-[32rem] flex-col text-left text-sm text-text ${room}`}>
    <div className="relative overflow-hidden rounded-card border border-line bg-surface shadow-popover">
      {state.publishing ? (
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <span className="text-lg font-medium tracking-[-0.02em]">{state.draft.title}</span>
          {state.publishing.published ? <Badge tone="gold">Live</Badge> : <Badge>Draft · staff only</Badge>}
        </div>
      ) : null}
      <div className="flex items-center gap-1 border-b border-line px-2 py-1">
        <span data-demo-target={UNDO_TARGET}>
          <Button variant="ghost" disabled={!state.canUndo}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12" /></svg> Undo
          </Button>
        </span>
        <Button variant="ghost" disabled>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12" /></svg> Redo
        </Button>
        {state.publishing ? (
          <span className="ml-auto flex items-center gap-1">
            <span data-demo-target={READINESS_TARGET}>
              <Button variant="ghost">{issues.length ? <CautionIcon /> : null}{issues.length ? `${issues.length} publish ${issues.length === 1 ? 'issue' : 'issues'}` : 'Ready to publish'}</Button>
            </span>
            <span data-demo-target={PUBLISH_TARGET}><Button>Publish</Button></span>
          </span>
        ) : <span className="ml-auto pr-2 text-xs text-muted">Week 1 · Day 1</span>}
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
      {/* Dims the grid behind the paste review, as a dialog's backdrop does. */}
      <span className={`pointer-events-none absolute inset-0 bg-ink/60 transition-opacity duration-200 ${state.paste ? 'opacity-100' : 'opacity-0'}`} />
    </div>
      {state.publishing?.reviewOpen ? (
        <div className="absolute right-2 top-[6.5rem] z-[1] w-80 rounded-card border border-line bg-surface p-4 shadow-popover">
          <p className="font-semibold">Ready to publish?</p>
          <p className="mt-1 text-muted">{issues.length ? 'Not yet. Fix these first:' : 'Yes.'}</p>
          <ul className="mt-2 grid gap-0.5">
            {issues.map((issue, i) => (
              <li key={issue} data-demo-target={issueTarget(i)} className="flex min-h-10 items-center gap-3 rounded-card px-2 py-1.5">
                <CautionIcon /><span className="flex-1">{issue}</span><span aria-hidden className="text-gold-fg">→</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {state.paste ? <PasteReview paste={state.paste} rows={rows} columns={columns} /> : null}
    </div>
  );
}

/** The editor's paste review, as it lists the planner's changes. */
function PasteReview({ paste, rows, columns }: { paste: NonNullable<GridDemoState['paste']>; rows: ReturnType<typeof gridRows>; columns: ReturnType<typeof gridColumns> }) {
  const byId = new Map(rows.map((row) => [row.exerciseId, row]));
  return (
    <div className="absolute left-1/2 top-1/2 z-[1] w-[29rem] -translate-x-1/2 -translate-y-1/2 rounded-card border border-line bg-surface shadow-popover">
      <div className="border-b border-line px-4 py-3">
        <p className="font-semibold">Preview paste</p>
        <p className="mt-0.5 text-xs text-muted">Review the changes before applying them together. Nothing from this paste is saved until you apply.</p>
      </div>
      <div className="grid gap-3 px-4 py-3">
        <pre className="rounded-card border border-line bg-ink px-3 py-2 font-mono text-xs leading-5">{paste.text.replaceAll('\t', '    ')}</pre>
        <table className="w-full table-fixed text-left text-xs">
          <thead><tr className="border-b border-line text-muted"><th className="w-1/2 py-1.5 pr-3 font-medium">Exercise / field</th><th className="py-1.5 pr-3 font-medium">Before</th><th className="py-1.5 font-medium">After</th></tr></thead>
          <tbody className="divide-y divide-line">
            {paste.changes.map((change) => {
              const row = byId.get(change.exerciseId);
              return (
                <tr key={`${change.exerciseId}:${change.column}`}>
                  <td className="py-1.5 pr-3 font-medium">{row ? `${row.dayLabel} · ${row.exercise.name}` : ''}<span className="block font-normal text-muted">{columnLabel(change.column, columns)}</span></td>
                  <td className="py-1.5 pr-3 text-muted">{change.before || '(blank)'}</td>
                  <td className="py-1.5">{change.after || '(blank)'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end gap-2 border-t border-line px-4 py-2.5">
        <Button variant="secondary">Cancel</Button>
        <span data-demo-target={APPLY_PASTE_TARGET}><Button>Apply {paste.changes.length} changes</Button></span>
      </div>
    </div>
  );
}
