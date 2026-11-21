import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ActionItem, ActionsMenu } from '@/components/ActionsMenu';
import { ChevronIcon, PlusIcon } from '@/components/icons';
import { Alert, Badge, Button, type BadgeTone } from '@/components/ui';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/Skeleton';
import {
  chargeStatusLabel, isOverdue, paymentMethodLabel, periodLabel, statementShown, statements, unpaidCharges,
  type Charge, type ChargeLine, type ChargeStatus, type ClientBilling, type Payment, type Statement,
} from '@/domain/billing/billing';
import { formatCents } from '@/domain/billing/money';
import { formatDate } from '@/lib/format';
import { billingError, useClientBilling, useRestorePayment, type ClientNotice } from './api';
import { AddChargeDialog, EditLineDialog, MarkUnpaidDialog, PaymentDialog, PricingDialog, VoidDialog, type PaymentMode, type VoidTarget } from './BillingDialogs';

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
  | { kind: 'unpaid'; charge: Charge }
  | { kind: 'void'; target: VoidTarget };

/** `$320 owing`, `$40 in credit` or `Paid up`. */
export function balanceText(balanceCents: number) {
  if (balanceCents > 0) return `${formatCents(balanceCents)} owing`;
  if (balanceCents < 0) return `${formatCents(-balanceCents)} in credit`;
  return 'Paid up';
}

/** `allStatements` lists every month (the billing history page); otherwise settled past months are left out. */
export function ClientBillingPanel({ clientId, clientName, heading, allStatements = false }: {
  clientId: string; clientName: string; heading: ReactNode; allStatements?: boolean;
}) {
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
      {billing.data ? <BillingBody billing={billing.data} allStatements={allStatements} onOpen={setOpen} onNotice={setNotice} /> : null}

      {open?.kind === 'payment' ? <PaymentDialog clientId={clientId} clientName={clientName} mode={open.mode} onClose={close} onDone={done} /> : null}
      {open?.kind === 'charge' && billing.data ? <AddChargeDialog clientId={clientId} currentPeriod={billing.data.currentPeriod} onClose={close} onDone={done} /> : null}
      {open?.kind === 'pricing' && billing.data ? <PricingDialog clientId={clientId} clientName={clientName} rates={billing.data.rates} onClose={close} onDone={done} /> : null}
      {open?.kind === 'edit' ? <EditLineDialog line={open.line} paidCents={open.paidCents} onClose={close} onDone={done} /> : null}
      {open?.kind === 'unpaid' && billing.data ? (
        <MarkUnpaidDialog charge={open.charge} charges={billing.data.charges} payments={billing.data.payments} onClose={close} onDone={done} />
      ) : null}
      {open?.kind === 'void' ? <VoidDialog target={open.target} onClose={close} onDone={done} /> : null}
    </section>
  );
}

/** The panel's shape while it loads: summary, statements and payments. */
function BillingSkeleton() {
  return (
    <LoadingRegion label="Loading billing" className="grid gap-5">
      <Skeleton className="h-[5.75rem]" />
      <div className="grid gap-2">
        <SkeletonText size="base" width="w-24" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-2">
        <SkeletonText size="base" width="w-20" />
        <Skeleton className="h-10" />
      </div>
    </LoadingRegion>
  );
}

