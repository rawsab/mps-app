/**
 * Builds small synthetic .xlsx/.docx files in memory so layout variations can be tested without
 * real client files (NFR-07). Only the OOXML parts the importer reads are generated.
 */
import { strToU8, zipSync } from 'fflate';

export type XCell = string | number | { n: number; style: 'date' | 'time' } | { f: string; v?: number };
export type XSheet = { name: string; cells: Record<string, XCell>; merges?: string[] };

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function cellXml(ref: string, cell: XCell): string {
  if (typeof cell === 'string') return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${esc(cell)}</t></is></c>`;
  if (typeof cell === 'number') return `<c r="${ref}"><v>${cell}</v></c>`;
  if ('f' in cell) return `<c r="${ref}"><f>${esc(cell.f)}</f>${cell.v !== undefined ? `<v>${cell.v}</v>` : ''}</c>`;
  return `<c r="${ref}" s="${cell.style === 'date' ? 1 : 2}"><v>${cell.n}</v></c>`;
}

function sheetXml(sheet: XSheet): string {
  const rows = new Map<number, string[]>();
  const sorted = Object.entries(sheet.cells).sort(([a], [b]) => {
    const pa = /([A-Z]+)(\d+)/.exec(a)!;
    const pb = /([A-Z]+)(\d+)/.exec(b)!;
    return Number(pa[2]) - Number(pb[2]) || pa[1]!.length - pb[1]!.length || pa[1]!.localeCompare(pb[1]!);
  });
  for (const [ref, cell] of sorted) {
    const row = Number(/\d+/.exec(ref)![0]);
    rows.set(row, [...(rows.get(row) ?? []), cellXml(ref, cell)]);
  }
  const data = [...rows.entries()].map(([r, cells]) => `<row r="${r}">${cells.join('')}</row>`).join('');
  const merges = sheet.merges?.length
    ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`
    : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${data}</sheetData>${merges}</worksheet>`;
}

export function buildXlsx(sheets: XSheet[], options: { date1904?: boolean; extraParts?: Record<string, string> } = {}): Uint8Array {
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    '_rels/.rels': strToU8('<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"/>'),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr${options.date1904 ? ' date1904="1"' : ''}/><sheets>${sheets
        .map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
        .map((_, i) => `<Relationship Id="rId${i + 1}" Type="worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
        .join('')}</Relationships>`,
    ),
    'xl/styles.xml': strToU8(
      '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="m-d"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="164"/><xf numFmtId="20"/></cellXfs></styleSheet>',
    ),
  };
  sheets.forEach((s, i) => (files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(s))));
  for (const [path, xml] of Object.entries(options.extraParts ?? {})) files[path] = strToU8(xml);
  return zipSync(files);
}

export type DocBlock = { p: string } | { table: string[][] };

export function buildDocx(blocks: DocBlock[], header?: string): Uint8Array {
  const para = (t: string) => `<w:p><w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r></w:p>`;
  const body = blocks
    .map((b) =>
      'p' in b
        ? para(b.p)
        : `<w:tbl>${b.table.map((row) => `<w:tr>${row.map((c) => `<w:tc>${para(c)}</w:tc>`).join('')}</w:tr>`).join('')}</w:tbl>`,
    )
    .join('');
  const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>'),
    'word/document.xml': strToU8(`<?xml version="1.0"?><w:document ${ns}><w:body>${body}</w:body></w:document>`),
  };
  if (header) files['word/header1.xml'] = strToU8(`<?xml version="1.0"?><w:hdr ${ns}>${para(header)}</w:hdr>`);
  return zipSync(files);
}

/** A synthetic mesocycle day block. `origin` shifts the whole block to test moved/inserted layouts. */
export function mesocycleDay(opts: {
  originRow: number;
  originCol?: string;
  title: string;
  insertTempo?: boolean;
  rows: { name: string; rir: XCell; sets: [string | number, string | number][]; tempo?: string }[];
  blankRowsAfterHeader?: number;
}): Record<string, XCell> {
  const cols = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const base = cols.indexOf(opts.originCol ?? 'B');
  const col = (i: number) => cols[base + i]!;
  const cells: Record<string, XCell> = {};
  const r0 = opts.originRow;
  cells[`${col(0)}${r0}`] = opts.title;
  const headers = ['Exercise', ...(opts.insertTempo ? ['Tempo'] : []), 'RIR Goal', 'Weight', 'Reps', 'Weight', 'Reps', 'Weight', 'Reps'];
  headers.forEach((h, i) => (cells[`${col(i)}${r0 + 1}`] = h));
  let r = r0 + 2 + (opts.blankRowsAfterHeader ?? 0);
  for (const row of opts.rows) {
    let c = 0;
    cells[`${col(c++)}${r}`] = row.name;
    if (opts.insertTempo) {
      if (row.tempo) cells[`${col(c)}${r}`] = row.tempo;
      c++;
    }
    cells[`${col(c++)}${r}`] = row.rir;
    for (const [w, reps] of row.sets) {
      cells[`${col(c++)}${r}`] = typeof w === 'number' ? String(w) : w;
      cells[`${col(c++)}${r}`] = typeof reps === 'number' ? String(reps) : reps;
    }
    r++;
  }
  cells[`${col(0)}${r + 1}`] = 'Time Started/Ended:';
  cells[`${col(1)}${r + 1}`] = { n: 0.75, style: 'time' };
  cells[`${col(2)}${r + 1}`] = { n: 0.8, style: 'time' };
  return cells;
}
