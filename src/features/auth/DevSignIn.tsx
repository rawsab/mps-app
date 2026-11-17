import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SettingsIcon } from '@/components/icons';
import { Spinner } from '@/components/ui';

/*
 * LOCAL DEVELOPMENT ONLY. One-click sign-in for the fictional accounts in supabase/seed.sql.
 * SignInPage loads this module only in a dev build pointed at a local Supabase, so the seed
 * password never reaches a production bundle.
 */
const SEED_PASSWORD = 'local-dev-only-password';

const ACCOUNTS: { group: string; people: { name: string; email: string; note: string }[] }[] = [
  {
    group: 'Staff',
    people: [
      { name: 'Matt Lizmore', email: 'matt@example.test', note: 'Admin' },
      { name: 'Priya Nair', email: 'priya.nair@example.test', note: 'Coach · Maya, Grace' },
      { name: 'Liam O’Connor', email: 'liam.oconnor@example.test', note: 'Coach · no clients' },
    ],
  },
  {
    group: 'Clients',
    people: [
      { name: 'Maya Chen', email: 'maya.chen@example.test', note: 'Meso + nutrition' },
      { name: 'Grace Liu', email: 'grace.liu@example.test', note: 'Meso + PT' },
      { name: 'Lucas Silva', email: 'lucas.silva@example.test', note: 'Mesocycle · invited' },
      { name: 'Daniel Okafor', email: 'daniel.okafor@example.test', note: 'PT + nutrition' },
      { name: 'Sofia Márquez', email: 'sofia.marquez@example.test', note: 'Disabled' },
      { name: 'Ryan Patel', email: 'ryan.patel@example.test', note: 'Disabled' },
    ],
  },
];

export default function DevSignIn({ onSignIn }: { onSignIn: (credentials: { email: string; password: string }) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const scroller = useRef<HTMLDivElement>(null);
  // Whether more of the list is hidden above or below; drives the fade at each edge.
  const [more, setMore] = useState({ above: false, below: false });

  function measure() {
    const el = scroller.current;
    if (!el) return;
    setMore({ above: el.scrollTop > 1, below: el.scrollTop + el.clientHeight < el.scrollHeight - 1 });
  }

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);

  async function pick(email: string) {
    setPending(email);
    await onSignIn({ email, password: SEED_PASSWORD });
    setPending(null);
  }

  // Portalled to <body>: the form's entrance animation uses a transform, which would otherwise
  // pin this fixed corner button to the form instead of the screen.
  return createPortal(
    <div
      ref={root}
      className="fixed left-4 top-4 z-40"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.preventDefault();
          setOpen(false);
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        type="button"
        aria-label="Local test accounts"
        title="Local test accounts"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className="btn-motion inline-flex size-11 items-center justify-center rounded-card border border-line bg-surface text-muted shadow-lg hover:bg-surface-raised hover:text-text"
      >
        <SettingsIcon />
      </button>
      {/* Stays mounted so it can fade out; inert keeps the closed menu out of focus and clicks. */}
      <section
        id={id}
        aria-labelledby={`${id}-title`}
        data-open={open || undefined}
        inert={!open}
        className="menu-fade absolute left-0 top-full mt-2 w-72 max-w-[calc(100vw-2rem)] overflow-hidden rounded-card border border-line bg-surface shadow-lg"
      >
        <div ref={scroller} onScroll={measure} className="max-h-[min(26rem,calc(100dvh-5rem))] overflow-y-auto overscroll-contain p-2">
          <div className="px-1 pb-1 pt-1">
            <h2 id={`${id}-title`} className="text-sm font-semibold">Local test accounts</h2>
            <p className="mt-0.5 text-xs text-muted">Development only.</p>
          </div>
          {ACCOUNTS.map(({ group, people }) => (
            <div key={group} className="mt-3">
              <h3 className="px-1 pb-1.5 text-xs font-medium uppercase tracking-wide text-muted">{group}</h3>
              <ul className="grid gap-1.5">
                {people.map((p) => (
                  <li key={p.email}>
                    <button
                      type="button"
                      disabled={pending !== null}
                      onClick={() => void pick(p.email)}
                      className="flex min-h-11 w-full items-center gap-2 rounded-card border border-line bg-surface-raised px-3 text-left text-sm transition-colors hover:border-gold disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <span className="min-w-0 flex-1 truncate">{p.name}</span>
                      <span className="shrink-0 truncate text-xs text-muted">{p.note}</span>
                      {pending === p.email ? <Spinner small /> : <span aria-hidden className="text-muted">→</span>}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 top-0 h-10 bg-gradient-to-b from-surface to-transparent transition-opacity duration-150 ${more.above ? 'opacity-100' : 'opacity-0'}`} />
        <div aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-surface to-transparent transition-opacity duration-150 ${more.below ? 'opacity-100' : 'opacity-0'}`} />
      </section>
    </div>,
    document.body,
  );
}
