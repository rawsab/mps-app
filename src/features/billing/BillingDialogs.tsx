import { useState, type ReactNode } from 'react';
import { useViewer } from '@/app/auth';
import { ConfirmDialog, Dialog, DialogBody } from '@/components/Dialog';
import { Alert, Button, SelectField, TextAreaField, TextField } from '@/components/ui';
import {
  paymentMethodLabel, periodLabel, serviceRateLabel, sessionTypeLabel, type Charge, type ChargeLine, type ClientBilling, type Payment, type PaymentMethod, type Rate,
} from '@/domain/billing/billing';
import { centsToInput, formatCents, parseDollars } from '@/domain/billing/money';
import { todayIn } from '@/features/scheduling/time';
import { formatDate } from '@/lib/format';
import {
  billingError, useAddAdjustment, useDismissPaymentNotice, useEditChargeLine, useMarkChargesPaid, useRecordPayment, useRecordReportedPayment,
  useSetClientServiceRate, useSetClientSessionRate, useVoidCharge, useVoidPayment, type PaymentNotice,
} from './api';

// Dialogs for the coach's billing panel (decision 0053). Each reports success through `onDone`.

const AMOUNT_HINT = 'In dollars, before tax. For example 100 or 85.50.';

function useToday() {
  const viewer = useViewer();
  return todayIn(viewer.data?.timezone ?? 'America/Toronto');
}

function MethodField({ value, onChange }: { value: PaymentMethod; onChange: (method: PaymentMethod) => void }) {
  return (
    <SelectField label="Method" value={value} onChange={(event) => onChange(event.target.value as PaymentMethod)}>
      {(['e_transfer', 'cash', 'other'] as const).map((method) => <option key={method} value={method}>{paymentMethodLabel[method]}</option>)}
    </SelectField>
  );
}

export type PaymentMode =
  | { kind: 'record' }
  | { kind: 'credit' }
  /** Pays exactly what's left on these charges. */
  | { kind: 'mark'; chargeIds: string[]; amountCents: number; label: string }
  /** Records what a client reported with "I've sent it" (decision 0055), prefilled, and confirms the notice. */
  | { kind: 'reported'; notice: PaymentNotice };

