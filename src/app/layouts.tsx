import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useMatches } from 'react-router';
import {
  ClientsIcon,
  HomeIcon,
  MesocycleIcon,
  MenuIcon,
  NutritionIcon,
  ProgressIcon,
  ReviewsIcon,
  CalendarIcon,
  BillingIcon,
  CloseIcon,
  SidebarIcon,
  SignOutIcon,
  TemplatesIcon,
  TrainingIcon,
} from '@/components/icons';
import { IconButton } from '@/components/controls';
import { Avatar } from '@/components/Avatar';
import { LegalFooter } from '@/components/LegalFooter';
import { READ_FADE_MS, useUnreadCount } from '@/features/activity/api';
import { useMeetingsLeftToday } from '@/features/scheduling/api';
import { ThemeToggle } from '@/components/ThemeToggle';
import { clientSections } from '@/lib/services';
import { signOut, useViewer } from './auth';

type NavItem = { to: string; label: string; icon: ReactNode };

function SkipLink() {
  return <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-card focus:bg-surface focus:px-4 focus:py-3 focus:text-text">Skip to content</a>;
}

const navWord = ({ isActive }: { isActive: boolean }) =>
  `nav-word flex min-h-12 items-center gap-2 px-3 text-sm ${isActive ? 'text-text' : 'text-muted hover:text-text'}`;

/** Route `handle` for coach pages built around tables or grids, which get a wider column than the default. */
export const wideRoute = { wide: true };

function useWideRoute() {
  return useMatches().some((match) => (match.handle as { wide?: boolean } | undefined)?.wide);
}

/** Route content settles in once when the route mounts (keyed by path); never on scroll. */
function RouteContent() {
  const location = useLocation();
  return (
    <div key={location.pathname} className="page-enter">
      <Outlet />
    </div>
  );
}

function TopBar({ children, leading, className = '', contentWidth = 'max-w-5xl' }: { children?: ReactNode; leading?: ReactNode; className?: string; contentWidth?: string }) {
  return (
    <header className={`sticky top-0 z-10 border-b border-line bg-ink/90 backdrop-blur-md ${className}`}>
      <div className={`mx-auto flex ${contentWidth} items-center justify-between gap-3 px-4`}>
        <div className="flex min-w-0 items-center gap-1">
          {leading}
          <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo my-3 h-8 w-auto max-w-[45vw] sm:max-w-none" />
        </div>
        <div className="flex items-center gap-1 self-stretch">
          {children}
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            className="btn-motion my-auto min-h-11 rounded-card px-3 text-sm text-muted hover:bg-surface-raised hover:text-text"
          >
            <span className="hidden sm:inline">Sign out</span><span className="sm:hidden"><SignOutIcon /></span>
          </button>
        </div>
      </div>
    </header>
  );
}

/** The picture is also the entry point to settings, including in collapsed navigation. */
function ProfileLink({ coach = false, collapsed = false, onNavigate }: { coach?: boolean; collapsed?: boolean; onNavigate?: () => void }) {
  const viewer = useViewer().data;
  return (
    <NavLink to={coach ? '/coach/profile' : '/profile'} onClick={onNavigate} aria-label="Profile settings" title="Profile settings"
      className={`btn-motion flex min-h-11 min-w-11 items-center gap-3 rounded-card text-sm text-text ${coach ? 'hover:bg-surface-raised/60' : 'hover:bg-surface-raised'} ${collapsed ? 'justify-center' : 'px-2 py-2'}`}>
      <Avatar url={viewer?.avatarUrl} name={viewer?.displayName ?? ''} />
      {coach && !collapsed ? <span className="min-w-0"><span className="block truncate font-medium">{viewer?.displayName || 'Your profile'}</span><span className="block text-xs text-muted">Profile settings</span></span> : null}
    </NavLink>
  );
}

/** A label shortened where space is tight, with the full name kept for screen readers. */
function NavLabel({ label, short }: { label: string; short?: string }) {
  if (!short) return label;
  return <><span aria-hidden>{short}</span><span className="sr-only">{label}</span></>;
}

