import { formatRange, parseRangeText, type NumericRange } from '../measurements/range';
import type { Effort, Load, WeightUnit } from '../measurements/load';
import { applyCommands, newDay, newExercise, newSection, newWeek, type DraftCommand } from './commands';
import { dayFocus, dayName, weekName } from './labels';
import { formatMuscles, parseMuscles, weekMuscles } from './muscles';
import { ExercisePrescription, type Exercise, type ProgramDraft, type Section, type SetTarget, type ServiceKind } from './contract';

/**
 * The Grid view as a pure model (FR-06). Rows are exercises; cells are text. Every edit, from one
 * typed cell to a rectangular paste, goes through `planEdits`, which rebuilds each touched row from
 * its current values plus the edited cells and returns one command batch, or per-cell errors and no
 * commands. A bad cell therefore rejects the whole edit instead of shifting its neighbours.
 *
 * Per-set targets show as "10 / 8 / 6". A single value applies to every set; a list must have one
 * value per set. Annotations and alternatives are Program-view only and are kept untouched.
 */

export const GRID_COLUMNS = [
  { key: 'day', label: 'Day / Focus', editable: false },
  { key: 'section', label: 'Section', editable: false },
  { key: 'order', label: '#', editable: false },
  { key: 'name', label: 'Exercise', editable: true },
  { key: 'muscles', label: 'Muscles', editable: true },
  { key: 'sets', label: 'Sets', editable: true },
  { key: 'effort', label: 'Reps / time', editable: true },
  { key: 'perSide', label: 'Per side', editable: true },
  { key: 'loadMode', label: 'Load mode', editable: true },
  { key: 'load', label: 'Load', editable: true },
  { key: 'unit', label: 'Unit', editable: true },
  { key: 'rir', label: 'RIR', editable: true },
  { key: 'rpe', label: 'RPE', editable: true },
  { key: 'notes', label: 'Notes', editable: true },
] as const;

export type GridColumnKey = (typeof GRID_COLUMNS)[number]['key'];
export type GridColumn = { key: GridColumnKey; label: string; editable: boolean };
// Mesocycles: RIR goal follows Exercise, then Muscles (which drive set totals, decision 0021).
const MESOCYCLE_COLUMNS: readonly GridColumn[] = GRID_COLUMNS.flatMap<GridColumn>((column) =>
  column.key === 'rir' || column.key === 'muscles' ? [] : column.key === 'name'
    ? [column, { key: 'rir', label: 'RIR goal', editable: true }, { key: 'muscles', label: 'Muscles', editable: true }] : [column]);
// Personal training has no set totals, so it keeps its original columns.
const PERSONAL_TRAINING_COLUMNS: readonly GridColumn[] = GRID_COLUMNS.filter((column) => column.key !== 'muscles');
export const gridColumns = (service: ServiceKind): readonly GridColumn[] => service === 'mesocycle' ? MESOCYCLE_COLUMNS : PERSONAL_TRAINING_COLUMNS;


export type GridRow = {
  exerciseId: string;
  /** Null for program-wide shared sections. */
  weekId: string | null;
  dayId: string | null;
  sectionId: string;
  dayLabel: string;
  focus?: string;
  sectionLabel: string;
  /** 1-based position within the section. */
  position: number;
  exercise: Exercise;
};

export type CellEdit = { exerciseId: string; column: GridColumnKey; text: string };
export type CellError = { exerciseId: string | null; column: GridColumnKey | null; message: string };
export type CellChange = { exerciseId: string; column: GridColumnKey; before: string; after: string };

export type GridPlan = {
  /** One batch for `applyCommands`; empty when there are errors or nothing changed. */
  commands: DraftCommand[];
  errors: CellError[];
  /** Cells whose displayed text changes, as the draft will show them after the batch. */
  changes: CellChange[];
};

export function gridRows(draft: ProgramDraft): GridRow[] {
  const rows: GridRow[] = [];
  const add = (weekId: string | null, dayId: string | null, dayLabel: string, sections: ProgramDraft['sharedSections'], focus = '') => {
    for (const section of sections) {
      const sectionLabel = section.title;
      section.exercises.forEach((exercise, i) =>
        rows.push({ exerciseId: exercise.id, weekId, dayId, sectionId: section.id, dayLabel, focus, sectionLabel, position: i + 1, exercise }),
      );
    }
  };
  add(null, null, 'All days', draft.sharedSections);
  for (const week of draft.weeks) {
    week.days.forEach((day, index) => add(week.id, day.id, dayName(index), day.sections, dayFocus(day)));
  }
  return rows;
}

