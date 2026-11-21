import { applyCommands, type DraftCommand } from '@/domain/programs/commands';
import type { Exercise, ProgramDraft } from '@/domain/programs/contract';
import { planClear, planEdits, type CellEdit, type GridColumnKey } from '@/domain/programs/grid';
import { planGridRowMove } from '@/domain/programs/gridRowMoves';
import { typing, type DemoFrame, type DemoScript } from './demo';

/*
 * Spreadsheet demos for the program editor Help (decision 0057, phase 2). A fictional program is
 * edited with the editor's own planners (planEdits, planGridRowMove, planClear), so every frame
 * shows what the real Spreadsheet would show. Exercise names are generic, never from MPS templates.
 */

/** The columns the demo grid shows, a narrow slice of the real Spreadsheet. */
export const DEMO_COLUMNS = ['order', 'name', 'sets', 'effort'] as const satisfies readonly GridColumnKey[];
export type DemoColumn = (typeof DEMO_COLUMNS)[number];

export type DemoCell = { exerciseId: string; column: DemoColumn };

export type GridDemoState = {
  draft: ProgramDraft;
  /** A rectangle of cells, from anchor to focus. */
  selection?: { from: DemoCell; to: DemoCell } | null;
  /** A cell being typed into, with the text so far. */
  editing?: (DemoCell & { text: string }) | null;
  /** A row being dragged, and where it would land. */
  dragging?: { exerciseId: string; over: { exerciseId: string; edge: 'before' | 'after' } | null } | null;
  /** Cells that just changed, shown with a brief gold wash. */
  changed?: DemoCell[];
  /** Whether Undo can be pressed. */
  canUndo?: boolean;
};

/** `data-demo-target` names the grid renders. */
export const cellTarget = (cell: DemoCell) => `cell:${cell.exerciseId}:${cell.column}`;
export const UNDO_TARGET = 'undo';

function exercise(id: string, name: string): Exercise {
  return { id, logicalKey: id, name, alternatives: [], groupId: null, demoUrl: null, muscles: [], prescription: { setCount: null, targets: [] }, notes: '' };
}

/** Plans and applies one batch, as the editor does. A refused edit is a broken script. */
function apply(draft: ProgramDraft, plan: { commands: DraftCommand[]; errors?: { message: string }[]; error?: string | null }): ProgramDraft {
  const problem = plan.errors?.[0]?.message ?? plan.error;
  if (problem) throw new Error(`Demo edit refused: ${problem}`);
  const result = applyCommands(draft, plan.commands, { newId: () => 'demo-new' });
  if (!result.ok) throw new Error(`Demo edit failed: ${result.error.message}`);
  return result.draft;
}

const edit = (draft: ProgramDraft, edits: CellEdit[]) => apply(draft, planEdits(draft, edits));

/** One week, one day, typed in through the grid like a coach would. */
function demoProgram(rows: [id: string, name: string, sets: string, reps: string][]): ProgramDraft {
  const draft: ProgramDraft = {
    schemaVersion: 1,
    service: 'mesocycle',
    title: 'Hypertrophy',
    programTheme: '',
    sharedSections: [],
    weeks: [{ id: 'week-1', index: 1, label: '', startDate: null, useSections: false, days: [{ id: 'day-1', label: 'Push', scheduledDate: null, sections: [
      { id: 'main', kind: 'main', title: 'Main', instructions: '', exercises: rows.map(([id, name]) => exercise(id, name)) },
    ] }] }],
    resources: [],
    coachNotes: '',
  };
  return edit(draft, rows.flatMap(([id, , sets, reps]) => [{ exerciseId: id, column: 'sets', text: sets }, { exerciseId: id, column: 'effort', text: reps }]));
}

type Frame = DemoFrame<GridDemoState>;

/** Typing a different target for each set. */
function perSetTargets(): DemoScript<GridDemoState> {
  const start = demoProgram([['bench', 'Bench press', '3', '8-10'], ['incline', 'Incline dumbbell press', '3', '10'], ['fly', 'Cable fly', '2', '12-15']]);
  const cell: DemoCell = { exerciseId: 'incline', column: 'effort' };
  const done = edit(start, [{ ...cell, text: '10 / 8 / 6' }]);
  const pick = 'Select the Reps / time cell.';
  const type = 'Type one target per set, separated by slashes.';
  const frames: Frame[] = [
    { state: { draft: start }, ms: 1400, caption: 'One week of a program in the Spreadsheet.', pointer: { target: cellTarget({ exerciseId: 'bench', column: 'name' }) } },
    { state: { draft: start }, ms: 700, caption: pick, pointer: { target: cellTarget(cell) } },
    { state: { draft: start, selection: { from: cell, to: cell } }, ms: 500, caption: pick, pointer: { target: cellTarget(cell), press: true } },
    { state: { draft: start, selection: { from: cell, to: cell } }, ms: 600, caption: pick, pointer: { target: cellTarget(cell) } },
    ...typing<GridDemoState>('10 / 8 / 6', 140, (text) => ({ state: { draft: start, editing: { ...cell, text } }, caption: type, pointer: { target: cellTarget(cell) } })),
    { state: { draft: start, editing: { ...cell, text: '10 / 8 / 6' } }, ms: 700, caption: 'Press Enter to save it.', keys: ['Enter'], pointer: { target: cellTarget(cell) } },
    { state: { draft: done, selection: { from: cell, to: cell }, changed: [cell] }, ms: 2600, caption: 'Set 1 is now 10 reps, set 2 is 8 and set 3 is 6.', pointer: { target: cellTarget(cell) } },
  ];
  return { id: 'per-set-targets', description: 'Typing 10 / 8 / 6 into the Reps / time cell of a 3-set exercise gives each set its own target.', frames };
}

