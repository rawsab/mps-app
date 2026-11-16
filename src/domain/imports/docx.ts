import { readPart, type Archive } from './archive';
import { ImportError } from './limits';
import { attr, find, findAll, kids, parseXml, path, tagOf, textOf, type XNode } from './xml';

export type DocParagraph = { kind: 'paragraph'; index: number; style: string | null; text: string };
export type DocTable = { kind: 'table'; index: number; rows: { cells: { text: string; span: number }[] }[] };
export type DocBlock = DocParagraph | DocTable;
export type HeaderFooterText = { part: string; paragraph: number; text: string };

export type WordDocument = {
  blocks: DocBlock[];
  headersFooters: HeaderFooterText[];
  hasMacros: boolean;
};

function paragraphText(p: XNode): string {
  return textOf(p, 'w:t').replace(/ /g, ' ');
}

/** Reads body paragraphs and tables in document order, plus header/footer text. */
export function readDocument(archive: Archive): WordDocument {
  const xml = readPart(archive, 'word/document.xml')!;
  const body = path(parseXml(xml), ['w:document', 'w:body']);
  if (!body) throw new ImportError('CORRUPT', 'The document body is missing.');

  const blocks: DocBlock[] = [];
  let paragraphIndex = 0;
  let tableIndex = 0;
  for (const node of kids(body)) {
    const tag = tagOf(node);
    if (tag === 'w:p') {
      const pPr = find(kids(node), 'w:pPr');
      const pStyle = pPr ? find(kids(pPr), 'w:pStyle') : undefined;
      blocks.push({ kind: 'paragraph', index: paragraphIndex++, style: pStyle ? attr(pStyle, 'w:val') ?? null : null, text: paragraphText(node) });
    } else if (tag === 'w:tbl') {
      const rows = findAll(kids(node), 'w:tr').map((tr) => ({
        cells: findAll(kids(tr), 'w:tc').map((tc) => {
          const tcPr = find(kids(tc), 'w:tcPr');
          const span = tcPr ? find(kids(tcPr), 'w:gridSpan') : undefined;
          const text = findAll(kids(tc), 'w:p').map(paragraphText).join('\n');
          return { text, span: span ? Number(attr(span, 'w:val') ?? 1) : 1 };
        }),
      }));
      blocks.push({ kind: 'table', index: tableIndex++, rows });
    }
  }

  const headersFooters: HeaderFooterText[] = [];
  for (const part of [...archive.entries.keys()].filter((p) => /^word\/(header|footer)\d*\.xml$/.test(p)).sort()) {
    const root = parseXml(readPart(archive, part)!);
    const container = find(root, 'w:hdr') ?? find(root, 'w:ftr');
    if (!container) continue;
    findAll(kids(container), 'w:p').forEach((p, i) => {
      const text = paragraphText(p);
      if (text.trim()) headersFooters.push({ part: part.replace('word/', ''), paragraph: i, text });
    });
  }

  return {
    blocks,
    headersFooters,
    hasMacros: [...archive.entries.keys()].some((p) => /vbaProject/i.test(p)),
  };
}
