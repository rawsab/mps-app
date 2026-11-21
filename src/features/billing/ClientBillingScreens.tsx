import { useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { useViewer } from '@/app/auth';
import { AllClear, AllClearMark } from '@/components/AllClear';
import { Dialog, DialogBody } from '@/components/Dialog';
import { BillingIcon, CheckIcon, CopyIcon } from '@/components/icons';
import { Alert, Button, Card, EmptyState, PageHeader, SectionHeading, Skeleton, TextAreaField, TextField } from '@/components/ui';
import { paymentMethodLabel, type ClientBilling } from '@/domain/billing/billing';
import { balanceHeadline, clientPrices } from '@/domain/billing/client';
import { centsToInput, formatCents, parseDollars } from '@/domain/billing/money';
import { todayIn } from '@/features/scheduling/time';
import { formatDate } from '@/lib/format';
import { billingError, useClientBilling, usePaymentDetails, useReportPaymentSent, type ClientNotice, type PaymentDetails } from './api';
import { ClientStatements, type ReportTarget } from './ClientBilling';

// The client's billing (decision 0055): the Home card, /billing and the Pay dialog. Read-only except
// "I've sent it" / "I've paid this", which never change the balance.

/** Home: what's owed with Pay, or a quiet "Paid up" line. Hidden for a client with no billing at all. */
export function HomeBalanceCard({ clientId }: { clientId: string }) {
  const billing = useClientBilling(clientId);
  const details = usePaymentDetails();
  const [paying, setPaying] = useState(false);
  const data = billing.data;
  if (!data || (data.charges.length === 0 && data.payments.length === 0)) return null;
  const headline = balanceHeadline(data.summary, data.currentPeriod);
  const notices = details.data?.pendingNotices ?? [];
  const viewLink = <Link to="/billing" className="-my-3 inline-flex min-h-11 items-center text-sm text-gold-fg"><span className="link">View billing</span></Link>;

  if (headline.kind !== 'owing') {
    return (
      <section aria-labelledby="home-billing" className="min-w-0 border-b border-line pb-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <SectionHeading id="home-billing" icon={<BillingIcon />}>Billing</SectionHeading>
          {viewLink}
        </div>
        {headline.kind === 'credit'
          ? <AllClear title={headline.text} detail="It goes toward your next charges." />
          : <AllClear title="Paid up" detail="Nothing to pay right now." />}
      </section>
    );
  }
  return (
    <section aria-labelledby="home-billing" className="min-w-0 border-b border-line pb-8">
      <SectionHeading id="home-billing" icon={<BillingIcon />} className="mb-3">Billing</SectionHeading>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-text/60">You owe</p>
          <p className="text-3xl font-semibold leading-tight tabular-nums">{formatCents(data.summary.balanceCents)}</p>
          {headline.detail ? <p className="text-sm text-muted">{headline.detail}</p> : null}
          {notices.length ? <p className="mt-1 text-sm text-muted">{noticesText(notices)}</p> : null}
        </div>
        <div className="flex items-center gap-3">
          {viewLink}
          <Button onClick={() => setPaying(true)}>Pay</Button>
        </div>
      </div>
      {paying ? <PayDialog onClose={() => setPaying(false)} /> : null}
    </section>
  );
}

/** One line for every pending notice: what the client has told their coach so far. */
function noticesText(notices: ClientNotice[]): string {
  const total = notices.reduce((sum, n) => sum + n.amountCents, 0);
  const last = notices.at(-1)!;
  return notices.length === 1
    ? `You told your coach you sent ${formatCents(last.amountCents)} on ${formatDate(last.sentOn)}. Your balance updates once they confirm it.`
    : `You told your coach about ${notices.length} payments (${formatCents(total)}). Your balance updates once they confirm them.`;
}

/** `/billing`: balance with Pay, statements, prices and payments. */
export function ClientBillingPage() {
  const viewer = useViewer().data!;
  const clientId = viewer.client?.id;
  const billing = useClientBilling(clientId);
  const details = usePaymentDetails();
  const [paying, setPaying] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);

  return (
    <div className="grid gap-8">
      <PageHeader title="Billing" />
      {billing.isPending ? <div role="status" className="grid gap-4"><span className="sr-only">Loading billing</span><Skeleton className="h-24" /><Skeleton className="h-40" /></div> : null}
      <Alert visible={!!billing.error} title="Could not load billing">{billingError(billing.error)}</Alert>
      {billing.data && billing.data.charges.length === 0 && billing.data.payments.length === 0 ? (
        <EmptyState title="Nothing to pay yet">Your charges and payments will show here once your coach starts billing.</EmptyState>
      ) : billing.data ? (
        <BillingContent billing={billing.data} services={viewer.services} notices={details.data?.pendingNotices ?? []}
          onPay={() => setPaying(true)} onReport={setReporting} />
      ) : null}
      {paying ? <PayDialog onClose={() => setPaying(false)} /> : null}
      {reporting && details.data ? <ReportSentDialog details={details.data} target={reporting} onClose={() => setReporting(null)} /> : null}
    </div>
  );
}

