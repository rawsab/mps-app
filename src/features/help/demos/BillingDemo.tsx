import { PlusIcon } from '@/components/icons';
import { Badge, Button } from '@/components/ui';
import { chargeStatusLabel, isOverdue, periodLabel, statements, type Charge } from '@/domain/billing/billing';
import { formatCents } from '@/domain/billing/money';
import {
  BALANCE_TARGET, BILLING_DEMOS, DEMO_PERIOD, DIALOG_SAVE_TARGET, RECORD_PAYMENT_TARGET, chargeTarget, demoSummary, type BillingDemoName, type BillingDemoState,
} from '@/domain/help/billingDemos';
import { STATUS_TONE, balanceText } from '@/features/billing/ClientBilling';
import { formatDate } from '@/lib/format';
import { DemoPlayer } from './DemoPlayer';

/** A billing demo by name, for Help pages: `<BillingDemo name="payment-oldest-first" />`. */
export function BillingDemo({ name }: { name: BillingDemoName }) {
  const script = BILLING_DEMOS[name];
  // The frame with the most charges sizes the picture for every frame.
  const tallest = script.frames.reduce((a, b) => (b.state.charges.length > a.state.charges.length ? b : a)).state;
  return <DemoPlayer script={script} render={(state) => (
    <div className="grid">
      <div className="[grid-area:1/1]"><BillingPicture state={state} /></div>
      <div aria-hidden className="pointer-events-none opacity-0 [grid-area:1/1]"><BillingPicture state={{ ...tallest, dialog: null }} /></div>
    </div>
  )} />;
}

/**
 * A client's billing as the coach's panel shows it, drawn from a demo frame: the balance, then every
 * month's statement open, grouped and labelled with the panel's own rules.
 */
function BillingPicture({ state }: { state: BillingDemoState }) {
  const summary = demoSummary(state.charges, state.creditCents);
  const changed = new Set(state.changed ?? []);
  return (
    <div className="relative w-[36rem] text-left text-sm text-text">
      <div className="rounded-card border border-line bg-surface p-4 shadow-popover">
        <div className="mb-3 flex items-center justify-between gap-2">
          <span className="text-lg font-semibold">Riley Moreau</span>
          <span data-demo-target={RECORD_PAYMENT_TARGET}><Button variant="secondary"><PlusIcon />Record payment</Button></span>
        </div>
        <dl className="grid grid-cols-3 gap-3 rounded-card border border-line p-4">
          <div data-demo-target={BALANCE_TARGET}>
            <dt className="text-xs text-muted">Balance</dt>
            <dd key={summary.balanceCents} className={`help-demo-changed rounded-[4px] text-2xl font-semibold tabular-nums ${summary.balanceCents > 0 ? 'text-text' : 'text-success'}`}>{balanceText(summary.balanceCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">From previous months</dt>
            <dd className="text-lg tabular-nums">{summary.carriedOverCents ? formatCents(summary.carriedOverCents) : 'None'}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted">Monthly plan</dt>
            <dd className="text-lg tabular-nums">$300.00/mo</dd>
          </div>
        </dl>
        <p className="mb-2 mt-4 text-base font-semibold">Statements</p>
        <div className="divide-y divide-line rounded-card border border-line">
          {statements(state.charges).map((statement) => (
            <div key={statement.period} className="px-4 py-1">
              <div className="flex min-h-12 items-center gap-2">
                <span className="min-w-0 flex-1 font-medium">{periodLabel(statement.period)}{statement.period === DEMO_PERIOD ? <span className="ml-2 text-xs font-normal text-muted">This month</span> : null}</span>
                <span className="text-base font-semibold tabular-nums">{formatCents(statement.totalCents)}</span>
                {isOverdue(statement, DEMO_PERIOD)
                  ? <Badge size="sm" tone="danger">Overdue</Badge>
                  : <Badge size="sm" tone={STATUS_TONE[statement.status]}>{statement.status === 'empty' ? 'Nothing due' : chargeStatusLabel[statement.status as Exclude<typeof statement.status, 'empty'>]}</Badge>}
              </div>
              <ul className="divide-y divide-line pb-2">
                {statement.charges.map((charge) => <ChargeLine key={charge.id} charge={charge} monthStatus={statement.status} changed={changed.has(charge.id)} />)}
              </ul>
              {statement.outstandingCents > 0 ? (
                <p className="flex items-baseline gap-1.5 pb-2"><span className="text-lg font-semibold tabular-nums">{formatCents(statement.outstandingCents)}</span><span className="text-muted/70">left to pay</span></p>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      {state.dialog ? (
        <>
          <span className="absolute inset-0 rounded-card bg-ink/60" />
          <div className="absolute left-1/2 top-12 w-80 -translate-x-1/2 rounded-card border border-line bg-surface p-4 shadow-popover">
            <p className="text-base font-semibold">Record a payment</p>
            <p className="mt-1 text-xs text-muted">Applied to the oldest unpaid charges first. Anything left over is credit for the next charges.</p>
            <span className="mt-4 block text-sm font-medium">Amount ($)</span>
            <span className="mt-1.5 flex min-h-11 items-center rounded-card border border-gold bg-ink px-3 tabular-nums">
              {state.dialog.amount}<span className="help-demo-caret ml-px inline-block h-4 w-px bg-text" />
            </span>
            <span className="mt-3 grid grid-cols-2 gap-3">
              <span><span className="block text-sm font-medium">Received on</span><span className="mt-1.5 flex min-h-11 items-center rounded-card border border-line bg-ink px-3">{formatDate('2026-11-20')}</span></span>
              <span><span className="block text-sm font-medium">Method</span><span className="mt-1.5 flex min-h-11 items-center rounded-card border border-line bg-ink px-3">e-Transfer</span></span>
            </span>
            <span className="mt-4 flex justify-end gap-2">
              <Button variant="secondary">Cancel</Button>
              <span data-demo-target={DIALOG_SAVE_TARGET}><Button>Record payment</Button></span>
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
}

/** One charge, as the statement lists it: a programming charge shows its services and the bundle discount. */
function ChargeLine({ charge, monthStatus, changed }: { charge: Charge; monthStatus: string; changed: boolean }) {
  const left = charge.amountCents - charge.paidCents;
  return (
    <li data-demo-target={chargeTarget(charge.id)} className={`rounded-[4px] py-2 ${changed ? 'help-demo-changed' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-xs text-muted">{formatDate(charge.occurredOn).replace(/,? \d{4}$/, '')}</span>
        <span className="min-w-0 flex-1">
          <span className="block">{charge.label}</span>
          {charge.status === 'part_paid' ? <span className="block text-xs text-muted">{formatCents(charge.paidCents)} paid · {formatCents(left)} left</span> : null}
        </span>
        <span className="tabular-nums">{formatCents(charge.amountCents)}</span>
        {charge.status !== monthStatus ? <Badge size="sm" tone={STATUS_TONE[charge.status]}>{chargeStatusLabel[charge.status]}</Badge> : null}
      </div>
      {charge.kind === 'programming' ? (
        <ul className="grid gap-0.5 pl-17">
          {charge.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2 text-xs text-muted"><span className="flex-1">{line.label}</span><span className="tabular-nums">{formatCents(line.amountCents)}</span></li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
