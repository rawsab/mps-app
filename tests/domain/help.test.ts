import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_PAGES } from '@/domain/help/pages';
import { extractSections, headingId, inlineShared, searchHelp, snippet } from '@/domain/help/sections';

const CONTENT = join(import.meta.dirname, '../../src/features/help/content');
const files = readdirSync(CONTENT).filter((f) => f.endsWith('.mdx'));
const SHARED = Object.fromEntries(readdirSync(join(CONTENT, 'shared')).filter((f) => f.endsWith('.mdx'))
  .map((f) => [f.replace(/\.mdx$/, ''), readFileSync(join(CONTENT, 'shared', f), 'utf8')]));
/** A page as search reads it, with shared text in place. */
const source = (slug: string) => inlineShared(readFileSync(join(CONTENT, `${slug}.mdx`), 'utf8'), SHARED);

describe('help pages', () => {
  it('has one file per manifest entry, and no others', () => {
    const slugs = HELP_PAGES.map((p) => p.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(files.map((f) => f.replace(/\.mdx$/, '')).sort()).toEqual([...slugs].sort());
  });

  it('follows the writing rules: no em or en dashes', () => {
    for (const page of HELP_PAGES) {
      const text = source(page.slug);
      expect(text, page.slug).not.toMatch(/[—–]/);
      expect(`${page.title} ${page.summary}`, page.slug).not.toMatch(/[—–]/);
    }
  });

  it('keeps shared text free of dashes too', () => {
    for (const [name, text] of Object.entries(SHARED)) expect(text, name).not.toMatch(/[—–]/);
  });

  it('counts shared headings as part of each page that includes them', () => {
    for (const slug of ['mesocycle', 'personal-training']) {
      expect(extractSections(slug, slug, source(slug)).map((s) => s.id), slug).toContain('writing-targets');
    }
  });

  it('gives every section a unique id within its page', () => {
    for (const page of HELP_PAGES) {
      const ids = extractSections(page.slug, page.title, source(page.slug)).map((s) => s.id);
      expect(ids.length, page.slug).toBeGreaterThan(0);
      expect(new Set(ids).size, page.slug).toBe(ids.length);
    }
  });
});

const SAMPLE = `import { Example } from '../blocks';

Intro text before any heading is not a section.

## Recording a payment

Select **Record payment** and enter the [amount](/coach/billing).

<Example caption="The payment dialog">
  <Button>Record payment</Button>
</Example>

### Credits

- Leftover money becomes credit.
- A \`$0\` price is complimentary.

## Prices

| Kind | Price |
| --- | --- |
| Session | Set by staff |
`;

describe('extractSections', () => {
  const sections = extractSections('billing', 'Billing', SAMPLE);

  it('splits at h2 and h3, with the parent heading in the trail', () => {
    expect(sections.map((s) => [s.id, s.title, s.level, s.trail])).toEqual([
      ['recording-a-payment', 'Recording a payment', 2, 'Billing'],
      ['credits', 'Credits', 3, 'Billing › Recording a payment'],
      ['prices', 'Prices', 2, 'Billing'],
    ]);
  });

  it('keeps words and captions, and drops Markdown and JSX', () => {
    expect(sections[0]!.text).toBe('Select Record payment and enter the amount. The payment dialog Record payment');
    expect(sections[1]!.text).toBe('Leftover money becomes credit. A $0 price is complimentary.');
    expect(sections[2]!.text).toBe('Kind Price Session Set by staff');
  });

  it('makes the same ids as the rendered headings', () => {
    expect(headingId('Time off and extra hours')).toBe('time-off-and-extra-hours');
    expect(headingId('Writing targets')).toBe('writing-targets');
    expect(headingId("When a client says they've paid")).toBe('when-a-client-says-they-ve-paid');
  });
});

describe('inlineShared', () => {
  it('replaces the shared tag with its text, leaving other lines alone', () => {
    const page = "import Editor from './shared/editor.mdx';\n\n## Mine\n\n<Editor components={props.components} />\n\n<Example />";
    expect(inlineShared(page, { editor: '## Shared' })).toBe("import Editor from './shared/editor.mdx';\n\n## Mine\n\n## Shared\n\n<Example />");
  });
});

describe('searchHelp', () => {
  const sections = [
    ...extractSections('billing', 'Billing', SAMPLE),
    { slug: 'meetings', id: 'recording-attendance', title: 'Recording attendance', level: 2 as const, trail: 'Meetings', text: 'Mark each past meeting.' },
  ];

  it('ranks a title match above a body match', () => {
    const results = searchHelp(sections, 'credit');
    expect(results.map((r) => r.id)).toEqual(['credits']);
    expect(searchHelp(sections, 'complimentary').map((r) => r.id)).toEqual(['credits']);
    expect(searchHelp(sections, 'payment')[0]?.id).toBe('recording-a-payment');
  });

  it('links to the heading on its page', () => {
    expect(searchHelp(sections, 'attendance')[0]?.to).toBe('/coach/help/meetings#recording-attendance');
  });

  it('finds nothing for an empty query', () => {
    expect(searchHelp(sections, '  ')).toEqual([]);
  });

  it('marks the matched word in the snippet', () => {
    const result = snippet('Leftover money becomes credit.', 'credit');
    expect(result).not.toBeNull();
    const [start, end] = result!.ranges[0]!;
    expect(result!.text.slice(start, end)).toBe('credit');
  });

  it('finds every real section by its own title', () => {
    const all = HELP_PAGES.flatMap((p) => extractSections(p.slug, p.title, source(p.slug)));
    for (const s of all) expect(searchHelp(all, s.title, 50).some((r) => r.slug === s.slug && r.id === s.id), `${s.slug}#${s.id}`).toBe(true);
  });
});
