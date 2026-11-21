import { matchEntry, type Range } from './match';
import { SYNONYMS, type Concept } from './synonyms';

export type SearchGroup = 'clients' | 'programs' | 'pages' | 'meetings' | 'clientsPage' | 'settings';

/** Keys for the result icons; the palette maps them to components in `@/components/icons`. */
export type SearchIconKey = 'user' | 'clients' | 'calendar' | 'activity' | 'templates' | 'billing' | 'settings' | 'todo' | 'attendance' | 'timeOff' | 'extraHours' | 'invite' | 'services' | 'mesocycle' | 'personalTraining' | 'nutrition';

/** What the viewer can reach beyond the coach routes every staff member has. */
export type SearchAccess = { admin: boolean; scheduling: boolean };

export type SearchEntry = {
  /** Unique across all entries: a destination's slug, or `client:<id>`. */
  id: string;
  title: string;
  group: SearchGroup;
  icon: SearchIconKey;
  /** A path, plus `#id` to scroll to a section's heading. */
  to: string;
  /** Where it lives, shown under the title ("Meetings › To-dos"). Its words are searchable too. */
  trail?: string;
  concepts?: readonly Concept[];
  /** Phrasings specific to this entry; shared ones belong in `SYNONYMS`. */
  terms?: readonly string[];
  requires?: readonly (keyof SearchAccess)[];
  /** Listed before anything is typed. Clients and programs never are. */
  suggested?: boolean;
  /** Shown under the title but not searched (a client's email, a program's client). */
  detail?: string;
  /** Client results only. */
  clientStatus?: 'pending' | 'invited' | 'active' | 'disabled';
};

export type SearchResult = SearchEntry & { score: number; ranges: Range[] };
export type ResultGroup = { group: SearchGroup; label: string; results: SearchResult[] };

export const GROUP_LABELS: Record<SearchGroup, string> = {
  clients: 'Clients',
  programs: 'Programs',
  pages: 'Pages',
  meetings: 'Meetings',
  clientsPage: 'Clients page',
  settings: 'Settings',
};

const GROUP_ORDER: SearchGroup[] = ['clients', 'programs', 'pages', 'meetings', 'clientsPage', 'settings'];
const GROUP_LIMIT: Record<SearchGroup, number> = { clients: 6, programs: 6, pages: 5, meetings: 5, clientsPage: 5, settings: 5 };

export function searchTerms(entry: SearchEntry): string[] {
  return [...(entry.concepts ?? []).flatMap((c) => SYNONYMS[c]), ...(entry.terms ?? []), ...(entry.trail ? [entry.trail] : [])];
}

export function clientEntries(clients: readonly { id: string; full_name: string; email: string; status: SearchEntry['clientStatus'] }[]): SearchEntry[] {
  return clients.map((c) => ({
    id: `client:${c.id}`,
    title: c.full_name.trim() || c.email,
    group: 'clients',
    icon: 'user',
    to: `/coach/clients/${c.id}`,
    // The part before @ only, so a shared domain doesn't match every client.
    terms: [c.email.split('@')[0] ?? ''],
    detail: c.email,
    clientStatus: c.status,
  }));
}

const PROGRAM_KINDS = {
  mesocycle: { label: 'Mesocycle', icon: 'mesocycle', path: 'programs' },
  personal_training: { label: 'Personal training', icon: 'personalTraining', path: 'programs' },
  nutrition: { label: 'Nutrition', icon: 'nutrition', path: 'nutrition' },
} as const;

/** Programs by name; the service is searchable too ("mesocycle"), the client's name only shown. */
export function programEntries(programs: readonly { id: string; clientId: string; clientName: string; service: keyof typeof PROGRAM_KINDS; title: string }[]): SearchEntry[] {
  return programs.map((p) => {
    const kind = PROGRAM_KINDS[p.service];
    return {
      id: `program:${p.id}`,
      title: p.title,
      group: 'programs',
      icon: kind.icon,
      to: `/coach/clients/${p.clientId}/${kind.path}/${p.id}`,
      terms: [kind.label, 'program'],
      detail: `${p.clientName} · ${kind.label}`,
    };
  });
}

const rank = (a: SearchResult, b: SearchResult) =>
  b.score - a.score || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group) || a.title.localeCompare(b.title);

/**
 * Ranked results in groups, ordered by each group's best match, so "Gra" leads with Clients and
 * "calendar" with Meetings. An empty query lists the suggested pages and sections.
 */
export function search(entries: readonly SearchEntry[], query: string, access: SearchAccess): ResultGroup[] {
  const allowed = entries.filter((e) => (e.requires ?? []).every((r) => access[r]));
  const results: SearchResult[] = [];
  if (!query.trim()) {
    for (const e of allowed) if (e.suggested) results.push({ ...e, score: 0, ranges: [] });
    results.sort((a, b) => GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group));
  } else {
    for (const e of allowed) {
      const match = matchEntry(query, e.title, searchTerms(e));
      // Active clients first among equally good matches.
      if (match) results.push({ ...e, score: match.score - (e.clientStatus && e.clientStatus !== 'active' ? 5 : 0), ranges: match.ranges });
    }
    results.sort(rank);
  }
  const groups = new Map<SearchGroup, SearchResult[]>();
  for (const r of results) {
    const list = groups.get(r.group) ?? [];
    if (!groups.has(r.group)) groups.set(r.group, list);
    if (list.length < GROUP_LIMIT[r.group]) list.push(r);
  }
  return [...groups].map(([group, list]) => ({ group, label: GROUP_LABELS[group], results: list }));
}
