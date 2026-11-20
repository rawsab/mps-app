// Meeting resources (decision 0047): what the meeting-resources bucket accepts (migration 00046).

export const RESOURCE_MAX_BYTES = 50 * 1024 * 1024;

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif',
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'application/pdf': 'pdf',
};

/** For the file picker's `accept`. */
export const RESOURCE_ACCEPT = Object.keys(EXTENSIONS).join(',');

/** The stored file's extension. Throws for a type the bucket refuses. */
export function resourceExtension(type: string): string {
  const extension = EXTENSIONS[type];
  if (!extension) throw new Error('Choose an image, a video (MP4, MOV or WebM) or a PDF.');
  return extension;
}

/** The problem with a chosen file, or null when it can be uploaded. */
export function resourceFileProblem(file: Pick<File, 'size' | 'type'>): string | null {
  if (!EXTENSIONS[file.type]) return 'Choose an image, a video (MP4, MOV or WebM) or a PDF.';
  if (!file.size) return 'That file is empty.';
  if (file.size > RESOURCE_MAX_BYTES) return 'Files can be up to 50 MB. For longer videos, add a link instead.';
  return null;
}

/** A file name without its extension, as a default title. */
export function titleFromFileName(name: string): string {
  return name.replace(/\.[^./]+$/, '').trim().slice(0, 200) || 'File';
}

export type ResourceKindLabel = 'Image' | 'Video' | 'PDF' | 'Link';

export function resourceKind(resource: { kind: 'file' | 'link'; mimeType: string | null }): ResourceKindLabel {
  if (resource.kind === 'link') return 'Link';
  if (resource.mimeType?.startsWith('image/')) return 'Image';
  if (resource.mimeType?.startsWith('video/')) return 'Video';
  return 'PDF';
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
}
