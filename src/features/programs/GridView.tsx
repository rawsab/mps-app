import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui';
import {
  cellText, gridColumns, gridSheets, LOAD_MODE_OPTIONS, parseClipboard, planAddSheetRow, planAddGridStructure, planClear, planSetDayFocus, planRenameGridSection,
  planPaste, toClipboard, type GridColumnKey, type GridRow,
} from '@/domain/programs/grid';
import { PlusIcon } from '@/components/icons';
import { dayHeading, dayName, weekName } from '@/domain/programs/labels';
import { planDuplicateWeek, planInsertGridRow } from '@/domain/programs/gridStructureActions';
import { useWeekMotion, scrollBehavior } from './useWeekMotion';
import { WeekGridMenu, type WeekAction } from './WeekGridMenu';
import { useSearchParams } from 'react-router';
import { applyCommands, newWeek } from '@/domain/programs/commands';
import { MoveGridItemDialog, type GridMoveTarget } from './MoveGridItemDialog';
import { Dialog } from '@/components/Dialog';
import { AddGridStructureDialog } from './AddGridStructureDialog';
import { GridCellMenu, type GridCellAction } from './GridCellMenu';
import { GridTableFrame } from './GridTableFrame';
import { cellKey, useCellCommit } from './fields';
import { PastePreview } from './PastePreview';
import { gridCellOwner, gridRowSpans } from './gridTableLayout';
import { gridPointAtCell, useGridDragSelection } from './useGridDragSelection';
import { useEditor } from './useDraftEditor';
import { useMuscleSuggestions } from './MuscleSuggestions';
import { weekMuscles } from '@/domain/programs/muscles';
import { planGridStructureMove, type GridDragSource } from '@/domain/programs/gridRowMoves';
import { useGridRowDrag, type GridRowDrag } from './useGridRowDrag';
import { selectedProgramItem } from './programNavigation';

type Point = { exerciseId: string; column: number };
type Editing = Point & { text: string; selectOnFocus: boolean };
const choices: Partial<Record<GridColumnKey, { value: string; label: string }[]>> = {
  perSide: [{ value: '', label: '' }, { value: 'Yes', label: 'Yes' }],
  loadMode: [{ value: '', label: '—' }, ...LOAD_MODE_OPTIONS.map((option) => ({ value: option.label, label: option.label }))],
  unit: [{ value: '', label: '—' }, { value: 'lb', label: 'lb' }, { value: 'kg', label: 'kg' }],
};
const widths: Record<GridColumnKey, string> = {
  day: 'min-w-40', section: 'min-w-32', order: 'min-w-12', name: 'min-w-56', muscles: 'min-w-44', sets: 'min-w-20',
  effort: 'min-w-36', perSide: 'min-w-24', loadMode: 'min-w-32', load: 'min-w-28',
  unit: 'min-w-20', rir: 'min-w-24', rpe: 'min-w-24', notes: 'min-w-64',
};

