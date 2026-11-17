/**
 * Resource text is plain text with optional pipe tables, so coaches can type a table into the
 * Text field:
 *
 *   | Soreness | 0 | 1 |
 *   |---|---|---|
 *   | 0 | Add 1–3 sets | Add 0–2 sets |
 *
 * A table needs a header line and a separator line. When its top-left cell names two axes,
 * "Soreness Score \ Performance Score", it is a matrix: rows by the first axis, columns by the
 * second. A line starting with "## " is a heading. Anything else stays text, unchanged.
 */
export type ResourceBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'text'; text: string }
  | { kind: 'table'; header: string[]; rows: string[][] }
  | { kind: 'matrix'; rowAxis: string; columnAxis: string; columns: string[]; rows: { label: string; cells: string[] }[] };

/** Matrix advice cells: adding sets reads as good, recovery or dropping volume as a warning. */
export function matrixTone(cell: string): 'good' | 'bad' | null {
  if (/^add\b/i.test(cell)) return 'good';
  if (/^(recovery|drop)\b/i.test(cell)) return 'bad';
  return null;
}

const isTableLine = (line: string) => line.trim().startsWith('|');
const isSeparator = (line: string) => /^\|?(\s*:?-+:?\s*\|)+\s*:?-*:?\s*$/.test(line.trim());

function cells(line: string): string[] {
  let t = line.trim();
  if (t.startsWith('|')) t = t.slice(1);
  if (t.endsWith('|')) t = t.slice(0, -1);
  return t.split('|').map((c) => c.trim());
}

export function parseResourceBody(body: string): ResourceBlock[] {
  const lines = body.split('\n');
  const blocks: ResourceBlock[] = [];
  let text: string[] = [];
  const flushText = () => {
    const joined = text.join('\n').replace(/^\n+|\n+$/g, '');
    if (joined.trim()) blocks.push({ kind: 'text', text: joined });
    text = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (isTableLine(line) && i + 1 < lines.length && isSeparator(lines[i + 1]!)) {
      const header = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && isTableLine(lines[i]!)) {
        const row = cells(lines[i]!);
        // Short rows are padded so every row has a cell per column; extra cells are kept.
        while (row.length < header.length) row.push('');
        rows.push(row);
        i++;
      }
      i--;
      flushText();
      const axes = header[0]!.split('\\').map((a) => a.trim());
      if (axes.length === 2 && axes[0] && axes[1]) {
        blocks.push({ kind: 'matrix', rowAxis: axes[0], columnAxis: axes[1], columns: header.slice(1), rows: rows.map(([label = '', ...cells]) => ({ label, cells })) });
      } else {
        blocks.push({ kind: 'table', header, rows });
      }
    } else if (/^##\s+\S/.test(line.trim())) {
      flushText();
      blocks.push({ kind: 'heading', text: line.trim().replace(/^##\s+/, '') });
    } else {
      text.push(line);
    }
  }
  flushText();
  return blocks;
}