/** Day-cell editing sets optional Focus; the day number is always derived. */
export function planSetDayFocus(draft: ProgramDraft, exerciseId: string, text: string): GridPlan {
  const rows = gridRows(draft);
  const row = rows.find((row) => row.exerciseId === exerciseId);
  const label = text.trim();
  const message = !row ? 'This exercise no longer exists' : !row.dayId ? 'Shared preparation has no day focus' : label.length > 120 ? 'Keep focus under 120 characters' : null;
  if (message || !row?.dayId) return { commands: [], changes: [], errors: [{ exerciseId, column: 'day', message: message! }] };
  if (label === row.focus) return { commands: [], changes: [], errors: [] };
  return {
    commands: [{ type: 'updateDay', id: row.dayId, patch: { label } }], errors: [],
    changes: rows.filter((candidate) => candidate.dayId === row.dayId).map((candidate) => ({ exerciseId: candidate.exerciseId, column: 'day', before: row.focus ?? '', after: label })),
  };
}

/** Each sheet owns its selection and paste bounds, including weeks with no exercises yet. */
export function gridSheets(draft: ProgramDraft) {
  const rows = gridRows(draft);
  return [
    ...(draft.sharedSections.length ? [{ weekId: null, label: 'Every-workout preparation', rows: rows.filter((row) => row.weekId === null) }] : []),
    ...draft.weeks.map((week, index) => ({ weekId: week.id, label: weekName(index), rows: rows.filter((row) => row.weekId === week.id) })),
  ];
}

/** Add to this sheet only; an empty week gets its first day and section in the same batch. */
export function planAddSheetRow(draft: ProgramDraft, weekId: string | null, newId: () => string = () => crypto.randomUUID()): { commands: DraftCommand[]; exerciseId: string } {
  const commands: DraftCommand[] = [];
  const week = draft.weeks.find((week) => week.id === weekId);
  const day = week?.days.at(-1);
  let sectionId = weekId === null ? draft.sharedSections.at(-1)?.id : day?.sections.at(-1)?.id;
  if (!sectionId) {
    let dayId: string | null = day?.id ?? null;
    if (weekId !== null && !dayId) {
      const node = newDay('', newId);
      dayId = node.value.id;
      commands.push({ type: 'insert', parentId: weekId, node });
    }
    const node = newSection(weekId === null ? 'preparation' : 'main', '', newId);
    sectionId = node.value.id;
    commands.push({ type: 'insert', parentId: dayId, node });
  }
  const exercise = newExercise('New exercise', newId);
  if (exercise.kind === 'exercise') exercise.value.logicalKey = exercise.value.id;
  commands.push({ type: 'insert', parentId: sectionId, node: exercise });
  return { commands, exerciseId: exercise.value.id };
}

/** Move a complete superset together, keeping its ids, prescriptions and grouping intact. */
export function planMoveGridExercise(draft: ProgramDraft, exerciseId: string, sectionId: string): DraftCommand[] {
  const rows = gridRows(draft);
  const row = rows.find((row) => row.exerciseId === exerciseId);
  if (!row || row.sectionId === sectionId) return [];
  const moving = row.exercise.groupId
    ? rows.filter((candidate) => candidate.sectionId === row.sectionId && candidate.exercise.groupId === row.exercise.groupId)
    : [row];
  return moving.map((candidate) => ({ type: 'move', id: candidate.exerciseId, parentId: sectionId }));
}

/** Append an exercise to the final section, creating the first workout structure if necessary. */
export function planAddGridRow(draft: ProgramDraft, newId = () => crypto.randomUUID()): { commands: DraftCommand[]; exerciseId: string } {
  const commands: DraftCommand[] = [];
  const week = draft.weeks.at(-1);
  const day = week?.days.at(-1);
  let sectionId = day?.sections.at(-1)?.id;
  if (!week && draft.sharedSections.length > 0) sectionId = draft.sharedSections.at(-1)!.id;
  if (!sectionId) {
    let weekId = week?.id;
    if (!weekId) {
      const node = newWeek('Week 1', newId);
      weekId = node.value.id;
      commands.push({ type: 'insert', parentId: null, node });
    }
    let dayId = day?.id;
    if (!dayId) {
      const node = newDay('', newId);
      dayId = node.value.id;
      commands.push({ type: 'insert', parentId: weekId, node });
    }
    const node = newSection('main', '', newId);
    sectionId = node.value.id;
    commands.push({ type: 'insert', parentId: dayId, node });
  }
  const node = newExercise('New exercise', newId);
  // Placeholder names must not give unrelated new movements a shared history key.
  if (node.kind === 'exercise') node.value.logicalKey = node.value.id;
  commands.push({ type: 'insert', parentId: sectionId, node });
  return { commands, exerciseId: node.value.id };
}

