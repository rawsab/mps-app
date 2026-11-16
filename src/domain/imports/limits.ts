/** Initial engineering limits from PRD FR-12. Exceeding any limit fails visibly; nothing is truncated. */
export const IMPORT_LIMITS = {
  maxCompressedBytes: 10 * 1024 * 1024,
  maxExpandedBytes: 100 * 1024 * 1024,
  maxArchiveEntries: 2_000,
  maxWorksheets: 50,
  maxNonEmptyCells: 50_000,
  parseTimeoutMs: 30_000,
} as const;

export type ImportLimits = { [K in keyof typeof IMPORT_LIMITS]: number };

export type ImportErrorCode =
  | 'UNSUPPORTED_TYPE'
  | 'LEGACY_OR_ENCRYPTED'
  | 'CORRUPT'
  | 'TOO_LARGE'
  | 'TOO_MANY_ENTRIES'
  | 'EXPANDED_TOO_LARGE'
  | 'TOO_MANY_SHEETS'
  | 'TOO_MANY_CELLS'
  | 'UNSAFE_XML';

/** An actionable, user-facing failure. The client program is never touched when this is thrown. */
export class ImportError extends Error {
  constructor(
    readonly code: ImportErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'ImportError';
  }
}
