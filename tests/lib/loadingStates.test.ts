import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Content loads with a skeleton (decision 0056). Spinners are for actions in progress: busy
// buttons, saving, and quick checks inside dialogs ("Checking…", "Loading open times").
const ALLOWED_SPINNER_LABELS = new Set([
  'Checking what this service has',
  'Checking program',
  'Checking logged workouts',
  'Loading open times',
  'Saving',
  'One moment',
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith('.tsx') ? [path] : [];
  });
}

describe('loading states', () => {
  it('uses skeletons, not spinners, while content loads', () => {
    const found = sources('src').flatMap((path) =>
      [...readFileSync(path, 'utf8').matchAll(/<Spinner\b[^>]*\blabel="([^"]+)"/g)]
        .map((match) => match[1]!)
        .filter((label) => !ALLOWED_SPINNER_LABELS.has(label))
        .map((label) => `${path}: ${label}`));
    expect(found).toEqual([]);
  });
});