/** Dragging an exercise to a new place, with the numbers updating. */
function dragRow(): DemoScript<GridDemoState> {
  const start = demoProgram([['bench', 'Bench press', '3', '8-10'], ['incline', 'Incline dumbbell press', '3', '10'], ['fly', 'Cable fly', '2', '12-15'], ['dip', 'Assisted dip', '2', '8']]);
  const over = { exerciseId: 'incline', edge: 'before' as const };
  const moved = apply(start, planGridRowMove(start, 'fly', { kind: 'exercise', ...over }, () => 'demo-new'));
  const grab = cellTarget({ exerciseId: 'fly', column: 'order' });
  const drop = cellTarget({ exerciseId: 'incline', column: 'order' });
  const drag = 'Drag it to where it should go. A gold line shows where it lands.';
  const frames: Frame[] = [
    { state: { draft: start }, ms: 1300, caption: 'To reorder, press on an exercise row.', pointer: { target: cellTarget({ exerciseId: 'dip', column: 'name' }) } },
    { state: { draft: start }, ms: 700, caption: 'To reorder, press on an exercise row.', pointer: { target: grab } },
    { state: { draft: start, dragging: { exerciseId: 'fly', over: null } }, ms: 600, caption: drag, pointer: { target: grab, press: true } },
    { state: { draft: start, dragging: { exerciseId: 'fly', over } }, ms: 1300, caption: drag, pointer: { target: drop, press: true } },
    { state: { draft: moved, changed: DEMO_COLUMNS.map((column) => ({ exerciseId: 'fly', column })) }, ms: 2600, caption: 'Let go. The numbers in # update on their own.', pointer: { target: drop } },
  ];
  return { id: 'drag-row', description: 'Dragging Cable fly above Incline dumbbell press moves it to second place, and the numbers update.', frames };
}

/** Selecting a block with Shift, clearing it with Delete, then Undo. */
function selectDeleteUndo(): DemoScript<GridDemoState> {
  const start = demoProgram([['bench', 'Bench press', '3', '8-10'], ['incline', 'Incline dumbbell press', '3', '10'], ['fly', 'Cable fly', '2', '12-15']]);
  const from: DemoCell = { exerciseId: 'bench', column: 'sets' };
  const to: DemoCell = { exerciseId: 'incline', column: 'effort' };
  const block: DemoCell[] = [from, { exerciseId: 'bench', column: 'effort' }, { exerciseId: 'incline', column: 'sets' }, to];
  const cleared = apply(start, planClear(start, block));
  const shift = 'Hold Shift and click another cell to select the block between them.';
  const frames: Frame[] = [
    { state: { draft: start }, ms: 1000, caption: 'Click the first cell.', pointer: { target: cellTarget(from) } },
    { state: { draft: start, selection: { from, to: from } }, ms: 700, caption: 'Click the first cell.', pointer: { target: cellTarget(from), press: true } },
    { state: { draft: start, selection: { from, to: from } }, ms: 900, caption: shift, keys: ['Shift'], pointer: { target: cellTarget(to) } },
    { state: { draft: start, selection: { from, to } }, ms: 1200, caption: shift, keys: ['Shift'], pointer: { target: cellTarget(to), press: true } },
    { state: { draft: cleared, selection: { from, to }, canUndo: true }, ms: 1500, caption: 'Press Delete to clear every cell in it.', keys: ['Delete'], pointer: { target: cellTarget(to) } },
    { state: { draft: cleared, selection: { from, to }, canUndo: true }, ms: 900, caption: 'Changed your mind? Select Undo.', pointer: { target: UNDO_TARGET } },
    { state: { draft: cleared, selection: { from, to }, canUndo: true }, ms: 400, caption: 'Changed your mind? Select Undo.', pointer: { target: UNDO_TARGET, press: true } },
    { state: { draft: start, changed: block }, ms: 2400, caption: 'Everything is back as it was.', pointer: { target: UNDO_TARGET } },
  ];
  return { id: 'select-delete-undo', description: 'Shift-clicking selects four cells, Delete clears them, and Undo brings them back.', frames };
}

export const SPREADSHEET_DEMOS = {
  'per-set-targets': perSetTargets(),
  'drag-row': dragRow(),
  'select-delete-undo': selectDeleteUndo(),
} satisfies Record<string, DemoScript<GridDemoState>>;

export type SpreadsheetDemoName = keyof typeof SPREADSHEET_DEMOS;
