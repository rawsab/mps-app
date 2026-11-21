import { useState, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { useViewer } from '@/app/auth';
import { Chip, IconButton } from '@/components/controls';
import { Dialog, DialogBody } from '@/components/Dialog';
import { ArrowUpRightIcon, BillingIcon, CautionIcon, ChevronIcon } from '@/components/icons';
import { Alert, Badge, Button, EmptyState, PageHeader, SectionTitle, TextField } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText, SkeletonRows } from '@/components/Skeleton';
import { periodLabel, sessionTypeLabel, serviceRateLabel, type ServiceRateKey } from '@/domain/billing/billing';
import { centsToInput, formatCents, parseDollars } from '@/domain/billing/money';
import { sessionMoment } from '@/features/scheduling/time';
import { formatDate } from '@/lib/format';
import {
  billingError, useBillingOverview, useBillingSettings, usePaymentNotices, useSaveBillingSettings, useSessionsNeedingPrice,
  type BillingSettings, type OverviewClient, type PaymentNotice, type SessionNeedingPrice,
} from './api';
import { DismissNoticeDialog, PaymentDialog } from './BillingDialogs';
import { balanceText, ClientBillingPanel } from './ClientBilling';

// Billing across every client the coach can see (decision 0053). Choosing a client opens their billing
// beside the list (?client=), the same panel as on the client page.

type Filter = 'owing' | 'all' | 'credit';
const FILTERS: { value: Filter; label: string }[] = [{ value: 'owing', label: 'Owing' }, { value: 'all', label: 'All' }, { value: 'credit', label: 'In credit' }];

const matches = (client: OverviewClient, filter: Filter) =>
  filter === 'all' || (filter === 'owing' ? client.summary.balanceCents > 0 : client.summary.balanceCents < 0);