function BillingBody({ billing, allStatements, onOpen, onNotice }: {
  billing: ClientBilling; allStatements: boolean; onOpen: (open: Open) => void; onNotice: (message: ReactNode) => void;
}) {
  const { summary } = billing;
  const months = statements(billing.charges);
  const shown = (statement: Statement) => allStatements || statementShown(statement, billing.currentPeriod);
  const firstShown = months.find(shown)?.period;
  const hiddenCount = months.filter((statement) => !shown(statement)).length;
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
          // Rows stay mounted and collapse, so a past month that's just been paid animates out.
          <div className={firstShown ? 'rounded-card border border-line' : ''}>
            {months.map((statement) => (
              <CollapsingRow key={statement.period} visible={shown(statement)} divided={statement.period !== firstShown}>
                <StatementRow statement={statement} current={statement.period === billing.currentPeriod}
                  overdue={isOverdue(statement, billing.currentPeriod)} defaultOpen={statement.period === firstShown} onOpen={onOpen} />
              </CollapsingRow>
            ))}
          </div>
        ) : null}
        {!firstShown ? (
          <p className="text-sm text-muted">
            {months.length ? 'Nothing to pay. Earlier months are all settled.' : 'No charges yet. Monthly services are charged on the 1st, and sessions once attendance is recorded.'}
          </p>
        ) : null}
        {!allStatements && hiddenCount > 0 ? (
          <Link to={`/coach/clients/${billing.clientId}/billing`} className="-my-2 inline-flex min-h-11 items-center text-sm text-gold-fg">
            <span className="link">See statements for previous months</span>
          </Link>
        ) : null}
      </section>

      <Payments payments={billing.payments} historyTo={allStatements ? null : `/coach/clients/${billing.clientId}/billing#payments`} onOpen={onOpen} onRestored={onNotice} />
    </div>
  );
}

// With reduced motion the disclosure doesn't transition, so no transitionend arrives to unclip it.
const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Collapses when hidden; clipped only while it moves, so an open month's ⋯ menus aren't cut off. */
function CollapsingRow({ visible, divided, children }: { visible: boolean; divided: boolean; children: ReactNode }) {
  const [settled, setSettled] = useState(true);
  const [was, setWas] = useState(visible);
  if (was !== visible) { setWas(visible); setSettled(reducedMotion()); }
  return (
    <div data-open={visible} aria-hidden={!visible} inert={!visible} className="animated-disclosure-content"
      onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setSettled(true); }}>
      <div className={`min-h-0 ${visible && settled ? 'overflow-visible' : 'overflow-hidden'} ${divided ? 'border-t border-line' : ''}`}>{children}</div>
    </div>
  );
}

/** What a client can do on their own statements (decision 0055): say they've paid, never mark paid. */
export type ClientStatementActions = {
  onReport: (target: ReportTarget) => void;
  /** Pending "I've paid this" notices naming the charge. */
  noticesFor: (chargeId: string) => ClientNotice[];
};
export type ReportTarget = { chargeIds: string[]; amountCents: number; label: string };

/** The client's statements: every month, newest open, with the coach's layout and "I've paid this". */
export function ClientStatements({ billing, client }: { billing: ClientBilling; client: ClientStatementActions }) {
  const months = statements(billing.charges).filter((s) => s.status !== 'empty');
  if (!months.length) return <p className="text-sm text-muted">No charges yet. Monthly programming is charged on the 1st, and sessions once they happen.</p>;
  return (
    <div className="divide-y divide-line rounded-card border border-line">
      {months.map((statement, index) => (
        <StatementRow key={statement.period} statement={statement} current={statement.period === billing.currentPeriod}
          overdue={isOverdue(statement, billing.currentPeriod)} defaultOpen={index === 0} onOpen={() => {}} client={client} />
      ))}
    </div>
  );
}

