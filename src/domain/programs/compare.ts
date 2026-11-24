import type { ProgramDraft } from './contract';

/**
 * Whether two documents say the same thing, ignoring key order and absent-versus-undefined fields.
 * The editor uses it to tell whether a draft differs from what's published, so Publish can wait
 * for a real change (including edits that were all undone).
 */
export function sameProgram(a: ProgramDraft, b: ProgramDraft): boolean {
  return canonical(a) === canonical(b);
}

function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => v && typeof v === 'object' && !Array.isArray(v)
    ? Object.fromEntries(Object.keys(v).sort().map((key) => [key, (v as Record<string, unknown>)[key]]))
    : v);
}
