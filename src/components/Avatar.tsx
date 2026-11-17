import { useState } from 'react';

/** Shared placeholder for missing, inaccessible, or broken profile pictures. */
export function Avatar({ url, name, className = 'size-9' }: { url?: string | null; name: string; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  return (
    <span className={`inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-line bg-surface-raised text-muted ${className}`}>
      {url && failedUrl !== url ? (
        <img src={url} alt={`${name || 'Your'} profile picture`} className="size-full object-cover" onError={() => setFailedUrl(url)} />
      ) : (
        <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3/5 w-3/5"><circle cx="12" cy="8" r="4" /><path d="M4 22v-2a8 8 0 0 1 16 0v2" /></svg>
      )}
    </span>
  );
}
