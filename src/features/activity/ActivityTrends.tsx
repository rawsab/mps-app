import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, Spinner } from '@/components/ui';
import { fillSlots, foldRows, KIND_LABELS, TREND_RANGES, trendWindow, type TrendRange, type TrendRow, type TrendSlot } from '@/domain/activity/trends';
import { Avatar } from '@/components/Avatar';
import { friendlyError, useClient, useClientPhoto } from '@/features/clients/api';
import { capitalize } from '@/lib/format';
import { useActivityStats } from './api';

const CLIENT_ROWS = 6;
const plural = (n: number, one: string) => `${n.toLocaleString()} ${one}${n === 1 ? '' : 's'}`;

/**
 * Activity trends beside the feed (decision 0046): when notifications arrive, what kind they are, and
 * which clients send them. Counts every item the feed can list, whatever its read state or filter.
 */
export function ActivityTrends({ range, onRange }: { range: TrendRange; onRange: (range: TrendRange) => void }) {
  // The window is fixed per range and day, so polling doesn't shift it mid-hour.
  const today = new Date().toDateString();
  const window = useMemo(() => trendWindow(range, new Date(today)), [range, today]);
  const stats = useActivityStats(window);
  const counts = useMemo(() => fillSlots(window.slots, stats.data?.buckets ?? []), [window, stats.data]);
  const kinds = (stats.data?.kinds ?? []).map((k): TrendRow => ({ key: k.kind, label: KIND_LABELS[k.kind], count: k.count }));
  const clients = foldRows((stats.data?.clients ?? []).map((c): TrendRow => ({ key: c.clientId, label: c.clientName, count: c.count })),
    CLIENT_ROWS, (n) => `${n} other clients`);
  const total = stats.data?.total ?? 0;
  const empty = stats.data && total === 0;

  return (
    <section aria-labelledby="activity-trends" className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="activity-trends" className="text-sm font-medium text-muted">Trends</h2>
        <div role="group" aria-label="Trend range" className="flex rounded-card border border-line p-0.5">
          {TREND_RANGES.map((option) => (
            <button key={option} type="button" aria-pressed={range === option} onClick={() => onRange(option)}
              className={`min-h-9 rounded-inner px-3 text-sm transition-colors ${range === option ? 'bg-surface-raised font-medium text-text' : 'text-muted hover:text-text'}`}>
              {capitalize(option)}
            </button>
          ))}
        </div>
      </div>
      <Alert visible={!!stats.error} className="mb-3" title="Could not load trends">{friendlyError(stats.error)}</Alert>
      {stats.isPending ? <Spinner label="Loading trends" /> : null}
      {stats.data ? (
        <div className={`grid gap-7 transition-opacity ${stats.isPlaceholderData ? 'opacity-60' : ''}`}>
          <Panel title="Notifications received">
            <p className="mb-3 flex items-baseline gap-2">
              <span className="text-2xl font-semibold tabular-nums">{total.toLocaleString()}</span>
              <span className="text-sm text-muted">{window.caption}</span>
            </p>
            <ColumnTrend slots={window.slots} counts={counts} unit={window.bucket} />
          </Panel>
          <Panel title="By type">
            {empty ? <Empty range={range} /> : <BarList rows={kinds} total={total} label="Notifications by type" />}
          </Panel>
          <Panel title="By client">
            {empty ? <Empty range={range} /> : <BarList rows={clients} total={total} label="Notifications by client" clients />}
          </Panel>
        </div>
      ) : null}
    </section>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="min-w-0">
      <h3 className="mb-2 text-xs font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Empty({ range }: { range: TrendRange }) {
  return <p className="text-sm text-muted">{range === 'day' ? 'Nothing yet today.' : 'No activity in this period.'}</p>;
}

/**
 * Columns per hour or day. One series, so no legend: the panel title names it. The tallest count
 * labels the top gridline; hovering a column shows its slot and count, and a hidden table carries
 * the same numbers for screen readers.
 */
function ColumnTrend({ slots, counts, unit }: { slots: TrendSlot[]; counts: number[]; unit: 'hour' | 'day' }) {
  const max = Math.max(1, ...counts);
  const [hover, setHover] = useState<number | null>(null);
  // The pointer inside the plot, so the tooltip sits just above the cursor.
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const columns = slots.map((slot, index) => ({ slot, count: counts[index] ?? 0 }));
  const hovered = hover === null ? undefined : columns[hover];

  return (
    <div className="min-w-0">
      <div className="flex gap-2">
        <div ref={plotRef} className="relative h-32 min-w-0 flex-1" onPointerLeave={() => { setHover(null); setPointer(null); }}
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setPointer({ x: event.clientX - box.left, y: event.clientY - box.top });
          }}>
          {/* Recessive grid: the top line marks the tallest count, the baseline closes the bars. */}
          <span aria-hidden className="absolute inset-x-0 top-0 border-t border-dashed border-line" />
          <span aria-hidden className="absolute inset-x-0 bottom-0 h-px bg-line" />
          <ul aria-hidden className="absolute inset-0 flex items-end gap-0.5">
            {columns.map(({ slot, count }, index) => (
              <li key={slot.key} onPointerEnter={() => setHover(index)} className="flex h-full min-w-0 flex-1 items-end">
                <span data-hover={hover === index || undefined}
                  className="w-full rounded-t-[3px] bg-[var(--color-chart-bar)] opacity-80 transition-[height,opacity] duration-300 data-[hover]:opacity-100 motion-reduce:transition-none"
                  style={{ height: count ? `max(2px, ${(count / max) * 100}%)` : 0 }} />
              </li>
            ))}
          </ul>
          {hovered && pointer ? (
            <span aria-hidden style={{ left: pointer.x, top: pointer.y }}
              className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-[calc(100%+10px)] flex-col items-center whitespace-nowrap rounded-card border border-line bg-surface-raised px-2 py-1 text-xs shadow-lg">
              <span className="text-muted">{hovered.slot.label}</span>
              <span className="font-medium tabular-nums">{plural(hovered.count, 'notification')}</span>
            </span>
          ) : null}
        </div>
        <span aria-hidden className="-mt-1.5 w-6 shrink-0 text-xs tabular-nums text-muted">{max}</span>
      </div>
      <div aria-hidden className="mr-8 mt-1.5 flex gap-0.5">
        {slots.map((slot) => <span key={slot.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap text-[0.6875rem] text-muted">{slot.tick}</span>)}
      </div>
      <table className="sr-only">
        <caption>Notifications per {unit}</caption>
        <thead><tr><th scope="col">{unit === 'hour' ? 'Hour' : 'Day'}</th><th scope="col">Notifications</th></tr></thead>
        <tbody>{columns.map(({ slot, count }) => <tr key={slot.key}><th scope="row">{slot.label}</th><td>{count}</td></tr>)}</tbody>
      </table>
    </div>
  );
}

/** Client and signed-photo queries are shared with the feed's avatars, so this fetches nothing new. */
function ClientAvatar({ clientId, name }: { clientId: string; name: string }) {
  const client = useClient(clientId);
  const photo = useClientPhoto(client.data?.auth_user_id);
  return <Avatar url={photo.data} name={name} className="size-5" />;
}

/** Horizontal bars, busiest first. Every row is labelled with its count and share, so no hover is needed. */
function BarList({ rows, total, label, clients = false }: { rows: TrendRow[]; total: number; label: string; clients?: boolean }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  return (
    <ul aria-label={label} className="grid gap-1.5">
      {rows.map((row) => {
        const share = total ? Math.round((row.count / total) * 100) : 0;
        // Client rows get a small photo and link to the client; "N other clients" keeps the photo's space.
        const client = clients && row.key !== 'other';
        const name = clients ? (
          <span className="flex min-w-0 items-center gap-2">
            {client ? <ClientAvatar clientId={row.key} name={row.label} /> : <span aria-hidden className="size-5 shrink-0" />}
            {client ? <Link to={`/coach/clients/${row.key}`} className="link link--bare truncate">{row.label}</Link> : <span className="truncate text-muted">{row.label}</span>}
          </span>
        ) : <span className="truncate">{row.label}</span>;
        return (
          <li key={row.key} className="grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] items-center gap-3 text-[0.8125rem]">
            {name}
            <span aria-hidden className="h-2.5 min-w-0">
              <span className="block h-full rounded-r-[4px] bg-[var(--color-chart-bar)] opacity-80" style={{ width: `max(2px, ${(row.count / max) * 100}%)` }} />
            </span>
            <span className="text-right tabular-nums">
              {row.count.toLocaleString()}<span className="ml-1.5 text-muted">{share}%</span>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