function StatementRow({ statement, current, overdue, defaultOpen, onOpen, client }: {
  statement: Statement; current: boolean; overdue: boolean; defaultOpen: boolean; onOpen: (open: Open) => void; client?: ClientStatementActions;
}) {
  const unpaid = unpaidCharges(statement);
  const label = periodLabel(statement.period);
  const [open, setOpen] = useState(defaultOpen);
  // Clipped only while moving: an open month must not clip its ⋯ menus.
  const [settled, setSettled] = useState(defaultOpen);
  const id = `statement-${statement.period}`;
  return (
    <div className="px-4 py-1">
      <button type="button" aria-expanded={open} aria-controls={id} onClick={() => { setSettled(reducedMotion()); setOpen((value) => !value); }}
        className="flex min-h-12 w-full items-center gap-2 text-left">
        <span className="inline-flex text-muted"><ChevronIcon open={open} /></span>
        <span className="min-w-0 flex-1 font-medium">{label}{current ? <span className="ml-2 text-xs font-normal text-muted">This month</span> : null}</span>
        <span className="text-base font-semibold tabular-nums">{formatCents(statement.totalCents)}</span>
        {overdue
          ? <Badge size="sm" tone="danger">Overdue</Badge>
          : <Badge size="sm" tone={STATUS_TONE[statement.status]}>{statement.status === 'empty' ? 'Nothing due' : chargeStatusLabel[statement.status]}</Badge>}
      </button>
      <div id={id} role="region" aria-label={label} aria-hidden={!open} inert={!open} data-open={open} className="animated-disclosure-content"
        onTransitionEnd={(event) => { if (event.target === event.currentTarget && event.propertyName === 'grid-template-rows') setSettled(open); }}>
        <div className={`min-h-0 ${open && settled ? 'overflow-visible' : 'overflow-hidden'}`}>
          <div className="grid gap-2 pb-3">
            <ul className="divide-y divide-line">
              {statement.charges.map((charge) => <ChargeRow key={charge.id} charge={charge} monthStatus={statement.status} onOpen={onOpen} client={client} />)}
              {statement.voided.map((charge) => <ChargeRow key={charge.id} charge={charge} monthStatus={statement.status} onOpen={onOpen} client={client} />)}
            </ul>
            {unpaid.length ? (
              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <span className="flex translate-y-1 items-baseline gap-1.5">
                  <span className="text-xl font-semibold tabular-nums text-text">{formatCents(statement.outstandingCents)}</span>
                  <span className="text-sm text-muted/70">left to pay</span>
                </span>
                {client ? (
                  <Button variant="secondary" onClick={() => client.onReport({ chargeIds: unpaid.map((c) => c.id), amountCents: statement.outstandingCents, label })}>
                    I’ve paid {label}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => onOpen({
                    kind: 'payment',
                    mode: { kind: 'mark', chargeIds: unpaid.map((c) => c.id), amountCents: statement.outstandingCents, label },
                  })}>Mark {label} paid</Button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A charge's own status shows only when it differs from the month's, which sits on the month's row. */
function ChargeRow({ charge, monthStatus, onOpen, client }: {
  charge: Charge; monthStatus: Statement['status']; onOpen: (open: Open) => void; client?: ClientStatementActions;
}) {
  const voided = charge.status === 'void';
  const left = charge.amountCents - charge.paidCents;
  // A programming charge always lists its services, even one: its label ("November 2026 programming") doesn't name them.
  const showLines = charge.lines.length > 1 || (charge.kind === 'programming' && charge.lines.length > 0);
  const single = !showLines && charge.lines.length === 1 ? charge.lines[0] : undefined;
  return (
    <li className={`py-2 ${voided ? 'text-muted' : ''}`}>
      <div className="flex items-center gap-3">
        <span className="w-14 shrink-0 text-xs text-muted">{formatDate(charge.occurredOn).replace(/,? \d{4}$/, '')}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm ${voided ? 'line-through' : ''}`}>{charge.label}</p>
          {voided && charge.voidReason ? <p className="text-xs">Void: {charge.voidReason}</p> : null}
          {charge.status === 'part_paid' ? <p className="text-xs text-muted">{formatCents(charge.paidCents)} paid · {formatCents(left)} left</p> : null}
          {client?.noticesFor(charge.id).map((notice) => (
            <p key={notice.id} className="text-xs text-muted">You said you paid {formatCents(notice.amountCents)} on {formatDate(notice.sentOn)} · waiting for your coach</p>
          ))}
        </div>
        <span className={`text-sm tabular-nums ${voided ? 'line-through' : ''}`}>{formatCents(charge.amountCents)}</span>
        {charge.status !== monthStatus ? <Badge size="sm" tone={STATUS_TONE[charge.status]}>{chargeStatusLabel[charge.status]}</Badge> : null}
        {client ? (
          left > 0 ? (
            <ActionsMenu size="sm" label={`Actions for ${charge.label}`}>
              <ActionItem onClick={() => client.onReport({ chargeIds: [charge.id], amountCents: left, label: charge.label })}>I’ve paid this</ActionItem>
            </ActionsMenu>
          ) : <span className="size-9 shrink-0" />
        ) : !voided ? (
          <ActionsMenu size="sm" label={`Actions for ${charge.label}`}>
            {left > 0 ? (
              <ActionItem onClick={() => onOpen({ kind: 'payment', mode: { kind: 'mark', chargeIds: [charge.id], amountCents: left, label: charge.label } })}>Mark paid</ActionItem>
            ) : null}
            {charge.paidCents > 0 ? <ActionItem onClick={() => onOpen({ kind: 'unpaid', charge })}>Mark unpaid</ActionItem> : null}
            {single ? <ActionItem onClick={() => onOpen({ kind: 'edit', line: single, paidCents: charge.paidCents })}>Edit</ActionItem> : null}
            <ActionItem danger onClick={() => onOpen({ kind: 'void', target: { kind: 'charge', id: charge.id, label: charge.label, paidCents: charge.paidCents } })}>Void</ActionItem>
          </ActionsMenu>
        ) : <span className="size-9 shrink-0" />}
      </div>
      {showLines ? (
        <ul className="grid gap-0.5 pl-17 pr-12">
          {charge.lines.map((line) => (
            <li key={line.id} className="flex items-center gap-2 text-xs text-muted">
              <span className="min-w-0 flex-1">{line.label}</span>
              <span className="tabular-nums">{formatCents(line.amountCents)}</span>
              {!voided && !client ? (
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

const RECENT_PAYMENTS = 5;

/**
 * The latest payments. In the panel, "See all payments" opens the client's All statements page at this
 * section (`historyTo`); there, "Show all" lists the rest in place.
 */
function Payments({ payments: all, historyTo, onOpen, onRestored }: {
  payments: Payment[]; historyTo: string | null; onOpen: (open: Open) => void; onRestored: (message: ReactNode) => void;
}) {
  const restore = useRestorePayment();
  const [expanded, setExpanded] = useState(false);
  const payments = expanded ? all : all.slice(0, RECENT_PAYMENTS);
  const more = all.length - payments.length;
  return (
    <section id="payments" aria-labelledby="billing-payments" className="grid gap-2">
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
                  {voided && payment.voidReason ? <p className="text-xs">{payment.method === 'credit' ? 'Void' : 'Marked unpaid'}: {payment.voidReason}</p> : null}
                  {unapplied > 0 ? <p className="text-xs text-muted">{formatCents(unapplied)} not yet applied (credit)</p> : null}
                </div>
                <span className={`text-sm tabular-nums ${voided ? 'line-through' : ''}`}>{formatCents(payment.amountCents)}</span>
                {!voided ? (
                  <ActionsMenu size="sm" label={`Actions for ${label}`}>
                    <ActionItem danger onClick={() => onOpen({ kind: 'void', target: { kind: 'payment', id: payment.id, label, credit: payment.method === 'credit' } })}>
                      {payment.method === 'credit' ? 'Void' : 'Mark unpaid'}
                    </ActionItem>
                  </ActionsMenu>
                ) : (
                  // Undo "Mark unpaid": the payment counts again and pays the oldest open charges.
                  <ActionsMenu size="sm" label={`Actions for ${label}`}>
                    <ActionItem onClick={() => restore.mutate(payment.id, { onSuccess: () => onRestored(`${label} restored.`) })}>
                      {payment.method === 'credit' ? 'Restore' : 'Mark paid'}
                    </ActionItem>
                  </ActionsMenu>
                )}
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted">No payments recorded yet.</p>}
      {more > 0 && historyTo ? (
        <Link to={historyTo} className="-my-2 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">See all payments</span></Link>
      ) : null}
      {more > 0 && !historyTo ? (
        <div><Button variant="secondary" onClick={() => setExpanded(true)}>Show all payments</Button></div>
      ) : null}
      <Alert visible={!!restore.error} title="Not restored">{billingError(restore.error)}</Alert>
    </section>
  );
}

