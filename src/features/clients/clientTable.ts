import type { ServiceKind } from '@/domain/programs/contract';
import type { ClientRow, ClientStatus } from './api';

export type SortKey = 'name' | 'email' | 'status' | 'services' | 'added' | 'edited';
export type SortDir = 'asc' | 'desc';

export type ClientTableState = {
  query: string;
  /** Empty = any status; otherwise the client's status is one of these. */
  statuses: ClientStatus[];
  /** Empty = any; otherwise the client has every one of these live services (and possibly more). */
  services: ServiceKind[];
  sort: SortKey;
  dir: SortDir;
};

/** Most recently edited first, so the clients Matt just changed are on top. */
export const DEFAULT_TABLE_STATE: ClientTableState = { query: '', statuses: [], services: [], sort: 'edited', dir: 'desc' };

export const ALL_STATUSES: ClientStatus[] = ['active', 'invited', 'pending', 'disabled'];
const ALL_SERVICES: ServiceKind[] = ['personal_training', 'mesocycle', 'nutrition'];

export const STATUS_LABELS: Record<ClientStatus, string> = {
  active: 'Active',
  invited: 'Invited',
  pending: 'Not invited',
  disabled: 'Disabled',
};

const STATUS_ORDER = ALL_STATUSES;

/** Enrollments that are live (active or paused); ended services are history. */
export function liveServices(row: ClientRow) {
  return row.service_enrollments.filter((e) => e.status !== 'ended');
}

export function filterAndSortClients(rows: ClientRow[], state: ClientTableState): ClientRow[] {
  const q = state.query.trim().toLowerCase();
  const filtered = rows.filter((row) => {
    if (q && !row.full_name.toLowerCase().includes(q) && !row.email.toLowerCase().includes(q)) return false;
    if (state.statuses.length && !state.statuses.includes(row.status)) return false;
    const services = new Set(liveServices(row).map((e) => e.service));
    return state.services.every((s) => services.has(s));
  });

  const key = (row: ClientRow): string | number => {
    switch (state.sort) {
      case 'name':
        return row.full_name.toLowerCase();
      case 'email':
        return row.email.toLowerCase();
      case 'status':
        return STATUS_ORDER.indexOf(row.status);
      case 'services':
        return liveServices(row).length;
      case 'added':
        return row.created_at;
      case 'edited':
        return Date.parse(lastEditedAt(row));
    }
  };
  const sign = state.dir === 'asc' ? 1 : -1;
  return [...filtered].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    if (ka < kb) return -sign;
    if (ka > kb) return sign;
    // Stable, predictable tie-break by name.
    return a.full_name.localeCompare(b.full_name);
  });
}

/** Reads table state from URL search params so filters survive navigation and can be bookmarked. */
export function stateFromParams(params: URLSearchParams): ClientTableState {
  const pick = <T extends string>(value: string | null, allowed: readonly T[], fallback: T): T =>
    value && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
  // Comma-separated lists; unknown values are dropped and the result follows the canonical order.
  const pickMany = <T extends string>(value: string | null, allowed: readonly T[]): T[] => {
    const given = new Set((value ?? '').split(','));
    return allowed.filter((v) => given.has(v));
  };
  return {
    query: params.get('q') ?? '',
    statuses: pickMany(params.get('status'), ALL_STATUSES),
    services: pickMany(params.get('service'), ALL_SERVICES),
    sort: pick(params.get('sort'), ['name', 'email', 'status', 'services', 'added', 'edited'] as const, DEFAULT_TABLE_STATE.sort),
    dir: pick(params.get('dir'), ['asc', 'desc'] as const, DEFAULT_TABLE_STATE.dir),
  };
}

export function paramsFromState(state: ClientTableState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.statuses.length) params.set('status', ALL_STATUSES.filter((s) => state.statuses.includes(s)).join(','));
  if (state.services.length) params.set('service', ALL_SERVICES.filter((s) => state.services.includes(s)).join(','));
  if (state.sort !== DEFAULT_TABLE_STATE.sort) params.set('sort', state.sort);
  if (state.dir !== DEFAULT_TABLE_STATE.dir) params.set('dir', state.dir);
  return params;
}

export type ClientOverview = {
  total: number;
  /** Clients with a live (active or paused) enrollment in each service. */
  services: Record<ServiceKind, number>;
  statuses: Record<ClientStatus, number>;
  /** Follow-ups, by name. Disabled clients are left out on purpose. */
  notInvited: ClientRow[];
  inviteUnaccepted: ClientRow[];
};

export function clientOverview(rows: ClientRow[]): ClientOverview {
  const services = Object.fromEntries(ALL_SERVICES.map((s) => [s, 0])) as Record<ServiceKind, number>;
  const statuses = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ClientStatus, number>;
  for (const row of rows) {
    statuses[row.status] += 1;
    for (const service of new Set(liveServices(row).map((e) => e.service))) services[service] += 1;
  }
  const byName = (status: ClientStatus) =>
    rows.filter((r) => r.status === status).sort((a, b) => a.full_name.localeCompare(b.full_name));
  return { total: rows.length, services, statuses, notInvited: byName('pending'), inviteUnaccepted: byName('invited') };
}

/** The client record or any of its services, whichever changed last (pausing a service is an edit). */
export function lastEditedAt(row: ClientRow): string {
  return row.service_enrollments.reduce((latest, enrollment) =>
    enrollment.updated_at && Date.parse(enrollment.updated_at) > Date.parse(latest) ? enrollment.updated_at : latest, row.updated_at);
}

// ---------------------------------------------------------------------------------------------
// Column widths. Defaults reproduce the earlier layout (Name 16%, Email 21%, Services taking the
// rest) on the coach page's ~1000px table. Each viewer's resized widths are remembered locally.

export type ColumnWidths = Record<SortKey, number>;

export const DEFAULT_COLUMN_WIDTHS: ColumnWidths = { name: 160, email: 210, services: 180, status: 128, added: 128, edited: 192 };
export const MIN_COLUMN_WIDTHS: ColumnWidths = { name: 96, email: 112, services: 96, status: 96, added: 88, edited: 112 };
const MAX_COLUMN_WIDTH = 640;

export const clampColumnWidth = (key: SortKey, width: number) =>
  Math.round(Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTHS[key], width)));

/** Stored widths, ignoring unknown keys and bad values; anything missing uses the default. */
export function parseColumnWidths(raw: string | null): ColumnWidths {
  const widths = { ...DEFAULT_COLUMN_WIDTHS };
  try {
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    for (const key of Object.keys(widths) as SortKey[]) {
      const value = stored[key];
      if (typeof value === 'number' && Number.isFinite(value)) widths[key] = clampColumnWidth(key, value);
    }
  } catch {
    // Corrupt storage falls back to the defaults.
  }
  return widths;
}
