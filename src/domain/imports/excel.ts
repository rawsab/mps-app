/** Spreadsheet primitives: cell references, date systems, and number formats. Pure functions only. */

export function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

export function columnLetters(index: number): string {
  let s = '';
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(((n - 1) % 26) + 65) + s;
  return s;
}

export function parseRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)(\d+)$/i.exec(ref);
  if (!m) throw new Error(`Invalid cell reference ${ref}`);
  return { col: columnIndex(m[1]!), row: Number(m[2]) };
}

export function makeRef(row: number, col: number): string {
  return `${columnLetters(col)}${row}`;
}

const DAY_MS = 86_400_000;
const EPOCH_1900 = Date.UTC(1899, 11, 30); // accounts for Excel's fictitious 1900-02-29
const EPOCH_1904 = Date.UTC(1904, 0, 1);

/** Converts a date serial to ISO yyyy-mm-dd using the workbook's date system. */
export function serialToIsoDate(serial: number, date1904: boolean): string | null {
  if (!Number.isFinite(serial) || serial < 1) return null;
  if (!date1904 && serial < 61) return null; // ambiguous range around the 1900 leap-year bug
  const ms = (date1904 ? EPOCH_1904 : EPOCH_1900) + Math.floor(serial) * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Time-of-day from a day fraction (Excel stores times as fractions of 1,440 minutes). */
export function fractionToLocalTime(fraction: number): string | null {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction >= 1) return null;
  const totalMinutes = Math.round(fraction * 1440);
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Minutes between two local times; handles sessions that cross midnight (PRD §10 Duration). */
export function elapsedMinutes(start: string, end: string): number {
  const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const diff = toMin(end) - toMin(start);
  return diff >= 0 ? diff : diff + 1440;
}

export function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(`${isoDate}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const BUILTIN_DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 22, 27, 30, 36, 45, 46, 47, 50, 57]);
const BUILTIN_TIME_FORMAT_IDS = new Set([18, 19, 20, 21, 45, 46, 47]);
const BUILTIN_FORMATS: Record<number, string> = {
  14: 'm/d/yyyy', 15: 'd-mmm-yy', 16: 'd-mmm', 17: 'mmm-yy', 18: 'h:mm AM/PM', 19: 'h:mm:ss AM/PM',
  20: 'h:mm', 21: 'h:mm:ss', 22: 'm/d/yyyy h:mm', 45: 'mm:ss', 46: '[h]:mm:ss', 47: 'mm:ss.0', 49: '@',
};

export function builtinFormatCode(id: number): string | null {
  return BUILTIN_FORMATS[id] ?? null;
}

/** Strips quoted literals, escapes and [color]/[$-locale] sections before looking for date tokens. */
function formatTokens(code: string): string {
  return code.replace(/"[^"]*"/g, '').replace(/\\./g, '').replace(/\[(?!h\]|m\]|s\])[^\]]*\]/gi, '');
}

export function isDateFormat(id: number, code: string | null): boolean {
  if (BUILTIN_DATE_FORMAT_IDS.has(id) && !BUILTIN_TIME_FORMAT_IDS.has(id)) return true;
  if (!code || id < 164) return false;
  const t = formatTokens(code);
  return /[dy]/i.test(t) || (/m/i.test(t) && !/[hs]/i.test(t));
}

export function isTimeFormat(id: number, code: string | null): boolean {
  if (BUILTIN_TIME_FORMAT_IDS.has(id)) return true;
  if (!code || id < 164) return false;
  const t = formatTokens(code);
  return /[hs]/i.test(t) && !/[dy]/i.test(t);
}

/**
 * Renders a date serial the way a simple custom date format displays it, e.g. 46024 with `m-d`
 * shows "1-2". Supports the m/d/y tokens needed for evidence display, not full Excel formatting.
 */
export function renderDateSerial(serial: number, code: string, date1904: boolean): string | null {
  const iso = serialToIsoDate(serial, date1904);
  if (!iso) return null;
  const [y, mo, d] = iso.split('-').map(Number) as [number, number, number];
  const t = formatTokens(code);
  if (!/^[mdy\s/.\-]+$/i.test(t)) return null;
  return t.replace(/y+|m+|d+/gi, (tok) => {
    const k = tok[0]!.toLowerCase();
    if (k === 'y') return tok.length <= 2 ? String(y).slice(-2) : String(y);
    const v = k === 'm' ? mo : d;
    return tok.length >= 2 ? String(v).padStart(2, '0') : String(v);
  });
}
