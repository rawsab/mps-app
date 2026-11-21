import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router';
import { SegmentedControl } from '@/components/controls';
import { Alert, Spinner } from '@/components/ui';
import { fillSlots, foldRows, KIND_LABELS, TREND_RANGES, trendWindow, type TrendRange, type TrendRow } from '@/domain/activity/trends';
import { Avatar } from '@/components/Avatar';
import { ColumnTrend } from '@/components/ColumnTrend';
import { friendlyError, useClient, useClientPhoto } from '@/features/clients/api';
import { capitalize } from '@/lib/format';
import { useActivityStats } from './api';

const CLIENT_ROWS = 6;

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
        <SegmentedControl label="Trend range" value={range} onChange={onRange}
          options={TREND_RANGES.map((option) => ({ value: option, label: capitalize(option) }))} />
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
            <ColumnTrend slots={window.slots} counts={counts} noun="notification" caption={`Notifications per ${window.bucket}`} slotHeading={window.bucket === 'hour' ? 'Hour' : 'Day'} />
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
