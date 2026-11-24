import { describe, expect, it } from 'vitest';
import { openArchive } from '@/domain/imports/archive';
import { cellText, readWorkbook } from '@/domain/imports/xlsx';
import { backupFileName, programBackupSheets } from '@/domain/programs/backup';
import { ProgramDraft } from '@/domain/programs/contract';
import { sheetNames, writeXlsx } from '@/lib/xlsx';

const exercise = (id: string, name: string, extra: object = {}) => ({
  id, logicalKey: id, name, notes: '', alternatives: [], groupId: null, demoUrl: null, muscles: [],
  prescription: { setCount: { min: 3, max: 3 }, targets: [{ effort: { kind: 'reps', reps: { min: 8, max: 10 }, perSide: false }, load: null, rir: { min: 1, max: 2 }, rpe: null, annotations: [] }] },
  ...extra,
});

function draft(service: 'personal_training' | 'mesocycle' = 'personal_training'): ProgramDraft {
  return ProgramDraft.parse({
    schemaVersion: 1, service, title: 'Strength', programTheme: 'Size', coachNotes: 'Watch the knee',
    resources: [{ id: 'r1', title: 'Bracing', body: 'Breathe in', url: 'https://example.test/brace' }],
    sharedSections: [{ id: 'ss', kind: 'preparation', title: 'Warm-up', instructions: '', exercises: [exercise('w1', 'Bike')] }],
    weeks: [{ id: 'wk', index: 1, label: 'Intro', startDate: null, useSections: false, days: [
      { id: 'd1', label: 'Legs', scheduledDate: null, sections: [{ id: 's1', kind: 'main', title: 'Main', instructions: '', exercises: [
        exercise('e1', 'Squat', { notes: '=SUM(A1)', alternatives: [{ id: 'a1', name: 'Leg press' }], demoUrl: 'https://example.test/squat' }),
      ] }] },
      { id: 'd2', label: '', scheduledDate: null, sections: [] },
    ] }],
  });
}

function read(bytes: Uint8Array) {
  const book = readWorkbook(openArchive(bytes, 'backup.xlsx'));
  return book.sheets.map((sheet) => {
    const grid: string[][] = [];
    for (const cell of sheet.cells) (grid[cell.row - 1] ??= [])[cell.col - 1] = cellText(cell);
    return { name: sheet.name, rows: Array.from(grid, (row) => Array.from(row ?? [], (text) => text ?? '')), formulas: sheet.cells.filter((c) => c.formula).length };
  });
}

describe('program backup spreadsheet (decision 0062)', () => {
  it('writes a workbook the importer reads back: details, every-workout preparation, one sheet per week', () => {
    const sheets = read(writeXlsx(programBackupSheets(draft())));
    expect(sheets.map((s) => s.name)).toEqual(['Program', 'Every workout', 'Intro']);
    expect(sheets[0]!.rows).toEqual([
      ['Field', 'Value'], ['Title', 'Strength'], ['Coach notes', 'Watch the knee'], [], ['Resources'], ['Title', 'Link', 'Text'],
      ['Bracing', 'https://example.test/brace', 'Breathe in'],
    ]);
    const week = sheets[2]!;
    expect(week.rows[0]).toEqual(['Day', 'Section', '#', 'Exercise', 'Sets', 'Reps / time', 'Per side', 'Load mode', 'Load', 'Unit', 'RIR', 'RPE', 'Notes', 'Alternatives', 'Demo link']);
    expect(week.rows[1]!.slice(0, 6)).toEqual(['Day 1 · Legs', 'Main', '1', 'Squat', '3', '8-10']);
    expect(week.rows[1]![10]).toBe('1-2');
    expect(week.rows[1]!.slice(12)).toEqual(['=SUM(A1)', 'Leg press', 'https://example.test/squat']);
    expect(week.rows[2]).toEqual(['Day 2']);
  });

  it('never writes formulas, so text starting with "=" stays text', () => {
    expect(read(writeXlsx(programBackupSheets(draft()))).every((sheet) => sheet.formulas === 0)).toBe(true);
  });

  it('uses the mesocycle columns and labels', () => {
    const sheets = read(writeXlsx(programBackupSheets(draft('mesocycle'))));
    expect(sheets[0]!.rows.slice(1, 3)).toEqual([['Program Style', 'Strength'], ['Program Theme', 'Size']]);
    expect(sheets.map((s) => s.name)).toEqual(['Program', 'Every workout', 'Week 1']);
    expect(sheets[2]!.rows[0]!.slice(3, 6)).toEqual(['Exercise', 'RIR goal', 'Muscles']);
  });
});

describe('sheet and file names', () => {
  it('follows Excel\'s sheet name rules', () => {
    expect(sheetNames(['Week 1', 'week 1', 'A/B: [test]?', '', 'x'.repeat(40)])).toEqual(['Week 1', 'week 1 (2)', 'A B   test', 'Sheet 4', 'x'.repeat(31)]);
  });

  it('names the file after the client and program', () => {
    expect(backupFileName('Maya Chen', { title: 'Push / Pull', service: 'personal_training' }, 'xlsx')).toBe('Maya Chen - Push Pull.xlsx');
    expect(backupFileName('Maya Chen', { title: ' ', service: 'mesocycle' }, 'json')).toBe('Maya Chen - Untitled program style.json');
  });
});