function BillingContent({ billing, services, notices, onPay, onReport }: {
  billing: ClientBilling; services: Parameters<typeof clientPrices>[1]; notices: ClientNotice[];
  onPay: () => void; onReport: (target: ReportTarget) => void;
}) {
  const headline = balanceHeadline(billing.summary, billing.currentPeriod);
  const prices = clientPrices(billing.rates, services);
  const noticesFor = (chargeId: string) => notices.filter((n) => n.chargeIds.includes(chargeId));

  return (
    <>
      <Card as="section" className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-xs text-muted">Balance</h2>
          <p className={`flex items-center gap-2 text-2xl font-semibold tabular-nums ${headline.kind === 'owing' ? 'text-text' : 'text-success'}`}>
            {headline.kind === 'owing' ? null : <AllClearMark />}{headline.text}
          </p>
          {headline.kind === 'owing' && headline.detail ? <p className="text-sm text-muted">{headline.detail}</p> : null}
          {notices.length ? <p className="mt-1 text-sm text-muted">{noticesText(notices)}</p> : null}
        </div>
        {headline.kind === 'owing' ? <Button onClick={onPay}>Pay</Button> : null}
      </Card>

      <section aria-labelledby="billing-statements" className="grid gap-2">
        <SectionHeading id="billing-statements" icon={<BillingIcon />}>Statements</SectionHeading>
        <ClientStatements billing={billing} client={{ onReport, noticesFor }} />
        <p className="text-xs text-muted">Paid part of a charge or a month? Choose “I’ve paid this” so your coach knows to look for it.</p>
      </section>

      {prices.monthly.length || prices.sessions.length ? (
        <section aria-labelledby="billing-prices" className="grid gap-2">
          <h2 id="billing-prices" className="text-lg font-semibold">Your prices</h2>
          <dl className="divide-y divide-line rounded-card border border-line px-4">
            {[...prices.monthly, ...prices.sessions].map((row) => (
              <div key={row.label} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <dt>{row.label}</dt>
                <dd className="tabular-nums">{row.amount}</dd>
              </div>
            ))}
          </dl>
          {prices.monthly.length ? <p className="text-xs text-muted">Monthly programming is charged on the 1st. Sessions are charged once they happen.</p> : null}
        </section>
      ) : null}

      <section aria-labelledby="billing-payments" className="grid gap-2">
        <h2 id="billing-payments" className="text-lg font-semibold">Payments</h2>
        {billing.payments.length ? (
          <ul className="divide-y divide-line rounded-card border border-line px-4">
            {billing.payments.map((payment) => (
              <li key={payment.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <span>{formatDate(payment.receivedOn)} · {paymentMethodLabel[payment.method]}</span>
                <span className="tabular-nums">{formatCents(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">No payments yet. Your coach records them once they arrive.</p>}
      </section>
    </>
  );
}

/** How to pay by e-Transfer, then "I've sent it" for the whole balance. Nothing here marks anything paid. */
function PayDialog({ onClose }: { onClose: () => void }) {
  const details = usePaymentDetails();
  const [reporting, setReporting] = useState(false);
  const d = details.data;

  let body: ReactNode = null;
  if (details.isPending) body = <Skeleton className="h-24" />;
  else if (details.error) body = <Alert title="Could not load payment details">{billingError(details.error)}</Alert>;
  else if (d && d.balanceCents <= 0) body = <p className="text-sm text-muted">You don’t owe anything right now.</p>;
  else if (d && !d.etransferEmail) {
    body = <p className="text-sm">{d.coachName ?? 'Your coach'} hasn’t set up e-Transfer yet. Ask them how they’d like to be paid.</p>;
  } else if (d && reporting) {
    return <ReportSentDialog details={d} target={{ chargeIds: [], amountCents: d.balanceCents, label: 'your balance' }} onClose={onClose} />;
  } else if (d) {
    body = <EtransferSteps details={d} />;
  }

  return (
    <Dialog title="Pay" onClose={onClose}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Close</Button>
        {d && d.balanceCents > 0 && d.etransferEmail ? <Button onClick={() => setReporting(true)}>I’ve sent it</Button> : null}
      </>}>
      <DialogBody className="grid gap-4">{body}</DialogBody>
    </Dialog>
  );
}

function EtransferSteps({ details }: { details: PaymentDetails }) {
  const [copied, setCopied] = useState(false);
  const email = details.etransferEmail!;
  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }
  return (
    <>
      <div>
        <p className="text-xs text-muted">Amount</p>
        <p className="text-2xl font-semibold tabular-nums">{formatCents(details.balanceCents)}</p>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-muted">Send to</p>
          <p className="break-all font-medium">{email}</p>
        </div>
        <Button variant={copied ? 'primary' : 'secondary'} onClick={() => void copy()} aria-live="polite">
          {copied ? <CheckIcon /> : <CopyIcon />}{copied ? 'Copied' : 'Copy email'}
        </Button>
      </div>
      <p className="text-sm">
        Send an Interac e-Transfer for {formatCents(details.balanceCents)} to {email}. Put your name in the message.
        Your balance updates once {details.coachName ?? 'your coach'} confirms it.
      </p>
      {details.pendingNotices.length ? <Alert tone="note">{noticesText(details.pendingNotices)}</Alert> : null}
    </>
  );
}

/**
 * "I've sent it" (the whole balance) or "I've paid this" (a charge or a month): tells the coach to look
 * for the payment. Reporting the same thing again updates the earlier notice.
 */
function ReportSentDialog({ details, target, onClose }: { details: PaymentDetails; target: ReportTarget; onClose: () => void }) {
  const viewer = useViewer().data!;
  const today = todayIn(viewer.timezone);
  const report = useReportPaymentSent();
  const [id] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(centsToInput(target.amountCents));
  const [sentOn, setSentOn] = useState(today);
  const [message, setMessage] = useState('');
  const [problem, setProblem] = useState('');
  const [sent, setSent] = useState(false);
  const key = [...target.chargeIds].sort().join(',');
  const earlier = details.pendingNotices.find((n) => [...n.chargeIds].sort().join(',') === key);
  const whole = target.chargeIds.length === 0;

  function send() {
    const cents = parseDollars(amount);
    if (cents === null || cents === 0) return setProblem('Enter an amount more than $0.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sentOn)) return setProblem('Choose the day you paid.');
    setProblem('');
    report.mutate({ id, amountCents: cents, sentOn, message, chargeIds: target.chargeIds }, { onSuccess: () => setSent(true) });
  }

  if (sent) {
    return (
      <Dialog title="Thanks, your coach will check" onClose={onClose} footer={<Button onClick={onClose}>Done</Button>}>
        <DialogBody>
          <p className="text-sm">We’ve let {details.coachName ?? 'your coach'} know. Your balance updates once they confirm the payment arrived.</p>
        </DialogBody>
      </Dialog>
    );
  }
  return (
    <Dialog title={whole ? 'I’ve sent it' : 'I’ve paid this'}
      description={whole
        ? 'Let your coach know to look for your e-Transfer. This doesn’t change your balance.'
        : `Let your coach know you paid for ${target.label}. If you paid part of it, enter what you sent. This doesn’t change your balance.`}
      onClose={() => { if (!report.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={report.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={report.isPending} onClick={send}>Let my coach know</Button>
      </>}>
      <DialogBody className="grid gap-4">
        {earlier ? <Alert tone="note">This replaces what you said earlier: {formatCents(earlier.amountCents)} on {formatDate(earlier.sentOn)}.</Alert> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Amount paid ($)" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} />
          <TextField label="Paid on" type="date" value={sentOn} max={today} onChange={(event) => setSentOn(event.target.value)} />
        </div>
        <TextAreaField label="Message (optional)" rows={2} maxLength={1000} value={message} onChange={(event) => setMessage(event.target.value)}
          hint="For example how you paid, or the e-Transfer reference number." />
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!report.error} title="Not sent">{billingError(report.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}
