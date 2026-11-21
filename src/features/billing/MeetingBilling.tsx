import { useState, type ReactNode } from 'react';
import { useViewer } from '@/app/auth';
import { SegmentedControl } from '@/components/controls';
import { Alert, Badge, Button, Spinner, TextField } from '@/components/ui';
import { chargeStatusLabel, sessionType, type MeetingBilling, type SessionFormat } from '@/domain/billing/billing';
import { centsToInput, formatCents, parseDollars } from '@/domain/billing/money';
import { todayIn } from '@/features/scheduling/time';
import { billingError, useMarkChargesPaid, useMeetingBilling, useSetMeetingBilling } from './api';
import { STATUS_TONE } from './ClientBilling';

// Price of one PT meeting in the coach's meeting dialog (decision 0053). Attended, no-show and late-cancelled
// sessions are charged when attendance is recorded; this sets what they're charged.

const SOURCE: Record<NonNullable<MeetingBilling['priceSource']>, string> = {
  meeting: 'Set for this session.',
  client: 'The client’s price for this kind of session.',
  default: 'The default price.',
};

export function MeetingBillingSection({ meetingId, durationMinutes, onSaved }: { meetingId: string; durationMinutes: number; onSaved: (message: ReactNode) => void }) {
  const billing = useMeetingBilling(meetingId);
  if (billing.isPending) return <Spinner small label="Loading price" />;
  if (billing.isError) return <Alert title="Could not load the price">{billingError(billing.error)}</Alert>;
  // Remount after each save so the fields show what was stored.
  return <PriceFields key={`${billing.data.format}-${billing.data.priceCents}-${billing.data.charge?.id}`} billing={billing.data} durationMinutes={durationMinutes} onSaved={onSaved} />;
}

function PriceFields({ billing, durationMinutes, onSaved }: { billing: MeetingBilling; durationMinutes: number; onSaved: (message: ReactNode) => void }) {
  const viewer = useViewer();
  const save = useSetMeetingBilling();
  const markPaid = useMarkChargesPaid();
  const [format, setFormat] = useState<SessionFormat>(billing.format);
  const [price, setPrice] = useState(centsToInput(billing.priceCents));
  const [problem, setProblem] = useState('');
  const [paymentId] = useState(() => crypto.randomUUID());
  const charge = billing.charge;
  const left = charge && charge.status !== 'void' ? charge.amountCents - charge.paidCents : 0;
  const changed = format !== billing.format || price.trim() !== centsToInput(billing.priceCents);
  // The format changes which price applies, so the placeholder only describes the stored format.
  const fallback = format === billing.format && billing.priceCents === null ? billing.resolvedPriceCents : null;

  function submit() {
    const cents = price.trim() ? parseDollars(price) : null;
    if (price.trim() && cents === null) return setProblem('Enter a price, for example 100 or 85.50. Leave it blank for the client’s usual price.');
    setProblem('');
    save.mutate({ meetingId: billing.meetingId, format, priceCents: cents }, {
      onSuccess: (saved) => onSaved(saved.resolvedPriceCents === null ? 'Saved. This session still needs a price.' : `Session price is ${formatCents(saved.resolvedPriceCents)}.`),
    });
  }

  return (
    <section aria-labelledby="meeting-price" className="grid gap-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="meeting-price" className="text-base font-semibold">Price</h3>
        {charge ? (
          <span className="flex items-center gap-2 text-sm">
            <span className={charge.status === 'void' ? 'text-muted line-through' : ''}>Charged {formatCents(charge.amountCents)}</span>
            <Badge size="sm" tone={STATUS_TONE[charge.status]}>{charge.status === 'void' ? 'Waived' : chargeStatusLabel[charge.status]}</Badge>
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <SegmentedControl label="Session type" size="md" value={format} onChange={setFormat}
          options={[{ value: 'solo', label: 'Solo' }, { value: 'partner', label: 'Partner' }]} />
        <TextField label="Price ($)" className="w-36" inputMode="decimal" autoComplete="off" value={price} onChange={(event) => setPrice(event.target.value)}
          placeholder={fallback === null ? '' : centsToInput(fallback)} />
        <Button variant="secondary" busy={save.isPending} disabled={!changed || markPaid.isPending} onClick={submit}>Save price</Button>
      </div>
      <p className="text-xs text-muted">
        {format === billing.format && billing.priceSource ? `${SOURCE[billing.priceSource]} ` : ''}
        {format === billing.format && billing.resolvedPriceCents === null ? `No price yet for a ${format} ${durationMinutes}-minute session. ` : ''}
        A price typed here becomes the client’s price for {format === 'partner' ? 'partner' : 'solo'} {durationMinutes}-minute sessions. Leave it blank to use that price.
        {charge?.status === 'void' ? ' This session was waived, so it stays uncharged.' : ''}
      </p>
      {sessionType(format, durationMinutes) !== billing.sessionType ? <p className="text-xs text-muted">Save to see the {format} price.</p> : null}
      {left > 0 && charge ? (
        <div>
          <Button variant="ghost-gold" busy={markPaid.isPending} disabled={save.isPending}
            onClick={() => markPaid.mutate({ id: paymentId, chargeIds: [charge.id], receivedOn: todayIn(viewer.data?.timezone ?? 'America/Toronto'), method: 'e_transfer', note: '' }, {
              onSuccess: () => onSaved(`Marked paid (${formatCents(left)}, e-Transfer today). Change it from the client’s Billing section.`),
            })}>
            Mark {formatCents(left)} paid
          </Button>
        </div>
      ) : null}
      <Alert visible={!!problem}>{problem}</Alert>
      <Alert visible={!!(save.error ?? markPaid.error)} title="Not saved">{billingError(save.error ?? markPaid.error)}</Alert>
    </section>
  );
}
