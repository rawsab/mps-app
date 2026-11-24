import { strToU8, zipSync } from 'fflate';

/** One worksheet: rows of plain text. The first row is drawn bold as a header when `header` is set. */
export type XlsxSheet = { name: string; rows: readonly (readonly string[])[]; header?: boolean };

/**
 * Writes a minimal .xlsx workbook (decision 0062). Every cell is an inline string, so nothing is
 * ever read as a number, date or formula: a cell starting with "=" stays text. DOM-free.
 */
export function writeXlsx(sheets: readonly XlsxSheet[]): Uint8Array {
  const names = sheetNames(sheets.map((sheet) => sheet.name));
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(xml(`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('\n')}
</Types>`)),
    '_rels/.rels': strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`)),
    'xl/workbook.xml': strToU8(xml(`<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${names.map((name, i) => `<sheet name="${escape(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets>
</workbook>`)),
    'xl/_rels/workbook.xml.rels': strToU8(xml(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('\n')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`)),
    // Style 0 is normal text, wrapped at the top; style 1 adds bold for header rows.
    'xl/styles.xml': strToU8(xml(`<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs>
</styleSheet>`)),
  };
  sheets.forEach((sheet, i) => { files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(worksheet(sheet)); });
  return zipSync(files);
}

function worksheet(sheet: XlsxSheet): string {
  const width = Math.max(0, ...sheet.rows.map((row) => row.length));
  const cols = Array.from({ length: width }, (_, c) => {
    const longest = Math.max(4, ...sheet.rows.map((row) => Math.max(...(row[c] ?? '').split('\n').map((line) => line.length))));
    return `<col min="${c + 1}" max="${c + 1}" width="${Math.min(60, longest + 2)}" customWidth="1"/>`;
  }).join('');
  const rows = sheet.rows.map((row, r) => {
    const style = sheet.header && r === 0 ? ' s="1"' : '';
    const cells = row.map((text, c) => text === '' ? '' : `<c r="${column(c)}${r + 1}" t="inlineStr"${style}><is><t xml:space="preserve">${escape(text)}</t></is></c>`).join('');
    return `<row r="${r + 1}">${cells}</row>`;
  }).join('');
  const freeze = sheet.header && sheet.rows.length > 1
    ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '';
  return xml(`<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}${cols ? `<cols>${cols}</cols>` : ''}<sheetData>${rows}</sheetData></worksheet>`);
}

/** Excel's sheet name rules: 1 to 31 characters, none of : \ / ? * [ ], unique ignoring case. */
export function sheetNames(names: readonly string[]): string[] {
  const used = new Set<string>();
  return names.map((name, i) => {
    const base = name.replace(/[:\\/?*[\]]/g, ' ').replace(/^'+|'+$/g, '').trim().slice(0, 31) || `Sheet ${i + 1}`;
    let candidate = base;
    for (let n = 2; used.has(candidate.toLowerCase()); n++) candidate = `${base.slice(0, 31 - ` (${n})`.length)} (${n})`;
    used.add(candidate.toLowerCase());
    return candidate;
  });
}

const xml = (body: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${body}`;

const column = (index: number): string => {
  let name = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) name = String.fromCharCode(65 + ((n - 1) % 26)) + name;
  return name;
};

// XML 1.0 can't carry most control characters, so they're dropped rather than escaped.
const escape = (text: string) => text
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
