import { z } from 'zod';
import { slug } from '../imports/notation';
import type { NumericRange } from '../measurements/range';
import {
  MuscleList,
  Exercise,
  ExercisePrescription,
  ProgramDraft,
  ProgramWeek,
  Resource,
  Section,
  SetTarget,
  WorkoutDay,
} from './contract';

/**
 * Draft edits as commands against stable ids (roadmap §7). The Program view, the Grid view and
 * reviewed import edits all change a `ProgramDraft` only through `applyCommand(s)`, so both views
 * share one document and one persistence path (FR-05, FR-06). Commands are pure: a result is a new
 * draft that shares every untouched node with the old one, or an error that leaves it unchanged.
 */

export type NodeKind = 'week' | 'day' | 'section' | 'exercise' | 'resource';
type ResourceNode = z.infer<typeof Resource>;
type NodeOf = { week: ProgramWeek; day: WorkoutDay; section: Section; exercise: Exercise; resource: ResourceNode };
export type DraftNode = { [K in NodeKind]: { kind: K; value: NodeOf[K] } }[NodeKind];

const ProgramPatch = ProgramDraft.pick({ title: true, programTheme: true, coachNotes: true }).partial().strict();
const WeekPatch = ProgramWeek.pick({ label: true, startDate: true, useSections: true }).partial().strict();
const DayPatch = WorkoutDay.pick({ label: true, scheduledDate: true }).partial().strict();
const SectionPatch = Section.pick({ kind: true, title: true, instructions: true }).partial().strict();
/** `logicalKey` is deliberately absent: renaming a movement keeps its history key. */
// muscles is extended without its document default, so a patch that omits it leaves it alone.
const ExercisePatch = Exercise.pick({ name: true, alternatives: true, groupId: true, demoUrl: true, notes: true })
  .extend({ muscles: MuscleList })
  .partial()
  .strict();
const ResourcePatch = Resource.pick({ title: true, body: true, url: true }).partial().strict();
const TargetPatch = SetTarget.partial().strict();

export type DraftCommand =
  | { type: 'updateProgram'; patch: z.input<typeof ProgramPatch> }
  | { type: 'updateWeek'; id: string; patch: z.input<typeof WeekPatch> }
  | { type: 'updateDay'; id: string; patch: z.input<typeof DayPatch> }
  | { type: 'updateSection'; id: string; patch: z.input<typeof SectionPatch> }
  | { type: 'updateExercise'; id: string; patch: z.input<typeof ExercisePatch> }
  | { type: 'updateResource'; id: string; patch: z.input<typeof ResourcePatch> }
  /** Per-set targets follow the new count: extra sets copy the last target, removed sets drop theirs. */
  | { type: 'setSetCount'; exerciseId: string; setCount: NumericRange | null }
  | { type: 'updateTarget'; exerciseId: string; index: number; patch: z.input<typeof TargetPatch> }
  | { type: 'setTargets'; exerciseId: string; targets: SetTarget[] }
  /** Replaces set count and targets together, e.g. a Grid row whose sets and per-set targets change at once. */
  | { type: 'setPrescription'; exerciseId: string; prescription: ExercisePrescription }
  /** `parentId: null` is the program itself (weeks, shared sections, resources). `index` defaults to the end. */
  | { type: 'insert'; parentId: string | null; index?: number; node: DraftNode }
  | { type: 'move'; id: string; parentId: string | null; index?: number }
  /** Inserts a copy right after the original with fresh ids throughout. */
  | { type: 'duplicate'; id: string }
  | { type: 'remove'; id: string };

export type CommandErrorCode = 'not_found' | 'invalid_parent' | 'invalid_index' | 'duplicate_id' | 'invalid_value';
export type CommandError = { code: CommandErrorCode; message: string; path: string };

export type CommandResult =
  | { ok: true; draft: ProgramDraft; createdId: string | null }
  | { ok: false; error: CommandError };

export type BatchResult =
  | { ok: true; draft: ProgramDraft; createdIds: string[] }
  | { ok: false; error: CommandError; commandIndex: number };

