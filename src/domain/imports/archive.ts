import { unzipSync } from 'fflate';
import { IMPORT_LIMITS, ImportError, type ImportLimits } from './limits';

export type FileKind = 'xlsx' | 'docx';
export type Archive = { kind: FileKind; entries: Map<string, Uint8Array> };

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
// Compound File Binary: legacy .xls/.doc, and password-protected OOXML files.
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

function startsWith(bytes: Uint8Array, signature: number[]): boolean {
  return signature.every((b, i) => bytes[i] === b);
}

export function kindFromFileName(name: string): FileKind | null {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'xlsx' || ext === 'docx' ? ext : null;
}

/**
 * Preflight + bounded extraction (roadmap §10 step 1). Checks extension, content signature,
 * compressed size, entry count and declared/actual expanded size before handing XML to parsers.
 */
export function openArchive(bytes: Uint8Array, fileName: string, limits: ImportLimits = IMPORT_LIMITS): Archive {
  const kind = kindFromFileName(fileName);
  if (!kind) {
    throw new ImportError('UNSUPPORTED_TYPE', 'Only .xlsx and .docx files can be imported. Export Google Sheets/Docs to these formats first.');
  }
  if (bytes.byteLength > limits.maxCompressedBytes) {
    throw new ImportError('TOO_LARGE', `File is larger than ${Math.round(limits.maxCompressedBytes / 1048576)} MiB.`);
  }
  if (startsWith(bytes, CFB_SIGNATURE)) {
    throw new ImportError('LEGACY_OR_ENCRYPTED', 'This file is password-protected or an older .xls/.doc file. Remove the password or re-save it as .xlsx/.docx.');
  }
  if (!startsWith(bytes, ZIP_SIGNATURE)) {
    throw new ImportError('CORRUPT', `This file is not a valid .${kind} document.`);
  }

  let entryCount = 0;
  let declaredTotal = 0;
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes, {
      filter(file) {
        entryCount += 1;
        declaredTotal += file.originalSize;
        if (entryCount > limits.maxArchiveEntries) {
          throw new ImportError('TOO_MANY_ENTRIES', 'The file contains too many internal parts to import safely.');
        }
        if (declaredTotal > limits.maxExpandedBytes) {
          throw new ImportError('EXPANDED_TOO_LARGE', 'The file expands beyond the import size limit.');
        }
        // Only XML parts and relationships are needed; skip images and other binaries.
        return /\.(xml|rels)$/i.test(file.name);
      },
    });
  } catch (err) {
    if (err instanceof ImportError) throw err;
    throw new ImportError('CORRUPT', `The file could not be read as a .${kind} archive.`);
  }

  let actualTotal = 0;
  const map = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(entries)) {
    actualTotal += data.byteLength;
    map.set(name, data);
  }
  if (actualTotal > limits.maxExpandedBytes) {
    throw new ImportError('EXPANDED_TOO_LARGE', 'The file expands beyond the import size limit.');
  }

  const required = kind === 'xlsx' ? 'xl/workbook.xml' : 'word/document.xml';
  if (!map.has(required)) {
    throw new ImportError('CORRUPT', `This file does not contain a .${kind} document body.`);
  }
  return { kind, entries: map };
}

export function readPart(archive: Archive, path: string): string | null {
  const data = archive.entries.get(path);
  return data ? new TextDecoder('utf-8').decode(data) : null;
}
