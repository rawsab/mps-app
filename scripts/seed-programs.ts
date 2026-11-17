/** Regenerates supabase/seed/programs.sql from scripts/seed/. Run: pnpm seed:programs */
import { mkdirSync, writeFileSync } from 'node:fs';
import { renderSeedSql, SEED_SQL_PATH } from './seed/programs';

mkdirSync(new URL('.', SEED_SQL_PATH), { recursive: true });
writeFileSync(SEED_SQL_PATH, renderSeedSql());
console.log(`Wrote ${SEED_SQL_PATH.pathname}`);
