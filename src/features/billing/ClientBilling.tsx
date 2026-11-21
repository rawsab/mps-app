import { useState, type ReactNode } from 'react';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { ChevronIcon, PlusIcon } from '@/components/icons';
import { Alert, Badge, Button, Skeleton, type BadgeTone } from '@/components/ui';
import {
  chargeStatusLabel, paymentMethodLabel, periodLabel, statements, unpaidCharges,
  type Charge, type ChargeLine, type ChargeStatus, type ClientBilling, type Payment, type Statement,
} from '@/domain/billing/billing';
import { formatCents } from '@/domain/billing/money';
import { formatDate } from '@/lib/format';
import { billingError, useClientBilling } from './api';
import { AddChargeDialog, EditLineDialog, PaymentDialog, PricingDialog, VoidDialog, type PaymentMode } from './BillingDialogs';

// The coach's view of one client's billing (decision 0053): balance, prices, monthly statements and
// payments. Shared by the client page and the Billing page.

export const STATUS_TONE: Record<ChargeStatus | Statement['status'], BadgeTone> = {
  unpaid: 'danger', part_paid: 'gold', paid: 'success', void: 'neutral', empty: 'neutral',
};

type Open =
  | { kind: 'payment'; mode: PaymentMode }
  | { kind: 'charge' }
  | { kind: 'pricing' }
  | { kind: 'edit'; line: ChargeLine; paidCents: number }
  | { kind: 'void'; target: { kind: 'charge' | 'payment'; id: string; label: string; paidCents?: number } };

/** `$320 owing`, `$40 in credit` or `Paid up`. */
export function balanceText(balanceCents: number) {
  if (balanceCents > 0) return `${formatCents(balanceCents)} owing`;
  if (balanceCents < 0) return `${formatCents(-balanceCents)} in credit`;
  return 'Paid up';
}

export function ClientBillingPanel({ clientId, clientName, heading }: { clientId: string; clientName: string; heading: ReactNode }) {
  const billing = useClientBilling(clientId);
  const [open, setOpen] = useState<Open | null>(null);
  const [notice, setNotice] = useState<ReactNode>('');
  const close = () => setOpen(null);
  const done = (message: ReactNode) => { setOpen(null); setNotice(message); };

  return (
    <section aria-labelledby={`billing-${clientId}`} className="min-w-0">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`billing-${clientId}`} className="text-lg font-semibold">{heading}</h2>
        {/* Shown while loading too, so switching clients doesn't shift the layout. */}
        {!billing.isError ? (
          <div className="flex items-center gap-1">
            <Button variant="secondary" disabled={!billing.data} onClick={() => setOpen({ kind: 'payment', mode: { kind: 'record' } })}><PlusIcon />Record payment</Button>
            {billing.data ? (
              <ActionsMenu label="More billing actions">
                <ActionItem onClick={() => setOpen({ kind: 'pricing' })}>Edit client’s prices</ActionItem>
                <ActionItem onClick={() => setOpen({ kind: 'charge' })}>Add a charge</ActionItem>
                <ActionItem onClick={() => setOpen({ kind: 'payment', mode: { kind: 'credit' } })}>Add a credit</ActionItem>
              </ActionsMenu>
            ) : <span className="size-11 shrink-0" />}
          </div>
        ) : null}
      </div>
      <Alert visible={!!notice} tone="success" onDismiss={() => setNotice('')} className="mb-3">{notice}</Alert>
      {billing.isPending ? <BillingSkeleton /> : null}
      <Alert visible={!!billing.error} title="Could not load billing">{billingError(billing.error)}</Alert>
      {billing.data ? <BillingBody billing={billing.data} onOpen={setOpen} /> : null}

      {open?.kind === 'payment' ? <PaymentDialog clientId={clientId} clientName={clientName} mode={open.mode} onClose={close} onDone={done} /> : null}
      {open?.kind === 'charge' && billing.data ? <AddChargeDialog clientId={clientId} currentPeriod={billing.data.currentPeriod} onClose={close} onDone={done} /> : null}
      {open?.kind === 'pricing' && billing.data ? <PricingDialog clientId={clientId} clientName={clientName} rates={billing.data.rates} onClose={close} onDone={done} /> : null}
      {open?.kind === 'edit' ? <EditLineDialog line={open.line} paidCents={open.paidCents} onClose={close} onDone={done} /> : null}
      {open?.kind === 'void' ? <VoidDialog target={open.target} onClose={close} onDone={done} /> : null}
    </section>
  );
}

