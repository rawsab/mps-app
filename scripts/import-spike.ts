/**
 * M1 import feasibility spike. Parses every file in samples/ (or paths given as arguments),
 * prints accounting, issue counts and timings, and writes full normalized output to reports/
 * (gitignored, because it contains source excerpts).
 *
 *   pnpm spike:import [file ...]
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { summarize } from '../src/domain/imports/contract';
import { importFile } from '../src/domain/imports/importFile';
import { ImportError } from '../src/domain/imports/limits';

const files = process.argv.slice(2).length
  ? process.argv.slice(2)
  : !existsSync('samples')
    ? (console.error('No samples/ directory. The MPS templates are not committed; pass file paths instead.'), process.exit(1))
    : readdirSync('samples').filter((f) => /\.(xlsx|docx)$/i.test(f)).map((f) => join('samples', f));

mkdirSync('reports', { recursive: true });

for (const file of files) {
  const bytes = new Uint8Array(readFileSync(file));
  const heapBefore = process.memoryUsage().heapUsed;
  const started = performance.now();
  try {
    const result = await importFile(bytes, basename(file));
    const ms = performance.now() - started;
    const s = summarize(result);
    const byCode = new Map<string, number>();
    for (const issue of result.issues) byCode.set(`${issue.severity}:${issue.code}`, (byCode.get(`${issue.severity}:${issue.code}`) ?? 0) + 1);
    console.log(`\n== ${basename(file)}  (${(bytes.byteLength / 1024).toFixed(0)} KiB)`);
    console.log(`profile ${result.profile.id}@${result.profile.version} → ${result.profile.status}; parsed in ${ms.toFixed(0)} ms; heap Δ ≈ ${((process.memoryUsage().heapUsed - heapBefore) / 1048576).toFixed(1)} MiB`);
    console.log(`source items ${s.sourceItems}: mapped ${s.mapped}, excluded ${s.excluded}, unresolved ${s.unresolved}`);
    console.log(`program: ${s.weeks} week(s), ${s.days} day(s), ${s.exercises} exercise(s); shared sections ${result.program?.sharedSections.length ?? 0}`);
    console.log(`history: ${s.historicalSessions} session(s), ${s.bodyweights} weigh-in(s), ${s.nutritionLogs} nutrition log(s); targets ${result.nutritionTargets.length}`);
    console.log('issues:', Object.fromEntries([...byCode.entries()].sort()));
    writeFileSync(join('reports', `${basename(file)}.normalized.json`), JSON.stringify(result, null, 2));
  } catch (err) {
    if (err instanceof ImportError) console.log(`\n== ${basename(file)}: rejected (${err.code}) ${err.message}`);
    else throw err;
  }
}
