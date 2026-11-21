import { describe, expect, it } from 'vitest';
import { demoProblems, demoSteps, typing } from '@/domain/help/demo';
import { DEMO_COLUMNS, SPREADSHEET_DEMOS, publishIssues } from '@/domain/help/spreadsheetDemos';
import { cellText, gridRows } from '@/domain/programs/grid';
import { NUTRITION_DEMOS, NUTRITION_DEMO_PROGRAM, type NutritionDemoState } from '@/domain/help/nutritionDemos';
import { nutritionGridCoachEdited, nutritionGridMissing, nutritionGridText } from '@/domain/nutritionGrid';
import { nutritionWeeks } from '@/domain/nutritionProgram';

const table = (draft: Parameters<typeof gridRows>[0]) => gridRows(draft).map((row) => DEMO_COLUMNS.map((c) => cellText(row, c)));

describe('help demo scripts', () => {
  it('are all valid, with a last frame to show under reduced motion', () => {
    for (const [name, script] of Object.entries(SPREADSHEET_DEMOS)) {
      expect(demoProblems(script), name).toEqual([]);
      expect(script.frames.at(-1), name).toBeDefined();
    }
  });

  it('only point at things the frame draws', () => {
    for (const [name, script] of Object.entries(SPREADSHEET_DEMOS)) {
      script.frames.forEach((frame, i) => {
        const target = frame.pointer?.target;
        if (!target?.startsWith('cell:')) return;
        const [, exerciseId, column] = target.split(':');
        expect(gridRows(frame.state.draft).some((row) => row.exerciseId === exerciseId), `${name} frame ${i}`).toBe(true);
        expect(DEMO_COLUMNS as readonly string[], `${name} frame ${i}`).toContain(column);
      });
    }
  });

  it('show what the editor really does', () => {
    const perSet = SPREADSHEET_DEMOS['per-set-targets'].frames;
    expect(table(perSet.at(-1)!.state.draft)[1]).toEqual(['2', 'Incline dumbbell press', '3', '10 / 8 / 6']);

    const drag = SPREADSHEET_DEMOS['drag-row'].frames;
    expect(table(drag.at(-1)!.state.draft).map((r) => `${r[0]} ${r[1]}`)).toEqual(['1 Bench press', '2 Cable fly', '3 Incline dumbbell press', '4 Assisted dip']);

    const undo = SPREADSHEET_DEMOS['select-delete-undo'].frames;
    const cleared = undo.find((f) => f.keys?.includes('Delete'))!.state.draft;
    expect(table(cleared).slice(0, 2).map((r) => r.slice(2))).toEqual([['', ''], ['', '']]);
    expect(table(undo.at(-1)!.state.draft)).toEqual(table(undo[0]!.state.draft));

    const paste = SPREADSHEET_DEMOS['paste-review'].frames;
    const review = paste.find((f) => f.state.paste)!.state.paste!;
    expect(review.changes.map((c) => `${c.exerciseId}.${c.column}: ${c.before} → ${c.after}`)).toEqual(['bench.sets: 3 → 4', 'bench.effort: 8-10 → 6-8', 'incline.effort: 10 → 10 / 8 / 6']);
    expect(table(paste.at(-1)!.state.draft).slice(0, 2).map((r) => r.slice(2))).toEqual([['4', '6-8'], ['3', '10 / 8 / 6']]);

    const publish = SPREADSHEET_DEMOS['publish-readiness'].frames;
    expect(publishIssues(publish[0]!.state.draft)).toEqual(['Exercise needs a name', 'Unnamed exercise: set count is missing']);
    expect(publishIssues(publish.at(-1)!.state.draft)).toEqual([]);
    expect(publish.at(-1)!.state.publishing?.published).toBe(true);
  });

  it('point at every publish issue the readiness list shows', () => {
    for (const frame of SPREADSHEET_DEMOS['publish-readiness'].frames) {
      const target = frame.pointer?.target;
      if (target?.startsWith('issue:')) expect(Number(target.slice(6))).toBeLessThan(publishIssues(frame.state.draft).length);
    }
  });
});

describe('demo helpers', () => {
  it('types one character per frame', () => {
    expect(typing('ab', 100, (text) => ({ state: text, caption: 'Type' })).map((f) => f.state)).toEqual(['a', 'ab']);
  });

  it('lists each step once, in order', () => {
    expect(demoSteps({ id: 'x', description: 'x', frames: [{ state: 0, ms: 100, caption: 'A' }, { state: 1, ms: 100, caption: 'A' }, { state: 2, ms: 100, caption: 'B' }] })).toEqual(['A', 'B']);
  });

  it('flags empty captions, short frames and dashes', () => {
    expect(demoProblems({ id: 'x', description: 'Bad — script', frames: [{ state: 0, ms: 10, caption: '' }] })).toHaveLength(3);
  });
});

describe('nutrition demo scripts', () => {
  const week = (state: NutritionDemoState) => nutritionWeeks(NUTRITION_DEMO_PROGRAM, state.weights, state.entries, state.today)[0]!;
  const text = (state: NutritionDemoState, date: string, column: number) => nutritionGridText(week(state), { exerciseId: date, column });

  it('are all valid, and only point at cells that exist', () => {
    for (const [name, script] of Object.entries(NUTRITION_DEMOS)) {
      expect(demoProblems(script), name).toEqual([]);
      for (const frame of script.frames) {
        const target = frame.pointer?.target;
        if (target?.startsWith('nutrition:')) expect(week(frame.state).rows.some((row) => row.date === target.split(':')[1]), `${name}: ${target}`).toBe(true);
      }
    }
  });

  it('put a morning’s weight and the day before’s calories on one row', () => {
    const last = NUTRITION_DEMOS['nutrition-week'].frames.at(-1)!.state;
    const tuesday = week(last).rows.find((row) => row.date === '2026-11-03')!;
    expect(tuesday.activityDate).toBe('2026-11-02');
    expect([1, 2, 3, 4].map((c) => text(last, '2026-11-03', c))).toEqual(['172.1', '2790', '2640', '150']);
    // Average Weight needs three weigh-ins, so it starts on Wednesday.
    expect(text(last, '2026-11-03', 5)).toBe('');
    expect(text(last, '2026-11-04', 5)).not.toBe('');
  });

  it('correct the typo through the spreadsheet’s own plan, marked as a coach edit', () => {
    const frames = NUTRITION_DEMOS['nutrition-correction'].frames;
    expect(nutritionGridMissing({ exerciseId: '2026-11-04', column: 2 }, frames[0]!.state.today, text(frames[0]!.state, '2026-11-04', 2))).toBe(true);
    expect(text(frames[0]!.state, '2026-11-05', 2)).toBe('28100');
    const last = frames.at(-1)!.state;
    expect([2, 4].map((c) => text(last, '2026-11-05', c))).toEqual(['2810', '110']);
    expect(nutritionGridCoachEdited(week(last), { exerciseId: '2026-11-05', column: 2 })).toBe(true);
    expect(last.history?.[0]?.activityDate).toBe('2026-11-04');
  });
});
