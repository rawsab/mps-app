import { HELP_PAGES } from '@/domain/help/pages';
import { extractSections, inlineShared, type HelpSection } from '@/domain/help/sections';

/** Page sources, read as text for search and the topic list. Part of the Help chunk only. */
const SOURCES = import.meta.glob<string>('./content/*.mdx', { query: '?raw', import: 'default', eager: true });
const SHARED = Object.fromEntries(Object.entries(import.meta.glob<string>('./content/shared/*.mdx', { query: '?raw', import: 'default', eager: true }))
  .map(([path, text]) => [path.replace(/^.*\/|\.mdx$/g, ''), text]));

export const SECTIONS: readonly HelpSection[] = HELP_PAGES.flatMap((page) =>
  extractSections(page.slug, page.title, inlineShared(SOURCES[`./content/${page.slug}.mdx`] ?? '', SHARED)));

/** Each page's headings, in page order. */
export const SECTIONS_BY_PAGE = new Map(HELP_PAGES.map((page) => [page.slug, SECTIONS.filter((s) => s.slug === page.slug)]));
