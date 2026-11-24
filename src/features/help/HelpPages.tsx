import { lazy, Suspense, useEffect, useRef, useState, type ComponentType, type ReactNode } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation, useMatch, useParams } from 'react-router';
import type { MDXProps } from 'mdx/types';
import { IconButton } from '@/components/controls';
import { ChevronIcon } from '@/components/icons';
import { LoadingRegion, SkeletonText } from '@/components/Skeleton';
import { Card, PageHeader } from '@/components/ui';
import { HELP_GROUP_LABELS, HELP_PAGES, HELP_PATH, helpPath, type HelpGroup, type HelpPage } from '@/domain/help/pages';
import { HelpSearch } from './HelpSearch';
import { mdxComponents } from './mdxComponents';
import { HelpThumbnail } from './thumbnails';
import { SECTIONS_BY_PAGE } from './sectionIndex';

/** One chunk per page, loaded when it's opened. */
const loaders = import.meta.glob<{ default: ComponentType<MDXProps> }>('./content/*.mdx');
const CONTENT = new Map(HELP_PAGES.map((page) => {
  const load = loaders[`./content/${page.slug}.mdx`];
  return [page.slug, load ? lazy(load) : null];
}));

const GROUPS = Object.keys(HELP_GROUP_LABELS) as HelpGroup[];
const pagesIn = (group: HelpGroup) => HELP_PAGES.filter((page) => page.group === group);