/** FR-06: separate sheets share one canonical draft, command history and save path. */
export function GridView({ readOnly = false }: { readOnly?: boolean }) {
  const editor = useEditor();
  const [adding, setAdding] = useState<{ row?: GridRow; weekId?: string | null; kind?: 'day' | 'section' } | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);
  const [moving, setMoving] = useState<GridMoveTarget | null>(null);
  const sheets = gridSheets(editor.draft);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [removing, setRemoving] = useState(false);
  const [weekError, setWeekError] = useState<string | null>(null);
  const motion = useWeekMotion(editor.draft.weeks.map((week) => week.id).join(','));
  const [movedItem, setMovedItem] = useState<GridDragSource | null>(null);
  const [dragMessage, setDragMessage] = useState<string | null>(null);
  const [dayNumberChanges, setDayNumberChanges] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!Object.keys(dayNumberChanges).length) return;
    const timer = window.setTimeout(() => setDayNumberChanges({}), 360);
    return () => window.clearTimeout(timer);
  }, [dayNumberChanges]);
  const rowDrag = useGridRowDrag(motion.root, (source, target) => {
    if (readOnly || removing) return;
    const plan = planGridStructureMove(editor.draft, source, target);
    if (plan.error) { setDragMessage(plan.error); return; }
    if (!plan.commands.length) return;
    const projected = source.kind === 'day' ? applyCommands(editor.draft, plan.commands) : null;
    const error = editor.dispatch(plan.commands)?.message;
    if (error) { setDragMessage(error); return; }
    if (projected?.ok) {
      const before = new Map(editor.draft.weeks.flatMap((week) => week.days.map((day, index) => [day.id, dayName(index)] as const)));
      const changes: Record<string, string> = {};
      projected.draft.weeks.forEach((week) => week.days.forEach((day, index) => {
        const old = before.get(day.id);
        if (old && old !== dayName(index)) changes[day.id] = old;
      }));
      setDayNumberChanges(changes);
    }
    setMovedItem(source);
    setDragMessage(source.kind === 'day' ? 'Day moved. Day numbers updated.' : source.kind === 'section' ? 'Section moved with its exercises.' : 'Exercise moved. Row numbers updated.');
  });
  const weekAction = (id: string, action: WeekAction) => {
    if (readOnly || removing) return;
    const index = editor.draft.weeks.findIndex((week) => week.id === id);
    if (index < 0) return;
    if (action === 'toggleSections') { editor.dispatch([{ type: 'updateWeek', id, patch: { useSections: !editor.draft.weeks[index]!.useSections } }]); return; }
    if (action === 'delete') { setDeleting(id); return; }
    if (action === 'duplicate') {
      const plan = planDuplicateWeek(editor.draft, id);
      if (!plan.weekId) return;
      motion.capture(id, plan.weekId);
      setWeekError(editor.dispatch(plan.commands)?.message ?? null);
    } else {
      const target = index + (action === 'up' ? -1 : 1);
      if (target < 0 || target >= editor.draft.weeks.length) return;
      motion.capture(id);
      setWeekError(editor.dispatch([{ type: 'move', id, parentId: null, index: target }])?.message ?? null);
    }
  };
  return <div ref={motion.root} className={`grid min-w-0 gap-8 ${rowDrag.preview ? 'cursor-grabbing' : ''}`}
    onPointerDownCapture={rowDrag.resetClick} onPointerMove={rowDrag.move} onPointerUp={rowDrag.finish}
    onPointerCancel={rowDrag.stop} onLostPointerCapture={rowDrag.stop} onClickCapture={rowDrag.click}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-semibold">Training spreadsheets</h2>
      <p className="text-xs text-muted">Drag Day, Section or Exercise to reorder them. Shift-drag or Shift-click to select cells.</p>
    </div>
    {dragMessage ? <p role="status" className="text-sm text-muted">{dragMessage}</p> : null}
    {weekError ? <p role="alert" className="text-sm text-danger">{weekError}</p> : null}
    {sheets.length === 0 ? <p className="text-sm text-muted">Add a week to start its spreadsheet.</p> : null}
    {sheets.map((sheet, index) => <section key={sheet.weekId ?? 'shared'} aria-label={`${sheet.label} spreadsheet`} data-week-sheet={sheet.weekId ?? undefined} className={`grid min-w-0 scroll-mt-24 gap-4 ${rowDrag.preview?.target?.kind === 'week' && rowDrag.preview.target.weekId === sheet.weekId ? 'outline-2 outline-gold/60' : ''}`}>
      {index > 0 ? <hr className="border-0 border-t border-line" /> : null}
      <WeekGrid rows={sheet.rows} weekId={sheet.weekId} label={sheet.label} readOnly={readOnly}
        useSections={sheet.weekId ? editor.draft.weeks.find((week) => week.id === sheet.weekId)!.useSections : true}
        headerActions={sheet.weekId ? <WeekGridMenu sectionsEnabled={editor.draft.weeks.find((week) => week.id === sheet.weekId)!.useSections} label={sheet.label} first={editor.draft.weeks[0]?.id === sheet.weekId}
          last={editor.draft.weeks.at(-1)?.id === sheet.weekId} disabled={readOnly || removing} onAction={(action) => weekAction(sheet.weekId!, action)} /> : null}
        rowDrag={rowDrag} dayNumberChanges={dayNumberChanges} movedItem={movedItem} onMoved={setMovedItem}
        onWeekAction={weekAction} addedId={addedId} onAdded={setAddedId} onMove={setMoving}
        onAddStructure={(row, kind) => setAdding({ row, weekId: sheet.weekId, kind })} />
    </section>)}
    <div className="-mt-4"><Button variant="ghost" disabled={readOnly} onMouseDown={(event) => event.preventDefault()} onClick={(event) => {
      event.currentTarget.focus();
      const week = newWeek(`Week ${editor.draft.weeks.length + 1}`);
      editor.dispatch([{ type: 'insert', parentId: null, node: week }]);
    }}><PlusIcon /> Add week</Button></div>
    {deleting ? <Dialog title={`Delete ${weekName(editor.draft.weeks.findIndex((week) => week.id === deleting))}?`}
      description="This removes the week and all its days, sections and exercises from this draft. You can undo this change. Published history is kept."
      onClose={() => { if (!removing) setDeleting(null); }} footer={<>
        <Button variant="secondary" disabled={removing} onClick={() => setDeleting(null)}>Keep week</Button>
        <Button variant="danger" busy={removing} onClick={async () => {
          const id = deleting;
          setRemoving(true); setDeleting(null);
          if (await motion.collapse(id)) {
            motion.capture();
            setWeekError(editor.dispatch([{ type: 'remove', id }])?.message ?? null);
          }
          setRemoving(false);
        }}>Delete week</Button>
      </>}><span /></Dialog> : null}
    {adding ? <AddGridStructureDialog currentRow={adding.row} initialWeekId={adding.weekId} initialKind={adding.kind ?? (adding.weekId === null ? 'section' : 'day')} onAdded={setAddedId} onClose={() => setAdding(null)} /> : null}
    {moving ? <MoveGridItemDialog target={moving} onClose={() => setMoving(null)} /> : null}
  </div>;
}