export type GridStructureRequest =
  | { kind: 'week'; label: string }
  | { kind: 'day'; label: string; weekId: string | null }
  | { kind: 'section'; label: string; dayId: string | null; sectionKind: Section['kind']; weekId?: string };

/** Create a visible week/day/section in one undoable batch, with its first editable exercise. */
export function planAddGridStructure(draft: ProgramDraft, request: GridStructureRequest, newId = () => crypto.randomUUID()): { commands: DraftCommand[]; exerciseId: string } {
  const commands: DraftCommand[] = [];
  let dayId: string | null;
  if (request.kind === 'section') {
    dayId = request.dayId;
    if (dayId === null && request.weekId) {
      const day = newDay('', newId);
      dayId = day.value.id;
      commands.push({ type: 'insert', parentId: request.weekId, node: day });
    }
  }
  else {
    let weekId = request.kind === 'day' ? request.weekId : null;
    if (!weekId) {
      const week = newWeek(request.kind === 'week' ? request.label : `Week ${draft.weeks.length + 1}`, newId);
      weekId = week.value.id;
      commands.push({ type: 'insert', parentId: null, node: week });
    }
    const day = newDay(request.kind === 'day' ? request.label : '', newId);
    dayId = day.value.id;
    commands.push({ type: 'insert', parentId: weekId, node: day });
  }
  const section = newSection(request.kind === 'section' ? request.sectionKind : 'main', request.kind === 'section' ? request.label : '', newId);
  commands.push({ type: 'insert', parentId: dayId, node: section });
  const exercise = newExercise('New exercise', newId);
  if (exercise.kind === 'exercise') exercise.value.logicalKey = exercise.value.id;
  commands.push({ type: 'insert', parentId: section.value.id, node: exercise });
  return { commands, exerciseId: exercise.value.id };
}

// ---------------------------------------------------------------------------------------------
// Display

const LOAD_MODE_LABELS: Record<Load['mode'], string> = {
  external: 'Weight',
  bodyweight: 'Bodyweight',
  assisted: 'Assisted',
  band: 'Band',
  not_applicable: 'None',
};

/** Accepted spellings for the load mode column, lower-cased. */
const LOAD_MODE_ALIASES: Record<string, Load['mode']> = {
  weight: 'external', external: 'external', w: 'external',
  bodyweight: 'bodyweight', bw: 'bodyweight', 'body weight': 'bodyweight',
  assisted: 'assisted', assist: 'assisted', assistance: 'assisted',
  band: 'band',
  none: 'not_applicable', 'n/a': 'not_applicable', na: 'not_applicable',
};

export const LOAD_MODE_OPTIONS = Object.entries(LOAD_MODE_LABELS).map(([mode, label]) => ({ mode: mode as Load['mode'], label }));

const formatEffort = (e: Effort | null) => (!e ? '' : e.kind === 'reps' ? formatRange(e.reps) : `${formatRange(e.seconds)}s`);
const formatOptionalRange = (r: NumericRange | null) => (r ? formatRange(r) : '');

function loadValueText(load: Load | null): string {
  if (!load) return '';
  switch (load.mode) {
    case 'external':
    case 'assisted':
      return formatRange(load.value);
    case 'bodyweight':
      return load.added ? `+${load.added.value}` : '';
    case 'band':
      return load.label;
    case 'not_applicable':
      return '';
  }
}

function loadUnitText(load: Load | null): string {
  if (!load) return '';
  if (load.mode === 'external' || load.mode === 'assisted') return load.unit ?? '';
  if (load.mode === 'bodyweight') return load.added?.unit ?? '';
  return '';
}

