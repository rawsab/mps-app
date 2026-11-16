import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { Badge, Button } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { formatDate } from '@/lib/format';
import { SERVICE_SHORT_LABELS, SERVICES } from '@/lib/services';
import type { ClientRow, ClientStatus } from './api';
import {
  ALL_STATUSES,
  DEFAULT_TABLE_STATE,
  filterAndSortClients,
  liveServices,
  paramsFromState,
  STATUS_LABELS,
  stateFromParams,
  type ClientTableState,
  type SortKey,
} from './clientTable';

export function statusBadge(status: ClientStatus) {
  return <Badge tone={status === 'disabled' ? 'danger' : status === 'active' ? 'gold' : 'neutral'}>{STATUS_LABELS[status]}</Badge>;
}


const COLUMNS: { key: SortKey; label: string; className?: string }[] = [
  { key: 'name', label: 'Name', className: 'w-[19%]' },
  { key: 'email', label: 'Email', className: 'w-[28%]' },
  { key: 'services', label: 'Services' },
  { key: 'status', label: 'Status', className: 'w-32' },
  { key: 'added', label: 'Added', className: 'w-32' },
];

const controlClass =
  'min-h-10 rounded-card border border-line bg-surface px-3 text-sm text-text focus:border-gold focus:outline-none';

/** Notion-style client database: search, filter chips, sortable columns. State lives in the URL. */
export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // React state is the source of truth (updates queue reliably); the URL mirrors it so filters
  // survive navigating to a client and back, and can be bookmarked.
  const [state, setState] = useState<ClientTableState>(() => stateFromParams(params));
  const urlSearch = paramsFromState(state).toString();
  useEffect(() => {
    if (urlSearch !== params.toString()) setParams(new URLSearchParams(urlSearch), { replace: true });
  }, [urlSearch]);

  const visible = useMemo(() => filterAndSortClients(rows, state), [rows, state]);
  const filtersActive = state.query !== '' || state.statuses.length > 0 || state.services.length > 0;

  const update = (patch: Partial<ClientTableState>) => setState((prev) => ({ ...prev, ...patch }));
  const sortBy = (key: SortKey) =>
    setState((prev) => ({
      ...prev,
      sort: key,
      dir: prev.sort === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : key === 'added' ? 'desc' : 'asc',
    }));

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
    return counts;
  }, [rows]);
  const serviceCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const r of rows) for (const e of liveServices(r)) counts[e.service] = (counts[e.service] ?? 0) + 1;
    return counts;
  }, [rows]);

  return (
    <div className="grid gap-3">
      <div className="relative flex flex-wrap items-end gap-2" role="search">
        <label className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
          <span className="text-xs font-medium text-muted">Search</span>
          <input
            type="search"
            value={state.query}
            onChange={(e) => update({ query: e.target.value })}
            placeholder="Name or email"
            className={controlClass}
          />
        </label>
        <MultiSelectFilter
          label="Status"
          options={ALL_STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st], display: statusBadge(st), count: statusCounts[st] ?? 0 }))}
          selected={state.statuses}
          onChange={(statuses) => update({ statuses })}
          hint="Shows any of these"
        />
        <MultiSelectFilter
          label="Services"
          options={SERVICES.map((sv) => ({ value: sv, label: SERVICE_SHORT_LABELS[sv], count: serviceCounts[sv] ?? 0 }))}
          selected={state.services}
          onChange={(services) => update({ services })}
          hint="Clients with all of these"
        />
        {filtersActive ? (
          <Button variant="ghost" className="min-h-10" onClick={() => update({ query: DEFAULT_TABLE_STATE.query, statuses: [], services: [] })}>
            Clear filters
          </Button>
        ) : null}
      </div>

      <p className="text-xs text-muted" aria-live="polite">
        {visible.length === rows.length ? `${rows.length} client${rows.length === 1 ? '' : 's'}` : `${visible.length} of ${rows.length} clients`}
      </p>

      {/* The table scrolls inside its own frame on narrow screens; the page itself never overflows. */}
      <div className="overflow-x-auto rounded-card border border-line bg-surface">
        <table className="w-full min-w-[720px] table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-line text-left">
              {COLUMNS.map((col) => {
                const active = state.sort === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className={`px-3 py-0 font-medium text-muted ${col.className ?? ''}`}
                    aria-sort={active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(col.key)}
                      className={`flex min-h-10 w-full items-center gap-1 text-left hover:text-text ${active ? 'text-text' : ''}`}
                    >
                      {col.label}
                      <span aria-hidden className={`text-xs ${active ? 'text-gold-fg' : 'opacity-0'}`}>
                        {active && state.dir === 'desc' ? '↓' : '↑'}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={row.id}
                onClick={(e) => {
                  if (!(e.target as HTMLElement).closest('a')) navigate(`/coach/clients/${row.id}`);
                }}
                className="row-link cursor-pointer border-b border-line align-top last:border-b-0 hover:bg-surface-raised"
              >
                <td className="p-0">
                  <Link to={`/coach/clients/${row.id}`} className="block min-h-11 truncate px-3 py-2.5 font-medium text-text">
                    <span className="link link--bare">{row.full_name}</span>
                  </Link>
                </td>
                <td className="truncate px-3 py-2.5 text-muted" title={row.email}>
                  {row.email}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {liveServices(row).length === 0 ? <span className="text-muted">—</span> : null}
                    {liveServices(row).map((e) => (
                      <ServiceTag key={e.id} service={e.service} paused={e.status === 'paused'} />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5">{statusBadge(row.status)}</td>
                <td className="px-3 py-2.5 text-muted">{formatDate(row.created_at)}</td>
              </tr>
            ))}
            {visible.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-3 py-8 text-center text-muted">
                  {rows.length === 0 ? 'No clients yet.' : 'No clients match these filters.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ServiceTag({ service, paused }: { service: ServiceKind; paused: boolean }) {
  return (
    <span
      className={`inline-flex items-center rounded px-1.5 py-0.5 text-xs ${paused ? 'bg-surface-raised text-muted' : 'bg-gold/15 text-gold-fg'}`}
      title={paused ? `${SERVICE_SHORT_LABELS[service]} (paused)` : SERVICE_SHORT_LABELS[service]}
    >
      {SERVICE_SHORT_LABELS[service]}
      {paused ? ' · paused' : ''}
    </span>
  );
}
