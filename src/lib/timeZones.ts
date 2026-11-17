export type TimeZoneOption = { value: string; label: string; detail?: string };
let timeZoneCache: TimeZoneOption[] | null = null;

/** The browser's IANA zone, e.g. "America/Toronto". */
export const deviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** IANA zones with their current UTC offset, e.g. "America/Toronto" · "GMT-5". Built once per page load. */
export function timeZoneOptions(): TimeZoneOption[] {
  if (timeZoneCache) return timeZoneCache;
  const now = new Date();
  // Some browsers leave UTC out of the list; the database default is UTC, so it must stay selectable.
  const zones = Intl.supportedValuesOf('timeZone');
  timeZoneCache = (zones.includes('UTC') ? zones : [...zones, 'UTC']).map((zone) => {
    const offset = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'shortOffset' })
      .formatToParts(now)
      .find((p) => p.type === 'timeZoneName')?.value;
    return { value: zone, label: zone.replaceAll('_', ' '), ...(offset ? { detail: offset } : {}) };
  });
  return timeZoneCache;
}
