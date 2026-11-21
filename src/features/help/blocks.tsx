import type { ReactNode } from 'react';
import { InfoIcon } from '@/components/icons';

const CALLOUT_STYLES = {
  tip: 'border-gold/40 bg-gold/10',
  note: 'border-line bg-surface-raised',
  warning: 'border-danger/50 bg-danger/10',
};

const CALLOUT_LABELS = { tip: 'Tip', note: 'Note', warning: 'Important' };

/**
 * A boxed aside in a Help page. Styled like `Alert`, but static: Alert is a live region for messages
 * that appear, and this is page content.
 */
export function Callout({ tone = 'note', title, children }: { tone?: keyof typeof CALLOUT_STYLES; title?: string; children: ReactNode }) {
  return (
    <aside aria-label={title ?? CALLOUT_LABELS[tone]} className={`my-5 flex items-start gap-2.5 rounded-card border px-4 py-3 text-sm text-text ${CALLOUT_STYLES[tone]}`}>
      <span className={`mt-0.5 ${tone === 'warning' ? 'text-danger' : tone === 'tip' ? 'text-gold-fg' : 'text-muted'}`}><InfoIcon /></span>
      <div className="min-w-0 flex-1 [&>p]:my-0 [&>p+p]:mt-2">
        {title ? <p className="font-semibold">{title}</p> : null}
        {children}
      </div>
    </aside>
  );
}

const EXAMPLE_WIDTHS = { sm: 'max-w-sm', md: 'max-w-lg', full: 'max-w-none' };

/**
 * A live component shown on the gradient and grain backdrop (`.help-example`). Display-only unless
 * `interactive`, so a click never navigates or saves. Use fictional data only.
 */
export function Example({ caption, interactive = false, width = 'full', children }: {
  caption?: string; interactive?: boolean; width?: keyof typeof EXAMPLE_WIDTHS; children: ReactNode;
}) {
  return (
    <figure className="my-6">
      <div className="help-example rounded-card border border-line px-4 py-8 sm:px-8 sm:py-10">
        <div inert={!interactive} className={`mx-auto flex flex-wrap items-center justify-center gap-3 text-left ${EXAMPLE_WIDTHS[width]}`}>
          {children}
        </div>
      </div>
      {caption ? <figcaption className="mt-2 text-xs text-muted">{caption}</figcaption> : null}
    </figure>
  );
}
