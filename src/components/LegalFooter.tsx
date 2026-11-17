import { Link } from 'react-router';
import { ThemeToggle } from '@/components/ThemeToggle';
import { COPYRIGHT, USE_NOTICE, USE_NOTICE_PATH } from '@/lib/legal';

/** The copyright line on every page, with a link to the full use notice. */
export function LegalFooter({ className = '' }: { className?: string }) {
  return (
    <footer className={`text-xs text-muted ${className}`}>
      <p>
        {COPYRIGHT}{' '}
        <span aria-hidden>·</span>{' '}
        <Link to={USE_NOTICE_PATH} className="underline-offset-2 hover:text-text hover:underline">Use notice</Link>
      </p>
    </footer>
  );
}

/** The full notice, shown under a client's program and on the Use notice page. */
export function UseNotice({ headingLevel = 'h2', className = '' }: { headingLevel?: 'h1' | 'h2'; className?: string }) {
  const Heading = headingLevel;
  return (
    <section aria-labelledby="use-notice" className={className}>
      <Heading id="use-notice" className={headingLevel === 'h1' ? 'mb-4 text-2xl font-semibold' : 'mb-2 text-sm font-semibold'}>{USE_NOTICE.title}</Heading>
      <div className={`grid gap-2 ${headingLevel === 'h1' ? 'text-base' : 'text-xs text-muted'}`}>
        {USE_NOTICE.paragraphs.map((text) => <p key={text}>{text}</p>)}
      </div>
    </section>
  );
}

/** Public page: readable before signing in, so the sign-in footer link works. */
export function UseNoticePage() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col px-4 py-6">
      <div className="mb-10 flex items-center justify-between">
        <Link to="/"><img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo h-8 w-auto" /></Link>
        <ThemeToggle />
      </div>
      <main id="main-content" className="flex-1">
        <UseNotice headingLevel="h1" />
        <Link to="/" className="mt-8 inline-flex min-h-11 items-center gap-1 text-sm text-muted hover:text-text">← Back to the app</Link>
      </main>
      <LegalFooter className="mt-10 border-t border-line pt-4" />
    </div>
  );
}