const TARGET_TEXT: Record<'effort' | 'perSide' | 'loadMode' | 'load' | 'unit' | 'rir' | 'rpe', (t: SetTarget) => string> = {
  effort: (t) => formatEffort(t.effort),
  perSide: (t) => (t.effort?.perSide ? 'Yes' : ''),
  loadMode: (t) => (t.load ? LOAD_MODE_LABELS[t.load.mode] : ''),
  load: (t) => loadValueText(t.load),
  unit: (t) => loadUnitText(t.load),
  rir: (t) => formatOptionalRange(t.rir),
  rpe: (t) => formatOptionalRange(t.rpe),
};

type TargetColumn = keyof typeof TARGET_TEXT;
const isTargetColumn = (c: GridColumnKey): c is TargetColumn => c in TARGET_TEXT;

/** One value when every set agrees, otherwise "a / b / c". */
function joinPerSet(targets: SetTarget[], column: TargetColumn): string {
  const texts = targets.map(TARGET_TEXT[column]);
  return texts.every((t) => t === texts[0]) ? (texts[0] ?? '') : texts.join(' / ');
}

export function cellText(row: GridRow, column: GridColumnKey): string {
  const e = row.exercise;
  switch (column) {
    case 'day':
      return row.dayId ? row.focus ?? '' : row.dayLabel;
    case 'section':
      return row.sectionLabel;
    case 'order':
      return String(row.position);
    case 'name':
      return e.name;
    case 'notes':
      return e.notes;
    case 'muscles':
      return formatMuscles(e.muscles);
    case 'sets':
      return formatOptionalRange(e.prescription.setCount);
    default:
      return joinPerSet(e.prescription.targets, column);
  }
}

export const isEditable = (column: GridColumnKey) => GRID_COLUMNS.find((c) => c.key === column)!.editable;

// ---------------------------------------------------------------------------------------------
// Planning edits

const EMPTY_TARGET: SetTarget = { effort: null, load: null, rir: null, rpe: null, annotations: [] };

export function planEdits(draft: ProgramDraft, edits: CellEdit[]): GridPlan {
  const rows = gridRows(draft);
  const byId = new Map(rows.map((r) => [r.exerciseId, r]));
  const errors: CellError[] = [];
  const grouped = new Map<string, Map<GridColumnKey, string>>();

  for (const edit of edits) {
    const row = byId.get(edit.exerciseId);
    if (!row) {
      errors.push({ exerciseId: edit.exerciseId, column: edit.column, message: 'This exercise no longer exists' });
      continue;
    }
    if (!isEditable(edit.column)) {
      // Pasting a copied block back over its own labels is harmless; changing them is not.
      if (edit.text.trim() !== cellText(row, edit.column)) {
        errors.push({ exerciseId: edit.exerciseId, column: edit.column, message: `${columnLabel(edit.column)} can't be edited in the grid` });
      }
      continue;
    }
    const cells = grouped.get(edit.exerciseId) ?? new Map<GridColumnKey, string>();
    cells.set(edit.column, edit.text);
    grouped.set(edit.exerciseId, cells);
  }

  const commands: DraftCommand[] = [];
  for (const [exerciseId, cells] of grouped) {
    const row = byId.get(exerciseId)!;
    const result = planRow(row.exercise, cells, weekMuscles(draft, row.weekId));
    if ('errors' in result) errors.push(...result.errors);
    else commands.push(...result.commands);
  }
  if (errors.length > 0) return { commands: [], errors, changes: [] };

  const applied = applyCommands(draft, commands);
  if (!applied.ok) {
    // planRow validates the same rules, so this is a defect guard rather than an expected path.
    const failed = commands[applied.commandIndex]!;
    const exerciseId = 'exerciseId' in failed ? failed.exerciseId : 'id' in failed ? failed.id : null;
    return { commands: [], errors: [{ exerciseId, column: null, message: applied.error.message }], changes: [] };
  }

  const after = new Map(gridRows(applied.draft).map((r) => [r.exerciseId, r]));
  const changes: CellChange[] = [];
  for (const exerciseId of grouped.keys()) {
    const beforeRow = byId.get(exerciseId)!;
    const afterRow = after.get(exerciseId)!;
    for (const { key } of GRID_COLUMNS) {
      const before = cellText(beforeRow, key);
      const next = cellText(afterRow, key);
      if (before !== next) changes.push({ exerciseId, column: key, before, after: next });
    }
  }
  return { commands: changes.length > 0 ? commands : [], errors: [], changes };
}

