import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ProgramDraft, validateForPublish, type Exercise } from '@/domain/programs/contract';
import { renderSeedSql, SEED_SQL_PATH, seedPrograms } from '../../scripts/seed/programs';

const exercises = (draft: ProgramDraft): Exercise[] => [
  ...draft.sharedSections.flatMap((s) => s.exercises),
  ...draft.weeks.flatMap((w) => w.days.flatMap((d) => d.sections.flatMap((s) => s.exercises))),
];

const nodeIds = (draft: ProgramDraft): string[] => [
  ...draft.sharedSections.map((s) => s.id),
  ...draft.weeks.flatMap((w) => [w.id, ...w.days.flatMap((d) => [d.id, ...d.sections.map((s) => s.id)])]),
  ...exercises(draft).map((e) => e.id),
  ...draft.resources.map((r) => r.id),
];

const revisions = seedPrograms.flatMap((p) => p.revisions.map((r, i) => ({ program: p, label: `${p.key} r${i + 1}`, ...r })));

describe('demo program seed', () => {
  it('matches the committed SQL (run pnpm seed:programs after editing scripts/seed)', () => {
    expect(readFileSync(SEED_SQL_PATH, 'utf8')).toBe(renderSeedSql());
  });

  it.each(revisions)('$label is a valid ProgramDraft for its service', ({ program, draft }) => {
    expect(ProgramDraft.parse(draft)).toEqual(draft);
    expect(draft.service).toBe(program.service);
    expect(new Set(nodeIds(draft)).size).toBe(nodeIds(draft).length);
  });

  it('all coaching documents pass the publish checks', () => {
    for (const { label, draft } of revisions) {
      expect(validateForPublish(draft), label).toEqual([]);
    }
  });

  it('mesocycles prescribe reps and RIR only; logged loads are never targets', () => {
    for (const { label, draft } of revisions.filter((r) => r.draft.service === 'mesocycle')) {
      for (const target of exercises(draft).flatMap((e) => e.prescription.targets)) {
        expect(target.effort?.kind, label).toBe('reps');
        expect(target.rir, label).not.toBeNull();
        expect(target.load === null || target.load.mode === 'bodyweight', label).toBe(true);
      }
    }
  });

  it('every lifted load has an explicit unit', () => {
    for (const { label, draft } of revisions) {
      for (const target of exercises(draft).flatMap((e) => e.prescription.targets)) {
        if (target.load?.mode === 'external') expect(target.load.unit, label).toBe('lb');
      }
    }
  });

  it('a later revision keeps the node ids of the one it was opened from', () => {
    const maya = seedPrograms.find((p) => p.key === 'maya/meso3')!;
    expect(nodeIds(maya.revisions[1]!.draft)).toEqual(nodeIds(maya.revisions[0]!.draft));
  });
});
