import { Children, isValidElement, type ComponentProps, type ReactNode } from 'react';
import { Link } from 'react-router';
import type { MDXComponents } from 'mdx/types';
import { headingId } from '@/domain/help/sections';

/** A heading's text, for its `id`. Help search builds the same id from the page source. */
function textOf(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => (typeof child === 'string' || typeof child === 'number' ? String(child) : isValidElement<{ children?: ReactNode }>(child) ? textOf(child.props.children) : ''))
    .join('');
}

function HelpLink({ href = '', children }: ComponentProps<'a'>) {
  if (href.startsWith('/')) return <Link to={href} className="link text-gold-fg">{children}</Link>;
  return <a href={href} target="_blank" rel="noreferrer" className="link text-gold-fg">{children}</a>;
}

/**
 * Markdown elements in Help pages, in the app's type and tokens (decision 0057). Body text is a
 * little softer than headings, bold words and table headers, so those stand out.
 */
export const mdxComponents: MDXComponents = {
  h2: ({ children }) => <h2 id={headingId(textOf(children))} className="mb-3 mt-10 scroll-mt-24 text-xl font-semibold tracking-[-0.01em] text-text first:mt-0">{children}</h2>,
  h3: ({ children }) => <h3 id={headingId(textOf(children))} className="mb-2 mt-7 scroll-mt-24 text-base font-semibold text-text">{children}</h3>,
  p: ({ children }) => <p className="my-3 text-[0.9375rem] leading-7 text-text/80">{children}</p>,
  ul: ({ children }) => <ul className="my-3 flex list-disc flex-col gap-1.5 pl-5 text-[0.9375rem] leading-7 text-text/80 marker:text-gold-fg">{children}</ul>,
  ol: ({ children }) => <ol className="my-3 flex list-decimal flex-col gap-1.5 pl-5 text-[0.9375rem] leading-7 text-text/80 marker:font-semibold marker:text-gold-fg">{children}</ol>,
  li: ({ children }) => <li className="pl-1 [&>p]:my-0">{children}</li>,
  a: HelpLink,
  strong: ({ children }) => <strong className="font-semibold text-text">{children}</strong>,
  code: ({ children }) => <code className="rounded-[4px] border border-line bg-surface-raised px-1 py-px text-[0.85em]">{children}</code>,
  hr: () => <hr className="my-8 border-line" />,
  table: ({ children }) => (
    <div className="my-4 overflow-x-auto rounded-card border border-line">
      <table className="w-full border-collapse text-left text-sm">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border-b border-line bg-surface-raised px-3 py-2 font-medium text-text">{children}</th>,
  td: ({ children }) => <td className="border-b border-line px-3 py-2 align-top text-text/80 [tr:last-child>&]:border-b-0">{children}</td>,
};