/** The panel's shape while it loads: summary, statements and payments. */
function BillingSkeleton() {
  return (
    <div role="status" className="grid gap-5">
      <span className="sr-only">Loading billing</span>
      <Skeleton className="h-[5.75rem]" />
      <div className="grid gap-2">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-2">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-10" />
      </div>
    </div>
  );
}

function BillingBody({ billing, onOpen }: { billing: ClientBilling; onOpen: (open: Open) => void }) {
  const { summary } = billing;
  const months = statements(billing.charges);
  return (
    <div className="grid gap-5">
      <dl className="grid gap-3 rounded-card border border-line p-4 sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">Balance</dt>
          <dd className={`text-2xl font-semibold tabular-nums ${summary.balanceCents > 0 ? 'text-text' : 'text-success'}`}>{balanceText(summary.balanceCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">From previous months</dt>
          <dd className="text-lg tabular-nums">{summary.carriedOverCents ? formatCents(summary.carriedOverCents) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Monthly plan</dt>
          <dd className="text-lg tabular-nums">{billing.planCents === null ? 'None' : `${formatCents(billing.planCents)}/mo`}</dd>
        </div>
      </dl>

      <section aria-labelledby="billing-statements" className="grid gap-2">
        <h3 id="billing-statements" className="text-base font-semibold">Statements</h3>
        {months.length ? (
          <div className="divide-y divide-line rounded-card border border-line">
            {months.map((statement, index) => (
              <StatementRow key={statement.period} statement={statement} current={statement.period === billing.currentPeriod} defaultOpen={index === 0} onOpen={onOpen} />
            ))}
          </div>
        ) : <p className="text-sm text-muted">No charges yet. Monthly services are charged on the 1st, and sessions once attendance is recorded.</p>}
      </section>

      <Payments payments={billing.payments} onOpen={onOpen} />
    </div>
  );
}

function StatementRow({ statement, current, defaultOpen, onOpen }: { statement: Statement; current: boolean; defaultOpen: boolean; onOpen: (open: Open) => void }) {
  const unpaid = unpaidCharges(statement);
  const label = periodLabel(statement.period);
  const [open, setOpen] = useState(defaultOpen);
  // Clipped only while moving: an open month must not clip its ⋯ menus.
  const [settled, setSettled] = useState(defaultOpen);
  const id = `statement-${statement.period}`;
  return (
    <div className="px-4 py-1">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setSettled(false); setOpen((value) => !value); }}
        className="flex min-h-12 w-full items-center gap-2 text-left">
        <span className="inline-flex text-muted"><ChevronIcon open={open} /></span>
        <span className="min-w-0 flex-1 font-medium">{label}{current ? <span className="ml-2 text-xs font-normal text-muted">This month</span> : null}</span>
        <span className="text-sm tabular-nums">{formatCents(statement.totalCents)}</span>
        <Badge size="sm" tone={STATUS_TONE[statement.status]}>{statement.status === 'empty' ? 'Nothing due' : chargeStatusLabel[statement.status]}</Badge>
      </button>
      <div id={id} role="region" aria-label={label} aria-hidden={!open} inert={!open} data-open={open} className="animated-disclosure-content"
        onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setSettled(open); }}>
        <div className={`min-h-0 ${open && settled ? 'overflow-visible' : 'overflow-hidden'}`}>
          <div className="grid gap-2 pb-3">
            <ul className="divide-y divide-line">
              {statement.charges.map((charge) => <ChargeRow key={charge.id} charge={charge} monthStatus={statement.status} onOpen={onOpen} />)}
              {statement.voided.map((charge) => <ChargeRow key={charge.id} charge={charge} monthStatus={statement.status} onOpen={onOpen} />)}
            </ul>
            {unpaid.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="flex translate-y-1 items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums text-text">{formatCents(statement.outstandingCents)}</span>
                  <span className="text-sm text-muted/70">left to pay</span>
                </span>
                <Button variant="secondary" onClick={() => onOpen({
                  kind: 'payment',
                  mode: { kind: 'mark', chargeIds: unpaid.map((c) => c.id), amountCents: statement.outstandingCents, label },
                })}>Mark {label} paid</Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A charge's own status shows only when it differs from the month's, which sits on the month's row. */
function ChargeRow({ charge, monthStatus, onOpen }: { charge: Charge; monthStatus: Statement['status']; onOpen: (open: Open) => void }) {
  const voided = charge.status === 'void';
  const left = charge.amountCents - charge.paidCents;
  const single = charge.lines.length === 1 ? charge.lines[0] : undefined;
  return (
    <li className={`py-2 ${voided ? 'text-muted' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-xs text-muted">{formatDate(charge.occurredOn).replace(/,? \d{4}$/, '')}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${voided ? 'line-through' : ''}`}>{charge.label}</p>
          {voided && charge.voidReason ? <p className="text-xs">Void: {charge.voidReason}</p> : null}
          {charge.status === 'part_paid' ? <p className="text-xs text-muted">{formatCents(charge.paidCents)} paid · {formatCents(left)} left</p> : null}
        </div>
        <span className={`text-sm tabular-nums ${voided ? 'line-through' : ''}`}>{formatCents(charge.amountCents)}</span>
        {charge.status !== monthStatus ? <Badge size="sm" tone={STATUS_TONE[charge.status]}>{chargeStatusLabel[charge.status]}</Badge> : null}
        {!voided ? (
          <ActionsMenu size="sm" label={`Actions for ${charge.label}`}>
            {left > 0 ? (
              <ActionItem onClick={() => onOpen({ kind: 'payment', mode: { kind: 'mark', chargeIds: [charge.id], amountCents: left, label: charge.label } })}>Mark paid</ActionItem>
            ) : null}
            {single ? <ActionItem onClick={() => onOpen({ kind: 'edit', line: single, paidCents: charge.paidCents })}>Edit</ActionItem> : null}
            <ActionItem danger onClick={() => onOpen({ kind: 'void', target: { kind: 'charge', id: charge.id, label: charge.label, paidCents: charge.paidCents } })}>Void</ActionItem>
          </ActionsMenu>
        ) : <span className="size-9 shrink-0" />}
      </div>
      {charge.lines.length > 1 ? (
        <ul className="grid gap-0.5 pl-17 pr-12">
          {charge.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2 text-xs text-muted">
              <span className="min-w-0 flex-1">{line.label}</span>
              <span className="tabular-nums">{formatCents(line.amountCents)}</span>
              {!voided ? (
                <button type="button" className="min-h-8 px-1 text-gold-fg underline underline-offset-2" aria-label={`Edit ${line.label}`}
                  onClick={() => onOpen({ kind: 'edit', line, paidCents: charge.paidCents })}>Edit</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}

function Payments({ payments, onOpen }: { payments: Payment[]; onOpen: (open: Open) => void }) {
  return (
    <section aria-labelledby="billing-payments" className="grid gap-2">
      <h3 id="billing-payments" className="text-base font-semibold">Payments</h3>
      {payments.length ? (
        <ul className="divide-y divide-line">
          {payments.map((payment) => {
            const voided = !!payment.voidedAt;
            const unapplied = voided ? 0 : payment.amountCents - payment.allocatedCents;
            const label = `${payment.method === 'credit' ? 'Credit' : 'Payment'} of ${formatCents(payment.amountCents)} on ${formatDate(payment.receivedOn)}`;
            return (
              <li key={payment.id} className={`flex items-center gap-3 py-2 ${voided ? 'text-muted' : ''}`}>
                <span className="w-14 shrink-0 text-xs text-muted">{formatDate(payment.receivedOn).replace(/,? \d{4}$/, '')}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <p className={voided ? 'line-through' : ''}>{paymentMethodLabel[payment.method]}{payment.note ? <span className="text-muted"> · {payment.note}</span> : null}</p>
                  {voided && payment.voidReason ? <p className="text-xs">Void: {payment.voidReason}</p> : null}
                  {unapplied > 0 ? <p className="text-xs text-muted">{formatCents(unapplied)} not yet applied (credit)</p> : null}
                </div>
                <span className={`text-sm tabular-nums ${voided ? 'line-through' : ''}`}>{formatCents(payment.amountCents)}</span>
                {!voided ? (
                  <ActionsMenu size="sm" label={`Actions for ${label}`}>
                    <ActionItem danger onClick={() => onOpen({ kind: 'void', target: { kind: 'payment', id: payment.id, label } })}>Void</ActionItem>
                  </ActionsMenu>
                ) : <span className="size-9 shrink-0" />}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">No payments recorded yet.</p>}
    </section>
  );
}

