import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { importFile } from '@/domain/imports/importFile';
import { IMPORT_LIMITS, ImportError } from '@/domain/imports/limits';
import { buildXlsx } from './fixtures/build';

async function rejection(promise: Promise<unknown>): Promise<ImportError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ImportError) return err;
    throw err;
  }
  throw new Error('expected an ImportError');
}

describe('import preflight', () => {
  it('rejects unsupported extensions', async () => {
    expect((await rejection(importFile(new Uint8Array([1, 2, 3]), 'program.xls'))).code).toBe('UNSUPPORTED_TYPE');
  });

  it('rejects files whose content is not a zip archive', async () => {
    expect((await rejection(importFile(strToU8('name,reps\nsquat,5'), 'renamed.xlsx'))).code).toBe('CORRUPT');
  });

  it('explains password-protected or legacy compound files', async () => {
    const cfb = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
    expect((await rejection(importFile(cfb, 'locked.xlsx'))).code).toBe('LEGACY_OR_ENCRYPTED');
  });

  it('rejects a truncated archive', async () => {
    const bytes = buildXlsx([{ name: 'Week 1', cells: { A1: 'x' } }]);
    expect((await rejection(importFile(bytes.slice(0, 60), 't.xlsx'))).code).toBe('CORRUPT');
  });

  it('rejects an archive that is not a workbook', async () => {
    const bytes = zipSync({ 'readme.xml': strToU8('<a/>') });
    expect((await rejection(importFile(bytes, 'other.xlsx'))).code).toBe('CORRUPT');
  });

  it('enforces the compressed size limit', async () => {
    const bytes = buildXlsx([{ name: 'S', cells: { A1: 'x' } }]);
    const limits = { ...IMPORT_LIMITS, maxCompressedBytes: 100 };
    expect((await rejection(importFile(bytes, 'big.xlsx', limits))).code).toBe('TOO_LARGE');
  });

  it('stops a highly compressed archive before it expands past the limit', async () => {
    const padding = '<x>' + 'A'.repeat(2_000_000) + '</x>';
    const bytes = buildXlsx([{ name: 'S', cells: { A1: 'x' } }], { extraParts: { 'xl/padding.xml': padding } });
    expect(bytes.byteLength).toBeLessThan(50_000);
    const limits = { ...IMPORT_LIMITS, maxExpandedBytes: 1_000_000 };
    expect((await rejection(importFile(bytes, 'bomb.xlsx', limits))).code).toBe('EXPANDED_TOO_LARGE');
  });

  it('enforces worksheet and cell limits instead of truncating', async () => {
    const sheets = Array.from({ length: 3 }, (_, i) => ({ name: `S${i}`, cells: { A1: 'x' } }));
    expect((await rejection(importFile(buildXlsx(sheets), 's.xlsx', { ...IMPORT_LIMITS, maxWorksheets: 2 }))).code).toBe('TOO_MANY_SHEETS');
    const cells = Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`A${i + 1}`, `v${i}`]));
    expect((await rejection(importFile(buildXlsx([{ name: 'S', cells }]), 'c.xlsx', { ...IMPORT_LIMITS, maxNonEmptyCells: 10 }))).code).toBe('TOO_MANY_CELLS');
  });

  it('refuses XML with DOCTYPE declarations (entity expansion)', async () => {
    const bytes = zipSync({
      'xl/workbook.xml': strToU8('<?xml version="1.0"?><!DOCTYPE lol [<!ENTITY a "aaaa">]><workbook>&a;</workbook>'),
    });
    expect((await rejection(importFile(bytes, 'evil.xlsx'))).code).toBe('UNSAFE_XML');
  });

  it('returns an unsupported result (not an empty success) for an unknown layout', async () => {
    const result = await importFile(buildXlsx([{ name: 'Budget', cells: { A1: 'Groceries', B1: 120 } }]), 'budget.xlsx');
    expect(result.profile.status).toBe('unsupported');
    expect(result.program).toBeNull();
    expect(result.sourceItems.every((i) => i.disposition.status === 'unresolved')).toBe(true);
    expect(result.issues.map((i) => i.code)).toContain('UNSUPPORTED_LAYOUT');
  });

  it('reports macros without running them', async () => {
    const bytes = buildXlsx([{ name: 'S', cells: { A1: 'x' } }], { extraParts: { 'xl/vbaProject.xml': '<x/>' } });
    const result = await importFile(bytes, 'macro.xlsx');
    expect(result.issues.some((i) => i.message.includes('macros'))).toBe(true);
  });
});