export type CommandOptions = { newId?: () => string };

const defaultNewId = (): string => crypto.randomUUID();

/** Applies commands in order, all or nothing (e.g. a rectangular Grid paste). */
export function applyCommands(draft: ProgramDraft, commands: DraftCommand[], options: CommandOptions = {}): BatchResult {
  let current = draft;
  const createdIds: string[] = [];
  for (const [commandIndex, command] of commands.entries()) {
    const result = applyCommand(current, command, options);
    if (!result.ok) return { ok: false, error: result.error, commandIndex };
    current = result.draft;
    if (result.createdId) createdIds.push(result.createdId);
  }
  return { ok: true, draft: current, createdIds };
}

export function applyCommand(draft: ProgramDraft, command: DraftCommand, options: CommandOptions = {}): CommandResult {
  const newId = options.newId ?? defaultNewId;
  switch (command.type) {
    case 'updateProgram': {
      const patch = ProgramPatch.safeParse(command.patch);
      if (!patch.success) return invalid(patch.error, []);
      return done({ ...draft, ...patch.data });
    }
    case 'updateWeek':
      return updateNode(draft, command.id, 'week', WeekPatch, command.patch);
    case 'updateDay':
      return updateNode(draft, command.id, 'day', DayPatch, command.patch);
    case 'updateSection':
      return updateNode(draft, command.id, 'section', SectionPatch, command.patch);
    case 'updateExercise':
      return updateNode(draft, command.id, 'exercise', ExercisePatch, command.patch);
    case 'updateResource':
      return updateNode(draft, command.id, 'resource', ResourcePatch, command.patch);
    case 'setSetCount':
      return updatePrescription(draft, command.exerciseId, (p) => {
        const { setCount } = command;
        if (p.targets.length <= 1 || !setCount) return { setCount, targets: p.targets };
        if (!Number.isInteger(setCount.max) || setCount.max < 1) {
          return 'Per-set targets need a whole-number set count of at least 1';
        }
        const last = p.targets[p.targets.length - 1]!;
        const targets = Array.from({ length: setCount.max }, (_, i) => p.targets[i] ?? last);
        return { setCount, targets };
      });
    case 'updateTarget':
      return updatePrescription(draft, command.exerciseId, (p) => {
        if (!Number.isInteger(command.index) || command.index < 0 || command.index >= p.targets.length) {
          return `Target ${command.index} does not exist`;
        }
        const patch = TargetPatch.safeParse(command.patch);
        if (!patch.success) return patch.error;
        const targets = p.targets.map((t, i) => (i === command.index ? { ...t, ...patch.data } : t));
        return { ...p, targets };
      });
    case 'setTargets':
      return updatePrescription(draft, command.exerciseId, (p) => ({ ...p, targets: command.targets }));
    case 'setPrescription':
      return updatePrescription(draft, command.exerciseId, () => command.prescription);
    case 'insert':
      return insert(draft, command.parentId, command.index, command.node);
    case 'move':
      return move(draft, command.id, command.parentId, command.index);
    case 'duplicate':
      return duplicate(draft, command.id, newId);
    case 'remove': {
      const at = locate(draft, command.id);
      if (!at) return notFound(command.id);
      const next = updateIn(draft, at.containerPath, (list: unknown[]) => list.filter((_, i) => i !== at.index));
      return done(at.kind === 'week' ? renumberWeeks(next) : next);
    }
  }
}

/** A user operation (including a rectangular paste) is one reversible batch. */
export type HistoryEntry = { undo: DraftCommand[]; redo: DraftCommand[] };
export type ReversibleBatchResult =
  | { ok: true; draft: ProgramDraft; commands: DraftCommand[]; entry: HistoryEntry }
  | { ok: false; error: CommandError; commandIndex: number };

/**
 * Invert accepted commands, retaining removed subtrees and the actual ids produced by duplication.
 * Forward replay and redo use concrete inserts instead of generating different ids on each replay.
 * Undo is a new draft edit through the same save/version path, including after autosave (FR-06).
 */
