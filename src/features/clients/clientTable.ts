import type { ServiceKind } from '@/domain/programs/contract';
import type { ClientRow, ClientStatus } from './api';

export type SortKey = 'name' | 'email' | 'status' | 'services' | 'added';
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

export const DEFAULT_TABLE_STATE: ClientTableState = { query: '', statuses: [], services: [], sort: 'name', dir: 'asc' };

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
    sort: pick(params.get('sort'), ['name', 'email', 'status', 'services', 'added'] as const, 'name'),
    dir: pick(params.get('dir'), ['asc', 'desc'] as const, 'asc'),
  };
}

export function paramsFromState(state: ClientTableState): URLSearchParams {
  const params = new URLSearchParams();
  if (state.query) params.set('q', state.query);
  if (state.statuses.length) params.set('status', ALL_STATUSES.filter((s) => state.statuses.includes(s)).join(','));
  if (state.services.length) params.set('service', ALL_SERVICES.filter((s) => state.services.includes(s)).join(','));
  if (state.sort !== 'name') params.set('sort', state.sort);
  if (state.dir !== 'asc') params.set('dir', state.dir);
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
