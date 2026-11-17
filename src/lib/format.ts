const DATE = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
const DATE_ONLY = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

/**
 * One date style across the app ("Nov 16, 2026"). A calendar date (yyyy-mm-dd) is formatted in UTC
 * so it never shifts a day in the viewer's time zone; a timestamp uses the viewer's zone.
 */
export function formatDate(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? DATE_ONLY.format(new Date(`${value}T00:00:00Z`)) : DATE.format(new Date(value));
}

const DATE_TIME = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

/** A timestamp with its time in the viewer's zone ("Nov 16, 2026, 3:42 PM"). */
export function formatDateTime(value: string): string {
  return DATE_TIME.format(new Date(value));
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
