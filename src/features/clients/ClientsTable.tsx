import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { MultiSelectFilter } from '@/components/MultiSelectFilter';
import { Badge, Button } from '@/components/ui';
import type { ServiceKind } from '@/domain/programs/contract';
import { formatDate, formatDateTime } from '@/lib/format';
import { SERVICE_SHORT_LABELS, SERVICES } from '@/lib/services';
import type { ClientRow, ClientStatus } from './api';
import {
  ALL_STATUSES,
  clampColumnWidth,
  DEFAULT_COLUMN_WIDTHS,
  MIN_COLUMN_WIDTHS,
  parseColumnWidths,
  type ColumnWidths,
  clientOverview,
  DEFAULT_TABLE_STATE,
  filterAndSortClients,
  lastEditedAt,
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


const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email' },
  { key: 'services', label: 'Services' },
  { key: 'status', label: 'Status' },
  { key: 'added', label: 'Added' },
  { key: 'edited', label: 'Last edited' },
];

const WIDTHS_STORAGE_KEY = 'mps.clientsTable.columnWidths';

/** Per-viewer column widths, remembered in this browser only (a convenience, not shared state). */
function useColumnWidths() {
  const [widths, setWidths] = useState<ColumnWidths>(() => {
    try { return parseColumnWidths(localStorage.getItem(WIDTHS_STORAGE_KEY)); } catch { return { ...DEFAULT_COLUMN_WIDTHS }; }
  });
  useEffect(() => {
    try { localStorage.setItem(WIDTHS_STORAGE_KEY, JSON.stringify(widths)); } catch { /* Storage unavailable: widths last for this visit. */ }
  }, [widths]);
  const resize = (key: SortKey, width: number) => setWidths((current) => ({ ...current, [key]: clampColumnWidth(key, width) }));
  return { widths, resize };
}

/** Drag (pointer), arrow keys (keyboard) or double-click (reset) to size a column. */
function ResizeHandle({ label, width, min, onResize, onReset }: { label: string; width: number; min: number; onResize: (width: number) => void; onReset: () => void }) {
  const start = useRef<{ x: number; width: number } | null>(null);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label={`Resize ${label} column`}
      aria-valuenow={width}
      aria-valuemin={min}
      tabIndex={0}
      title="Drag to resize · double-click to reset"
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => { e.stopPropagation(); onReset(); }}
      onPointerDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        start.current = { x: e.clientX, width };
      }}
      onPointerMove={(e) => { if (start.current) onResize(start.current.width + e.clientX - start.current.x); }}
      onPointerUp={() => { start.current = null; }}
      onPointerCancel={() => { start.current = null; }}
      onKeyDown={(e) => {
        if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
        e.preventDefault();
        onResize(width + (e.key === 'ArrowRight' ? 16 : -16));
      }}
      className="group/resize absolute -right-1.5 top-0 z-[1] flex h-full w-3 cursor-col-resize touch-none justify-center focus:outline-none"
    >
      <span aria-hidden className="h-full w-px bg-line transition-colors group-hover/resize:w-0.5 group-hover/resize:bg-gold group-focus-visible/resize:w-0.5 group-focus-visible/resize:bg-gold" />
    </span>
  );
}

const controlClass =
  'min-h-10 rounded-card border border-line bg-surface px-3 text-sm text-text focus:border-gold focus:outline-none';

/** Notion-style client database: search, filter chips, sortable columns. State lives in the URL. */
export function ClientsTable({ rows }: { rows: ClientRow[] }) {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  // React state is the source of truth (updates queue reliably); the URL mirrors it so filters
  // survive navigating to a client and back, and can be bookmarked.
  const [state, setState] = useState<ClientTableState>(() => stateFromParams(params));
  const columnWidths = useColumnWidths();
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
      dir: prev.sort === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : key === 'added' || key === 'edited' ? 'desc' : 'asc',
    }));

  const overview = useMemo(() => clientOverview(rows), [rows]);

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
          options={ALL_STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st], display: statusBadge(st), count: overview.statuses[st] }))}
          selected={state.statuses}
          onChange={(statuses) => update({ statuses })}
          hint="Shows any of these"
        />
        <MultiSelectFilter
          label="Services"
          options={SERVICES.map((sv) => ({ value: sv, label: SERVICE_SHORT_LABELS[sv], count: overview.services[sv] }))}
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
        {/* Fixed layout with pixel columns: resizing one column never reflows the others. */}
        <table className="min-w-full table-fixed border-collapse text-sm" style={{ width: COLUMNS.reduce((sum, col) => sum + columnWidths.widths[col.key], 0) }}>
          <colgroup>{COLUMNS.map((col) => <col key={col.key} style={{ width: columnWidths.widths[col.key] }} />)}</colgroup>
          <thead>
            <tr className="border-b border-line text-left">
              {COLUMNS.map((col) => {
                const active = state.sort === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    className="relative px-3 py-0 font-medium text-muted"
                    aria-sort={active ? (state.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  >
                    <button
                      type="button"
                      onClick={() => sortBy(col.key)}
                      className={`flex min-h-10 w-full min-w-0 items-center gap-1 text-left hover:text-text ${active ? 'text-text' : ''}`}
                    >
                      <span className="truncate">{col.label}</span>
                      <span aria-hidden className={`text-xs ${active ? 'text-gold-fg' : 'opacity-0'}`}>
                        {active && state.dir === 'desc' ? '↓' : '↑'}
                      </span>
                    </button>
                    <ResizeHandle label={col.label} width={columnWidths.widths[col.key]} min={MIN_COLUMN_WIDTHS[col.key]}
                      onResize={(width) => columnWidths.resize(col.key, width)} onReset={() => columnWidths.resize(col.key, DEFAULT_COLUMN_WIDTHS[col.key])} />
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
                className="row-link cursor-pointer border-b border-line align-middle last:border-b-0 hover:bg-surface-raised"
              >
                <td className="p-0">
                  <Link to={`/coach/clients/${row.id}`} className="block min-h-11 truncate px-3 py-2.5 font-medium text-text">
                    <span className="link link--bare">{row.full_name}</span>
                  </Link>
                </td>
                <td className="truncate px-3 py-2.5 text-muted" title={row.email}>
                  {row.email}
                </td>
                {/* Services may wrap onto more lines; every other cell stays on one line and ends in "…". */}
                <td className="px-3 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {liveServices(row).length === 0 ? <span className="text-muted">—</span> : null}
                    {liveServices(row).map((e) => (
                      <ServiceTag key={e.id} service={e.service} paused={e.status === 'paused'} />
                    ))}
                  </div>
                </td>
                <td className="truncate px-3 py-2.5">{statusBadge(row.status)}</td>
                <td className="truncate px-3 py-2.5 text-muted" title={formatDate(row.created_at)}>{formatDate(row.created_at)}</td>
                <td className="truncate px-3 py-2.5 text-muted">
                  <time dateTime={lastEditedAt(row)} title={new Date(lastEditedAt(row)).toLocaleString()}>{formatDateTime(lastEditedAt(row))}</time>
                </td>
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
      className={`inline-block max-w-full truncate whitespace-nowrap rounded px-1.5 py-0.5 align-middle text-xs ${paused ? 'bg-surface-raised text-muted' : 'bg-gold/15 text-gold-fg'}`}
      title={paused ? `${SERVICE_SHORT_LABELS[service]} (paused)` : SERVICE_SHORT_LABELS[service]}
    >
      {SERVICE_SHORT_LABELS[service]}
      {paused ? ' · paused' : ''}
    </span>
  );
}
