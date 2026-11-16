import type { ImportAccumulator } from '../builder';
import type { RawValue } from '../contract';
import { cellText, norm, type Cell, type Sheet, type Workbook } from '../xlsx';

export const PARSER = { name: 'mps-ooxml', version: '0.1.0-spike' } as const;

export function cellId(cell: Pick<Cell, 'sheet' | 'ref'>): string {
  return `${cell.sheet}!${cell.ref}`;
}

export function rawOf(cell: Cell): RawValue {
  return { type: cell.type, value: cell.value, formula: cell.formula, numberFormat: cell.numberFormat };
}

/** Registers every non-empty cell so that nothing can leave the import unaccounted for. */
export function registerWorkbook(wb: Workbook, acc: ImportAccumulator) {
  for (const sheet of wb.sheets) {
    for (const cell of sheet.cells) {
      acc.register(cellId(cell), { kind: 'cell', sheet: sheet.name, ref: cell.ref, row: cell.row, col: cell.col }, rawOf(cell), cell.displayText);
      if (!cell.formula && (cell.value ?? '').trim() === '') acc.exclude(cellId(cell), 'unknown', 'Whitespace-only cell');
    }
  }
}

export function at(sheet: Sheet, row: number, col: number): Cell | undefined {
  return sheet.cells.find((c) => c.row === row && c.col === col);
}

export function rowCells(sheet: Sheet, row: number): Cell[] {
  return sheet.cells.filter((c) => c.row === row);
}

export function numeric(cell: Cell | undefined): number | null {
  if (!cell || cell.value === null || cell.value.trim() === '') return null;
  const n = Number(cell.value);
  return Number.isFinite(n) ? n : null;
}

const OWNERSHIP = /(intellectual property|proprietary|unauthori[sz]ed|all rights reserved|written permission)/i;
const BRANDING = /^(modern physique systems|mps|(mesocycle|nutritional|nutrition|personal training) programming)$/i;
const TAGLINE = /^evidence-based coaching/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE = /^\+?[\d\s().-]{7,}$/;

export function isOwnershipText(text: string): boolean {
  return OWNERSHIP.test(text) || BRANDING.test(text) || TAGLINE.test(text) || EMAIL.test(text) || PHONE.test(text);
}

export type HeaderMetadata = { clientName?: Cell; dateReceived?: Cell; programStyle?: Cell; programTheme?: Cell };

const META_LABELS: [keyof HeaderMetadata, RegExp][] = [
  ['clientName', /^name\s*:/i],
  ['dateReceived', /^date received\s*:/i],
  ['programStyle', /^program style\s*:/i],
  ['programTheme', /^program theme\s*:/i],
];

export function metadataValue(cell: Cell): string {
  return cellText(cell).replace(/^[^:]*:\s*/, '');
}

/**
 * Claims branding, ownership notices, contact blocks and "LABEL: value" header metadata.
 * Identity/received-date headers are never used as client identity or activity dates (FR-15).
 */
export function claimOwnershipAndMetadata(wb: Workbook, acc: ImportAccumulator): HeaderMetadata {
  const meta: HeaderMetadata = {};
  for (const sheet of wb.sheets) {
    for (const cell of sheet.cells) {
      const id = cellId(cell);
      if (acc.isClaimed(id)) continue;
      const text = cellText(cell);
      if (cell.type !== 'n' && isOwnershipText(text)) {
        acc.exclude(id, 'ownership', 'Branding, ownership notice or coach contact details; carried by the app, not imported');
        continue;
      }
      const label = META_LABELS.find(([, re]) => re.test(text));
      if (label) meta[label[0]] = cell;
    }
    // A contact name sits directly above the coach's email address.
    for (const cell of sheet.cells) {
      const below = at(sheet, cell.row + 1, cell.col);
      if (!acc.isClaimed(cellId(cell)) && below && EMAIL.test(cellText(below)) && cellText(cell) === cellText(cell).toUpperCase()) {
        acc.exclude(cellId(cell), 'ownership', 'Coach contact block; carried by the app, not imported');
      }
    }
  }
  if (meta.clientName) {
    acc.exclude(cellId(meta.clientName), 'metadata', 'Client identity comes from the client selected in the app, not from the file');
  }
  if (meta.dateReceived) {
    acc.exclude(cellId(meta.dateReceived), 'metadata', 'A received-date header is not an activity date (FR-15); kept as source evidence');
  }
  return meta;
}

/** Leftover formula cells are legacy calculations: retained as evidence, recomputed only by reviewed app rules. */
export function excludeLegacyFormulas(wb: Workbook, acc: ImportAccumulator) {
  for (const sheet of wb.sheets) {
    for (const cell of sheet.cells) {
      if (cell.formula && !acc.isClaimed(cellId(cell))) {
        acc.exclude(cellId(cell), 'calculated', 'Legacy spreadsheet calculation; retained as evidence, not imported as data (PRD §10)');
      }
    }
  }
}

export function findCells(wb: Workbook, predicate: (text: string, cell: Cell) => boolean): Cell[] {
  return wb.sheets.flatMap((s) => s.cells.filter((c) => predicate(norm(cellText(c)), c)));
}
