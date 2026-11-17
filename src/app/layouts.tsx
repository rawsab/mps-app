import type { ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router';
import { ClientsIcon, HomeIcon, NutritionIcon, ProgressIcon, ReviewsIcon, TemplatesIcon, TrainingIcon } from '@/components/icons';
import { ThemeToggle } from '@/components/ThemeToggle';
import { clientSections } from '@/lib/services';
import { signOut, useViewer } from './auth';

type NavItem = { to: string; label: string; icon: ReactNode };

function SkipLink() {
  return <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-3 focus:text-text">Skip to content</a>;
}

const navWord = ({ isActive }: { isActive: boolean }) =>
  `nav-word flex min-h-12 items-center gap-2 px-3 text-sm ${isActive ? 'text-text' : 'text-muted hover:text-text'}`;

/** Route content settles in once when the route mounts (keyed by path); never on scroll. */
function RouteContent() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      <Outlet />
    </div>
  );
}

function TopBar({ children }: { children?: ReactNode }) {
  return (
    <header className="sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4">
        <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo my-3 h-8 w-auto max-w-[45vw] sm:max-w-none" />
        <div className="flex items-center gap-1 self-stretch">
          {children}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut()}
            className="btn-motion my-auto min-h-11 rounded-card px-3 text-sm text-muted hover:bg-surface-raised hover:text-text"
          >
            Sign out
          </button>
        </div>
      </div>
    </header>
  );
}

/** Client app: Home, Training, Nutrition, Progress — filtered by assigned services (PRD §6). */
export function ClientLayout() {
  const viewer = useViewer();
  const sections = clientSections(viewer.data?.services ?? []);
  const items = [
    { to: '/home', label: 'Home', icon: <HomeIcon />, show: true },
    { to: '/training', label: 'Training', icon: <TrainingIcon />, show: sections.training },
    { to: '/nutrition', label: 'Nutrition', icon: <NutritionIcon />, show: sections.nutrition },
    { to: '/progress', label: 'Progress', icon: <ProgressIcon />, show: sections.progress },
  ].filter((i) => i.show);

  return (
    <div className="min-h-dvh pb-24 sm:pb-0">
      <SkipLink />
      <TopBar>
        <nav aria-label="Main" className="mr-2 hidden items-stretch sm:flex">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={navWord}>
              {i.label}
            </NavLink>
          ))}
        </nav>
      </TopBar>
      <main id="main-content" tabIndex={-1} className="mx-auto max-w-3xl scroll-mt-20 px-4 py-8">
        <RouteContent />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-10 border-t border-line bg-ink/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md sm:hidden"
      >
        <ul className="mx-auto flex max-w-md justify-around">
          {items.map((i) => (
            <li key={i.to} className="flex-1">
              <NavLink
                to={i.to}
                className={({ isActive }) =>
                  `flex min-h-16 flex-col items-center justify-center gap-1 text-xs transition-colors ${isActive ? 'font-semibold text-gold-fg' : 'text-muted'}`
                }
              >
                {i.icon}
                {i.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Matt's workspace: Clients, Templates, Reviews. */
export function CoachLayout() {
  const items: NavItem[] = [
    { to: '/coach/clients', label: 'Clients', icon: <ClientsIcon /> },
    { to: '/coach/templates', label: 'Templates', icon: <TemplatesIcon /> },
    { to: '/coach/reviews', label: 'Reviews', icon: <ReviewsIcon /> },
  ];
  return (
    <div className="min-h-dvh">
      <SkipLink />
      <TopBar />
      <div className="mx-auto max-w-5xl px-4">
        {/* Words sit 12px in; pull them back so their text lines up with the page edge. */}
        <div className="border-b border-line">
          <nav aria-label="Coach" className="-mx-3 flex overflow-x-auto">
            {items.map((i) => (
              <NavLink key={i.to} to={i.to} className={navWord}>
                {i.icon}
                {i.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <main id="main-content" tabIndex={-1} className="scroll-mt-20 py-8">
          <RouteContent />
        </main>
      </div>
    </div>
  );
}
