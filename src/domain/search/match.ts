/**
 * Fuzzy matching for coach search (decision 0054). Small on purpose: the searchable set is a few
 * dozen destinations plus the coach's clients, scored on every keystroke.
 */

/** A matched span of the title, [start, end), for highlighting. */
export type Range = [start: number, end: number];

export type Match = { score: number; ranges: Range[] };

/** Words that carry no meaning in a query like "how do I change my time zone". */
const STOPWORDS = new Set(['a', 'an', 'the', 'my', 'me', 'i', 'to', 'for', 'of', 'in', 'on', 'at', 'and', 'or', 'how', 'do', 'does', 'where', 'is', 'are', 'can', 'what', 'which', 'with', 'want']);

/** Lower case without accents, one character for one, so positions still index the original title. */
export function fold(text: string) {
  let out = '';
  for (const char of text) {
    const folded = char.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    // Keep the length: a character that folds to several (or none) stays as itself.
    out += folded.length === char.length ? folded : char;
  }
  return out;
}

type Word = { text: string; start: number };

function words(folded: string): Word[] {
  return [...folded.matchAll(/[\p{L}\p{N}]+/gu)].map((m) => ({ text: m[0], start: m.index }));
}

export function queryTokens(query: string) {
  const tokens = words(fold(query)).map((w) => w.text);
  const meaningful = tokens.filter((t) => !STOPWORDS.has(t));
  return meaningful.length ? meaningful : tokens;
}

/** Edit distance with adjacent swaps (optimal string alignment), giving up past `max`. */
export function editDistance(a: string, b: string, max: number) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let d = Math.min(prev[j]! + 1, row[j - 1]! + 1, prev[j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d = Math.min(d, prev2[j - 2]! + 1);
      row.push(d);
      best = Math.min(best, d);
    }
    if (best > max) return max + 1;
    prev2 = prev;
    prev = row;
  }
  return prev[b.length]!;
}

const allowedTypos = (token: string) => (token.length >= 6 ? 2 : token.length >= 4 ? 1 : 0);

/**
 * How well one query token matches one text, best kind of match first. Mid-word and letters-in-order
 * matches are `loose`: allowed on titles, but too noisy on search terms ("gra" inside "program").
 */
function matchToken(token: string, folded: string, list: Word[], loose: boolean): Match | null {
  for (const w of list) if (w.text === token) return { score: 100, ranges: [[w.start, w.start + token.length]] };
  for (const w of list) if (w.text.startsWith(token)) return { score: 90, ranges: [[w.start, w.start + token.length]] };
  const at = loose && token.length >= 2 ? folded.indexOf(token) : -1;
  if (at >= 0) return { score: 60, ranges: [[at, at + token.length]] };
  const typos = allowedTypos(token);
  if (typos) {
    for (const w of list) {
      // The whole word ("calender"), or the start of it while still typing ("availabil").
      const whole = editDistance(token, w.text, typos);
      const start = w.text.length > token.length ? editDistance(token, w.text.slice(0, token.length), typos) : typos + 1;
      const distance = Math.min(whole, start);
      if (distance <= typos) return { score: 50 - 10 * distance, ranges: [[w.start, w.start + Math.min(w.text.length, token.length)]] };
    }
  }
  // Letters in order, starting at a word's first letter ("rsch" → reschedule).
  if (loose && token.length >= 3) {
    for (const w of list) {
      if (w.text[0] !== token[0]) continue;
      const ranges: Range[] = [];
      let i = w.start;
      for (const char of token) {
        i = folded.indexOf(char, i);
        if (i < 0) break;
        ranges.push([i, i + 1]);
        i++;
      }
      if (ranges.length === token.length) return { score: 25, ranges };
    }
  }
  return null;
}

function mergeRanges(ranges: Range[]): Range[] {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out.at(-1);
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1]);
    else out.push([r[0], r[1]]);
  }
  return out;
}

/** Search terms score a little below the title, so "Calendar" outranks a page that lists it as a synonym. */
const TERM_WEIGHT = 0.85;

/**
 * Scores a query against a title and its search terms. Every meaningful query word has to match the
 * title or a term; highlights only ever mark the title.
 */
export function matchEntry(query: string, title: string, terms: readonly string[] = []): Match | null {
  const tokens = queryTokens(query);
  if (!tokens.length) return null;
  const foldedTitle = fold(title);
  const titleWords = words(foldedTitle);
  const foldedTerms = terms.map((t) => { const f = fold(t); return { folded: f, list: words(f) }; });
  let total = 0;
  const ranges: Range[] = [];
  for (const token of tokens) {
    const inTitle = matchToken(token, foldedTitle, titleWords, true);
    let best = inTitle?.score ?? 0;
    for (const term of foldedTerms) {
      const m = matchToken(token, term.folded, term.list, false);
      if (m) best = Math.max(best, m.score * TERM_WEIGHT);
    }
    if (!best) return null;
    if (inTitle && inTitle.score >= best) ranges.push(...inTitle.ranges);
    total += best;
  }
  let score = total / tokens.length;
  const whole = fold(query.trim());
  if (foldedTitle === whole) score += 40;
  else if (foldedTitle.startsWith(whole)) score += 20;
  return { score, ranges: mergeRanges(ranges) };
}