export function BillingPage() {
  const viewer = useViewer();
  const overview = useBillingOverview();
  const needsPrice = useSessionsNeedingPrice();
  const notices = usePaymentNotices();
  const [reportedDone, setReportedDone] = useState<ReactNode>('');
  const [params, setParams] = useSearchParams();
  const selected = params.get('client');
  // From an Activity notification: Record payment for that notice opens over the client's billing.
  // A notice that's already been handled just leaves the client selected.
  const openNotice = notices.data?.find((n) => n.id === params.get('notice'));
  const closeNotice = () => setParams((p) => { p.delete('notice'); return p; }, { replace: true });
  const [filter, setFilter] = useState<Filter>('owing');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isAdmin = viewer.data?.staffRole === 'admin';

  const select = (clientId: string | null) => setParams((p) => {
    if (clientId) p.set('client', clientId); else p.delete('client');
    return p;
  }, { replace: true });

  const clients = overview.data?.clients ?? [];
  // Without a choice, wide screens open the top of the list (phones keep the list until one is tapped).
  // That client stays open after it stops matching the filter, e.g. once it's paid up.
  const [shownFirst, setShownFirst] = useState<string | null>(null);
  const sticky = shownFirst && clients.some((c) => c.clientId === shownFirst) ? shownFirst : null;
  const top = clients.find((c) => matches(c, filter))?.clientId ?? null;
  const current = selected ?? sticky ?? top;
  if (!selected && !sticky && top && top !== shownFirst) setShownFirst(top);
  const shown = clients.filter((c) => matches(c, filter) || c.clientId === current);
  const chosen = clients.find((c) => c.clientId === current);
  const owing = clients.filter((c) => c.summary.balanceCents > 0);

  return (
    <div>
      <PageHeader title="Billing" subtitle="Charges and payments for your clients, in CAD. Payments count once you record them."
        actions={isAdmin ? <Button variant="secondary" onClick={() => setSettingsOpen(true)}>Default prices</Button> : null} />
      {overview.isPending ? <BillingOverviewSkeleton /> : null}
      <Alert visible={!!overview.error} title="Could not load billing">{billingError(overview.error)}</Alert>

      {overview.data ? (
        <div className="grid gap-8">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-line pb-8 lg:grid-cols-4">
            <Tile label="Outstanding" value={formatCents(owing.reduce((sum, c) => sum + c.summary.balanceCents, 0))}
              detail={`${owing.length} ${owing.length === 1 ? 'client' : 'clients'} owing`} />
            <Tile label="From previous months" value={formatCents(clients.reduce((sum, c) => sum + c.summary.carriedOverCents, 0))} detail="Unpaid before this month" />
            <Tile label={`Billed in ${periodLabel(overview.data.currentPeriod).split(' ')[0]}`} value={formatCents(overview.data.billedThisMonthCents)} detail="Charges this month" />
            <Tile label={`Received in ${periodLabel(overview.data.currentPeriod).split(' ')[0]}`} value={formatCents(overview.data.receivedThisMonthCents)} detail="Payments recorded, not credits" />
          </dl>

          <Alert visible={!!reportedDone} tone="success" onDismiss={() => setReportedDone('')}>{reportedDone}</Alert>
          {openNotice ? (
            <PaymentDialog key={openNotice.id} clientId={openNotice.clientId} clientName={openNotice.clientName} mode={{ kind: 'reported', notice: openNotice }}
              onClose={closeNotice} onDone={(message) => { closeNotice(); setReportedDone(message); }} />
          ) : null}
          {notices.data?.length ? <ReportedPayments notices={notices.data} onDone={setReportedDone} /> : null}
          {needsPrice.data?.length ? <NeedsPrice sessions={needsPrice.data} /> : null}

          <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
            <section aria-labelledby="billing-clients" className={`min-w-0 ${selected ? 'hidden lg:block' : ''}`}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <h2 id="billing-clients" className="text-lg font-semibold">Clients</h2>
                <div role="group" aria-label="Show clients" className="flex gap-1.5">
                  {FILTERS.map((f) => <Chip key={f.value} pressed={filter === f.value} onClick={() => { setFilter(f.value); setShownFirst(null); }}>{f.label}</Chip>)}
                </div>
              </div>
              {shown.length ? (
                <ul className="divide-y divide-line rounded-card border border-line">
                  {shown.map((client) => <ClientRow key={client.clientId} client={client} selected={client.clientId === current} onSelect={() => select(client.clientId)} />)}
                </ul>
              ) : (
                <p className="text-sm text-muted">{clients.length ? (filter === 'owing' ? 'Nobody owes anything right now.' : 'No clients are in credit.') : 'No clients with services or charges yet.'}</p>
              )}
            </section>

            <div className={`min-w-0 ${selected ? '' : 'hidden lg:block'}`}>
              {chosen ? (
                <>
                  {selected ? (
                    <Button variant="ghost" className="-ml-3 mb-2 lg:hidden" onClick={() => select(null)}><span aria-hidden>←</span>All clients</Button>
                  ) : null}
                  {/* The name links to the client's page. */}
                  <ClientBillingPanel key={chosen.clientId} clientId={chosen.clientId} clientName={chosen.fullName}
                    heading={<span className="flex items-center gap-2"><SectionTitle icon={<BillingIcon />}>
                      <Link to={`/coach/clients/${chosen.clientId}`} className="inline-flex items-center gap-1 text-text hover:text-gold-fg"
                        title={`Open ${chosen.fullName}’s page`}>
                        <span className="link">{chosen.fullName}</span><ArrowUpRightIcon />
                      </Link>
                    </SectionTitle></span>} />
                </>
              ) : (
                <EmptyState title={filter === 'credit' ? 'No one is in credit' : 'Nothing owing'}>
                  {filter === 'credit' ? 'Clients who paid ahead show here.' : 'Everyone is paid up. Choose All to see every client’s billing.'}
                </EmptyState>
              )}
            </div>
          </div>
        </div>
      ) : null}
      {settingsOpen ? <BillingSettingsDialog onClose={() => setSettingsOpen(false)} /> : null}
    </div>
  );
}

