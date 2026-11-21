/** The green circled tick on its own, for a status shown inline (e.g. a balance that's paid up). */
export function AllClearMark() {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className="size-9 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <path d="m7.5 12.5 3 3 6-6.5" />
    </svg>
  );
}

/** A calm "nothing to do" state: a green circled tick, a short title and one line of detail. */
export function AllClear({ title, detail }: { title: string; detail: string }) {
  return (
    <div role="status" className="flex items-center gap-3 py-1">
      <AllClearMark />
      <div className="min-w-0">
        <p className="text-xl font-semibold leading-tight text-text">{title}</p>
        <p className="mt-0.5 text-xs text-muted">{detail}</p>
      </div>
    </div>
  );
}
