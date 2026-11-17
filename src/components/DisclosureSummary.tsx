import type { ComponentPropsWithoutRef } from 'react';
import { ChevronIcon } from './icons';

/** Native details behavior with one shared, animated indicator. */
export function DisclosureSummary({ children, className = '', ...props }: ComponentPropsWithoutRef<'summary'>) {
  return <summary {...props} className={`disclosure-summary ${className}`}>
    <span aria-hidden className="disclosure-chevron"><ChevronIcon open={false} /></span>
    {children}
  </summary>;
}