/** Clear selected content, including merged Day/Section labels, as one undoable batch. */
export function planClear(draft: ProgramDraft, cells: { exerciseId: string; column: GridColumnKey }[]): GridPlan {
  const rows = gridRows(draft);
  const byId = new Map(rows.map((row) => [row.exerciseId, row]));
  const commands: DraftCommand[] = [];
  const selected = new Map<string, Set<GridColumnKey>>();
  const days = new Set<string>();
  const sections = new Set<string>();
  for (const cell of cells) {
    const row = byId.get(cell.exerciseId);
    if (!row) return { commands: [], changes: [], errors: [{ ...cell, message: 'This exercise no longer exists' }] };
    const columns = selected.get(cell.exerciseId) ?? new Set<GridColumnKey>();
    columns.add(cell.column);
    selected.set(cell.exerciseId, columns);
    if (cell.column === 'day' && row.dayId) days.add(row.dayId);
    if (cell.column === 'section') sections.add(row.sectionId);
  }
  for (const [id, columns] of selected) {
    const exercise = byId.get(id)!.exercise;
    if (columns.has('name') || columns.has('notes') || columns.has('muscles')) commands.push({
      type: 'updateExercise', id,
      patch: { ...(columns.has('name') ? { name: '' } : {}), ...(columns.has('notes') ? { notes: '' } : {}), ...(columns.has('muscles') ? { muscles: [] } : {}) },
    });
    // Clearing is a draft operation, not parsing an incomplete new value. Keep the remaining
    // targets valid so a load dependency cannot refuse the entire range (including names).
    const prescription = {
      setCount: columns.has('sets') ? null : exercise.prescription.setCount,
      targets: exercise.prescription.targets.map((target) => {
        let load = target.load;
        if (columns.has('loadMode') || columns.has('load')) load = null;
        else if (columns.has('unit') && load) {
          if (load.mode === 'external' || load.mode === 'assisted') load = { ...load, unit: null };
          else if (load.mode === 'bodyweight' && load.added) load = { ...load, added: { ...load.added, unit: null } };
        }
        return {
          ...target,
          effort: columns.has('effort') ? null : columns.has('perSide') && target.effort ? { ...target.effort, perSide: false } : target.effort,
          load,
          rir: columns.has('rir') ? null : target.rir,
          rpe: columns.has('rpe') ? null : target.rpe,
        };
      }),
    };
    if (JSON.stringify(prescription) !== JSON.stringify(exercise.prescription)) commands.push({ type: 'setPrescription', exerciseId: id, prescription });
  }
  days.forEach((id) => commands.push({ type: 'updateDay', id, patch: { label: '' } }));
  sections.forEach((id) => commands.push({ type: 'updateSection', id, patch: { title: '' } }));
  const result = applyCommands(draft, commands);
  if (!result.ok) return { commands: [], changes: [], errors: [{ exerciseId: null, column: null, message: result.error.message }] };
  const changes: CellChange[] = [];
  for (const after of gridRows(result.draft)) {
    const before = byId.get(after.exerciseId)!;
    for (const { key } of GRID_COLUMNS) {
      const previous = cellText(before, key);
      const next = cellText(after, key);
      if (previous !== next) changes.push({ exerciseId: after.exerciseId, column: key, before: previous, after: next });
    }
  }
  return { commands: changes.length ? commands : [], errors: [], changes };
}

export function planRenameGridSection(draft: ProgramDraft, exerciseId: string, text: string): GridPlan {
  const rows = gridRows(draft);
  const row = rows.find((row) => row.exerciseId === exerciseId);
  const title = text.trim();
  const message = !row ? 'This exercise no longer exists' : title.length > 160 ? 'Keep section names under 160 characters' : null;
  if (message || !row) return { commands: [], changes: [], errors: [{ exerciseId, column: 'section', message: message! }] };
  if (title === row.sectionLabel) return { commands: [], changes: [], errors: [] };
  return {
    commands: [{ type: 'updateSection', id: row.sectionId, patch: { title } }], errors: [],
    changes: rows.filter((candidate) => candidate.sectionId === row.sectionId).map((candidate) => ({ exerciseId: candidate.exerciseId, column: 'section', before: row.sectionLabel, after: title })),
  };
}