export function applyReversibleCommands(draft: ProgramDraft, commands: DraftCommand[], options: CommandOptions = {}): ReversibleBatchResult {
  let current = draft;
  const redo: DraftCommand[] = [];
  let undo: DraftCommand[] = [];
  const previousPatch = <T extends object>(value: T, patch: Partial<T>): Partial<T> =>
    Object.fromEntries(Object.keys(patch).map((key) => [key, value[key as keyof T]])) as Partial<T>;
  for (const [commandIndex, command] of commands.entries()) {
    const result = applyCommand(current, command, options);
    if (!result.ok) return { ...result, commandIndex };
    let forward = command;
    let inverse: DraftCommand;
    switch (command.type) {
      case 'updateProgram': inverse = { type: 'updateProgram', patch: previousPatch(current, command.patch) }; break;
      case 'updateWeek': inverse = { ...command, patch: previousPatch(locate(current, command.id)!.node as ProgramWeek, command.patch) }; break;
      case 'updateDay': inverse = { ...command, patch: previousPatch(locate(current, command.id)!.node as WorkoutDay, command.patch) }; break;
      case 'updateSection': inverse = { ...command, patch: previousPatch(locate(current, command.id)!.node as Section, command.patch) }; break;
      case 'updateExercise': inverse = { ...command, patch: previousPatch(locate(current, command.id)!.node as Exercise, command.patch) }; break;
      case 'updateResource': inverse = { ...command, patch: previousPatch(locate(current, command.id)!.node as ResourceNode, command.patch) }; break;
      case 'setSetCount':
      case 'updateTarget':
      case 'setTargets':
      case 'setPrescription':
        inverse = { type: 'setPrescription', exerciseId: command.exerciseId, prescription: (locate(current, command.exerciseId)!.node as Exercise).prescription };
        break;
      case 'insert': inverse = { type: 'remove', id: command.node.value.id }; break;
      case 'duplicate': {
        const at = locate(result.draft, result.createdId!)!;
        forward = insertionAt(result.draft, at);
        inverse = { type: 'remove', id: at.node.id };
        break;
      }
      case 'remove': inverse = insertionAt(current, locate(current, command.id)!); break;
      case 'move': {
        const at = locate(current, command.id)!;
        inverse = { type: 'move', id: command.id, parentId: parentIdAt(current, at), index: at.index };
        break;
      }
    }
    current = result.draft;
    redo.push(forward);
    undo = [inverse, ...undo];
  }
  return { ok: true, draft: current, commands: redo, entry: { undo, redo } };
}

function parentIdAt(draft: ProgramDraft, at: Location): string | null {
  if (at.containerPath.length === 1) return null;
  return (getIn(draft, at.containerPath.slice(0, -1)) as { id: string }).id;
}

function insertionAt(draft: ProgramDraft, at: Location): Extract<DraftCommand, { type: 'insert' }> {
  return { type: 'insert', parentId: parentIdAt(draft, at), index: at.index, node: { kind: at.kind, value: at.node } as DraftNode };
}

// ---------------------------------------------------------------------------------------------
// Node factories for editors. Ids default to uuids, which `save_draft` requires (decision 0004).

export function newWeek(label: string, newId = defaultNewId): DraftNode {
  // The index is assigned from the week's position on insert.
  return { kind: 'week', value: { id: newId(), index: 1, label, startDate: null, useSections: false, days: [] } };
}

export function newDay(label: string, newId = defaultNewId): DraftNode {
  return { kind: 'day', value: { id: newId(), label, scheduledDate: null, sections: [] } };
}

export function newSection(kind: Section['kind'], title: string, newId = defaultNewId): DraftNode {
  return { kind: 'section', value: { id: newId(), kind, title: title || kind[0]!.toUpperCase() + kind.slice(1), instructions: '', exercises: [] } };
}

