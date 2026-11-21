import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { IconButton } from '@/components/controls';
import { Highlighted } from '@/components/Highlighted';
import { Kbd } from '@/components/ui';
import {
  BillingIcon, CalendarIcon, CheckCircleIcon, ClientsIcon, CloseIcon, ExtraHoursIcon, HelpIcon, InviteIcon, NutritionIcon, ProgressIcon,
  ReviewsIcon, SearchIcon, ServicesIcon, SettingsIcon, TemplatesIcon, TimeOffIcon, TodoIcon, TrainingIcon, UserIcon,
} from '@/components/icons';
import { useViewer } from '@/app/auth';
import { COACH_DESTINATIONS } from '@/domain/search/destinations';
import { clientEntries, programEntries, search, type SearchIconKey, type SearchResult } from '@/domain/search/search';
import { useClients } from '@/features/clients/api';
import { statusBadge } from '@/features/clients/ClientsTable';
import { useSearchablePrograms } from '@/features/programs/api';
import { programTitle } from '@/features/programs/ProgramsCard';
import { searchShortcut } from './shortcut';

const ICONS: Record<SearchIconKey, () => ReactNode> = {
  user: UserIcon,
  clients: ClientsIcon,
  calendar: CalendarIcon,
  activity: ReviewsIcon,
  templates: TemplatesIcon,
  billing: BillingIcon,
  settings: SettingsIcon,
  todo: TodoIcon,
  attendance: CheckCircleIcon,
  timeOff: TimeOffIcon,
  extraHours: ExtraHoursIcon,
  invite: InviteIcon,
  services: ServicesIcon,
  // As on the client's Programs card.
  mesocycle: ProgressIcon,
  personalTraining: TrainingIcon,
  nutrition: NutritionIcon,
  help: HelpIcon,
};

/**
 * Coach search (decision 0054): clients, pages and sections, ranked as you type. ARIA 1.2 combobox
 * with a grouped listbox: arrows move (wrapping), Enter opens, Escape closes. Clients come from the
 * clients query, so RLS decides who appears.
 */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const id = useId();
  const navigate = useNavigate();
  const viewer = useViewer().data;
  const clients = useClients();
  const programs = useSearchablePrograms();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const list = useRef<HTMLDivElement>(null);
  const admin = viewer?.staffRole === 'admin';
  const scheduling = !!viewer?.scheduling;

  const entries = useMemo(() => {
    const names = new Map((clients.data ?? []).map((c) => [c.id, c.full_name]));
    const titled = (programs.data ?? []).map((p) => ({ id: p.id, clientId: p.client_id, clientName: names.get(p.client_id) ?? '', service: p.service, title: programTitle(p) }));
    return [...COACH_DESTINATIONS, ...clientEntries(clients.data ?? []), ...programEntries(titled)];
  }, [clients.data, programs.data]);
  const groups = useMemo(() => search(entries, query, { admin, scheduling }), [entries, query, admin, scheduling]);
  const flat = groups.flatMap((g) => g.results);
  const current = Math.min(active, flat.length - 1);
  const optionId = (index: number) => `${id}-option-${index}`;

  // Back at the top, the first group's heading comes into view too.
  useEffect(() => {
    if (current <= 0) list.current?.scrollTo({ top: 0 });
    else document.getElementById(`${id}-option-${current}`)?.scrollIntoView({ block: 'nearest' });
  }, [id, current]);

  function open(result: SearchResult) {
    onClose();
    navigate(result.to);
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!flat.length) return;
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setActive((current + step + flat.length) % flat.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const result = flat[current];
      if (result) open(result);
    }
  }

  const typed = query.trim();
  let index = 0;

  return (
    <Dialog bare title="Search" onClose={onClose}>
      <div className="flex items-center gap-3 border-b border-line pl-4 pr-2">
        <span className="text-muted"><SearchIcon /></span>
        <input
          role="combobox"
          aria-expanded
          aria-controls={`${id}-results`}
          aria-autocomplete="list"
          aria-activedescendant={current >= 0 ? optionId(current) : undefined}
          aria-label="Search clients, pages and settings"
          autoFocus
          autoComplete="off"
          spellCheck={false}
          value={query}
          placeholder="Search clients, pages and settings"
          onChange={(e) => { setQuery(e.target.value); setActive(0); }}
          onKeyDown={onKeyDown}
          className="palette-input min-h-14 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-muted/60 focus:outline-none"
        />
        <span className="pointer-coarse:hidden pr-2"><Kbd>esc</Kbd></span>
        <IconButton label="Close search" size="sm" onClick={onClose} className="pointer-fine:hidden"><CloseIcon /></IconButton>
      </div>

      <div ref={list} id={`${id}-results`} role="listbox" aria-label="Results" className="min-h-0 flex-1 overflow-y-auto p-1.5">
        {groups.map((group) => (
          <div key={group.group} role="group" aria-label={group.label} className="pb-1">
            <div aria-hidden className="px-2.5 pb-1 pt-2 text-xs font-medium text-muted">{group.label}</div>
            {group.results.map((result) => {
              const i = index++;
              const selected = i === current;
              const Icon = ICONS[result.icon];
              return (
                <div
                  key={result.id}
                  id={optionId(i)}
                  role="option"
                  aria-selected={selected}
                  // Keep focus in the input.
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => open(result)}
                  onMouseMove={() => { if (!selected) setActive(i); }}
                  className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-inner px-2.5 py-1.5 ${selected ? 'bg-surface-raised' : ''}`}
                >
                  <span className={`inline-flex ${selected ? 'text-gold-fg' : 'text-muted'}`}><Icon /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-text"><Highlighted text={result.title} ranges={result.ranges} /></span>
                    {result.trail || result.detail ? <span className="block truncate text-xs text-muted">{result.detail ?? result.trail}</span> : null}
                  </span>
                  {result.clientStatus && result.clientStatus !== 'active' ? statusBadge(result.clientStatus) : null}
                  <span aria-hidden className={`text-xs text-muted ${selected ? '' : 'invisible'}`}>↵</span>
                </div>
              );
            })}
          </div>
        ))}
        {typed && !flat.length ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-text">No matches for “{typed}”</p>
            <p className="mt-1 text-xs text-muted">Try a client’s name, or a page like Meetings or Billing.</p>
          </div>
        ) : null}
        {typed && (clients.isPending || programs.isPending) ? <p className="px-2.5 py-2 text-xs text-muted">Loading clients and programs…</p> : null}
        {typed && (clients.error || programs.error) ? <p className="px-2.5 py-2 text-xs text-muted">Some clients or programs couldn’t be loaded, so results may be missing.</p> : null}
      </div>

      <p role="status" className="sr-only">{typed ? `${flat.length} ${flat.length === 1 ? 'result' : 'results'}` : ''}</p>
      <footer className="pointer-coarse:hidden flex items-center gap-4 border-t border-line px-4 py-2 text-xs text-muted">
        <span className="flex items-center gap-1.5"><Kbd>↑</Kbd><Kbd>↓</Kbd> to move</span>
        <span className="flex items-center gap-1.5"><Kbd>↵</Kbd> to open</span>
        <span className="ml-auto flex items-center gap-1.5"><Kbd>{searchShortcut().label}</Kbd> to close</span>
      </footer>
    </Dialog>
  );
}