/**
 * A rectangular paste anchored at (`rowIndex`, `columnIndex`) of `rows`. Cells that fall outside the
 * grid are errors, never dropped, so a paste either lands whole or not at all.
 */
export function planPaste(draft: ProgramDraft, rows: GridRow[], rowIndex: number, columnIndex: number, matrix: string[][], columns: readonly GridColumn[] = GRID_COLUMNS): GridPlan {
  const edits: CellEdit[] = [];
  const errors: CellError[] = [];
  matrix.forEach((line, r) =>
    line.forEach((text, c) => {
      const row = rows[rowIndex + r];
      const column = columns[columnIndex + c];
      if (!row || !column) return;
      edits.push({ exerciseId: row.exerciseId, column: column.key, text });
    }),
  );
  const width = Math.max(0, ...matrix.map((l) => l.length));
  if (rowIndex + matrix.length > rows.length || columnIndex + width > columns.length) {
    errors.push({
      exerciseId: null,
      column: null,
      message: `The pasted block is ${matrix.length} × ${width} but only ${rows.length - rowIndex} × ${columns.length - columnIndex} cells are available from here`,
    });
  }
  const plan = planEdits(draft, edits);
  return errors.length > 0 ? { commands: [], errors: [...errors, ...plan.errors], changes: [] } : plan;
}

export const columnLabel = (column: GridColumnKey, columns: readonly GridColumn[] = GRID_COLUMNS) => columns.find((c) => c.key === column)!.label;

type RowResult = { commands: DraftCommand[] } | { errors: CellError[] };

function planRow(exercise: Exercise, cells: Map<GridColumnKey, string>, knownMuscles: readonly string[] = []): RowResult {
  const errors: CellError[] = [];
  const fail = (column: GridColumnKey, message: string) => errors.push({ exerciseId: exercise.id, column, message });
  const commands: DraftCommand[] = [];

  const patch: { name?: string; notes?: string; muscles?: string[] } = {};
  if (cells.has('name')) {
    const name = cells.get('name')!.trim();
    if (name.length > 200) fail('name', 'Keep the name under 200 characters');
    else if (name !== exercise.name) patch.name = name;
  }
  if (cells.has('notes') && cells.get('notes') !== exercise.notes) patch.notes = cells.get('notes')!;
  if (cells.has('muscles')) {
    // The week's existing spelling wins, so typing "glutes" joins an existing "Glutes".
    const parsed = parseMuscles(cells.get('muscles')!, knownMuscles);
    if (!parsed.ok) fail('muscles', parsed.message);
    else if (formatMuscles(parsed.muscles) !== formatMuscles(exercise.muscles)) patch.muscles = parsed.muscles;
  }

  let { setCount, targets } = exercise.prescription;
  if (cells.has('sets')) {
    const parsed = parseSetCount(cells.get('sets')!);
    if (typeof parsed === 'string') fail('sets', parsed);
    else {
      setCount = parsed;
      // Same resize rule as setSetCount: extra sets copy the last target, removed sets drop theirs.
      if (targets.length > 1 && setCount) targets = Array.from({ length: setCount.max }, (_, i) => targets[i] ?? targets[targets.length - 1]!);
    }
  }

  const targetCells = [...cells].filter((entry): entry is [TargetColumn, string] => isTargetColumn(entry[0]));
  if (targetCells.length > 0) {
    const parts = new Map(targetCells.map(([column, text]) => [column, splitPerSet(text)]));
    const listLength = Math.max(...[...parts.values()].map((p) => p.length));
    if (targets.length === 0 && targetCells.some(([, text]) => text.trim() !== '')) targets = [EMPTY_TARGET];
    if (listLength > 1 && targets.length !== listLength) {
      if (targets.length <= 1 && setCount?.max === listLength && Number.isInteger(listLength)) {
        targets = Array.from({ length: listLength }, () => targets[0] ?? EMPTY_TARGET);
      }
    }
    for (const [column, list] of parts) {
      if (list.length !== 1 && list.length !== targets.length) {
        fail(column, setCount ? `Enter one value, or one per set (${setCount.max})` : 'Set the number of sets before listing values per set');
      }
    }
    if (errors.length === 0) {
      const at = (column: TargetColumn, i: number) => {
        const list = parts.get(column);
        return list === undefined ? undefined : (list.length === 1 ? list[0]! : list[i]!);
      };
      targets = targets.map((t, i) => buildTarget(t, (c) => at(c, i), fail));
    }
  }

  if (errors.length > 0) return { errors: dedupe(errors) };
  if (Object.keys(patch).length > 0) commands.push({ type: 'updateExercise', id: exercise.id, patch });

  const prescription = { setCount, targets };
  if (JSON.stringify(prescription) !== JSON.stringify(exercise.prescription)) {
    const checked = ExercisePrescription.safeParse(prescription);
    if (!checked.success) return { errors: [{ exerciseId: exercise.id, column: 'sets', message: checked.error.issues[0]!.message }] };
    commands.push({ type: 'setPrescription', exerciseId: exercise.id, prescription });
  }
  return { commands };
}