/** `/coach/help`: every topic, grouped, with search across all of them (decision 0057). */
export function HelpIndexPage() {
  return (
    <div className="max-w-4xl">
      <PageHeader title="Help" subtitle="How to use the coach workspace." />
      {/* Wide screens have search beside the topics. */}
      <div className="mb-8 max-w-xl lg:hidden"><HelpSearch /></div>
      <div className="flex flex-col gap-8">
        {GROUPS.map((group) => (
          <section key={group} aria-labelledby={`help-group-${group}`}>
            <h2 id={`help-group-${group}`} className="mb-3 text-sm font-medium text-muted/60">{HELP_GROUP_LABELS[group]}</h2>
            <ul className="grid gap-4 sm:grid-cols-2">
              {pagesIn(group).map((page) => {
                return (
                  <li key={page.slug}>
                    <Link to={helpPath(page.slug)} className="btn-motion group block h-full rounded-card focus-visible:shadow-focus focus-visible:outline-none">
                      <Card as="div" padding="none" className="h-full">
                        <HelpThumbnail slug={page.slug} />
                        <span className="block p-4">
                          <span className="block font-medium text-text transition-colors group-hover:text-gold-fg">{page.title}</span>
                          <span className="mt-1 block text-sm text-muted">{page.summary}</span>
                        </span>
                      </Card>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

/**
 * Topics, each with its page's headings under a chevron. The open page's list expands on its own and
 * collapses again when you move to another page, unless you opened it yourself with the chevron.
 * Stays mounted while pages change (HelpLayout), so its lists animate.
 */
function TopicNav({ current }: { current: string }) {
  /** Lists opened or closed with the chevron, by page. */
  const [overrides, setOverrides] = useState(() => new Map<string, boolean>());
  // Arriving at a page always shows its headings, even if its list was closed by hand earlier.
  useEffect(() => {
    setOverrides((prev) => {
      if (prev.get(current) !== false) return prev;
      const next = new Map(prev);
      next.delete(current);
      return next;
    });
  }, [current]);
  const isOpen = (slug: string) => overrides.get(slug) ?? slug === current;
  const toggle = (slug: string) => setOverrides(new Map(overrides).set(slug, !isOpen(slug)));

  return (
    <nav aria-label="Help topics" className="flex flex-col gap-6.5">
      {/* The main Help page, with every topic as a card. `end` so it isn't active on a topic page. */}
      <NavLink to={HELP_PATH} end
        className={({ isActive }) => `-mb-2.5 flex min-h-9 items-center rounded-card px-3 text-sm transition-colors ${isActive ? 'bg-surface-raised font-medium text-text' : 'text-muted hover:bg-surface-raised hover:text-text'}`}>
        Overview
      </NavLink>
      {GROUPS.map((group) => (
        <div key={group}>
          {/* Lighter than the page links, so group names read as labels. */}
          <p className="mb-1 px-3 text-xs font-medium text-muted/60">{HELP_GROUP_LABELS[group]}</p>
          <ul className="flex flex-col gap-0.5">
            {pagesIn(group).map((page) => {
              const sections = SECTIONS_BY_PAGE.get(page.slug) ?? [];
              const open = isOpen(page.slug);
              const listId = `help-toc-${page.slug}`;
              return (
                <li key={page.slug} className="relative">
                  <NavLink to={helpPath(page.slug)}
                    className={({ isActive }) => `flex min-h-9 items-center rounded-card pl-3 pr-10 text-sm transition-colors ${isActive ? 'bg-surface-raised font-medium text-text' : 'text-muted hover:bg-surface-raised hover:text-text'}`}>
                    {page.title}
                  </NavLink>
                  {sections.length ? (
                    <>
                      {/* Beside the link rather than in it, so the row still opens the page. */}
                      <IconButton label={`${page.title} sections`} size="sm" aria-expanded={open} aria-controls={listId} onClick={() => toggle(page.slug)} className="absolute right-0 top-0">
                        <ChevronIcon open={open} />
                      </IconButton>
                      <div id={listId} aria-hidden={!open} inert={!open} data-open={open} className="animated-disclosure-content">
                        <div className="min-h-0 overflow-hidden">
                          <ul className="mb-1.5 ml-3 mt-0.5 border-l border-line">
                            {sections.map((section) => (
                              <li key={section.id}>
                                <Link to={`${helpPath(page.slug)}#${section.id}`}
                                  className={`flex min-h-8 items-center rounded-r-card pr-2 text-[0.8125rem] leading-5 text-muted transition-colors hover:bg-surface-raised hover:text-text ${section.level === 3 ? 'pl-6' : 'pl-3'}`}>
                                  {section.title}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    </>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function PrevNext({ index }: { index: number }) {
  const prev: HelpPage | undefined = HELP_PAGES[index - 1];
  const next: HelpPage | undefined = HELP_PAGES[index + 1];
  return (
    <nav aria-label="More help" className="mt-12 grid gap-3 border-t border-line pt-6 sm:grid-cols-2">
      {prev ? (
        <Link to={helpPath(prev.slug)} className="group rounded-card px-1 py-1">
          <span className="block text-xs text-muted">Previous</span>
          <span className="link text-sm font-medium text-text group-hover:text-gold-fg">{prev.title}</span>
        </Link>
      ) : <span />}
      {next ? (
        <Link to={helpPath(next.slug)} className="group rounded-card px-1 py-1 sm:text-right">
          <span className="block text-xs text-muted">Next</span>
          <span className="link text-sm font-medium text-text group-hover:text-gold-fg">{next.title}</span>
        </Link>
      ) : null}
    </nav>
  );
}

function ArticleSkeleton() {
  return (
    <LoadingRegion label="Loading help page" className="flex flex-col gap-6">
      <SkeletonText size="lg" width="w-2/5" />
      <SkeletonText lines={4} size="base" width="w-3/4" />
      <SkeletonText lines={3} size="base" width="w-1/2" />
    </LoadingRegion>
  );
}

/** The topic list's scroll area, with a fade at the bottom while there's more below. */
function TopicScroller({ children }: { children: ReactNode }) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setMore(el.scrollTop + el.clientHeight < el.scrollHeight - 1);
    measure();
    // Opening or closing a page's headings changes the height, as does resizing the window.
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    el.addEventListener('scroll', measure, { passive: true });
    return () => { observer.disconnect(); el.removeEventListener('scroll', measure); };
  }, []);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="-mx-1 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 pb-4">
        {children}
      </div>
      <span aria-hidden className={`pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-ink to-transparent transition-opacity duration-200 motion-reduce:transition-none ${more ? 'opacity-100' : 'opacity-0'}`} />
    </div>
  );
}

/**
 * The Help frame: on wide screens, the topics and search stay in place beside the index or a page
 * while it changes; only the content settles in.
 */
export function HelpLayout() {
  const slug = useMatch(`${HELP_PATH}/:slug`)?.params.slug;
  const location = useLocation();
  // A new page starts at the top; a link to a heading scrolls there instead (useHashTarget).
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0 });
  }, [slug, location.hash]);
  return (
    <div className="mx-auto max-w-6xl lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-12">
      <aside className="hidden lg:block">
        {/* Fits the screen: a long topic list scrolls on its own, below the search. z-10 keeps the search
            results above the page beside it, whose entrance animation gives it its own layer. */}
        <div className="sticky top-6 z-10 flex max-h-[calc(100dvh-3rem)] flex-col gap-5">
          <HelpSearch popupClassName="w-[26rem]" />
          <TopicScroller>
            <TopicNav current={slug ?? ''} />
          </TopicScroller>
        </div>
      </aside>
      <div key={slug ?? 'index'} className="page-enter min-w-0">
        <Outlet />
      </div>
    </div>
  );
}

/** `/coach/help/:slug`: one page, inside HelpLayout. */
export function HelpArticlePage() {
  const { slug = '' } = useParams();
  const index = HELP_PAGES.findIndex((page) => page.slug === slug);
  const page = HELP_PAGES[index];
  const Content = CONTENT.get(slug);
  if (!page || !Content) return <Navigate to={HELP_PATH} replace />;
  return (
    <article className="min-w-0 max-w-[44rem]">
      <div className="mb-6 flex flex-col gap-3 lg:hidden">
        <Link to={HELP_PATH} className="link self-start text-sm text-muted">All help topics</Link>
        <HelpSearch />
      </div>
      <PageHeader title={page.title} subtitle={page.summary} />
      <Suspense fallback={<ArticleSkeleton />}>
        <Content components={mdxComponents} />
      </Suspense>
      <PrevNext index={index} />
    </article>
  );
}
