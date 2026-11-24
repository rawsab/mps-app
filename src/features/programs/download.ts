import { backupFileName, programBackupSheets } from '@/domain/programs/backup';
import type { ProgramDraft } from '@/domain/programs/contract';
import { writeXlsx } from '@/lib/xlsx';
import { fetchProgramDraft } from './api';

export type BackupFormat = 'xlsx' | 'json';

/**
 * Saves a program to the coach's device (decision 0062): a spreadsheet to read, or the program file,
 * which keeps every field exactly as the app stores it.
 */
export function downloadProgram(draft: ProgramDraft, clientName: string, format: BackupFormat) {
  const blob = format === 'xlsx'
    ? new Blob([writeXlsx(programBackupSheets(draft)) as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
    : new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = backupFileName(clientName, draft, format);
  link.click();
  // Some browsers start the download after this tick, so the URL is released a little later.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** For lists, where the program isn't open: its latest saved content (the draft, else what's published). */
export async function downloadSavedProgram(programId: string, clientName: string, format: BackupFormat) {
  const snapshot = await fetchProgramDraft(programId);
  if (!snapshot.draft) throw new Error('This program has nothing to download yet.');
  downloadProgram(snapshot.draft, clientName, format);
}
