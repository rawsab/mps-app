// Money is integer cents, CAD, before tax (decision 0053). Never a float in storage or arithmetic.

const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD', currencyDisplay: 'narrowSymbol' });
const cadWhole = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
  currencyDisplay: 'narrowSymbol',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** `$100`, `$85.50`, `−$100` (a real minus sign, for discounts and credit). */
export function formatCents(cents: number): string {
  const text = (cents % 100 === 0 ? cadWhole : cad).format(Math.abs(cents) / 100);
  return cents < 0 ? `−${text}` : text;
}

export const MAX_CENTS = 10_000_000;

/**
 * Parses a dollar amount typed by a coach: `100`, `$85.5`, `1,200.00`. Returns cents, or null when the text
 * isn't an amount (blank, negative, more than two decimals, over the limit). Blank is null, never zero.
 */
export function parseDollars(text: string): number | null {
  const cleaned = text.trim().replace(/^\$/, '').replace(/,/g, '').trim();
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(cleaned);
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] ?? '').padEnd(2, '0'));
  return Number.isSafeInteger(cents) && cents <= MAX_CENTS ? cents : null;
}

/** For an input's initial value: `100`, `85.50`. */
export const centsToInput = (cents: number | null) =>
  cents === null ? '' : cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
