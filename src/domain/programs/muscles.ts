import type { ProgramDraft } from './contract';

/**
 * Muscle groups on exercises (decision 0021). Names are free text, matched case-insensitively,
 * so "glutes" and "Glutes" count toward one muscle. The coach's first spelling in a week wins.
 */

export const muscleKey = (name: string) => name.trim().replace(/\s+/g, ' ').toLowerCase();

export const formatMuscles = (muscles: readonly string[]) => muscles.join(', ');

export type MuscleParse = { ok: true; muscles: string[] } | { ok: false; message: string };

/**
 * Parses "Quads, glutes" into names. Each name takes the spelling of a matching `known` name, and
 * duplicates collapse.
 */
export function parseMuscles(text: string, known: readonly string[] = []): MuscleParse {
  const canonical = new Map(known.map((name) => [muscleKey(name), name]));
  const muscles: string[] = [];
  const seen = new Set<string>();
  for (const part of text.split(/[,;\n]/)) {
    const name = part.trim().replace(/\s+/g, ' ');
    if (!name) continue;
    if (name.length > 60) return { ok: false, message: 'Keep each muscle name under 60 characters' };
    const key = muscleKey(name);
    if (seen.has(key)) continue;
    seen.add(key);
    muscles.push(canonical.get(key) ?? name);
  }
  if (muscles.length > 8) return { ok: false, message: 'List up to 8 muscles' };
  return { ok: true, muscles };
}

/** Distinct muscle names used in a week (first spelling wins); shared sections use the whole program. */
export function weekMuscles(draft: ProgramDraft, weekId: string | null): string[] {
  const weeks = weekId ? draft.weeks.filter((week) => week.id === weekId) : draft.weeks;
  const sections = [...(weekId ? [] : draft.sharedSections), ...weeks.flatMap((week) => week.days.flatMap((day) => day.sections))];
  const names = new Map<string, string>();
  for (const exercise of sections.flatMap((section) => section.exercises)) {
    for (const muscle of exercise.muscles) if (!names.has(muscleKey(muscle))) names.set(muscleKey(muscle), muscle);
  }
  return [...names.values()].sort((a, b) => a.localeCompare(b));
}

/** The comma-separated item being typed: the text after the last separator. */
export function currentMuscleToken(text: string): { prefix: string; token: string } {
  const at = Math.max(text.lastIndexOf(','), text.lastIndexOf(';'));
  return { prefix: text.slice(0, at + 1), token: text.slice(at + 1).trim() };
}

/**
 * Known muscles matching the token being typed: names starting with it first, then names with a
 * word starting with it. Muscles already listed in the text are left out.
 */
export function muscleSuggestions(known: readonly string[], text: string, limit = 6): string[] {
  const { prefix, token } = currentMuscleToken(text);
  const listed = new Set(prefix.split(/[,;]/).map(muscleKey).filter(Boolean));
  const query = muscleKey(token);
  const candidates = known.filter((name) => !listed.has(muscleKey(name)) && muscleKey(name) !== query);
  if (!query) return candidates.slice(0, limit);
  const starts = candidates.filter((name) => muscleKey(name).startsWith(query));
  const words = candidates.filter((name) => !starts.includes(name) && muscleKey(name).split(' ').some((word) => word.startsWith(query)));
  return [...starts, ...words].slice(0, limit);
}

/** Replaces the token being typed with `name` and leaves the text ready for another muscle. */
export function applyMuscleSuggestion(text: string, name: string): string {
  const { prefix } = currentMuscleToken(text);
  return `${prefix ? `${prefix.trimEnd()} ` : ''}${name}, `;
}
