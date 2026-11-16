import { readPart, type Archive } from './archive';
import { builtinFormatCode, isDateFormat, isTimeFormat, makeRef, parseRef, renderDateSerial } from './excel';
import { IMPORT_LIMITS, ImportError, type ImportLimits } from './limits';
import { attr, find, findAll, kids, parseXml, path, tagOf, textOf, type XNode } from './xml';

export type Cell = {
  sheet: string;
  ref: string;
  row: number;
  col: number;
  /** OOXML `t` attribute; `n` when absent. */
  type: string;
  /** Raw stored value (shared strings resolved to their text). */
  value: string | null;
  formula: string | null;
  numberFormat: string | null;
  isDate: boolean;
  isTime: boolean;
  /** What the cell displays for simple date formats (e.g. "1-2"); otherwise null. */
  displayText: string | null;
};

export type Sheet = {
  name: string;
  cells: Cell[];
  byRef: Map<string, Cell>;
  merges: string[];
};

export type Workbook = {
  date1904: boolean;
  sheets: Sheet[];
  hasMacros: boolean;
  externalLinkCount: number;
};

function sharedStrings(archive: Archive): string[] {
  const xml = readPart(archive, 'xl/sharedStrings.xml');
  if (!xml) return [];
  const sst = path(parseXml(xml), ['sst']);
  // Skip phonetic runs (rPh); they are not displayed text.
  return sst ? findAll(kids(sst), 'si').map((si) => textOf(si, 't', ['rPh'])) : [];
}

type Styles = { formatIds: number[]; customFormats: Map<number, string> };

function styles(archive: Archive): Styles {
  const xml = readPart(archive, 'xl/styles.xml');
  const result: Styles = { formatIds: [], customFormats: new Map() };
  if (!xml) return result;
  const root = path(parseXml(xml), ['styleSheet']);
  if (!root) return result;
  const numFmts = find(kids(root), 'numFmts');
  for (const nf of numFmts ? findAll(kids(numFmts), 'numFmt') : []) {
    result.customFormats.set(Number(attr(nf, 'numFmtId')), attr(nf, 'formatCode') ?? '');
  }
  const xfs = find(kids(root), 'cellXfs');
  for (const xf of xfs ? findAll(kids(xfs), 'xf') : []) result.formatIds.push(Number(attr(xf, 'numFmtId') ?? 0));
  return result;
}