/** Clients' "I've sent it" (decision 0055): record the payment once it arrives, or dismiss the notice. */
function ReportedPayments({ notices, onDone }: { notices: PaymentNotice[]; onDone: (message: ReactNode) => void }) {
  const [open, setOpen] = useState<{ kind: 'record' | 'dismiss'; notice: PaymentNotice } | null>(null);
  const done = (message: ReactNode) => { setOpen(null); onDone(message); };
  return (
    <section aria-labelledby="reported-payments" className="rounded-card border border-gold/40 bg-gold/5 px-4 py-3">
      <h2 id="reported-payments" className="flex items-center gap-2 font-semibold">
        <SectionTitle icon={<BillingIcon />}>Payments clients reported ({notices.length})</SectionTitle>
      </h2>
      <p className="mt-1 text-sm text-muted">Check that each e-Transfer arrived, then record it. Balances don’t change until you do.</p>
      <ul className="mt-2 divide-y divide-line">
        {notices.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2 text-sm">
            <span className="min-w-0 flex-1">
              <Link to={`/coach/billing?client=${n.clientId}`} className="font-medium text-gold-fg"><span className="link">{n.clientName}</span></Link>
              <span className="text-muted"> · {formatCents(n.amountCents)} sent {formatDate(n.sentOn)}{n.chargeLabels.length ? ` for ${n.chargeLabels.join(', ')}` : ''}</span>
              {n.message ? <span className="block text-xs text-muted">“{n.message}”</span> : null}
            </span>
            <span className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setOpen({ kind: 'dismiss', notice: n })}>Dismiss</Button>
              <Button onClick={() => setOpen({ kind: 'record', notice: n })}>Record payment</Button>
            </span>
          </li>
        ))}
      </ul>
      {open?.kind === 'record' ? (
        <PaymentDialog clientId={open.notice.clientId} clientName={open.notice.clientName} mode={{ kind: 'reported', notice: open.notice }}
          onClose={() => setOpen(null)} onDone={done} />
      ) : null}
      {open?.kind === 'dismiss' ? <DismissNoticeDialog notice={open.notice} onClose={() => setOpen(null)} onDone={done} /> : null}
    </section>
  );
}

