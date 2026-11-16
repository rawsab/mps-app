import { formatRange, parseRangeText, type NumericRange } from '../measurements/range';
import type { Effort, Load, WeightUnit } from '../measurements/load';
import { applyCommands, type DraftCommand } from './commands';
import { ExercisePrescription, type Exercise, type ProgramDraft, type SetTarget } from './contract';

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
  { key: 'day', label: 'Day', editable: false },
  { key: 'section', label: 'Section', editable: false },
  { key: 'order', label: '#', editable: false },
  { key: 'name', label: 'Exercise', editable: true },
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

export type GridRow = {
  exerciseId: string;
  /** Null for program-wide shared sections. */
  weekId: string | null;
  dayId: string | null;
  sectionId: string;
  dayLabel: string;
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

const SECTION_KIND_LABELS = { preparation: 'Preparation', main: 'Main', cooldown: 'Cooldown', other: 'Other' } as const;

export function gridRows(draft: ProgramDraft): GridRow[] {
  const rows: GridRow[] = [];
  const add = (weekId: string | null, dayId: string | null, dayLabel: string, sections: ProgramDraft['sharedSections']) => {
    for (const section of sections) {
      const sectionLabel = section.title.trim() || SECTION_KIND_LABELS[section.kind];
      section.exercises.forEach((exercise, i) =>
        rows.push({ exerciseId: exercise.id, weekId, dayId, sectionId: section.id, dayLabel, sectionLabel, position: i + 1, exercise }),
      );
    }
  };
  add(null, null, 'All days', draft.sharedSections);
  for (const week of draft.weeks) {
    for (const day of week.days) add(week.id, day.id, `W${week.index} · ${day.label}`, day.sections);
  }
  return rows;
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
      return row.dayLabel;
    case 'section':
      return row.sectionLabel;
    case 'order':
      return String(row.position);
    case 'name':
      return e.name;
    case 'notes':
      return e.notes;
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
    const result = planRow(byId.get(exerciseId)!.exercise, cells);
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

/** Clears every editable cell in `cells` (Delete/Backspace over a selection). */
export function planClear(draft: ProgramDraft, cells: { exerciseId: string; column: GridColumnKey }[]): GridPlan {
  return planEdits(
    draft,
    cells.filter((c) => isEditable(c.column) && c.column !== 'name').map((c) => ({ ...c, text: '' })),
  );
}

/**
 * A rectangular paste anchored at (`rowIndex`, `columnIndex`) of `rows`. Cells that fall outside the
 * grid are errors, never dropped, so a paste either lands whole or not at all.
 */
export function planPaste(draft: ProgramDraft, rows: GridRow[], rowIndex: number, columnIndex: number, matrix: string[][]): GridPlan {
  const edits: CellEdit[] = [];
  const errors: CellError[] = [];
  matrix.forEach((line, r) =>
    line.forEach((text, c) => {
      const row = rows[rowIndex + r];
      const column = GRID_COLUMNS[columnIndex + c];
      if (!row || !column) return;
      edits.push({ exerciseId: row.exerciseId, column: column.key, text });
    }),
  );
  const width = Math.max(0, ...matrix.map((l) => l.length));
  if (rowIndex + matrix.length > rows.length || columnIndex + width > GRID_COLUMNS.length) {
    errors.push({
      exerciseId: null,
      column: null,
      message: `The pasted block is ${matrix.length} × ${width} but only ${rows.length - rowIndex} × ${GRID_COLUMNS.length - columnIndex} cells are available from here`,
    });
  }
  const plan = planEdits(draft, edits);
  return errors.length > 0 ? { commands: [], errors: [...errors, ...plan.errors], changes: [] } : plan;
}

export const columnLabel = (column: GridColumnKey) => GRID_COLUMNS.find((c) => c.key === column)!.label;

type RowResult = { commands: DraftCommand[] } | { errors: CellError[] };

function planRow(exercise: Exercise, cells: Map<GridColumnKey, string>): RowResult {
  const errors: CellError[] = [];
  const fail = (column: GridColumnKey, message: string) => errors.push({ exerciseId: exercise.id, column, message });
  const commands: DraftCommand[] = [];

  const patch: { name?: string; notes?: string } = {};
  if (cells.has('name')) {
    const name = cells.get('name')!.trim();
    if (name === '') fail('name', 'Exercise needs a name');
    else if (name.length > 200) fail('name', 'Keep the name under 200 characters');
    else if (name !== exercise.name) patch.name = name;
  }
  if (cells.has('notes') && cells.get('notes') !== exercise.notes) patch.notes = cells.get('notes')!;

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
  if (patch.name !== undefined || patch.notes !== undefined) commands.push({ type: 'updateExercise', id: exercise.id, patch });

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
