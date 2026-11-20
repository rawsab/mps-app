import { describe, expect, it } from 'vitest';
import { formatBytes, RESOURCE_MAX_BYTES, resourceExtension, resourceFileProblem, resourceKind, titleFromFileName } from '@/domain/scheduling/resources';

describe('meeting resources', () => {
  it('maps accepted types to the stored extension', () => {
    expect(resourceExtension('video/quicktime')).toBe('mov');
    expect(resourceExtension('application/pdf')).toBe('pdf');
    expect(() => resourceExtension('application/zip')).toThrow();
  });

  it('refuses empty, oversized and unsupported files', () => {
    expect(resourceFileProblem({ type: 'image/png', size: 10 })).toBeNull();
    expect(resourceFileProblem({ type: 'image/png', size: 0 })).toMatch(/empty/);
    expect(resourceFileProblem({ type: 'video/mp4', size: RESOURCE_MAX_BYTES + 1 })).toMatch(/50 MB/);
    expect(resourceFileProblem({ type: 'video/mp4', size: RESOURCE_MAX_BYTES })).toBeNull();
    expect(resourceFileProblem({ type: 'text/plain', size: 10 })).toMatch(/PDF/);
  });

  it('titles a file after its name', () => {
    expect(titleFromFileName('Week 3 plan.pdf')).toBe('Week 3 plan');
    expect(titleFromFileName('squat.form.mov')).toBe('squat.form');
    expect(titleFromFileName('.pdf')).toBe('File');
  });

  it('labels resources by kind', () => {
    expect(resourceKind({ kind: 'link', mimeType: null })).toBe('Link');
    expect(resourceKind({ kind: 'file', mimeType: 'image/webp' })).toBe('Image');
    expect(resourceKind({ kind: 'file', mimeType: 'video/mp4' })).toBe('Video');
    expect(resourceKind({ kind: 'file', mimeType: 'application/pdf' })).toBe('PDF');
  });

  it('formats sizes', () => {
    expect(formatBytes(900)).toBe('900 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5 MB');
    expect(formatBytes(1.5 * 1024 * 1024)).toBe('1.5 MB');
  });
});