/** Collapsible, open at first: PT sessions recorded without a price, so not yet charged. */
function NeedsPrice({ sessions }: { sessions: SessionNeedingPrice[] }) {
  const [open, setOpen] = useState(true);
  return (
    <section aria-labelledby="needs-price" className="rounded-card border border-gold/40 bg-gold/5 px-4 py-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="needs-price" className="flex items-center gap-2 font-semibold">
          <SectionTitle icon={<CautionIcon />}>Sessions that need a price ({sessions.length})</SectionTitle>
        </h2>
        <IconButton size="sm" label={open ? 'Hide sessions that need a price' : 'Show sessions that need a price'} aria-expanded={open} aria-controls="needs-price-list"
          onClick={() => setOpen((value) => !value)}>
          <span className={`inline-flex transition-transform duration-150 motion-reduce:transition-none ${open ? 'rotate-90' : '-rotate-90'}`}><ChevronIcon open={false} /></span>
        </IconButton>
      </div>
      <div id="needs-price-list" role="region" aria-labelledby="needs-price" aria-hidden={!open} inert={!open} data-open={open} className="animated-disclosure-content">
        <div className="min-h-0 overflow-hidden">
          <div className="pb-2">
            <p className="text-sm text-muted">These have no default price for their length, so they aren’t charged yet. Open one and set its price.</p>
            <ul className="mt-2 divide-y divide-line">
              {sessions.map((session) => (
                <li key={session.meetingId}>
                  <Link to={`/coach/clients/${session.clientId}?session=${session.meetingId}`} className="flex min-h-11 flex-wrap items-center gap-x-3 py-1 text-sm">
                    <span className="font-medium text-gold-fg"><span className="link">{session.clientName}</span></span>
                    <span className="text-muted">{sessionMoment(session.startsAt, session.timezone)} · {sessionTypeLabel(`${session.format}_${session.durationMinutes}`)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

function Tile({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
      <dd className="mt-0.5 text-xs text-muted">{detail}</dd>
    </div>
  );
}

function ClientRow({ client, selected, onSelect }: { client: OverviewClient; selected: boolean; onSelect: () => void }) {
  const { summary } = client;
  const details: ReactNode[] = [];
  if (summary.oldestUnpaidPeriod) details.push(`Unpaid since ${periodLabel(summary.oldestUnpaidPeriod)}`);
  if (client.lastPaymentOn) details.push(`Last paid ${formatDate(client.lastPaymentOn)}`);
  if (client.planCents !== null) details.push(`${formatCents(client.planCents)}/mo`);
  return (
    <li>
      <button type="button" aria-current={selected || undefined} onClick={onSelect}
        className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-surface-raised ${selected ? 'bg-surface-raised' : ''}`}>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{client.fullName}</span>
          <span className="block text-xs text-muted">{details.join(' · ') || 'No charges yet'}</span>
        </span>
        <span className="flex shrink-0 flex-col items-end gap-1">
          {/* The balance alone: owing in full colour, paid up or in credit (negative) muted. */}
          <span className={`text-xl font-semibold leading-tight tabular-nums ${summary.balanceCents > 0 ? 'text-text' : 'text-muted'}`}
            title={balanceText(summary.balanceCents)}>
            {formatCents(summary.balanceCents)}<span className="sr-only"> ({balanceText(summary.balanceCents)})</span>
          </span>
          {summary.carriedOverCents > 0 ? <Badge size="sm" tone="danger">Overdue</Badge> : null}
        </span>
      </button>
    </li>
  );
}

/** Tiles, then the client list beside one client's billing, while the overview loads. */
function BillingOverviewSkeleton() {
  return (
    <LoadingRegion label="Loading billing" className="grid gap-8">
      <div className="grid grid-cols-2 gap-x-4 gap-y-5 border-b border-line pb-8 lg:grid-cols-4">
        {['w-24', 'w-36', 'w-28', 'w-32'].map((width) => (
          <div key={width}>
            <SkeletonText width={width} />
            <SkeletonText size="xl" width="w-24" className="mt-1" />
            <SkeletonText size="xs" width="w-28" className="mt-0.5" />
          </div>
        ))}
      </div>
      <div className="grid min-w-0 items-start gap-8 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
        <div className="min-w-0">
          <div className="mb-2 flex min-h-11 items-center"><SkeletonText size="lg" width="w-20" className="w-20" /></div>
          <div className="rounded-card border border-line"><SkeletonRows count={5} divided /></div>
        </div>
        <div className="hidden min-w-0 gap-5 lg:grid">
          <SkeletonText size="lg" width="w-40" />
          <Skeleton className="h-[5.75rem]" />
          <Skeleton className="h-32" />
        </div>
      </div>
    </LoadingRegion>
  );
}

const RATE_ORDER = ['pt_solo_60', 'pt_solo_40', 'pt_partner_60', 'pt_partner_40', 'mesocycle_month', 'nutrition_month', 'bundle_discount_month'] as const;

function rateLabel(key: (typeof RATE_ORDER)[number]) {
  return key.startsWith('pt_') ? sessionTypeLabel(key.slice(3)) : serviceRateLabel[key as ServiceRateKey];
}

/** Admins: the defaults every client starts from. Existing charges and custom prices don't change. */
function BillingSettingsDialog({ onClose }: { onClose: () => void }) {
  const settings = useBillingSettings();
  return settings.data ? <SettingsForm settings={settings.data} onClose={onClose} /> : (
    <Dialog title="Default prices" onClose={onClose}>
      <DialogBody>
        {settings.isPending ? (
          <LoadingRegion label="Loading prices" className="grid gap-3">
            {RATE_ORDER.map((key) => <div key={key}><SkeletonText size="xs" width="w-32" className="mb-1" /><Skeleton className="h-11" /></div>)}
          </LoadingRegion>
        ) : null}
        <Alert visible={!!settings.error} title="Could not load prices">{billingError(settings.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}

function SettingsForm({ settings, onClose }: { settings: BillingSettings; onClose: () => void }) {
  const save = useSaveBillingSettings();
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(RATE_ORDER.map((key) => [key, centsToInput(settings.rates[key] ?? null)])));
  const [problem, setProblem] = useState('');
  const [saved, setSaved] = useState(false);

  function submit() {
    const rates: Record<string, number> = {};
    for (const key of RATE_ORDER) {
      const cents = parseDollars(values[key] ?? '');
      if (cents === null) return setProblem(`Enter a price for ${rateLabel(key)}. $0 is allowed.`);
      rates[key] = cents;
    }
    setProblem('');
    save.mutate({ timezone: settings.timezone, rates }, { onSuccess: () => setSaved(true) });
  }

  return (
    <Dialog wide title="Default prices" description="Every client starts from these, in CAD before tax. Custom client prices and existing charges stay as they are."
      onClose={() => { if (!save.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={save.isPending} onClick={onClose}>{saved ? 'Close' : 'Cancel'}</Button>
        <Button busy={save.isPending} onClick={submit}>Save prices</Button>
      </>}>
      <DialogBody className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          {RATE_ORDER.map((key) => (
            <TextField key={key} label={`${rateLabel(key)} ($${key.endsWith('_month') ? key === 'bundle_discount_month' ? ' off per month' : ' per month' : ''})`}
              inputMode="decimal" autoComplete="off" value={values[key] ?? ''}
              onChange={(event) => { setSaved(false); setValues((current) => ({ ...current, [key]: event.target.value })); }} />
          ))}
        </div>
        <p className="text-xs text-muted">Months and “today” for billing follow {settings.timezone.replaceAll('_', ' ')}.</p>
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={saved} tone="success">Default prices saved.</Alert>
        <Alert visible={!!save.error} title="Not saved">{billingError(save.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}
