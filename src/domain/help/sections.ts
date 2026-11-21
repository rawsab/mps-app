import { fold, matchEntry, queryTokens, type Range } from '@/domain/search/match';
import { HELP_PAGES, helpPath } from './pages';

/**
 * Help search (decision 0057): every `##` and `###` heading in a Help page is a section, searched by
 * its title and the words under it. DOM-free so it runs in Node tests.
 */
export type HelpSection = {
  slug: string;
  /** The heading's `id`, the same one `headingId` gives the rendered heading. */
  id: string;
  title: string;
  /** 2 for `##`, 3 for `###`. */
  level: 2 | 3;
  /** The page, plus the parent heading for a `###` ("Billing › Payments"). */
  trail: string;
  /** The section's words, without Markdown or JSX. */
  text: string;
};

export type HelpResult = HelpSection & { to: string; score: number; ranges: Range[]; snippet: { text: string; ranges: Range[] } | null };

/** A heading's anchor: lower case words joined by hyphens ("Record a payment" → `record-a-payment`). */
export function headingId(text: string) {
  return fold(text).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '');
}

/** Inline Markdown down to its words: links keep their text, emphasis and code marks go. */
function plainInline(text: string) {
  return text
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

/** A block of MDX down to plain words. A tag's `title` or `caption` is kept, as it's shown on the page. */
function plainBlock(lines: string[]) {
  return lines
    .join('\n')
    .replace(/<[A-Za-z][^>]*?\b(?:title|caption)="([^"]*)"[^>]*>/g, ' $1 ')
    .replace(/<\/?[A-Za-z][^>]*>/g, ' ')
    .replace(/\{[^{}]*\}/g, ' ')
    .split('\n')
    .map((line) => plainInline(line.replace(/^\s*(?:[-*+]|\d+\.|>|\|)\s*/, '').replace(/\s*\|\s*/g, ' ').replace(/^[-:\s]+$/, '')))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Puts shared text in place (`import X from './shared/name.mdx'`, then `<X ... />` on its own line),
 * so its headings count as the page's own for search and the topic list. `shared` is keyed by name.
 */
export function inlineShared(raw: string, shared: Readonly<Record<string, string>>) {
  const names = new Map<string, string>();
  for (const m of raw.matchAll(/^import\s+(\w+)\s+from\s+'\.\/shared\/([\w-]+)\.mdx';?\s*$/gm)) names.set(m[1]!, m[2]!);
  if (!names.size) return raw;
  return raw
    .split('\n')
    .map((line) => {
      const tag = /^\s*<(\w+)\b[^>]*\/>\s*$/.exec(line);
      const name = tag ? names.get(tag[1]!) : undefined;
      return name === undefined ? line : (shared[name] ?? '');
    })
    .join('\n');
}

export function extractSections(slug: string, pageTitle: string, raw: string): HelpSection[] {
  const sections: HelpSection[] = [];
  let parent: string | null = null;
  let current: { level: number; title: string; lines: string[] } | null = null;
  let fenced = false;
  const close = () => {
    if (!current) return;
    sections.push({
      slug,
      id: headingId(current.title),
      title: current.title,
      level: current.level === 3 ? 3 : 2,
      trail: current.level === 3 && parent ? `${pageTitle} › ${parent}` : pageTitle,
      text: plainBlock(current.lines),
    });
  };
  for (const line of raw.split('\n')) {
    if (line.startsWith('```')) fenced = !fenced;
    const heading = fenced ? null : /^(#{2,3})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      close();
      const level = heading[1]!.length;
      const title = plainInline(heading[2]!);
      if (level === 2) parent = title;
      current = { level, title, lines: [] };
    } else if (current && !/^(import|export)\s/.test(line)) {
      current.lines.push(line);
    }
  }
  close();
  return sections;
}

const SNIPPET_BEFORE = 40;
const SNIPPET_LENGTH = 140;

/** A short piece of the text around the first word a query token starts, with that word marked. */
export function snippet(text: string, query: string): HelpResult['snippet'] {
  const folded = fold(text);
  const tokens = queryTokens(query);
  let at = -1;
  let length = 0;
  for (const token of tokens) {
    const match = new RegExp(`(?:^|[^\\p{L}\\p{N}])(${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'u').exec(folded);
    if (match && (at < 0 || match.index < at)) {
      at = match.index + match[0].length - match[1]!.length;
      length = token.length;
    }
  }
  if (at < 0) return null;
  let start = Math.max(0, at - SNIPPET_BEFORE);
  // Start on a word.
  if (start > 0) start = text.indexOf(' ', start) + 1 || start;
  const end = Math.min(text.length, start + SNIPPET_LENGTH);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < text.length ? '…' : '';
  const offset = prefix.length - start;
  return { text: `${prefix}${text.slice(start, end)}${suffix}`, ranges: [[at + offset, at + length + offset]] };
}

const RESULT_LIMIT = 8;

/** Sections ranked for a query, title matches first (body words score as search terms). */
export function searchHelp(sections: readonly HelpSection[], query: string, limit = RESULT_LIMIT): HelpResult[] {
  if (!query.trim()) return [];
  const order = new Map(HELP_PAGES.map((p, i) => [p.slug, i]));
  const results: (HelpResult & { index: number })[] = [];
  sections.forEach((section, index) => {
    const match = matchEntry(query, section.title, [section.trail, section.text]);
    if (!match) return;
    results.push({ ...section, to: `${helpPath(section.slug)}#${section.id}`, score: match.score, ranges: match.ranges, snippet: snippet(section.text, query), index });
  });
  results.sort((a, b) => b.score - a.score || (order.get(a.slug) ?? 0) - (order.get(b.slug) ?? 0) || a.index - b.index);
  return results.slice(0, limit).map(({ index: _index, ...result }) => result);
}