/** Client app: Home, Mesocycle, Personal training, Nutrition, Progress — filtered by assigned services (PRD §6, decision 0051). */
export function ClientLayout() {
  const viewer = useViewer();
  const sections = clientSections(viewer.data?.services ?? []);
  const items: (NavItem & { short?: string; show: boolean })[] = [
    { to: '/home', label: 'Home', icon: <HomeIcon />, show: true },
    { to: '/mesocycle', label: 'Mesocycle', icon: <MesocycleIcon />, show: sections.mesocycle },
    { to: '/personal-training', label: 'Personal training', short: 'PT', icon: <TrainingIcon />, show: sections.personalTraining },
    { to: '/nutrition', label: 'Nutrition', icon: <NutritionIcon />, show: sections.nutrition },
    { to: '/progress', label: 'Progress', icon: <ProgressIcon />, show: sections.progress },
  ].filter((i) => i.show);

  return (
    <div className="flex min-h-dvh flex-col pb-24 sm:pb-0">
      <SkipLink />
      <TopBar contentWidth="max-w-[70rem]">
        <nav aria-label="Main" className="mr-2 hidden items-stretch sm:flex">
          {items.map((i) => (
            <NavLink key={i.to} to={i.to} className={navWord}>
              <span className="lg:hidden"><NavLabel label={i.label} short={i.short} /></span>
              <span className="hidden lg:inline">{i.label}</span>
            </NavLink>
          ))}
        </nav>
        <ProfileLink />
      </TopBar>
      <main id="main-content" tabIndex={-1} className="mx-auto w-full max-w-[70rem] flex-1 scroll-mt-20 px-4 py-8">
        <RouteContent />
      </main>
      <LegalFooter className="mx-auto mt-8 w-full max-w-[70rem] px-4 pb-8" />
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
                <NavLabel label={i.label} short={i.short} />
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

const COACH_ITEMS: NavItem[] = [
  { to: '/coach/clients', label: 'Clients', icon: <ClientsIcon /> },
  { to: '/coach/meetings', label: 'Meetings', icon: <CalendarIcon /> },
  { to: '/coach/billing', label: 'Billing', icon: <BillingIcon /> },
  { to: '/coach/templates', label: 'Templates', icon: <TemplatesIcon /> },
  { to: '/coach/reviews', label: 'Activity', icon: <ReviewsIcon /> },
];

const SIDEBAR_STORAGE_KEY = 'mps.coachSidebar.collapsed';
const SIDEBAR_WIDTH_STORAGE_KEY = 'mps.coachSidebar.width';
const SIDEBAR_WIDTH = { min: 192, default: 224, max: 360 };

const clampSidebarWidth = (width: number) => Math.round(Math.min(SIDEBAR_WIDTH.max, Math.max(SIDEBAR_WIDTH.min, width)));

function readSidebarCollapsed() {
  try { return localStorage.getItem(SIDEBAR_STORAGE_KEY) === 'true'; } catch { return false; }
}

function readSidebarWidth() {
  try {
    const stored = Number(localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY));
    return stored ? clampSidebarWidth(stored) : SIDEBAR_WIDTH.default;
  } catch { return SIDEBAR_WIDTH.default; }
}

/** Drag (pointer), arrow keys (keyboard) or double-click (reset) to size the expanded sidebar. */
function SidebarResizeHandle({ width, onResize, onDragging }: { width: number; onResize: (width: number) => void; onDragging: (dragging: boolean) => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const end = () => { start.current = null; onDragging(false); };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize sidebar"
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_WIDTH.min}
      aria-valuemax={SIDEBAR_WIDTH.max}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onDoubleClick={() => onResize(SIDEBAR_WIDTH.default)}
      onPointerDown={(e) => {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
        onDragging(true);
      }}
      onPointerMove={(e) => { if (start.current) onResize(start.current.width + e.clientX - start.current.x); }}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onResize(width + (e.key === 'ArrowRight' ? 16 : -16));
      }}
      className="group/resize absolute -right-1.5 top-0 z-[1] flex h-full w-3 cursor-col-resize touch-none justify-center focus:outline-none"
    >
      <span aria-hidden className="h-full w-0.5 bg-transparent transition-colors group-hover/resize:bg-gold group-focus-visible/resize:bg-gold" />
    </div>
  );
}

const REVIEWS_PATH = '/coach/reviews';
const MEETINGS_PATH = '/coach/meetings';
const unreadLabel = (count: number) => (count > 99 ? '99+' : String(count));

