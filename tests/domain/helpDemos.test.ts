import { describe, expect, it } from 'vitest';
import { demoProblems, demoSteps, typing } from '@/domain/help/demo';
import { DEMO_COLUMNS, SPREADSHEET_DEMOS, UNDO_TARGET } from '@/domain/help/spreadsheetDemos';
import { cellText, gridRows } from '@/domain/programs/grid';

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
        if (!target || target === UNDO_TARGET) return;
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