function WeekGrid({ rows, weekId, label, readOnly, addedId, onAdded, onMove, onAddStructure, headerActions, onWeekAction, rowDrag, useSections, dayNumberChanges, movedItem, onMoved }: {
  useSections: boolean; rowDrag: GridRowDrag; dayNumberChanges: Record<string, string>; movedItem: GridDragSource | null; onMoved: (item: GridDragSource | null) => void;
  headerActions: ReactNode; onWeekAction: (id: string, action: WeekAction) => void;
  rows: GridRow[]; weekId: string | null; label: string; readOnly: boolean;
  addedId: string | null; onAdded: (id: string | null) => void;
  onMove: (target: GridMoveTarget) => void; onAddStructure: (row?: GridRow, kind?: 'day' | 'section') => void;
}) {
  const editor = useEditor();
  const commitCell = useCellCommit();
  const columns = gridColumns(editor.draft.service).filter((column) => useSections || column.key !== 'section');
  const nameColumn = columns.findIndex((column) => column.key === 'name');
  const spans = useMemo(() => gridRowSpans(rows), [rows]);
  const rejectKey = (row: GridRow, column: GridColumnKey) => column === 'day' && row.dayId ? `${row.dayId}:label` : column === 'section' ? `${row.sectionId}:title` : cellKey(row.exerciseId, column);
  const canEdit = (row: GridRow, column: (typeof columns)[number]) => column.editable || column.key === 'section' || (column.key === 'day' && row.dayId !== null);
  const [active, setActive] = useState<Point | null>(null);
  const [anchor, setAnchor] = useState<Point | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [paste, setPaste] = useState<{ start: Point; text: string } | null>(null);
  const [cellMenu, setCellMenu] = useState<{ point: Point; x: number; y: number } | null>(null);
  const [removal, setRemoval] = useState<{ id: string; label: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // Set when a message describes the edit just dispatched, so that edit's own draft change keeps it.
  const keepMessage = useRef(false);
  const announceEdit = (text: string) => { keepMessage.current = true; setMessage(text); };
  // Feedback about an earlier draft (e.g. "day removed") no longer applies after undo/redo.
  useEffect(() => {
    if (keepMessage.current) { keepMessage.current = false; return; }
    setMessage(null);
  }, [editor.draft]);
  const table = useRef<HTMLTableElement>(null);
  const [params] = useSearchParams();
  const selectedDay = selectedProgramItem(editor.draft, params.get('item'));
  const focusKey = params.get('focus');
  // Only an explicit destination in the URL moves focus; opening the editor keeps the page at the top.
  const requestedItem = params.get('item');
  useEffect(() => {
    if (!requestedItem && !focusKey) return;
    const issueRow = focusKey ? rows.find((row) => columns.some((column) => rejectKey(row, column.key) === focusKey)) : undefined;
    const row = issueRow ?? rows.find((row) => row.dayId === selectedDay);
    if (!row) return;
    const column = issueRow ? columns.findIndex((column) => rejectKey(row, column.key) === focusKey) : 0;
    const columnKey = columns[column]?.key;
    const span = columnKey === 'day' ? spans[rows.indexOf(row)]?.day : columnKey === 'section' ? spans[rows.indexOf(row)]?.section : undefined;
    const owner = span ? rows[span.start]! : row;
    const cell = table.current?.querySelector<HTMLElement>(`[data-grid-exercise="${CSS.escape(owner.exerciseId)}"] [data-grid-column="${columns[column]!.key}"]`);
    setActive({ exerciseId: row.exerciseId, column });
    setAnchor({ exerciseId: row.exerciseId, column });
    cell?.focus({ preventScroll: true });
    cell?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: scrollBehavior() });
  }, [selectedDay, focusKey]);
  const [focused, setFocused] = useState(false);
  // A ref prevents blur from committing a second time after Enter or Escape.
  const editRef = useRef<Editing | null>(null);
  useEffect(() => {
    if (!addedId) return;
    const row = rows.find((r) => r.exerciseId === addedId);
    if (!row) return;
    const point = { exerciseId: addedId, column: nameColumn };
    const edit = { ...point, text: row.exercise.name, selectOnFocus: true };
    setActive(point); setAnchor(point);
    editRef.current = edit; setEditing(edit); onAdded(null);
  }, [addedId, rows, onAdded]);
  useEffect(() => {
    if (!movedItem) return;
    const row = rows.find((row) => movedItem.kind === 'exercise' ? row.exerciseId === movedItem.id : movedItem.kind === 'section' ? row.sectionId === movedItem.id : row.dayId === movedItem.id);
    const column = movedItem.kind === 'day' ? 0 : movedItem.kind === 'section' ? 1 : nameColumn;
    const cell = row ? table.current?.querySelector<HTMLElement>(`[data-grid-exercise="${CSS.escape(row.exerciseId)}"] [data-grid-column="${columns[column]!.key}"]`)
      : table.current?.parentElement?.querySelector<HTMLElement>(`[data-grid-drop-${movedItem.kind}="${CSS.escape(movedItem.id)}"]`);
    if (!cell) return;
    if (row) { const point = { exerciseId: row.exerciseId, column }; setActive(point); setAnchor(point); }
    cell.focus({ preventScroll: true });
    cell.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: scrollBehavior() });
    onMoved(null);
  }, [movedItem, rows, onMoved]);
  const current = active && rows.some((r) => r.exerciseId === active.exerciseId)
    ? active : rows[0] ? { exerciseId: rows[0].exerciseId, column: nameColumn } : null;
  const indexOf = (p: Point) => rows.findIndex((r) => r.exerciseId === p.exerciseId);
  const endRow = current ? indexOf(current) : 0;
  const editingRow = editing ? indexOf(editing) : -1;
  const validAnchor = anchor && indexOf(anchor) >= 0 ? anchor : current;
  const startRow = validAnchor ? indexOf(validAnchor) : endRow;
  const left = Math.min(validAnchor?.column ?? current?.column ?? 0, current?.column ?? 0);
  const right = Math.max(validAnchor?.column ?? current?.column ?? 0, current?.column ?? 0);
  const top = Math.min(startRow, endRow);
  const bottom = Math.max(startRow, endRow);
  const selectedCells = () => rows.slice(top, bottom + 1).flatMap((row) =>
    columns.slice(left, right + 1).map((c) => ({ exerciseId: row.exerciseId, column: c.key })),
  );
  const focus = (point: Point, extend = false) => {
    setAnchor(extend ? anchor ?? current : point);
    setActive(point);
    const owner = gridCellOwner(spans, indexOf(point), columns[point.column]!.key);
    const ownerId = rows[owner]?.exerciseId;
    const column = columns[point.column]?.key;
    if (ownerId && column) table.current?.querySelector<HTMLElement>(`[data-grid-exercise="${CSS.escape(ownerId)}"] [data-grid-column="${column}"]`)?.focus();
  };
  const finishEdit = (discard = false) => {
    const edit = editRef.current;
    if (!edit) return;
    editRef.current = null;
    setEditing(null);
    const column = columns[edit.column]!.key;
    const row = rows.find((row) => row.exerciseId === edit.exerciseId);
    if (!row) return;
    const key = rejectKey(row, column);
    if (discard) { editor.setRejected(key, null); return; }
    const plan = column === 'day' ? planSetDayFocus(editor.draft, edit.exerciseId, edit.text) : column === 'section' ? planRenameGridSection(editor.draft, edit.exerciseId, edit.text) : null;
    const error = plan ? plan.errors[0]?.message ?? editor.dispatch(plan.commands)?.message : commitCell(edit.exerciseId, column, edit.text);
    editor.setRejected(key, error ? { text: edit.text, message: error } : null);
  };
  const beginEdit = (point: Point, replacement?: string) => {
    const column = columns[point.column]!;
    const owner = gridCellOwner(spans, indexOf(point), column.key);
    const row = rows[owner];
    if (readOnly || !row || !canEdit(row, column)) return;
    point = { exerciseId: row.exerciseId, column: point.column };
    const text = replacement ?? editor.state.rejected[rejectKey(row, column.key)]?.text ?? cellText(row, column.key);
    const edit = { ...point, text, selectOnFocus: replacement === undefined };
    setActive(point); setAnchor(point);
    editRef.current = edit;
    setEditing(edit);
  };
  const dragSelection = useGridDragSelection(table, (start, end) => {
    setAnchor(start); setActive(end);
  }, () => finishEdit());
  const navigate = (e: KeyboardEvent, point: Point) => {
    let r = indexOf(point);
    let c = point.column;
    switch (e.key) {
      case 'ArrowUp': r--; break;
      case 'ArrowDown': r++; break;
      case 'ArrowLeft': c--; break;
      case 'ArrowRight': c++; break;
      case 'Enter': r += e.shiftKey ? -1 : 1; break;
      case 'Tab': {
        const next = r * columns.length + c + (e.shiftKey ? -1 : 1);
        // Let Tab leave the grid at its boundaries.
        if (next < 0 || next >= rows.length * columns.length) return;
        r = Math.floor(next / columns.length);
        c = next % columns.length;
        break;
      }
      case 'Home': c = 0; if (e.ctrlKey || e.metaKey) r = 0; break;
      case 'End': c = columns.length - 1; if (e.ctrlKey || e.metaKey) r = rows.length - 1; break;
      default: return;
    }
    e.preventDefault();
    focus({ exerciseId: rows[Math.max(0, Math.min(rows.length - 1, r))]!.exerciseId, column: Math.max(0, Math.min(columns.length - 1, c)) }, e.shiftKey && e.key !== 'Tab' && e.key !== 'Enter');
  };
  const openCellMenu = (point: Point, x: number, y: number) => {
    if (readOnly) return;
    finishEdit();
    focus(point);
    setCellMenu({ point, x, y });
  };
  const closeCellMenu = (restoreFocus: boolean) => {
    if (restoreFocus && cellMenu) focus(cellMenu.point);
    setCellMenu(null);
  };
  const menuRow = cellMenu ? rows.find((row) => row.exerciseId === cellMenu.point.exerciseId) : null;
  const runCellAction = (action: GridCellAction) => {
    if (readOnly || !menuRow) return;
    if (action === 'insertAbove' || action === 'insertBelow') {
      const column = columns[cellMenu!.point.column]!.key;
      const plan = planInsertGridRow(editor.draft, menuRow.exerciseId, column, action === 'insertBelow');
      closeCellMenu(true);
      const error = editor.dispatch(plan.commands);
      if (error) setMessage(error.message);
      else onAdded(plan.exerciseId);
      return;
    }
    if ((action === 'duplicateWeek' || action === 'removeWeek') && menuRow.weekId) {
      closeCellMenu(true);
      onWeekAction(menuRow.weekId, action === 'duplicateWeek' ? 'duplicate' : 'delete');
      return;
    }
    if (action === 'moveExercise') {
      closeCellMenu(true);
      onMove({ kind: 'exercise', id: menuRow.exerciseId });
      return;
    }
    const id = action === 'duplicateDay' || action === 'removeDay' ? menuRow.dayId : menuRow.weekId;
    if (!id) return;
    closeCellMenu(true);
    if (action === 'duplicateDay' || action === 'duplicateWeek') {
      const error = editor.dispatch([{ type: 'duplicate', id }]);
      if (error) setMessage(error.message);
    } else {
      const week = editor.draft.weeks.find((w) => w.id === menuRow.weekId);
      const label = action === 'removeDay' ? menuRow.dayLabel : weekName(editor.draft.weeks.findIndex((candidate) => candidate.id === week?.id));
      setRemoval({ id, label });
    }
  };
  const week = editor.draft.weeks.find((week) => week.id === weekId);
  const emptyTargets: { kind: 'section' | 'day'; id: string; label: string; dayId?: string }[] = week
    ? week.days.flatMap<{ kind: 'section' | 'day'; id: string; label: string; dayId?: string }>((day, index) => day.sections.length
      ? day.sections.filter((section) => !section.exercises.length).map((section) => ({ kind: 'section' as const, id: section.id, dayId: day.id, label: `${dayHeading(day, index)} / ${section.title || 'Unnamed section'}` }))
      : [{ kind: 'day' as const, id: day.id, label: dayHeading(day, index) }])
    : editor.draft.sharedSections.filter((section) => !section.exercises.length).map((section) => ({ kind: 'section', id: section.id, label: section.title || 'Unnamed section' }));
  const dragSource = rowDrag.preview?.source;
  const drop = rowDrag.preview?.target;
  const dropIndex = rows.findIndex((row) => drop?.kind === 'exercise' ? row.exerciseId === drop.exerciseId : drop?.kind === 'section' ? row.sectionId === drop.sectionId : drop?.kind === 'day' ? row.dayId === drop.dayId : false);
  const dropSpan = dropIndex < 0 ? null : drop?.kind === 'day' ? spans[dropIndex]!.day : drop?.kind === 'section' ? spans[dropIndex]!.section : { start: dropIndex, length: 1 };
  const edge = drop && 'edge' in drop ? drop.edge ?? 'after' : 'after';
  const dragColumn = columns.findIndex((column) => column.key === (dragSource?.kind === 'day' ? 'day' : dragSource?.kind === 'section' ? 'section' : 'order'));
  const pasteRow = paste ? rows.findIndex((r) => r.exerciseId === paste.start.exerciseId) : -1;
  const pastePlan = paste && pasteRow >= 0 ? planPaste(editor.draft, rows, pasteRow, paste.start.column, parseClipboard(paste.text), columns) : null;

  return (
    <div className="grid min-w-0 gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 tabIndex={-1} className="text-xl font-semibold outline-none sm:text-2xl">{label}</h3>
        </div>
        {headerActions}
      </div>
      {/* Always rendered at a fixed height, so a message appearing or clearing never moves the table. */}
      <p role="status" className="min-h-5 truncate text-sm text-muted" title={message ?? undefined}>{message}</p>
      <GridTableFrame readOnly={readOnly} onAdd={(kind) => {
        finishEdit();
        if (kind === 'section') { onAddStructure(undefined, kind); return; }
        const plan = kind === 'day'
          ? planAddGridStructure(editor.draft, { kind: 'day', label: '', weekId: weekId ?? editor.draft.weeks.at(-1)?.id ?? null })
          : planAddSheetRow(editor.draft, weekId);
        const error = editor.dispatch(plan.commands);
        if (error) { setMessage(error.message); return; }
        onAdded(plan.exerciseId);
      }}>
          <table ref={table} role="grid" aria-label={`${label} targets`} aria-multiselectable="true" aria-rowcount={rows.length + 1} aria-colcount={columns.length}
            className="w-full select-none border-separate border-spacing-0 text-sm"
            onPointerDownCapture={dragSelection.resetClick}
            onPointerMove={dragSelection.move}
            onPointerUp={dragSelection.finish}
            onPointerCancel={dragSelection.stop}
            onLostPointerCapture={dragSelection.stop}
            onClickCapture={dragSelection.click}
            onFocusCapture={() => setFocused(true)}
            onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
            onCopy={(e) => {
              if (editRef.current) return;
              e.preventDefault();
              e.clipboardData.setData('text/plain', toClipboard(rows.slice(top, bottom + 1).map((row) => columns.slice(left, right + 1).map((c) => cellText(row, c.key)))));
              setMessage(`Copied ${bottom - top + 1} × ${right - left + 1} cells.`);
            }}
            onPaste={(e) => {
              if (readOnly || !current || (['day', 'section'].includes(columns[editRef.current?.column ?? -1]?.key ?? '') && e.target instanceof HTMLInputElement)) return;
              e.preventDefault();
              finishEdit();
              setPaste({ start: { exerciseId: rows[top]!.exerciseId, column: left }, text: e.clipboardData.getData('text/plain') });
            }}>
            <thead className="sticky top-0 z-10 bg-surface-raised"><tr role="row">
              {columns.map((column) => <th key={column.key} role="columnheader" scope="col" className={`${widths[column.key]} border-b border-r border-line px-3 py-2 text-left text-xs font-medium text-muted`}>{column.label}</th>)}
            </tr></thead>
            <tbody>
              {rows.map((row, r) => <tr key={row.exerciseId} role="row" aria-rowindex={r + 2} data-grid-exercise={row.exerciseId} data-grid-day-id={row.dayId ?? undefined} data-grid-section-id={row.sectionId}>
                {columns.map((column, c) => {
                  const span = column.key === 'day' ? spans[r]!.day : column.key === 'section' ? spans[r]!.section : { start: r, length: 1 };
                  if (span.start !== r) return null;
                  const isCurrent = current?.column === c && endRow >= r && endRow < r + span.length;
                  const point = isCurrent ? current! : { exerciseId: row.exerciseId, column: c };
                  const selected = r <= bottom && r + span.length > top && c >= left && c <= right;
                  const edit = editing?.column === c && editingRow >= r && editingRow < r + span.length ? editing : null;
                  const rejected = editor.state.rejected[rejectKey(row, column.key)];
                  const options = choices[column.key];
                  const value = rejected?.text ?? cellText(row, column.key);
                  const dropEdge = dropSpan && c >= dragColumn && (edge === 'before' ? r === dropSpan.start : r + span.length === dropSpan.start + dropSpan.length) ? edge : null;
                  const isDragged = dragSource?.kind === 'day' ? row.dayId === dragSource.id : dragSource?.kind === 'section' ? row.sectionId === dragSource.id : dragSource?.id === row.exerciseId;
                  const dayBoundary = r > 0 && spans[r]!.day.start === r;
                  return <td key={column.key} role="gridcell" rowSpan={span.length} aria-rowspan={span.length > 1 ? span.length : undefined} aria-colindex={c + 1}
                    data-grid-section={column.key === 'section' ? row.sectionId : undefined} title={rejected?.message} aria-describedby={rejected ? `${row.exerciseId}-${column.key}-error` : undefined} data-grid-day={column.key === 'day' ? row.dayId ?? undefined : undefined}
                    data-grid-column={column.key} data-grid-column-index={c} tabIndex={isCurrent ? 0 : -1} aria-selected={selected && focused} aria-readonly={readOnly || !canEdit(row, column)} aria-invalid={rejected ? true : undefined}
                    aria-label={column.key === 'day' ? `${row.dayLabel}, Focus: ${row.focus || 'not set'}` : column.key === 'section' ? `${row.dayLabel}, section: ${row.sectionLabel}` : `${row.dayLabel}, ${row.exercise.name}, ${column.label}`}
                    className={`${widths[column.key]} relative scroll-mt-24 border-b border-r border-line ${dayBoundary ? 'border-t border-t-line' : ''} p-0 align-top focus:z-[1] focus:outline-2 focus:-outline-offset-2 focus:outline-gold ${selected && focused ? 'bg-gold/10' : ''} ${canEdit(row, column) ? '' : 'text-muted'} ${rejected ? 'bg-danger/10 ring-1 ring-inset ring-danger/50' : ''} ${!readOnly && (c > 0 || row.dayId) ? 'cursor-grab' : ''} ${c >= dragColumn && isDragged ? 'opacity-40' : ''} ${dropEdge === 'before' ? 'shadow-[inset_0_2px_0_var(--color-gold)]' : dropEdge === 'after' ? 'shadow-[inset_0_-2px_0_var(--color-gold)]' : ''}`}
                    onPointerDown={(event) => {
                      const source: GridDragSource | null = column.key === 'day' ? row.dayId ? { kind: 'day', id: row.dayId } : null : column.key === 'section' ? { kind: 'section', id: row.sectionId } : { kind: 'exercise', id: row.exerciseId };
                      if (!readOnly && source && rowDrag.start(event, source)) {
                        dragSelection.stop(); finishEdit(); focus(point);
                        return;
                      }
                      dragSelection.start(event, point, event.shiftKey ? validAnchor ?? point : point);
                    }}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).tagName === 'SELECT') return;
                      if (!edit) focus(point, e.shiftKey);
                    }}
                    onContextMenu={(e) => {
                      if (readOnly) return;
                      e.preventDefault(); e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      openCellMenu(gridPointAtCell(e.currentTarget, e.clientY) ?? point, e.clientX || rect.left, e.clientY || rect.bottom);
                    }}
                    onDoubleClick={(event) => beginEdit(gridPointAtCell(event.currentTarget, event.clientY) ?? point)}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (!readOnly && (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10'))) {
                        e.preventDefault(); e.stopPropagation();
                        const rect = e.currentTarget.getBoundingClientRect();
                        openCellMenu(point, rect.left, rect.bottom);
                        return;
                      }
                      if (edit) {
                        if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEdit(true); focus(point); }
                        else if (e.key === 'Enter' || e.key === 'Tab') { finishEdit(); navigate(e, point); }
                        return;
                      }
                      if (e.key === 'F2' || e.key === 'Enter') { e.preventDefault(); beginEdit(point); }
                      else if (e.key === 'Escape') {
                        editor.setRejected(rejectKey(row, column.key), null);
                        setAnchor(point);
                      } else if (e.key === 'Delete' || e.key === 'Backspace') {
                        e.preventDefault();
                        if (readOnly) return;
                        const cells = selectedCells();
                        const plan = planClear(editor.draft, cells);
                        const error = plan.errors[0]?.message ?? editor.dispatch(plan.commands)?.message;
                        if (!error) [...cells, ...plan.changes].forEach((cell) => {
                          const selectedRow = rows.find((row) => row.exerciseId === cell.exerciseId);
                          if (selectedRow && cell.column !== 'order') editor.setRejected(rejectKey(selectedRow, cell.column), null);
                        });
                        if (error) setMessage(error);
                        else if (plan.commands.length) announceEdit('Selection cleared. Fill in missing names and labels before publishing.');
                      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
                        e.preventDefault(); beginEdit(point, e.key);
                      } else navigate(e, point);
                    }}>
                    {column.key === 'day' && row.dayId ? <p className="px-3 pt-3 font-medium"><TransitionDayNumber label={row.dayLabel} previous={dayNumberChanges[row.dayId]} /></p> : null}
                    {options && edit ? <select autoFocus tabIndex={-1} disabled={readOnly} aria-label={`${column.label} for ${row.exercise.name}`} value={value}
                      aria-invalid={rejected ? true : undefined}
                      onFocus={(event) => {
                        setActive(point); setAnchor(point);
                        // Supported browsers open the native picker from this user-initiated edit.
                        try { event.currentTarget.showPicker?.(); } catch { /* Keyboard/native select interaction remains available. */ }
                      }}
                      onBlur={() => finishEdit()}
                      onKeyDown={(e) => {
                        if (e.key === 'ContextMenu' || (e.shiftKey && e.key === 'F10')) return;
                        if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) return;
                        e.stopPropagation();
                        if (e.key === 'Tab') { finishEdit(); navigate(e, point); }
                        else if (e.key === 'Escape') { e.preventDefault(); finishEdit(true); focus(point); }
                      }}
                      onChange={(e) => {
                        const text = e.target.value;
                        const error = commitCell(row.exerciseId, column.key, text);
                        editor.setRejected(cellKey(row.exerciseId, column.key), error ? { text, message: error } : null);
                        editRef.current = null;
                        setEditing(null);
                        focus(point);
                      }}
                      className="min-h-11 w-full cursor-pointer bg-transparent px-2 py-3 text-sm text-text focus:outline-2 focus:-outline-offset-2 focus:outline-gold disabled:cursor-default">
                      {!options.some((option) => option.value === value) ? <option value={value} disabled>{value.includes('/') ? `Per set: ${value}` : value}</option> : null}
                      {options.map((option) => <option key={option.value} value={option.value} className="bg-surface text-text">{option.label}</option>)}
                    </select> : edit && column.key === 'muscles' ? <MuscleCellInput label={`Edit muscles for ${row.exercise.name}`} known={weekMuscles(editor.draft, row.weekId)}
                      text={edit.text} selectOnFocus={edit.selectOnFocus} invalid={!!rejected} describedBy={rejected ? `${row.exerciseId}-${column.key}-error` : undefined}
                      onText={(text) => { const next = { ...edit, text }; editRef.current = next; setEditing(next); }}
                      onBlur={() => finishEdit()} />
                    : edit ? <input autoFocus aria-label={column.key === 'day' ? 'Edit day focus' : column.key === 'section' ? 'Edit section name' : `Edit ${column.label} for ${row.exercise.name}`} value={edit.text}
                      placeholder={column.key === 'day' ? 'Legs, Pull, Push…' : column.key === 'section' ? 'Section name' : column.key === 'name' ? 'Exercise name' : undefined} data-edit-key={rejectKey(row, column.key)} aria-invalid={!!rejected} aria-describedby={rejected ? `${row.exerciseId}-${column.key}-error` : undefined}
                      onFocus={(e) => {
                        if (edit.selectOnFocus) e.currentTarget.select();
                        else e.currentTarget.setSelectionRange(edit.text.length, edit.text.length);
                      }}
                      onChange={(e) => { const next = { ...edit, text: e.target.value }; editRef.current = next; setEditing(next); }}
                      onBlur={() => finishEdit()}
                      className="min-h-11 w-full select-text bg-ink px-3 text-base text-text outline-2 -outline-offset-2 outline-gold sm:text-sm" />
                      : <>
                        <span className={`block min-h-11 whitespace-pre-wrap break-words px-3 py-3 ${options ? 'pr-9' : ''} ${column.key === 'name' ? 'font-medium' : column.key === 'day' && row.dayId ? 'text-muted' : ''}`}>{(options?.find((option) => option.value === value)?.label ?? value) || (column.key === 'day' && row.dayId ? 'Add focus' : '\u00a0')}</span>
                        {options && !readOnly ? <button type="button" tabIndex={-1} aria-label={`Choose ${column.label} for ${row.exercise.name}`}
                          onPointerDown={(event) => event.stopPropagation()}
                          onClick={(event) => { event.stopPropagation(); if (event.shiftKey) focus(point, true); else beginEdit(point); }}
                          className="absolute right-0 top-0 flex min-h-11 w-8 items-center justify-center text-muted hover:bg-surface-raised hover:text-text">
                          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m4 6 4 4 4-4" /></svg>
                        </button> : null}
                      </>}
                    {rejected ? <span id={`${row.exerciseId}-${column.key}-error`} className="sr-only">{rejected.message}</span> : null}
                  </td>;
                })}
              </tr>)}
            </tbody>
          </table>
          {emptyTargets.length ? <div className="grid gap-2 border-t border-line p-3">
            {emptyTargets.map((target) => {
              const drop = rowDrag.preview?.target;
              const highlighted = drop?.kind === target.kind && (drop.kind === 'section' ? drop.sectionId : drop.kind === 'day' ? drop.dayId : '') === target.id;
              return <div key={target.id} tabIndex={0} data-grid-drop-parent-day={target.dayId}
                onPointerDown={(event) => { if (!readOnly && rowDrag.start(event, { kind: target.kind, id: target.id })) finishEdit(); }}
                data-grid-drop-section={target.kind === 'section' ? target.id : undefined} data-grid-drop-day={target.kind === 'day' ? target.id : undefined}
                className={`rounded-card border border-dashed px-3 py-3 text-sm ${highlighted ? 'border-gold bg-gold/10 text-text' : 'border-line text-muted'}`}>
                {target.kind === 'day' ? <TransitionDayNumber label={target.label} previous={dayNumberChanges[target.id]} /> : target.label} · {rowDrag.preview ? `Drop ${rowDrag.preview.source.kind} here` : 'No exercises'}
              </div>;
            })}
          </div> : null}
      </GridTableFrame>
      {cellMenu && menuRow && !readOnly ? <GridCellMenu key={`${cellMenu.point.exerciseId}:${cellMenu.point.column}:${cellMenu.x}:${cellMenu.y}`}
        x={cellMenu.x} y={cellMenu.y} label={menuRow.dayLabel} hasDay={!!menuRow.dayId} hasWeek={!!menuRow.weekId} canInsert={cellMenu.point.column !== 0 || !!menuRow.dayId}
        onAction={runCellAction} onClose={closeCellMenu} /> : null}
      {removal ? <Dialog title={`Remove ${removal.label}?`} description="This removes the item and all its exercises from this draft. Published programs and client history are kept."
        onClose={() => setRemoval(null)} footer={<>
          <Button variant="secondary" onClick={() => setRemoval(null)}>Keep it</Button>
          <Button variant="danger" onClick={() => {
            const error = editor.dispatch([{ type: 'remove', id: removal.id }]);
            if (error) { setMessage(error.message); return; }
            const removedRows = rows.filter((r) => r.dayId === removal.id || r.weekId === removal.id);
            removedRows.forEach((r) => Object.keys(editor.state.rejected).filter((key) => key.startsWith(`${r.exerciseId}:`)).forEach((key) => editor.setRejected(key, null)));
            setActive(null); setAnchor(null); setRemoval(null); announceEdit(`${removal.label} removed from the draft.`);
          }}>Remove</Button>
        </>}><span /></Dialog> : null}
      {paste ? <PastePreview columns={columns} text={paste.text} onTextChange={(text) => setPaste({ ...paste, text })} plan={pastePlan} rows={rows}
        onClose={() => { setPaste(null); focus(paste.start); }}
        onApply={() => {
          if (!pastePlan || pastePlan.errors.length > 0) return;
          const error = editor.dispatch(pastePlan.commands);
          if (error) { setMessage(error.message); return; }
          const matrix = parseClipboard(paste.text);
          matrix.forEach((line, r) => line.forEach((_, c) => {
            const row = rows[pasteRow + r]; const column = columns[paste.start.column + c];
            if (row && column?.editable) editor.setRejected(cellKey(row.exerciseId, column.key), null);
          }));
          announceEdit(`Applied ${pastePlan.changes.length} cell changes together.`);
          setPaste(null);
          focus(paste.start);
        }} /> : null}
    </div>
  );
}


