import { describe, expect, it } from 'vitest';
import { dayView, formatLoad, formatSetTarget, groupExercises, locateDay, prescriptionView } from '@/domain/programs/clientView';
import { ProgramDraft, type Exercise, type SetTarget } from '@/domain/programs/contract';

const target = (patch: Partial<SetTarget> = {}): SetTarget => ({ effort: null, load: null, rir: null, rpe: null, annotations: [], ...patch });
const exercise = (id: string, patch: Partial<Exercise> = {}): Exercise => ({
  id, logicalKey: id, name: id, alternatives: [], groupId: null, demoUrl: null, muscles: [], notes: '',
  prescription: { setCount: { min: 3, max: 3 }, targets: [target()] }, ...patch,
});

describe('client prescription formatting', () => {
  it('keeps RIR 1-2 a range and prints scalars once', () => {
    expect(formatSetTarget(target({ effort: { kind: 'reps', reps: { min: 8, max: 12 }, perSide: false }, rir: { min: 1, max: 2 } }))).toBe('8–12 reps · RIR 1–2');
    expect(formatSetTarget(target({ effort: { kind: 'reps', reps: { min: 1, max: 1 }, perSide: false }, rpe: { min: 8, max: 8 } }))).toBe('1 rep · RPE 8');
  });

  it('prints zero targets as values and null targets as nothing', () => {
    expect(formatSetTarget(target({ rir: { min: 0, max: 0 } }))).toBe('RIR 0');
    expect(formatSetTarget(target())).toBe('');
  });

  it('formats timed, per-side, decimal and annotated targets', () => {
    expect(formatSetTarget(target({ effort: { kind: 'duration', seconds: { min: 45, max: 45 }, perSide: true } }))).toBe('45 s per side');
    expect(formatSetTarget(target({ effort: { kind: 'reps', reps: { min: 8.5, max: 8.5 }, perSide: false }, annotations: ['drop set'] }))).toBe('8.5 reps · drop set');
  });

  it('formats every load mode without inventing a unit', () => {
    expect(formatLoad({ mode: 'external', value: { min: 50, max: 55 }, unit: 'lb' })).toBe('50–55 lb');
    expect(formatLoad({ mode: 'external', value: { min: 45, max: 45 }, unit: null })).toBe('45');
    expect(formatLoad({ mode: 'assisted', value: { min: 30, max: 30 }, unit: 'kg' })).toBe('Assisted 30 kg');
    expect(formatLoad({ mode: 'bodyweight', added: null })).toBe('Bodyweight');
    expect(formatLoad({ mode: 'bodyweight', added: { value: 10, unit: 'kg' } })).toBe('Bodyweight + 10 kg');
    expect(formatLoad({ mode: 'band', label: 'light' })).toBe('Band: light');
    expect(formatLoad({ mode: 'not_applicable' })).toBeNull();
  });

  it('collapses identical per-set targets and lists differing ones', () => {
    const same = target({ effort: { kind: 'reps', reps: { min: 10, max: 10 }, perSide: false } });
    expect(prescriptionView({ setCount: { min: 2, max: 3 }, targets: [same] })).toEqual({ sets: '2–3 sets', lines: [{ label: null, text: '10 reps' }] });
    expect(prescriptionView({ setCount: { min: 2, max: 2 }, targets: [same, { ...same, annotations: ['drop set'] }] }).lines)
      .toEqual([{ label: 'Set 1', text: '10 reps' }, { label: 'Set 2', text: '10 reps · drop set' }]);
    expect(prescriptionView({ setCount: null, targets: [] })).toEqual({ sets: null, lines: [] });
    expect(prescriptionView({ setCount: { min: 1, max: 1 }, targets: [target()] })).toEqual({ sets: '1 set', lines: [] });
  });
});

describe('client day structure', () => {
  it('groups only consecutive exercises sharing a group id', () => {
    const groups = groupExercises([exercise('a', { groupId: 'A' }), exercise('b', { groupId: 'A' }), exercise('c'), exercise('d', { groupId: 'A' })]);
    expect(groups.map((g) => [g.superset, g.exercises.map((e) => e.id)])).toEqual([[true, ['a', 'b']], [false, ['c']], [false, ['d']]]);
  });

  const section = (id: string, kind: 'preparation' | 'main' | 'cooldown', exercises: Exercise[], title = id) => ({ id, kind, title, instructions: '', exercises });
  const program = (useSections: boolean) => ProgramDraft.parse({
    schemaVersion: 1, service: 'personal_training', title: 'Plan', coachNotes: '', resources: [],
    sharedSections: [section('warm', 'preparation', [exercise('bike')], 'Warm-up'), section('cool', 'cooldown', [exercise('stretch')], 'Cool-down'), section('empty', 'main', [])],
    weeks: [{ id: 'w1', index: 1, label: '', startDate: null, useSections, days: [
      { id: 'd1', label: 'Push', scheduledDate: null, sections: [section('s1', 'main', [exercise('press')], 'Strength'), section('s2', 'main', [exercise('fly')], 'Accessory')] },
      { id: 'd2', label: '', scheduledDate: null, sections: [] },
    ] }],
  });

  it('places shared preparation before and cool-down after the day, skipping empty sections', () => {
    const p = program(true);
    const view = dayView(p, p.weeks[0]!, p.weeks[0]!.days[0]!);
    expect(view.name).toBe('Day 1');
    expect(view.focus).toBe('Push');
    expect(view.before.map((b) => b.title)).toEqual(['Warm-up']);
    expect(view.after.map((b) => b.title)).toEqual(['Cool-down']);
    expect(view.blocks.map((b) => b.title)).toEqual(['Strength', 'Accessory']);
  });

  it('shows one untitled list when the week does not use sections', () => {
    const p = program(false);
    const view = dayView(p, p.weeks[0]!, p.weeks[0]!.days[0]!);
    expect(view.blocks).toHaveLength(1);
    expect(view.blocks[0]!.title).toBeNull();
    expect(view.blocks[0]!.groups.flatMap((g) => g.exercises.map((e) => e.id))).toEqual(['press', 'fly']);
    expect(dayView(p, p.weeks[0]!, p.weeks[0]!.days[1]!)).toMatchObject({ blocks: [], exerciseCount: 0 });
  });

  it('falls back to the first week and day for unknown selections', () => {
    const p = program(true);
    expect(locateDay(p, 'missing', 'missing')).toMatchObject({ week: { id: 'w1' }, day: { id: 'd1' } });
    expect(locateDay(p, 'w1', 'd2')?.day?.id).toBe('d2');
    expect(locateDay({ ...p, weeks: [] }, null, null)).toBeNull();
  });
});