function dedupe(errors: CellError[]): CellError[] {
  const seen = new Set<string>();
  return errors.filter((e) => {
    const key = `${e.exerciseId}:${e.column}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function splitPerSet(text: string): string[] {
  return text.includes('/') ? text.split('/').map((p) => p.trim()) : [text.trim()];
}

function parseSetCount(text: string): NumericRange | null | string {
  if (text.trim() === '') return null;
  const parsed = parseRangeText(text);
  if (!parsed.ok) return rangeMessage(parsed.reason, 'sets');
  if (!Number.isInteger(parsed.range.min) || !Number.isInteger(parsed.range.max)) return 'Sets must be whole numbers';
  if (parsed.range.min < 1) return 'Sets must be at least 1';
  return parsed.range;
}

function rangeMessage(reason: 'empty' | 'unrecognized' | 'inverted', what: string): string {
  if (reason === 'inverted') return 'The first number must not exceed the second';
  return `Enter ${what} as a number or a range such as 1-2`;
}

/** Builds one set's target from its current value and any edited cells (undefined = not edited). */
function buildTarget(
  current: SetTarget,
  cell: (column: TargetColumn) => string | undefined,
  fail: (column: GridColumnKey, message: string) => void,
): SetTarget {
  const next = { ...current };

  // Reps or time, then per side.
  let perSide = current.effort?.perSide ?? false;
  const perSideText = cell('perSide');
  if (perSideText !== undefined) {
    const parsed = parseYesNo(perSideText);
    if (parsed === null) fail('perSide', 'Enter Yes or leave blank');
    else perSide = parsed;
  }
  const effortText = cell('effort');
  if (effortText !== undefined) {
    const parsed = parseEffort(effortText, perSide);
    if (typeof parsed === 'string') fail('effort', parsed);
    else next.effort = parsed;
  } else if (next.effort) {
    next.effort = { ...next.effort, perSide };
  }
  if (perSideText !== undefined && perSide && !next.effort) fail('perSide', 'Add reps or time first');

  for (const column of ['rir', 'rpe'] as const) {
    const text = cell(column);
    if (text === undefined) continue;
    if (text.trim() === '') {
      next[column] = null;
      continue;
    }
    const parsed = parseRangeText(text);
    if (!parsed.ok) fail(column, rangeMessage(parsed.reason, column.toUpperCase()));
    else if (column === 'rpe' && parsed.range.max > 10) fail(column, 'RPE must be between 0 and 10');
    else next[column] = parsed.range;
  }

  const load = buildLoad(current.load, cell('loadMode'), cell('load'), cell('unit'), fail);
  if (load !== undefined) next.load = load;
  return next;
}

function parseYesNo(text: string): boolean | null {
  const t = text.trim().toLowerCase();
  if (['', 'no', 'n', 'false'].includes(t)) return false;
  if (['yes', 'y', 'true', 'x', '✓', 'per side', 'each'].includes(t)) return true;
  return null;
}

/** "8-10" is reps; "45s", "30-45 sec" and "2 min" are durations. A date is never a target. */
function parseEffort(text: string, perSide: boolean): Effort | null | string {
  const t = text.trim();
  if (t === '') return null;
  const timed = /^(.+?)\s*(s|sec|secs|seconds|m|min|mins|minutes)$/i.exec(t);
  if (timed) {
    const parsed = parseRangeText(timed[1]!);
    if (!parsed.ok) return 'Enter time such as 45s or 30-45s';
    const factor = /^m/i.test(timed[2]!) ? 60 : 1;
    return { kind: 'duration', seconds: { min: parsed.range.min * factor, max: parsed.range.max * factor }, perSide };
  }
  const parsed = parseRangeText(t);
  if (!parsed.ok) return parsed.reason === 'inverted' ? rangeMessage('inverted', '') : 'Enter reps such as 8-10, or time such as 45s';
  return { kind: 'reps', reps: parsed.range, perSide };
}

function parseUnit(text: string): WeightUnit | null | undefined {
  const t = text.trim().toLowerCase();
  if (t === '') return null;
  if (['lb', 'lbs', 'pound', 'pounds'].includes(t)) return 'lb';
  if (['kg', 'kgs', 'kilo', 'kilos'].includes(t)) return 'kg';
  return undefined;
}

/**
 * Combines the mode, value and unit cells with the current load. Returns undefined when nothing
 * load-related was edited. A number typed into Load with no mode means a weight; a unit is never
 * guessed (PRD §10).
 */
function buildLoad(
  current: Load | null,
  modeText: string | undefined,
  valueText: string | undefined,
  unitText: string | undefined,
  fail: (column: GridColumnKey, message: string) => void,
): Load | null | undefined {
  if (modeText === undefined && valueText === undefined && unitText === undefined) return undefined;

  let mode = current?.mode ?? null;
  if (modeText !== undefined) {
    const t = modeText.trim().toLowerCase();
    if (t === '') mode = null;
    else if (LOAD_MODE_ALIASES[t]) mode = LOAD_MODE_ALIASES[t]!;
    else {
      fail('loadMode', 'Choose Weight, Bodyweight, Assisted, Band or None');
      return undefined;
    }
  }
  if (modeText === undefined && mode === null && valueText !== undefined && valueText.trim() !== '') mode = 'external';

  // Unedited value and unit carry over only where both modes read them the same way.
  const sameShape = (a: Load['mode'] | null, b: Load['mode'] | null) =>
    a === b || ((a === 'external' || a === 'assisted') && (b === 'external' || b === 'assisted'));
  const value = (valueText ?? (sameShape(current?.mode ?? null, mode) ? loadValueText(current) : '')).trim();
  const unitSource = unitText ?? (current && mode && mode !== 'band' && mode !== 'not_applicable' ? loadUnitText(current) : '');
  const unit = parseUnit(unitSource);
  if (unit === undefined) {
    fail('unit', 'Enter lb or kg');
    return undefined;
  }
  const valueColumn: GridColumnKey = valueText !== undefined ? 'load' : 'loadMode';
  const strayUnit = (message: string) => {
    if (unitText !== undefined && unit !== null) fail('unit', message);
  };

  switch (mode) {
    case null:
      if (value !== '') fail('load', 'Choose a load mode');
      strayUnit('Choose a load mode first');
      return null;
    case 'not_applicable':
      if (value !== '') fail(valueColumn, 'A load mode of None has no value');
      strayUnit('A load mode of None has no unit');
      return { mode };
    case 'band':
      if (value === '') fail(valueColumn, 'Enter the band, such as Red');
      else if (value.length > 120) fail('load', 'Keep the band label under 120 characters');
      strayUnit('Bands have no unit');
      return { mode, label: value };
    case 'bodyweight': {
      if (value === '') {
        strayUnit('Add a weight before its unit');
        return { mode, added: null };
      }
      const added = parseRangeText(value.replace(/^\+/, ''));
      if (!added.ok || added.range.min !== added.range.max) {
        fail('load', 'Enter added weight as one number, such as +10');
        return undefined;
      }
      return { mode, added: { value: added.range.min, unit } };
    }
    case 'external':
    case 'assisted': {
      if (value === '') {
        fail(valueColumn, mode === 'external' ? 'Enter the weight' : 'Enter the assistance amount');
        return undefined;
      }
      const parsed = parseRangeText(value);
      if (!parsed.ok) {
        fail('load', rangeMessage(parsed.reason, 'the load'));
        return undefined;
      }
      return { mode, value: parsed.range, unit };
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Clipboard

/** Tab-separated text as spreadsheets copy it, including quoted cells with tabs or line breaks. */
export function parseClipboard(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === '') quoted = true;
    else if (ch === '\t') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export function toClipboard(matrix: string[][]): string {
  const quote = (c: string) => (/[\t\n\r"]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c);
  return matrix.map((r) => r.map(quote).join('\t')).join('\n');
}
