import type { ReactNode } from 'react';
import type { Range } from '@/domain/search/match';

/** Text with its matched spans in gold, for search results. */
export function Highlighted({ text, ranges }: { text: string; ranges: Range[] }) {
  if (!ranges.length) return text;
  const parts: ReactNode[] = [];
  let at = 0;
  for (const [start, end] of ranges) {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={start} className="bg-transparent font-semibold text-gold-fg">{text.slice(start, end)}</mark>);
    at = end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}
