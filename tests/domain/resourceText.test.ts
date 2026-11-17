import { describe, expect, it } from 'vitest';
import { matrixTone, parseResourceBody } from '@/domain/programs/resourceText';

describe('resource text tables', () => {
  it('splits text and pipe tables in order', () => {
    const body = [
      'Intro line.',
      '',
      '| Soreness | 0 | 1 |',
      '|---|:-:|---|',
      '| 0 | Add 1–3 sets | Add 0–2 sets |',
      '| 1 | Add 1–2 sets |',
      '',
      'After.',
    ].join('\n');
    expect(parseResourceBody(body)).toEqual([
      { kind: 'text', text: 'Intro line.' },
      { kind: 'table', header: ['Soreness', '0', '1'], rows: [['0', 'Add 1–3 sets', 'Add 0–2 sets'], ['1', 'Add 1–2 sets', '']] },
      { kind: 'text', text: 'After.' },
    ]);
  });

  it('keeps pipe lines without a separator as plain text', () => {
    expect(parseResourceBody('| not | a table |\nnext')).toEqual([{ kind: 'text', text: '| not | a table |\nnext' }]);
  });

  it('reads "## " lines as headings', () => {
    expect(parseResourceBody('## Stimulus Score Grading\nStimulus is 0–9.\n##not a heading')).toEqual([
      { kind: 'heading', text: 'Stimulus Score Grading' },
      { kind: 'text', text: 'Stimulus is 0–9.\n##not a heading' },
    ]);
  });

  it('reads a two-axis corner cell as a matrix', () => {
    const body = '| Soreness Score \\ Performance Score | 0 | 3 |\n|---|---|---|\n| 0 | Add 1–3 sets | Recovery |';
    expect(parseResourceBody(body)).toEqual([
      { kind: 'matrix', rowAxis: 'Soreness Score', columnAxis: 'Performance Score', columns: ['0', '3'], rows: [{ label: '0', cells: ['Add 1–3 sets', 'Recovery'] }] },
    ]);
    expect(['Add 0–1 sets', 'Do not add sets', 'Recovery'].map(matrixTone)).toEqual(['good', null, 'bad']);
  });

  it('returns nothing for blank text', () => {
    expect(parseResourceBody('  \n')).toEqual([]);
  });
});