/** Starts unprescribed (no set count, no target); publish readiness flags it until filled in. */
export function newExercise(name: string, newId = defaultNewId): DraftNode {
  return {
    kind: 'exercise',
    value: {
      id: newId(),
      logicalKey: slug(name),
      name,
      alternatives: [],
      groupId: null,
      demoUrl: null, muscles: [],
      prescription: { setCount: null, targets: [] },
      notes: '',
    },
  };
}

export function newResource(title: string, newId = defaultNewId): DraftNode {
  return { kind: 'resource', value: { id: newId(), title, body: '', url: null } };
}

// ---------------------------------------------------------------------------------------------
// Locating nodes

type Path = (string | number)[];
type Location = { kind: NodeKind; node: NodeOf[NodeKind]; containerPath: Path; index: number };

const NodeSchema = {
  week: ProgramWeek,
  day: WorkoutDay,
  section: Section,
  exercise: Exercise,
  resource: Resource,
} satisfies Record<NodeKind, z.ZodType>;

/** Which kind may contain each kind; `program` is the draft root. */
const PARENT_KIND: Record<NodeKind, 'program' | NodeKind | 'program-or-day'> = {
  week: 'program',
  day: 'week',
  section: 'program-or-day',
  exercise: 'section',
  resource: 'program',
};

const CHILD_FIELD: Record<NodeKind, string> = {
  week: 'weeks',
  day: 'days',
  section: 'sections',
  exercise: 'exercises',
  resource: 'resources',
};

function* walk(draft: ProgramDraft): Generator<Location> {
  function* sections(list: Section[], containerPath: Path): Generator<Location> {
    for (const [i, section] of list.entries()) {
      yield { kind: 'section', node: section, containerPath, index: i };
      for (const [j, exercise] of section.exercises.entries()) {
        yield { kind: 'exercise', node: exercise, containerPath: [...containerPath, i, 'exercises'], index: j };
      }
    }
  }
  yield* sections(draft.sharedSections, ['sharedSections']);
  for (const [w, week] of draft.weeks.entries()) {
    yield { kind: 'week', node: week, containerPath: ['weeks'], index: w };
    for (const [d, day] of week.days.entries()) {
      yield { kind: 'day', node: day, containerPath: ['weeks', w, 'days'], index: d };
      yield* sections(day.sections, ['weeks', w, 'days', d, 'sections']);
    }
  }
  for (const [r, resource] of draft.resources.entries()) {
    yield { kind: 'resource', node: resource, containerPath: ['resources'], index: r };
  }
}

function locate(draft: ProgramDraft, id: string): Location | null {
  for (const at of walk(draft)) if (at.node.id === id) return at;
  return null;
}

/** The list a node of `kind` goes into under `parentId`, or an error if that parent can't hold it. */
function containerFor(draft: ProgramDraft, kind: NodeKind, parentId: string | null): Path | CommandError {
  const allowed = PARENT_KIND[kind];
  if (parentId === null) {
    if (allowed === 'program') return [CHILD_FIELD[kind]];
    if (allowed === 'program-or-day') return ['sharedSections'];
    return { code: 'invalid_parent', message: `A ${kind} needs a parent`, path: '' };
  }
  const parent = locate(draft, parentId);
  if (!parent) return { code: 'not_found', message: `No node with id ${parentId}`, path: '' };
  const fits = allowed === 'program-or-day' ? parent.kind === 'day' : parent.kind === allowed;
  if (!fits) {
    return { code: 'invalid_parent', message: `A ${parent.kind} can't contain a ${kind}`, path: pathText(nodePath(parent)) };
  }
  return [...nodePath(parent), CHILD_FIELD[kind]];
}

const nodePath = (at: Location): Path => [...at.containerPath, at.index];
const pathText = (path: Path) => path.join('.');

// ---------------------------------------------------------------------------------------------
// Updates

function updateNode<K extends NodeKind>(
  draft: ProgramDraft,
  id: string,
  kind: K,
  schema: z.ZodType<Partial<NodeOf[K]>>,
  input: unknown,
): CommandResult {
  const at = locate(draft, id);
  if (!at || at.kind !== kind) return notFound(id, kind);
  const patch = schema.safeParse(input);
  if (!patch.success) return invalid(patch.error, nodePath(at));
  return done(updateIn(draft, nodePath(at), (node: NodeOf[K]) => ({ ...node, ...patch.data })));
}

