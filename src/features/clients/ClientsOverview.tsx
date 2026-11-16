import { useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router';
import { Dialog } from '@/components/Dialog';
import { CheckIcon, CopyIcon, SendIcon } from '@/components/icons';
import { Button } from '@/components/ui';
import { formatDate } from '@/lib/format';
import { SERVICE_SHORT_LABELS, SERVICES } from '@/lib/services';
import { friendlyError, useInviteClient, type ClientRow, type ClientStatus } from './api';
import { ALL_STATUSES, clientOverview, STATUS_LABELS } from './clientTable';
import { statusBadge } from './ClientsTable';

type FollowUp = 'notInvited' | 'inviteUnaccepted';

/** Theme tokens, so each status keeps its color in light and dark mode. Labels name every bar too. */
const STATUS_BAR_COLORS: Record<ClientStatus, string> = {
  active: 'var(--color-success)',
  invited: 'var(--color-gold)',
  pending: 'var(--color-muted)',
  disabled: 'var(--color-danger)',
};

const FOLLOW_UP_COPY: Record<FollowUp, { title: string; empty: string; description: string; label: (n: number) => string }> = {
  notInvited: {
    title: 'Not invited yet',
    empty: 'Everyone has been invited',
    description: 'These clients have no account yet. You can prepare their programs before inviting them.',
    label: (n) => `${n === 1 ? 'client' : 'clients'} not invited yet`,
  },
  inviteUnaccepted: {
    title: 'Invite not accepted',
    empty: 'No invitations waiting',
    description: 'Invited, but they haven’t signed in yet. Resending sends a fresh link.',
    label: (n) => `${n === 1 ? 'hasn’t' : 'haven’t'} accepted the invite`,
  },
};

/** Compact roster summary above the client table: services, statuses and invitation follow-ups. */
export function ClientsOverview({ rows, canInvite }: { rows: ClientRow[]; canInvite: boolean }) {
  const overview = useMemo(() => clientOverview(rows), [rows]);
  // The dialog keeps the list it opened with, so a client stays visible after you invite them.
  const [open, setOpen] = useState<{ kind: FollowUp; ids: string[] } | null>(null);

  return (
    <div className="mb-5 grid gap-x-9 gap-y-3 sm:grid-cols-[auto_auto] sm:justify-start lg:grid-cols-[auto_auto_1fr]">
      <Panel title="Services">
        <ColumnChart total={overview.total} items={SERVICES.map((s) => ({ label: SERVICE_SHORT_LABELS[s], count: overview.services[s] }))} />
      </Panel>
      <Panel title="Status">
        <ColumnChart total={overview.total} items={ALL_STATUSES.map((s) => ({ label: STATUS_LABELS[s], count: overview.statuses[s], color: STATUS_BAR_COLORS[s], badge: statusBadge(s) }))} />
      </Panel>
      <Panel title="Follow up" className="sm:col-span-2 lg:col-span-1">
        {overview.notInvited.length === 0 && overview.inviteUnaccepted.length === 0 ? (
          <div role="status" className="flex items-center gap-3 py-1">
            <svg aria-hidden viewBox="0 0 24 24" className="size-9 shrink-0 text-success" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9.5" />
              <path d="m7.5 12.5 3 3 6-6.5" />
            </svg>
            <div className="min-w-0">
              <p className="text-xl font-semibold leading-tight text-text">All done here.</p>
              <p className="mt-0.5 text-xs text-muted">No invitations left to send, and none waiting to be accepted.</p>
            </div>
          </div>
        ) : (
          <ul className="grid gap-2">
            {(['notInvited', 'inviteUnaccepted'] as const).map((kind) => {
              const list = overview[kind];
              return (
                <li key={kind}>
                  <FollowUpButton
                    count={list.length}
                    label={list.length === 0 ? FOLLOW_UP_COPY[kind].empty : FOLLOW_UP_COPY[kind].label(list.length)}
                    onClick={() => setOpen({ kind, ids: list.map((r) => r.id) })}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
      {open ? <FollowUpDialog kind={open.kind} ids={open.ids} rows={rows} canInvite={canInvite} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

function Panel({ title, className = '', children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`py-3 ${className}`}>
      <h2 className="mb-2 text-xs font-medium text-muted">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Columns rising from a baseline, scaled to the largest count. Counts sit on top of each column and
 * labels underneath, so color is never the only cue. Bars with a `color` are hatched in it; others are solid gold.
 */
type Column = {
  label: string;
  count: number;
  /** Hatched bar in this color; without it the bar is solid gold. */
  color?: string;
  /** Shown in the tooltip instead of the plain label, e.g. a status pill. */
  badge?: ReactNode;
};

function ColumnChart({ items, total }: { items: Column[]; total: number }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  // The hovered column and the pointer position inside the chart, for the "X/TOTAL" tooltip.
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null);
  const hovered = hover ? items[hover.index] : undefined;
  const chartRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={chartRef} className="relative" onPointerLeave={() => setHover(null)}>
      {/* Axes: one vertical line beside the plot and one baseline under it, across the chart's width. */}
      <span aria-hidden className="absolute left-0 top-0 h-20 w-px bg-line" />
      <span aria-hidden className="absolute left-0 right-0 top-20 h-px bg-line" />
      <ul className="flex gap-1 px-2">
        {items.map(({ label, count, color }, index) => {
          const description = `${label}: ${count} of ${total} client${total === 1 ? '' : 's'}`;
          return (
            <li
              key={label}
              aria-label={description}
              // The whole column is the hover target, not just the bar.
              onPointerMove={(e) => {
                const box = chartRef.current!.getBoundingClientRect();
                setHover({ index, x: e.clientX - box.left, y: e.clientY - box.top });
              }}
              className="flex w-16 shrink-0 flex-col items-center"
            >
              <div aria-hidden className="flex h-20 w-full flex-col items-center justify-end">
                <span className="mb-1 text-xs font-medium tabular-nums text-text">{count}</span>
                <span
                  data-hover={hover?.index === index || undefined}
                  className={`w-10 rounded-t-[4px] transition-[height,opacity] duration-300 ${color ? 'bar-hatched' : 'bg-gold opacity-75 data-[hover]:opacity-100'}`}
                  style={{ height: `${(count / max) * 3.5}rem`, ...(color ? { '--bar': color } : {}) } as CSSProperties}
                />
              </div>
              <span aria-hidden className="mt-2 text-center text-xs leading-tight text-muted">
                {label}
              </span>
            </li>
          );
        })}
      </ul>
      {hover && hovered ? (
        <span
          aria-hidden
          className="pointer-events-none absolute z-10 flex -translate-x-1/2 -translate-y-full flex-col items-center gap-1 whitespace-nowrap rounded-card border border-line bg-surface-raised px-2 py-1.5 text-xs shadow-lg"
          style={{ left: hover.x, top: hover.y - 8 }}
        >
          {hovered.badge ?? <span className="text-muted">{hovered.label}</span>}
          <span className="font-medium tabular-nums text-text">
            {hovered.count}/{total}
          </span>
        </span>
      ) : null}
    </div>
  );
}

function FollowUpButton({ count, label, onClick }: { count: number; label: string; onClick: () => void }) {
  if (count === 0) {
    return (
      <p className="flex min-h-11 items-center gap-3 rounded-card border border-line bg-surface px-3 text-sm text-muted">
        <span aria-hidden className="w-6 text-center">✓</span>
        {label}
      </p>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className="row-link group flex min-h-11 w-full items-center gap-3 rounded-card border border-line bg-surface px-3 text-left text-sm hover:bg-surface-raised"
    >
      <span className="w-6 text-center text-lg font-semibold tabular-nums text-gold-fg">{count}</span>
      <span className="min-w-0 flex-1 text-text">{label}</span>
      <span aria-hidden className="text-muted group-hover:text-text">
        →
      </span>
    </button>
  );
}

function FollowUpDialog({
  kind,
  ids,
  rows,
  canInvite,
  onClose,
}: {
  kind: FollowUp;
  ids: string[];
  rows: ClientRow[];
  canInvite: boolean;
  onClose: () => void;
}) {
  const copy = FOLLOW_UP_COPY[kind];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const clients = ids.map((id) => byId.get(id)).filter((r): r is ClientRow => r !== undefined);
  const [copied, setCopied] = useState(false);

  async function copyEmails() {
    try {
      await navigator.clipboard.writeText(clients.map((c) => c.email).join(', '));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <Dialog
      title={`${copy.title} (${clients.length})`}
      description={canInvite ? copy.description : `${copy.description} Only admins can send invitations.`}
      onClose={onClose}
      footer={
        <Button variant={copied ? 'primary' : 'secondary'} onClick={copyEmails} aria-live="polite">
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copied' : 'Copy emails'}
        </Button>
      }
    >
      <ul className="divide-y divide-line">
        {clients.map((client) => (
          <li key={client.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 bg-surface-raised px-4 py-3 sm:px-5">
            <div className="min-w-0">
              <Link to={`/coach/clients/${client.id}`} className="font-medium text-text">
                <span className="link link--bare">{client.full_name}</span>
              </Link>
              <a href={`mailto:${client.email}`} className="block truncate text-sm text-muted hover:text-text">
                {client.email}
              </a>
              <p className="text-xs text-muted">Added {formatDate(client.created_at)}</p>
            </div>
            {canInvite ? <InviteButton client={client} /> : null}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/** Each row owns its request so several invitations can be in flight and report separately. */
function InviteButton({ client }: { client: ClientRow }) {
  const invite = useInviteClient();
  if (invite.isSuccess) {
    return (
      <p role="status" className="text-sm text-success">
        {invite.data?.status === 'resent' ? 'Invitation resent' : 'Invitation sent'}
      </p>
    );
  }
  if (client.status === 'active' || client.status === 'disabled') {
    return <p className="text-sm text-muted">{STATUS_LABELS[client.status]}</p>;
  }
  return (
    <div className="flex flex-col items-end gap-1">
      <Button variant="secondary" className="min-h-10" busy={invite.isPending} onClick={() => invite.mutate(client.id)}>
        {invite.isPending ? null : <SendIcon />}
        {client.status === 'invited' ? 'Resend invite' : 'Send invite'}
      </Button>
      {invite.error ? (
        <p role="alert" className="max-w-56 text-right text-xs text-danger">
          {friendlyError(invite.error)}
        </p>
      ) : null}
    </div>
  );
}