function resolvePartPath(target: string): string {
  const clean = target.replace(/^\//, '');
  return clean.startsWith('xl/') ? clean : `xl/${clean}`;
}

/** Reads cell values, types, formats, formulas and merges without evaluating anything. */
export function readWorkbook(archive: Archive, limits: ImportLimits = IMPORT_LIMITS): Workbook {
  const wbXml = readPart(archive, 'xl/workbook.xml')!;
  const wb = path(parseXml(wbXml), ['workbook']);
  if (!wb) throw new ImportError('CORRUPT', 'Workbook structure is missing.');
  const wbPr = find(kids(wb), 'workbookPr');
  const date1904 = wbPr ? ['1', 'true'].includes(attr(wbPr, 'date1904') ?? '') : false;

  const relsXml = readPart(archive, 'xl/_rels/workbook.xml.rels') ?? '';
  const rels = new Map<string, string>();
  const relRoot = relsXml ? path(parseXml(relsXml), ['Relationships']) : undefined;
  for (const rel of relRoot ? findAll(kids(relRoot), 'Relationship') : []) {
    rels.set(attr(rel, 'Id') ?? '', attr(rel, 'Target') ?? '');
  }

  const sheetNodes = findAll(kids(find(kids(wb), 'sheets') ?? ({} as XNode)), 'sheet');
  if (sheetNodes.length > limits.maxWorksheets) {
    throw new ImportError('TOO_MANY_SHEETS', `The workbook has more than ${limits.maxWorksheets} worksheets.`);
  }

  const strings = sharedStrings(archive);
  const style = styles(archive);
  let nonEmpty = 0;
  const sheets: Sheet[] = [];

  for (const sheetNode of sheetNodes) {
    const name = attr(sheetNode, 'name') ?? `Sheet${sheets.length + 1}`;
    const target = rels.get(attr(sheetNode, 'r:id') ?? '');
    const xml = target ? readPart(archive, resolvePartPath(target)) : null;
    if (!xml) continue; // chart sheets and missing parts carry no cell data
    const ws = path(parseXml(xml), ['worksheet']);
    if (!ws) continue;

    const cells: Cell[] = [];
    const sharedMasters = new Map<string, { ref: string; formula: string }>();
    const sheetData = find(kids(ws), 'sheetData');
    for (const rowNode of sheetData ? findAll(kids(sheetData), 'row') : []) {
      for (const c of findAll(kids(rowNode), 'c')) {
        const ref = attr(c, 'r');
        if (!ref) continue;
        const type = attr(c, 't') ?? 'n';
        const vNode = find(kids(c), 'v');
        const fNode = find(kids(c), 'f');
        let value: string | null = vNode ? textOf({ v: kids(vNode) } as XNode, 'v') : null;
        if (type === 's' && value !== null) value = strings[Number(value)] ?? null;
        if (type === 'inlineStr') value = textOf(find(kids(c), 'is') ?? ({} as XNode), 't', ['rPh']);

        let formula: string | null = null;
        if (fNode) {
          const ftext = textOf({ f: kids(fNode) } as XNode, 'f');
          const si = attr(fNode, 'si');
          if (attr(fNode, 't') === 'shared' && si !== undefined) {
            if (ftext) sharedMasters.set(si, { ref, formula: ftext });
            const master = sharedMasters.get(si);
            formula = ftext || (master ? `<shared with ${master.ref}: ${master.formula}>` : `<shared ${si}>`);
          } else {
            formula = ftext || null;
          }
        }
        if ((value === null || value === '') && formula === null) continue;

        const fmtId = style.formatIds[Number(attr(c, 's') ?? 0)] ?? 0;
        const numberFormat = style.customFormats.get(fmtId) ?? builtinFormatCode(fmtId);
        const numeric = type === 'n' && value !== null && value !== '';
        const isDate = numeric && isDateFormat(fmtId, numberFormat);
        const isTime = numeric && !isDate && isTimeFormat(fmtId, numberFormat);
        const { row, col } = parseRef(ref);
        cells.push({
          sheet: name,
          ref: makeRef(row, col),
          row,
          col,
          type,
          value,
          formula,
          numberFormat,
          isDate,
          isTime,
          displayText: isDate && numberFormat ? renderDateSerial(Number(value), numberFormat, date1904) : null,
        });
        nonEmpty += 1;
        if (nonEmpty > limits.maxNonEmptyCells) {
          throw new ImportError('TOO_MANY_CELLS', `The workbook has more than ${limits.maxNonEmptyCells.toLocaleString()} filled cells.`);
        }
      }
    }
    const mergeNode = find(kids(ws), 'mergeCells');
    const merges = mergeNode ? findAll(kids(mergeNode), 'mergeCell').map((m) => attr(m, 'ref') ?? '') : [];
    cells.sort((a, b) => a.row - b.row || a.col - b.col);
    sheets.push({ name, cells, byRef: new Map(cells.map((c) => [c.ref, c])), merges });
  }

  const partNames = [...archive.entries.keys()];
  return {
    date1904,
    sheets,
    // Macro and external-link parts are never executed or followed; they are only reported.
    hasMacros: partNames.some((p) => /vbaProject/i.test(p)) || /vbaProject/i.test(readPart(archive, '[Content_Types].xml') ?? ''),
    externalLinkCount: partNames.filter((p) => /^xl\/externalLinks\/externalLink\d+\.xml$/i.test(p)).length,
  };
}

/** Text of a cell for matching purposes: trimmed, whitespace collapsed. */
export function cellText(cell: Cell | undefined): string {
  return (cell?.value ?? '').replace(/\s+/g, ' ').trim();
}

export function norm(text: string): string {
  return text.toLowerCase().replace(/[:\s]+$/g, '').replace(/\s+/g, ' ').trim();
}

export { tagOf };