function TransitionDayNumber({ label, previous }: { label: string; previous?: string }) {
  return <span className="inline-grid">
    <span className="sr-only">{label}</span>
    {previous ? <span key={`${previous}:${label}:old`} aria-hidden className="day-number-exit [grid-area:1/1]">{previous}</span> : null}
    <span key={`${previous ?? ''}:${label}:new`} aria-hidden className={`${previous ? 'day-number-enter' : ''} [grid-area:1/1]`}>{label}</span>
  </span>;
}

/** The Muscles cell editor: the grid's text input plus same-week suggestions (decision 0021). */
function MuscleCellInput({ label, known, text, selectOnFocus, invalid, describedBy, onText, onBlur }: {
  label: string; known: string[]; text: string; selectOnFocus: boolean; invalid: boolean; describedBy: string | undefined;
  onText: (text: string) => void; onBlur: () => void;
}) {
  const listId = useId();
  const suggestions = useMuscleSuggestions(known, text, onText, listId);
  return (
    <div className="relative">
      <input autoFocus aria-label={label} value={text} placeholder="E.g. biceps, triceps" aria-invalid={invalid} aria-describedby={describedBy} {...suggestions.inputProps}
        onFocus={(e) => {
          if (selectOnFocus) e.currentTarget.select();
          else e.currentTarget.setSelectionRange(text.length, text.length);
        }}
        onKeyDown={(e) => { suggestions.onKeyDown(e); }}
        onChange={(e) => { suggestions.onTextChange(); onText(e.target.value); }}
        onBlur={onBlur}
        className="min-h-11 w-full select-text bg-ink px-3 text-base text-text outline-2 -outline-offset-2 outline-gold sm:text-sm" />
      {suggestions.list}
    </div>
  );
}