/** Record a payment received, a credit, or mark charges paid. Nothing is paid until a coach saves here. */
export function PaymentDialog({ clientId, clientName, mode, onClose, onDone }: {
  clientId: string; clientName: string; mode: PaymentMode; onClose: () => void; onDone: (message: ReactNode) => void;
}) {
  const today = useToday();
  const record = useRecordPayment();
  const mark = useMarkChargesPaid();
  const reported = useRecordReportedPayment();
  // One id per dialog, so a retried save is recorded once.
  const [id] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(mode.kind === 'reported' ? centsToInput(mode.notice.amountCents) : '');
  const [receivedOn, setReceivedOn] = useState(mode.kind === 'reported' ? mode.notice.sentOn : today);
  const [method, setMethod] = useState<PaymentMethod>('e_transfer');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');
  const busy = record.isPending || mark.isPending || reported.isPending;
  const error = record.error ?? mark.error ?? reported.error;

  function save() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(receivedOn)) return setProblem('Choose the date it was received.');
    if (mode.kind === 'mark') {
      setProblem('');
      mark.mutate({ id, chargeIds: mode.chargeIds, receivedOn, method, note },
        { onSuccess: () => onDone(`${mode.label} marked paid (${formatCents(mode.amountCents)}).`) });
      return;
    }
    const cents = parseDollars(amount);
    if (cents === null || cents === 0) return setProblem('Enter an amount more than $0.');
    setProblem('');
    if (mode.kind === 'reported') {
      reported.mutate({ noticeId: mode.notice.id, id, amountCents: cents, receivedOn, method, note },
        { onSuccess: () => onDone(`Payment of ${formatCents(cents)} recorded for ${clientName}.`) });
      return;
    }
    record.mutate({ id, clientId, amountCents: cents, receivedOn, method: mode.kind === 'credit' ? 'credit' : method, note }, {
      onSuccess: () => onDone(mode.kind === 'credit' ? `Credit of ${formatCents(cents)} added for ${clientName}.` : `Payment of ${formatCents(cents)} recorded for ${clientName}.`),
    });
  }

  const title = mode.kind === 'credit' ? 'Add a credit' : mode.kind === 'mark' ? 'Mark paid' : 'Record a payment';
  const description = mode.kind === 'credit' ? 'Lowers the balance without counting as money received, for goodwill or a discount after the fact.'
    : mode.kind === 'mark' ? `${mode.label}: ${formatCents(mode.amountCents)} left to pay.`
    : mode.kind === 'reported' ? (mode.notice.chargeLabels.length
      ? `${clientName} said they sent ${formatCents(mode.notice.amountCents)} for ${mode.notice.chargeLabels.join(', ')}. It’s applied to those first. Record it once it has arrived, with the amount you received.`
      : `${clientName} said they sent ${formatCents(mode.notice.amountCents)}. Record it once it has arrived, with the amount you received.`)
    : 'Applied to the oldest unpaid charges first. Anything left over is credit for the next charges.';

  return (
    <Dialog title={title} description={description} onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button busy={busy} onClick={save}>{mode.kind === 'credit' ? 'Add credit' : mode.kind === 'mark' ? 'Mark paid' : 'Record payment'}</Button>
      </>}>
      <DialogBody className="grid gap-4">
        {mode.kind !== 'mark' ? (
          <TextField label="Amount ($)" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} hint={AMOUNT_HINT} />
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label={mode.kind === 'credit' ? 'Date' : 'Received on'} type="date" value={receivedOn} max={today} onChange={(event) => setReceivedOn(event.target.value)} />
          {mode.kind !== 'credit' ? <MethodField value={method} onChange={setMethod} /> : null}
        </div>
        <TextAreaField label="Note (optional)" rows={2} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)}
          hint={mode.kind === 'credit' ? 'Why the credit was given. The client doesn’t see notes.' : 'For example the e-Transfer reference. The client doesn’t see notes.'} />
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!error} title="Not saved">{billingError(error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}


const monthInput = (period: string) => period.slice(0, 7);

/** A manual charge, e.g. an opening balance from before the app. Never a future month. */
export function AddChargeDialog({ clientId, currentPeriod, onClose, onDone }: {
  clientId: string; currentPeriod: string; onClose: () => void; onDone: (message: ReactNode) => void;
}) {
  const add = useAddAdjustment();
  const [id] = useState(() => crypto.randomUUID());
  const [label, setLabel] = useState('');
  const [amount, setAmount] = useState('');
  const [month, setMonth] = useState(monthInput(currentPeriod));
  const [problem, setProblem] = useState('');

  function save() {
    const cents = parseDollars(amount);
    if (!label.trim()) return setProblem('Describe the charge, for example “Opening balance”.');
    if (cents === null || cents === 0) return setProblem('Enter an amount more than $0. To lower the balance, add a credit instead.');
    if (!/^\d{4}-\d{2}$/.test(month) || month > monthInput(currentPeriod)) return setProblem('Choose this month or an earlier one.');
    setProblem('');
    add.mutate({ id, clientId, period: `${month}-01`, label, amountCents: cents }, {
      onSuccess: () => onDone(`${label.trim()} (${formatCents(cents)}) added to ${periodLabel(`${month}-01`)}.`),
    });
  }

  return (
    <Dialog title="Add a charge" description="For anything the automatic charges don’t cover. An earlier month counts as carried over."
      onClose={() => { if (!add.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={add.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={add.isPending} onClick={save}>Add charge</Button>
      </>}>
      <DialogBody className="grid gap-4">
        <TextField label="Description" maxLength={200} placeholder="Opening balance" value={label} onChange={(event) => setLabel(event.target.value)} />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Amount ($)" inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)} hint={AMOUNT_HINT} />
          <TextField label="Month" type="month" value={month} max={monthInput(currentPeriod)} onChange={(event) => setMonth(event.target.value)} />
        </div>
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!add.error} title="Not added">{billingError(add.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}

/** One line of a charge. A discount is entered as a positive amount and stays a discount. */
export function EditLineDialog({ line, paidCents, onClose, onDone }: {
  line: ChargeLine; paidCents: number; onClose: () => void; onDone: (message: ReactNode) => void;
}) {
  const edit = useEditChargeLine();
  const discount = line.kind === 'bundle_discount';
  const [label, setLabel] = useState(line.label);
  const [amount, setAmount] = useState(centsToInput(Math.abs(line.amountCents)));
  const [problem, setProblem] = useState('');

  function save() {
    const cents = parseDollars(amount);
    if (!label.trim()) return setProblem('Describe the charge.');
    if (cents === null) return setProblem('Enter an amount, for example 100 or 85.50.');
    setProblem('');
    edit.mutate({ lineId: line.id, label, amountCents: discount ? -cents : cents }, { onSuccess: () => onDone(`${label.trim()} updated.`) });
  }

  return (
    <Dialog title={discount ? 'Edit discount' : 'Edit charge'} description="Only this charge changes. Prices for later charges stay as they are."
      onClose={() => { if (!edit.isPending) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={edit.isPending} onClick={onClose}>Cancel</Button>
        <Button busy={edit.isPending} onClick={save}>Save</Button>
      </>}>
      <DialogBody className="grid gap-4">
        <TextField label="Description" maxLength={200} value={label} onChange={(event) => setLabel(event.target.value)} />
        <TextField label={discount ? 'Discount ($)' : 'Amount ($)'} inputMode="decimal" autoComplete="off" value={amount} onChange={(event) => setAmount(event.target.value)}
          hint={paidCents > 0 ? `${formatCents(paidCents)} is already paid, so the charge can’t go below that.` : AMOUNT_HINT} />
        <Alert visible={!!problem}>{problem}</Alert>
        <Alert visible={!!edit.error} title="Not saved">{billingError(edit.error)}</Alert>
      </DialogBody>
    </Dialog>
  );
}

export type VoidTarget = { kind: 'charge' | 'payment'; id: string; label: string; paidCents?: number; credit?: boolean };

/**
 * Void a charge (no longer owed) or a payment, with the reason kept in the audit. A payment other than
 * a credit is framed as "Mark unpaid": the charges it paid are owed again.
 */
export function VoidDialog({ target, onClose, onDone }: { target: VoidTarget; onClose: () => void; onDone: (message: ReactNode) => void }) {
  const voidCharge = useVoidCharge();
  const voidPayment = useVoidPayment();
  const mutation = target.kind === 'charge' ? voidCharge : voidPayment;
  const unpay = target.kind === 'payment' && !target.credit;
  const [reason, setReason] = useState(unpay ? 'Marked paid by mistake' : '');

  return (
    <ConfirmDialog tone="danger" title={target.kind === 'charge' ? 'Void this charge?' : unpay ? 'Mark this payment unpaid?' : 'Void this credit?'}
      description={target.kind === 'charge'
        ? `${target.label}. ${target.paidCents ? `The ${formatCents(target.paidCents)} paid on it becomes credit for other charges.` : 'It no longer counts towards the balance.'}`
        : `${target.label}. The charges it paid are owed again and the balance goes back up.`}
      confirmLabel={target.kind === 'charge' ? 'Void charge' : unpay ? 'Mark unpaid' : 'Void credit'} pending={mutation.isPending} disabled={!reason.trim()}
      onClose={onClose}
      onConfirm={() => mutation.mutate({ id: target.id, reason }, { onSuccess: () => onDone(unpay ? `${target.label} marked unpaid.` : `${target.label} voided.`) })}>
      <DialogBody className="grid gap-4">
        <TextAreaField label="Reason" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
          hint="Kept with the change. The client doesn’t see it." />
        <Alert visible={!!mutation.error} title={unpay ? 'Not marked unpaid' : 'Not voided'}>{billingError(mutation.error)}</Alert>
      </DialogBody>
    </ConfirmDialog>
  );
}

/** Dismiss an "I've sent it" that didn't turn into a payment. The reason stays with staff. */
export function DismissNoticeDialog({ notice, onClose, onDone }: { notice: PaymentNotice; onClose: () => void; onDone: (message: ReactNode) => void }) {
  const dismiss = useDismissPaymentNotice();
  const [reason, setReason] = useState('');
  return (
    <ConfirmDialog tone="danger" title="Dismiss this payment notice?"
      description={`${notice.clientName} said they sent ${formatCents(notice.amountCents)} on ${formatDate(notice.sentOn)}. Their balance doesn’t change.`}
      confirmLabel="Dismiss" pending={dismiss.isPending} disabled={!reason.trim()} onClose={onClose}
      onConfirm={() => dismiss.mutate({ id: notice.id, reason }, { onSuccess: () => onDone(`${notice.clientName}’s payment notice dismissed.`) })}>
      <DialogBody className="grid gap-4">
        <TextAreaField label="Reason" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
          hint="For example, not received. The client doesn’t see it." />
        <Alert visible={!!dismiss.error} title="Not dismissed">{billingError(dismiss.error)}</Alert>
      </DialogBody>
    </ConfirmDialog>
  );
}

/**
 * Undo a mistaken "Mark paid": voids the payments applied to one charge. A payment that also paid other
 * charges unpays those too, so the dialog names them first.
 */
export function MarkUnpaidDialog({ charge, charges, payments, onClose, onDone }: {
  charge: Charge; charges: Charge[]; payments: Payment[]; onClose: () => void; onDone: (message: ReactNode) => void;
}) {
  const voidPayment = useVoidPayment();
  const [reason, setReason] = useState('Marked paid by mistake');
  const paying = payments.filter((p) => !p.voidedAt && p.allocations.some((a) => a.chargeId === charge.id));
  const others = charges.filter((c) => c.id !== charge.id && paying.some((p) => p.allocations.some((a) => a.chargeId === c.id)));
  const total = paying.reduce((sum, p) => sum + p.amountCents, 0);

  const confirm = async () => {
    for (const payment of paying) await voidPayment.mutateAsync({ id: payment.id, reason });
    onDone(`${charge.label} marked unpaid.`);
  };

  return (
    <ConfirmDialog tone="danger" title="Mark this charge unpaid?"
      description={`${charge.label}. This voids the ${paying.length === 1 ? 'payment' : `${paying.length} payments`} of ${formatCents(total)} recorded against it.`}
      confirmLabel="Mark unpaid" pending={voidPayment.isPending} disabled={!reason.trim() || paying.length === 0}
      onClose={onClose} onConfirm={() => void confirm().catch(() => undefined)}>
      <DialogBody className="grid gap-4">
        {others.length ? (
          <Alert tone="note" title={`This also unpays ${others.length === 1 ? 'another charge' : `${others.length} other charges`}`}>
            {others.map((c) => c.label).join(', ')}. Record the payment again for anything that was really paid.
          </Alert>
        ) : null}
        {paying.length === 0 ? <p className="text-sm text-muted">This charge was paid from credit or a payment that’s already void.</p> : null}
        <TextAreaField label="Reason" rows={2} maxLength={1000} value={reason} onChange={(event) => setReason(event.target.value)}
          hint="Kept with the change. The client doesn’t see it." />
        <Alert visible={!!voidPayment.error} title="Not marked unpaid">{billingError(voidPayment.error)}</Alert>
      </DialogBody>
    </ConfirmDialog>
  );
}

const SERVICE_ORDER = ['mesocycle_month', 'nutrition_month', 'bundle_discount_month'];

type PriceRow = { id: string; kind: 'service' | 'session'; label: string; suffix: string; rate: Rate };

/** What a price field saves: null follows the default (also when the default is typed), otherwise a custom price. */
function priceTarget(text: string, rate: Rate): number | null | 'invalid' {
  if (!text.trim()) return rate.defaultCents === null ? 'invalid' : null;
  const cents = parseDollars(text);
  if (cents === null) return 'invalid';
  return cents === rate.defaultCents ? null : cents;
}

/**
 * Every price for one client in one form. Blank, or the default amount, follows the default. Only changed
 * prices are saved, and each change applies to charges created after it.
 */
export function PricingDialog({ clientId, clientName, rates, onClose, onDone }: {
  clientId: string; clientName: string; rates: ClientBilling['rates']; onClose: () => void; onDone: (message: ReactNode) => void;
}) {
  const saveService = useSetClientServiceRate();
  const saveSession = useSetClientSessionRate();
  const rows: PriceRow[] = [
    ...[...rates.services].sort((a, b) => SERVICE_ORDER.indexOf(a.key) - SERVICE_ORDER.indexOf(b.key)).map((rate) => ({ id: rate.key, kind: 'service' as const, label: serviceRateLabel[rate.key],
      suffix: rate.key === 'bundle_discount_month' ? 'off each month' : 'per month', rate })),
    ...rates.sessions.map((rate) => ({ id: rate.sessionType, kind: 'session' as const, label: sessionTypeLabel(rate.sessionType), suffix: 'per session', rate })),
  ];
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(rows.map((row) => [row.id, centsToInput(row.rate.customCents ?? row.rate.defaultCents)])));
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [error, setError] = useState<unknown>(null);

  async function save() {
    const changes: { row: PriceRow; cents: number | null }[] = [];
    for (const row of rows) {
      const target = priceTarget(values[row.id] ?? '', row.rate);
      if (target === 'invalid') return setProblem(`Enter a price for ${row.label}, for example 100 or 85.50. $0 is allowed.`);
      if (target !== row.rate.customCents) changes.push({ row, cents: target });
    }
    setProblem('');
    if (!changes.length) return onClose();
    setBusy(true);
    setError(null);
    try {
      for (const { row, cents } of changes) {
        if (row.kind === 'service') await saveService.mutateAsync({ clientId, key: row.id as 'mesocycle_month', amountCents: cents });
        else await saveSession.mutateAsync({ clientId, sessionType: row.id, amountCents: cents });
      }
      onDone(`${changes.length === 1 ? `${changes[0]!.row.label} price` : `${changes.length} prices`} saved for ${clientName}.`);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const group = (kind: PriceRow['kind'], title: string) => (
    // content-start: the shorter column must not spread its rows to match the taller one.
    <fieldset className="grid min-w-0 content-start gap-4">
      <legend className="mb-3 text-sm font-semibold">{title}</legend>
      {rows.filter((row) => row.kind === kind).map((row) => {
        const target = priceTarget(values[row.id] ?? '', row.rate);
        const custom = target !== null && target !== 'invalid';
        return (
          <div key={row.id} className="grid content-start gap-1.5">
            <TextField label={`${row.label} ($ ${row.suffix})`} inputMode="decimal" autoComplete="off" value={values[row.id] ?? ''}
              aria-describedby={`price-${row.id}-default`}
              onChange={(event) => setValues((current) => ({ ...current, [row.id]: event.target.value }))} />
            {/* The default, with a way back to it when this price differs. */}
            <p id={`price-${row.id}-default`} className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
              <span>{row.rate.defaultCents === null ? 'No default for this length.' : `Default ${formatCents(row.rate.defaultCents)}.`}</span>
              {custom && row.rate.defaultCents !== null ? (
                <button type="button" className="text-gold-fg underline underline-offset-2"
                  onClick={() => setValues((current) => ({ ...current, [row.id]: centsToInput(row.rate.defaultCents) }))}>Use default</button>
              ) : null}
            </p>
          </div>
        );
      })}
    </fieldset>
  );

  return (
    <Dialog wide title={`Pricing for ${clientName}`}
      description="Changes apply to new charges; existing charges keep their price. A price set on a meeting also becomes this client’s price for that kind of session."
      onClose={() => { if (!busy) onClose(); }}
      footer={<>
        <Button variant="secondary" disabled={busy} onClick={onClose}>Cancel</Button>
        <Button busy={busy} onClick={() => void save()}>Save prices</Button>
      </>}>
      <DialogBody className="grid items-start gap-6 sm:grid-cols-2">
        {group('service', 'Monthly programming')}
        {group('session', 'Personal training')}
        <div className="grid gap-3 sm:col-span-2">
          <Alert visible={!!problem}>{problem}</Alert>
          <Alert visible={!!error} title="Not all prices were saved">{billingError(error)}</Alert>
        </div>
      </DialogBody>
    </Dialog>
  );
}
