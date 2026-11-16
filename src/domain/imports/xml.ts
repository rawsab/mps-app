import { XMLParser } from 'fast-xml-parser';
import { ImportError } from './limits';

/** Ordered XML node as produced by fast-xml-parser with `preserveOrder`. */
export type XNode = { [tag: string]: XNode[] | string | Record<string, string> | undefined } & {
  ':@'?: Record<string, string>;
  '#text'?: string;
};

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: '',
  // Keep every value as the literal string from the file: "1-2" must never be coerced.
  parseTagValue: false,
  parseAttributeValue: false,
  trimValues: false,
  processEntities: true,
  htmlEntities: false,
});

/** OOXML parts never need a DOCTYPE; rejecting it blocks entity-expansion and external-entity tricks. */
export function parseXml(xml: string): XNode[] {
  if (/<!DOCTYPE/i.test(xml)) throw new ImportError('UNSAFE_XML', 'The file contains unsupported XML declarations.');
  try {
    return parser.parse(xml) as XNode[];
  } catch {
    throw new ImportError('CORRUPT', 'The file contains malformed XML.');
  }
}

export function tagOf(node: XNode): string | undefined {
  for (const key of Object.keys(node)) if (key !== ':@') return key;
  return undefined;
}

export function kids(node: XNode): XNode[] {
  const tag = tagOf(node);
  const value = tag ? node[tag] : undefined;
  return Array.isArray(value) ? value : [];
}

export function attr(node: XNode, name: string): string | undefined {
  return node[':@']?.[name];
}

export function find(nodes: XNode[], tag: string): XNode | undefined {
  return nodes.find((n) => tagOf(n) === tag);
}

export function findAll(nodes: XNode[], tag: string): XNode[] {
  return nodes.filter((n) => tagOf(n) === tag);
}

/** Depth-first path lookup: path(['worksheet', 'sheetData']) */
export function path(nodes: XNode[], tags: string[]): XNode | undefined {
  let current: XNode | undefined;
  let level = nodes;
  for (const tag of tags) {
    current = find(level, tag);
    if (!current) return undefined;
    level = kids(current);
  }
  return current;
}

/** Concatenates text inside every descendant element named `textTag` (e.g. `t` or `w:t`). */
export function textOf(node: XNode, textTag: string, skipTags: string[] = []): string {
  let out = '';
  const walk = (n: XNode, inText: boolean) => {
    const tag = tagOf(n);
    if (tag === '#text') {
      if (inText) out += String(n['#text'] ?? '');
      return;
    }
    if (tag && skipTags.includes(tag)) return;
    if (tag === 'w:tab' || tag === 'w:br') {
      if (textTag === 'w:t') out += tag === 'w:tab' ? '\t' : '\n';
      return;
    }
    for (const child of kids(n)) walk(child, inText || tag === textTag);
  };
  walk(node, false);
  return out;
}
