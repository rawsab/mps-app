import { useEffect, useState, type ReactNode } from 'react';
import { Card } from './ui';

/*
 * Loading placeholders in the shape of the content (decision 0056). A skeleton stands in for data
 * only on its first load; refetches keep the old content. Headings and actions that don't depend on
 * the data render for real, so only the data parts are placeholders.
 */

/** Loads faster than this show nothing, instead of a skeleton that flashes. */
export const SKELETON_DELAY_MS = 150;

const SHAPES = { block: 'rounded-card', text: 'rounded-[3px]', round: 'rounded-full' };

/** One placeholder block. Size it with `className`; `text` is a line of text, `round` an avatar or pill. */
export function Skeleton({ shape = 'block', className = '' }: { shape?: keyof typeof SHAPES; className?: string }) {
  return <span aria-hidden className={`block animate-pulse bg-surface-raised motion-reduce:animate-none ${SHAPES[shape]} ${className}`} />;
}

/** Line box and bar height for each text size: the bar is about the letters' height, the rest is the gap between lines. */
const TEXT_SIZES = {
  xs: ['h-4', 'h-2.5'],
  sm: ['h-5', 'h-3'],
  base: ['h-6', 'h-3.5'],
  lg: ['h-7', 'h-4'],
  // text-2xl, leading-tight.
  xl: ['h-[1.875rem]', 'h-5'],
  // The PageHeader title.
  title: ['h-[2.1875rem] sm:h-10', 'h-6 sm:h-7'],
} as const;

export type SkeletonTextSize = keyof typeof TEXT_SIZES;

/**
 * Lines of text as bars, as tall as the real text so nothing moves when it arrives. Every line but
 * the last is full width; `width` sets the last one (or the only one).
 */
export function SkeletonText({ lines = 1, size = 'sm', width = lines > 1 ? 'w-3/5' : 'w-1/2', className = '' }: {
  lines?: number; size?: SkeletonTextSize; width?: string; className?: string;
}) {
  const [line, bar] = TEXT_SIZES[size];
  return (
    <span aria-hidden className={`block ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <span key={i} className={`flex ${line} items-center`}>
          <Skeleton shape="text" className={`${bar} max-w-full ${i === lines - 1 ? width : 'w-full'}`} />
        </span>
      ))}
    </span>
  );
}

function useDelayed(ms: number) {
  const [shown, setShown] = useState(ms <= 0);
  useEffect(() => {
    if (ms <= 0) return;
    const timer = window.setTimeout(() => setShown(true), ms);
    return () => window.clearTimeout(timer);
  }, [ms]);
  return shown;
}

/**
 * Wraps a skeleton: announces `label` to screen readers straight away and shows the placeholders
 * after SKELETON_DELAY_MS. `className` lays out the placeholders (grid, gaps, margin).
 */
export function LoadingRegion({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const shown = useDelayed(SKELETON_DELAY_MS);
  return (
    <div role="status" className="min-w-0">
      <span className="sr-only">{label}</span>
      {shown ? <div aria-hidden className={`skeleton-enter ${className}`}>{children}</div> : null}
    </div>
  );
}

/** PageHeader's shape: title, optional subtitle, avatar and action. */
export function SkeletonHeader({ titleWidth = 'w-48', subtitle = false, avatar = false, action = false }: {
  titleWidth?: string; subtitle?: boolean; avatar?: boolean; action?: boolean;
}) {
  return (
    <div className="mb-6 flex min-h-11 flex-wrap items-end justify-between gap-3">
      <div className="flex min-w-0 flex-1 items-center gap-4">
        {avatar ? <Skeleton shape="round" className="size-14 shrink-0 sm:size-16" /> : null}
        <div className="min-w-0 flex-1">
          <SkeletonText size="title" width={titleWidth} />
          {subtitle ? <SkeletonText width="w-40" className="mt-1" /> : null}
        </div>
      </div>
      {action ? <Skeleton className="h-11 w-28" /> : null}
    </div>
  );
}

/** Varied widths so a stack of rows reads as different items. */
const TITLE_WIDTHS = ['w-32', 'w-24', 'w-40', 'w-28'];
const DETAIL_WIDTHS = ['w-48', 'w-36', 'w-44', 'w-40'];

const ROW_SIZES = {
  // Meeting rows.
  sm: 'min-h-11 items-center py-2 pl-2',
  // Activity and note rows.
  md: 'min-h-14 items-start py-3 pl-3',
  // Program rows: icon, title, details.
  lg: 'min-h-16 items-center py-3 pl-2',
};

/**
 * List rows: a title over a detail line, with an optional avatar (or icon), gold-bar slot or check
 * circle in front. `size` matches the row's real min-height.
 */
export function SkeletonRows({ count = 3, leading = 'none', size = 'md', divided = false, detail = true }: {
  count?: number; leading?: 'none' | 'avatar' | 'bar' | 'check'; size?: keyof typeof ROW_SIZES; divided?: boolean; detail?: boolean;
}) {
  return (
    <ul className={divided ? 'divide-y divide-line' : ''}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={`flex min-w-0 gap-3 pr-2 ${ROW_SIZES[size]}`}>
          {leading === 'avatar' ? <Skeleton shape="round" className="size-9 shrink-0" /> : null}
          {leading === 'bar' ? <span className="w-1 shrink-0 self-stretch rounded-full bg-line" /> : null}
          {leading === 'check' ? <span className="m-0.5 size-4 shrink-0 self-center rounded-full border-2 border-line" /> : null}
          <span className="min-w-0 flex-1">
            <SkeletonText size={size === 'lg' ? 'base' : 'sm'} width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} />
            {detail ? <SkeletonText size="xs" width={DETAIL_WIDTHS[i % DETAIL_WIDTHS.length]} /> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** A Card with an optional heading line and some lines of text; pass `children` for anything else inside it. */
export function SkeletonCard({ heading = true, lines = 2, padding = 'md', className = '', children }: {
  heading?: boolean; lines?: number; padding?: 'sm' | 'md'; className?: string; children?: ReactNode;
}) {
  return (
    <Card as="div" padding={padding} className={className}>
      {heading ? <SkeletonText size="base" width="w-36" className="mb-2" /> : null}
      {lines ? <SkeletonText lines={lines} /> : null}
      {children}
    </Card>
  );
}

/**
 * A spreadsheet or program view's shape: a toolbar, then a header row and a few rows. Deliberately
 * not a full grid, which would only look busy.
 */
export function SkeletonTable({ rows = 6, toolbar = true }: { rows?: number; toolbar?: boolean }) {
  return (
    <div className="grid gap-3">
      {toolbar ? (
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-11 w-48" />
          <Skeleton className="h-11 w-28" />
        </div>
      ) : null}
      <div className="overflow-hidden rounded-card border border-line">
        <div className="border-b border-line bg-surface px-3 py-2.5"><SkeletonText size="xs" width="w-2/5" /></div>
        <div className="divide-y divide-line">
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className="flex items-center gap-4 px-3 py-2.5">
              <SkeletonText width={TITLE_WIDTHS[i % TITLE_WIDTHS.length]} className="w-40 shrink-0" />
              <SkeletonText width="w-full" className="flex-1" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
