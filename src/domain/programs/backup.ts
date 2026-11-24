import type { XlsxSheet } from '@/lib/xlsx';
import type { ProgramDraft } from './contract';
import { cellText, gridColumns, gridRows, type GridRow } from './grid';
import { dayFocus, dayName, weekTitle } from './labels';

/**
 * A program as spreadsheet sheets, for coaches to keep or read elsewhere (decision 0062): a Program
 * sheet with the details and resources, Every-workout preparation when there is any, then one sheet
 * per week in the editor's Spreadsheet columns. Each row repeats its day and section, so a sheet
 * still reads after sorting or filtering. Empty days get a row of their own.
 */
export function programBackupSheets(draft: ProgramDraft): XlsxSheet[] {
  const columns = gridColumns(draft.service);
  const header = [...columns.map((column) => column.key === 'day' ? 'Day' : column.key === 'order' ? '#' : column.label), 'Alternatives', 'Demo link'];
  const rows = gridRows(draft);
  const exerciseRow = (row: GridRow, day: string) => [
    ...columns.map((column) => column.key === 'day' ? day : cellText(row, column.key)),
    row.exercise.alternatives.map((alternative) => alternative.name).join('\n'),
    row.exercise.demoUrl ?? '',
  ];

  const mesocycle = draft.service === 'mesocycle';
  const details: string[][] = [
    ['Field', 'Value'],
    [mesocycle ? 'Program Style' : 'Title', draft.title],
    ...(mesocycle ? [['Program Theme', draft.programTheme ?? '']] : []),
    ['Coach notes', draft.coachNotes],
  ];
  const resources = draft.resources.length
    ? [[], ['Resources'], ['Title', 'Link', 'Text'], ...draft.resources.map((r) => [r.title, r.url ?? '', r.body])]
    : [];
  const sheets: XlsxSheet[] = [{ name: 'Program', header: true, rows: [...details, ...resources] }];

  if (draft.sharedSections.length) {
    sheets.push({ name: 'Every workout', header: true, rows: [header, ...rows.filter((row) => row.weekId === null).map((row) => exerciseRow(row, row.dayLabel))] });
  }
  draft.weeks.forEach((week, w) => {
    const body = week.days.flatMap((day, d) => {
      const focus = dayFocus(day);
      const label = `${dayName(d)}${focus ? ` · ${focus}` : ''}`;
      const dayRows = rows.filter((row) => row.dayId === day.id);
      return dayRows.length ? dayRows.map((row) => exerciseRow(row, label)) : [[label]];
    });
    sheets.push({ name: weekTitle(draft, week, w), header: true, rows: [header, ...body] });
  });
  return sheets;
}

/** "Maya Chen - Strength block.xlsx": the client and program, minus characters file systems refuse. */
export function backupFileName(clientName: string, draft: Pick<ProgramDraft, 'title' | 'service'>, extension: 'xlsx' | 'json'): string {
  const title = draft.title.trim() || (draft.service === 'mesocycle' ? 'Untitled program style' : 'Untitled program');
  const name = [clientName.trim(), title].filter(Boolean).join(' - ');
  return `${name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120)}.${extension}`;
}