type Prescription = Exercise['prescription'];

function updatePrescription(
  draft: ProgramDraft,
  exerciseId: string,
  change: (p: Prescription) => Prescription | string | z.ZodError,
): CommandResult {
  const at = locate(draft, exerciseId);
  if (!at || at.kind !== 'exercise') return notFound(exerciseId, 'exercise');
  const path = [...nodePath(at), 'prescription'];
  const next = change((at.node as Exercise).prescription);
  if (typeof next === 'string') return { ok: false, error: { code: 'invalid_value', message: next, path: pathText(path) } };
  if (next instanceof z.ZodError) return invalid(next, path);
  const checked = ExercisePrescription.safeParse(next);
  if (!checked.success) return invalid(checked.error, path);
  return done(updateIn(draft, path, () => next));
}

// ---------------------------------------------------------------------------------------------
// Structure: insert, move, duplicate

function insert(draft: ProgramDraft, parentId: string | null, index: number | undefined, node: DraftNode): CommandResult {
  const container = containerFor(draft, node.kind, parentId);
  if (!Array.isArray(container)) return { ok: false, error: container };
  const checked = NodeSchema[node.kind].safeParse(node.value);
  if (!checked.success) return invalid(checked.error, container);

  const existing = new Set<string>();
  for (const at of walk(draft)) existing.add(at.node.id);
  for (const id of subtreeIds(node)) {
    if (existing.has(id)) return { ok: false, error: { code: 'duplicate_id', message: `Id ${id} is already in use`, path: '' } };
    existing.add(id);
  }
  return placeAt(draft, container, index, { kind: node.kind, value: checked.data } as DraftNode);
}

function move(draft: ProgramDraft, id: string, parentId: string | null, index: number | undefined): CommandResult {
  const at = locate(draft, id);
  if (!at) return notFound(id);
  const node = { kind: at.kind, value: at.node } as DraftNode;
  // Kinds nest in a fixed order, so a node is never moved into its own subtree.
  const without = updateIn(draft, at.containerPath, (list: unknown[]) => list.filter((_, i) => i !== at.index));
  const container = containerFor(without, at.kind, parentId);
  if (!Array.isArray(container)) return { ok: false, error: container };
  const result = placeAt(without, container, index, node);
  return result.ok ? { ...result, createdId: null } : result;
}

function duplicate(draft: ProgramDraft, id: string, newId: () => string): CommandResult {
  const at = locate(draft, id);
  if (!at) return notFound(id);
  const copy = copyWithFreshIds({ kind: at.kind, value: at.node } as DraftNode, newId);
  return placeAt(draft, at.containerPath, at.index + 1, copy);
}

function placeAt(draft: ProgramDraft, container: Path, index: number | undefined, node: DraftNode): CommandResult {
  const list = getIn(draft, container) as unknown[];
  const position = index ?? list.length;
  if (!Number.isInteger(position) || position < 0 || position > list.length) {
    return { ok: false, error: { code: 'invalid_index', message: `Position ${position} is out of range`, path: pathText(container) } };
  }
  const next = updateIn(draft, container, (items: unknown[]) => [
    ...items.slice(0, position),
    node.value,
    ...items.slice(position),
  ]);
  return done(node.kind === 'week' ? renumberWeeks(next) : next, node.value.id);
}

/**
 * A whole program copied for a new program (decision 0061), with fresh ids throughout as Duplicate
 * gives one week. Exercises keep `logicalKey`; week and day dates are cleared for the new slot.
 */
export function copyProgramDraft(draft: ProgramDraft, newId: () => string = defaultNewId): ProgramDraft {
  return {
    ...draft,
    sharedSections: draft.sharedSections.map((value) => copyWithFreshIds({ kind: 'section', value }, newId).value as Section),
    weeks: draft.weeks.map((value) => copyWithFreshIds({ kind: 'week', value }, newId).value as ProgramWeek),
    resources: draft.resources.map((value) => copyWithFreshIds({ kind: 'resource', value }, newId).value as ResourceNode),
  };
}