/** Keeps the last count on screen while the badge fades out at zero. */
function useShownCount(count: number) {
  const last = useRef(count);
  if (count > 0) last.current = count;
  return last.current;
}

/** A count on a nav item (Reviews: unread; Meetings: left today): inline when expanded, a gold circle on the icon when collapsed. */
function UnreadBadge({ count, collapsed, label = 'unread' }: { count: number; collapsed: boolean; label?: string }) {
  const shown = useShownCount(count);
  if (shown === 0) return null;
  return (
    <span aria-hidden={count === 0} style={{ transitionDuration: `${READ_FADE_MS}ms` }}
      className={`rounded-full bg-gold text-center font-semibold tabular-nums leading-4 text-on-gold transition-[opacity,transform] ease-out motion-reduce:transition-none ${count ? 'scale-100 opacity-100' : 'scale-50 opacity-0'} ${collapsed ? 'absolute -right-2.5 -top-2 h-4 min-w-4 px-1 text-[0.625rem]' : 'ml-auto min-w-5 px-1.5 text-xs leading-5'}`}>
      {unreadLabel(shown)}<span className="sr-only"> {label}</span>
    </span>
  );
}

/** Sidebar and drawer links. Collapsed, the label stays as the accessible name and a hover title. */
function CoachNavLinks({ collapsed = false, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  const unread = useUnreadCount().data ?? 0;
  const meetingsLeft = useMeetingsLeftToday();
  const badges: Record<string, { count: number; label: string } | undefined> = {
    [REVIEWS_PATH]: { count: unread, label: 'unread' },
    [MEETINGS_PATH]: { count: meetingsLeft, label: 'left today' },
  };
  return (
    <ul className="flex flex-col gap-1">
      {COACH_ITEMS.map((i) => (
        <li key={i.to}>
          <NavLink
            to={i.to}
            onClick={onNavigate}
            title={collapsed ? (badges[i.to]?.count ? `${i.label} (${badges[i.to]!.count} ${badges[i.to]!.label})` : i.label) : undefined}
            className={({ isActive }) =>
              `flex min-h-11 items-center gap-3 rounded-card text-sm transition-colors ${collapsed ? 'justify-center' : 'px-3'} ${isActive ? 'bg-surface-raised font-medium text-text' : 'text-muted hover:bg-surface-raised hover:text-text'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`relative ${isActive ? 'text-gold-fg' : ''}`}>
                  {i.icon}
                  {collapsed && badges[i.to] ? <UnreadBadge count={badges[i.to]!.count} label={badges[i.to]!.label} collapsed /> : null}
                </span>
                <span className={collapsed ? 'sr-only' : 'flex-1'}>{i.label}</span>
                {!collapsed && badges[i.to] ? <UnreadBadge count={badges[i.to]!.count} label={badges[i.to]!.label} collapsed={false} /> : null}
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}

/** Below lg the sidebar becomes a modal drawer on the native <dialog>: Escape, focus trap and focus return come with it. */
function CoachDrawer({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    // Widening past lg swaps the drawer for the sidebar.
    const wide = window.matchMedia('(min-width: 64rem)');
    const closeIfWide = () => { if (wide.matches) dialog?.close(); };
    wide.addEventListener('change', closeIfWide);
    return () => wide.removeEventListener('change', closeIfWide);
  }, []);

  // Slide out first; onAnimationEnd closes the dialog. Reduced motion closes straight away.
  const dismiss = () => {
    const dialog = ref.current;
    if (!dialog || dialog.hasAttribute('data-closing')) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return dialog.close();
    dialog.setAttribute('data-closing', '');
  };

  return (
    <dialog
      ref={ref}
      aria-label="Coach navigation"
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault();
        dismiss();
      }}
      onAnimationEnd={(e) => {
        if (e.target === e.currentTarget && e.animationName === 'drawer-out') e.currentTarget.close();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
      className="drawer m-0 h-dvh max-h-none w-72 max-w-[85vw] border-r border-line sidebar-glow bg-ink p-0 text-text backdrop:bg-ink/75"
    >
      <div className="flex h-full flex-col gap-4 p-3">
        <div className="flex items-center justify-between gap-2 pl-2">
          <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo h-7 w-auto" />
          <IconButton label="Close navigation" lift onClick={dismiss}>
            <CloseIcon />
          </IconButton>
        </div>
        <nav aria-label="Coach">
          <CoachNavLinks onNavigate={dismiss} />
        </nav>
        <div className="mt-auto border-t border-line pt-3"><ProfileLink coach onNavigate={dismiss} /></div>
      </div>
    </dialog>
  );
}

/** Matt's workspace: Clients, Templates, Activity in a collapsible sidebar (lg+) or a drawer (below). */
export function CoachLayout() {
  const [collapsed, setCollapsed] = useState(readSidebarCollapsed);
  const [width, setWidth] = useState(readSidebarWidth);
  const [resizing, setResizing] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const unread = useUnreadCount().data ?? 0;
  const contentWidth = useWideRoute() ? 'max-w-[96rem]' : 'max-w-7xl';

  const resize = (next: number) => {
    const clamped = clampSidebarWidth(next);
    setWidth(clamped);
    try { localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(clamped)); } catch { /* Storage unavailable: the width lasts for this visit. */ }
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { localStorage.setItem(SIDEBAR_STORAGE_KEY, String(next)); } catch { /* Storage unavailable: the choice lasts for this visit. */ }
  };

  return (
    <div className="min-h-dvh lg:flex">
      <SkipLink />
      <aside
        style={collapsed ? undefined : { width }}
        // The width eases when collapsing, but follows the pointer directly while dragging.
        className={`sticky top-0 hidden h-dvh shrink-0 flex-col gap-4 border-r border-line sidebar-glow bg-ink py-3 lg:flex ${resizing ? 'select-none' : 'transition-[width] duration-200'} ${collapsed ? 'w-[4.5rem] px-3.5' : 'px-3'}`}
      >
        {collapsed ? null : <SidebarResizeHandle width={width} onResize={resize} onDragging={setResizing} />}
        <div className={`flex min-h-11 items-center ${collapsed ? 'justify-center' : 'pl-2'}`}>
          {collapsed ? (
            <img src="/logo/mps-logo-gold.png" alt="Modern Physique Systems" className="brand-logo w-10" />
          ) : (
            <img src="/logo/mps-full-logo.png" alt="Modern Physique Systems" className="brand-logo h-7 w-auto" />
          )}
        </div>
        <nav aria-label="Coach" className="min-h-0 flex-1 overflow-y-auto">
          <CoachNavLinks collapsed={collapsed} />
        </nav>
        <ProfileLink coach collapsed={collapsed} />
        <div className={`flex gap-1 border-t border-line pt-3 ${collapsed ? 'flex-col items-center' : 'items-center'}`}>
          <ThemeToggle />
          <IconButton label="Sign out" title="Sign out" lift onClick={() => void signOut()}>
            <SignOutIcon />
          </IconButton>
          <IconButton
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            lift
            onClick={toggleCollapsed}
            className={collapsed ? '' : 'ml-auto'}
          >
            <SidebarIcon />
          </IconButton>
        </div>
      </aside>
      <div className="flex min-h-dvh min-w-0 flex-1 flex-col">
        <TopBar
          className="lg:hidden"
          leading={
            <IconButton label={unread ? `Open navigation (${unread} unread activity items)` : 'Open navigation'} lift onClick={() => setDrawerOpen(true)} className="relative -ml-2">
              <MenuIcon />
              <span aria-hidden style={{ transitionDuration: `${READ_FADE_MS}ms` }}
                className={`absolute right-2 top-2 size-2 rounded-full bg-gold transition-[opacity,transform] motion-reduce:transition-none ${unread ? 'opacity-100' : 'scale-50 opacity-0'}`} />
            </IconButton>
          }
        />
        <main id="main-content" tabIndex={-1} className={`mx-auto w-full ${contentWidth} flex-1 scroll-mt-20 px-4 py-8 lg:scroll-mt-4 lg:px-8 lg:pt-12`}>
          <RouteContent />
        </main>
        <LegalFooter className={`mx-auto mt-8 w-full ${contentWidth} px-4 pb-8 lg:px-8`} />
      </div>
      {drawerOpen ? <CoachDrawer onClose={() => setDrawerOpen(false)} /> : null}
    </div>
  );
}
