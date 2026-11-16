import { openArchive } from './archive';
import { ImportAccumulator } from './builder';
import { NormalizedImport, NORMALIZED_IMPORT_SCHEMA_VERSION } from './contract';
import { readDocument } from './docx';
import { IMPORT_LIMITS, type ImportLimits } from './limits';
import { PARSER, registerWorkbook } from './profiles/common';
import { looksLikeMesocycle, MESOCYCLE_PROFILE, parseMesocycle } from './profiles/mesocycle';
import { looksLikeNutrition, NUTRITION_PROFILE, parseNutrition } from './profiles/nutrition';
import { looksLikePersonalTraining, parsePersonalTraining, PERSONAL_TRAINING_PROFILE } from './profiles/personalTraining';
import { readWorkbook } from './xlsx';

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Parses one source file into a NormalizedImport. Pure and DOM-free so it can run in a Web Worker
 * (M7). Throws ImportError for files that must be rejected outright; everything else is returned
 * with issues for review. The result is untrusted until the server revalidates it.
 */
export async function importFile(bytes: Uint8Array, fileName: string, limits: ImportLimits = IMPORT_LIMITS): Promise<NormalizedImport> {
  const archive = openArchive(bytes, fileName, limits);
  const acc = new ImportAccumulator();
  const base = {
    schemaVersion: NORMALIZED_IMPORT_SCHEMA_VERSION,
    source: { fileName, sha256: await sha256Hex(bytes), sizeBytes: bytes.byteLength, kind: archive.kind },
    parser: { ...PARSER },
  };
  const emptyHistory = { sessions: [], bodyweights: [], nutritionLogs: [] };

  let draft: Omit<NormalizedImport, 'sourceItems' | 'issues'>;

  if (archive.kind === 'xlsx') {
    const wb = readWorkbook(archive, limits);
    registerWorkbook(wb, acc);
    if (wb.hasMacros) acc.issue('UNRECOGNIZED_CONTENT', 'info', 'The workbook contains macros. They were not run.', []);
    if (wb.externalLinkCount) acc.issue('UNRECOGNIZED_CONTENT', 'info', `The workbook has ${wb.externalLinkCount} external link(s). They were not followed.`, []);

    if (looksLikeMesocycle(wb)) {
      const { program, sessions } = parseMesocycle(wb, acc);
      draft = { ...base, profile: { ...MESOCYCLE_PROFILE, status: 'needs_review', service: 'mesocycle' }, program, history: { ...emptyHistory, sessions }, nutritionTargets: [] };
    } else if (looksLikeNutrition(wb)) {
      const n = parseNutrition(wb, acc);
      draft = {
        ...base,
        profile: { ...NUTRITION_PROFILE, status: 'needs_review', service: 'nutrition' },
        program: null,
        history: { sessions: [], bodyweights: n.bodyweights, nutritionLogs: n.nutritionLogs },
        nutritionTargets: n.nutritionTargets,
      };
    } else {
      draft = unsupported(base, acc);
    }
  } else {
    const doc = readDocument(archive);
    if (doc.hasMacros) acc.issue('UNRECOGNIZED_CONTENT', 'info', 'The document contains macros. They were not run.', []);
    if (looksLikePersonalTraining(doc)) {
      const program = parsePersonalTraining(doc, acc);
      draft = { ...base, profile: { ...PERSONAL_TRAINING_PROFILE, status: 'needs_review', service: 'personal_training' }, program, history: emptyHistory, nutritionTargets: [] };
    } else {
      draft = unsupported(base, acc);
    }
  }

  const sourceItems = acc.finish();
  const result: NormalizedImport = { ...draft, sourceItems, issues: acc.issues };
  if (result.profile.status !== 'unsupported' && result.issues.every((i) => i.severity !== 'blocking')) {
    result.profile.status = 'recognized';
  }
  // Fail loudly if a profile produced something outside the contract.
  return NormalizedImport.parse(result);
}

function unsupported(base: Pick<NormalizedImport, 'schemaVersion' | 'source' | 'parser'>, acc: ImportAccumulator): Omit<NormalizedImport, 'sourceItems' | 'issues'> {
  acc.issue(
    'UNSUPPORTED_LAYOUT',
    'blocking',
    'This file does not match a supported MPS template. Its content is kept for manual mapping; nothing was saved.',
    [],
  );
  return {
    ...base,
    profile: { id: 'unsupported', version: '0', status: 'unsupported', service: null },
    program: null,
    history: { sessions: [], bodyweights: [], nutritionLogs: [] },
    nutritionTargets: [],
  };
}