/**
 * Copies keep `logicalKey`, so the same movement in a duplicated week still shares its history.
 * Groups inside the copy get new group ids so they don't merge with the original's; a single
 * duplicated exercise stays in its group. Dates are cleared because the copy is a different slot.
 */
function copyWithFreshIds(node: DraftNode, newId: () => string): DraftNode {
  const groups = new Map<string, string>();
  const regroup = (groupId: string | null) => {
    if (groupId === null || node.kind === 'exercise') return groupId;
    if (!groups.has(groupId)) groups.set(groupId, newId());
    return groups.get(groupId)!;
  };
  const exercise = (e: Exercise): Exercise => ({
    ...e,
    id: newId(),
    groupId: regroup(e.groupId),
    alternatives: e.alternatives.map((a) => ({ ...a, id: newId() })),
  });
  const section = (s: Section): Section => ({ ...s, id: newId(), exercises: s.exercises.map(exercise) });
  const day = (d: WorkoutDay): WorkoutDay => ({ ...d, id: newId(), scheduledDate: null, sections: d.sections.map(section) });
  switch (node.kind) {
    case 'week':
      return { kind: 'week', value: { ...node.value, id: newId(), startDate: null, useSections: node.value.useSections ?? false, days: node.value.days.map(day) } };
    case 'day':
      return { kind: 'day', value: day(node.value) };
    case 'section':
      return { kind: 'section', value: section(node.value) };
    case 'exercise':
      return { kind: 'exercise', value: exercise(node.value) };
    case 'resource':
      return { kind: 'resource', value: { ...node.value, id: newId() } };
  }
}

function subtreeIds(node: DraftNode): string[] {
  const ofSection = (s: Section) => [s.id, ...s.exercises.map((e) => e.id)];
  const ofDay = (d: WorkoutDay) => [d.id, ...d.sections.flatMap(ofSection)];
  switch (node.kind) {
    case 'week':
      return [node.value.id, ...node.value.days.flatMap(ofDay)];
    case 'day':
      return ofDay(node.value);
    case 'section':
      return ofSection(node.value);
    case 'exercise':
    case 'resource':
      return [node.value.id];
  }
}

/** Week indexes must ascend (enforced by `save_draft`), so structural week changes renumber 1..n. */
function renumberWeeks(draft: ProgramDraft): ProgramDraft {
  if (draft.weeks.every((w, i) => w.index === i + 1)) return draft;
  return { ...draft, weeks: draft.weeks.map((w, i) => (w.index === i + 1 ? w : { ...w, index: i + 1 })) };
}

// ---------------------------------------------------------------------------------------------
// Helpers

function getIn(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((value, key) => (value as Record<string | number, unknown>)[key], root);
}

/** Copies only the objects and arrays along `path`; everything else is shared with `root`. */
function updateIn<T>(root: T, path: Path, change: (value: never) => unknown): T {
  if (path.length === 0) return change(root as never) as T;
  const [head, ...rest] = path as [string | number, ...Path];
  const source = root as Record<string | number, unknown>;
  const copy = (Array.isArray(root) ? [...root] : { ...source }) as Record<string | number, unknown>;
  copy[head] = updateIn(source[head], rest, change);
  return copy as T;
}

function done(draft: ProgramDraft, createdId: string | null = null): CommandResult {
  return { ok: true, draft, createdId };
}

function notFound(id: string, kind?: NodeKind): CommandResult {
  return { ok: false, error: { code: 'not_found', message: `No ${kind ?? 'node'} with id ${id}`, path: '' } };
}

function invalid(error: z.ZodError, base: Path): CommandResult {
  const issue = error.issues[0]!;
  const path = [...base, ...issue.path.map((p) => (typeof p === 'symbol' ? String(p) : p))];
  return { ok: false, error: { code: 'invalid_value', message: issue.message, path: pathText(path) } };
}
