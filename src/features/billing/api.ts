import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import type { PaymentMethod, ServiceRateKey, SessionFormat } from '@/domain/billing/billing';
import { requireSupabase } from '@/lib/supabase';
import {
  ClientBillingSchema, MeetingBillingSchema, NeedsPriceSchema, OverviewSchema, PaymentDetailsSchema, PaymentNoticesSchema, SettingsSchema,
  type BillingSettings,
} from './schemas';

export type { BillingOverview, BillingSettings, ClientNotice, OverviewClient, PaymentDetails, PaymentNotice, SessionNeedingPrice } from './schemas';

// ---------------------------------------------------------------------------------------------
// Billing (migration 00051, decision 0053). Every rule lives in the database; this reads its documents.

const billingKey = ['billing'];

async function rpc<T>(name: string, args: Record<string, unknown>, schema: z.ZodType<T>): Promise<T> {
  const { data, error } = await requireSupabase().rpc(name, args);
  if (error) throw error;
  return schema.parse(data);
}

/** Database messages are sentences without the capital and full stop. */
export function billingError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === '42501') return 'You do not have permission to do that.';
  const text = e?.message?.trim();
  if (!text) return 'Something went wrong. Nothing was saved.';
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}${/[.!?]$/.test(text) ? '' : '.'}`;
}

export function useClientBilling(clientId: string | undefined) {
  return useQuery({
    queryKey: [...billingKey, 'client', clientId],
    enabled: !!clientId,
    queryFn: () => rpc('get_client_billing', { p_client_id: clientId }, ClientBillingSchema),
  });
}

export function useBillingOverview() {
  return useQuery({ queryKey: [...billingKey, 'overview'], queryFn: () => rpc('billing_overview', {}, OverviewSchema) });
}

export function useSessionsNeedingPrice() {
  return useQuery({ queryKey: [...billingKey, 'needs-price'], queryFn: () => rpc('list_sessions_needing_price', {}, NeedsPriceSchema) });
}

export function useMeetingBilling(meetingId: string, enabled = true) {
  return useQuery({
    queryKey: [...billingKey, 'meeting', meetingId],
    enabled,
    queryFn: () => rpc('get_meeting_billing', { p_meeting_id: meetingId }, MeetingBillingSchema),
  });
}

export function useBillingSettings() {
  return useQuery({ queryKey: [...billingKey, 'settings'], queryFn: () => rpc('get_billing_settings', {}, SettingsSchema) });
}

/** For the client's Pay dialog: their primary coach's e-transfer email, what they owe and any pending "I've sent it". */
export function usePaymentDetails(enabled = true) {
  return useQuery({ queryKey: [...billingKey, 'payment-details'], enabled, queryFn: () => rpc('billing_payment_details', {}, PaymentDetailsSchema) });
}

/** Billing changes can follow from meetings and the other way round, so both refresh. */
function useBillingMutation<I, T>(fn: (input: I) => Promise<T>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => Promise.all([
      queryClient.invalidateQueries({ queryKey: billingKey }),
      queryClient.invalidateQueries({ queryKey: ['meetings'] }),
    ]),
  });
}

export type PaymentInput = {
  /** Chosen once per dialog, so a retried save is recorded once. */
  id: string;
  clientId: string;
  amountCents: number;
  receivedOn: string;
  method: PaymentMethod;
  note: string;
  chargeIds?: string[];
};

export function useRecordPayment() {
  return useBillingMutation((input: PaymentInput) => rpc('record_payment', {
    p_id: input.id, p_client_id: input.clientId, p_amount_cents: input.amountCents, p_received_on: input.receivedOn,
    p_method: input.method, p_note: input.note, p_charge_ids: input.chargeIds ?? [],
  }, ClientBillingSchema));
}

/** A payment of exactly what's left on the charges. */
export function useMarkChargesPaid() {
  return useBillingMutation((input: { id: string; chargeIds: string[]; receivedOn: string; method: PaymentMethod; note: string }) => rpc('mark_charges_paid', {
    p_id: input.id, p_charge_ids: input.chargeIds, p_received_on: input.receivedOn, p_method: input.method, p_note: input.note,
  }, ClientBillingSchema));
}

export function useVoidPayment() {
  return useBillingMutation(({ id, reason }: { id: string; reason: string }) => rpc('void_payment', { p_payment_id: id, p_reason: reason }, ClientBillingSchema));
}

export function useRestorePayment() {
  return useBillingMutation((id: string) => rpc('restore_payment', { p_payment_id: id }, ClientBillingSchema));
}

export function useVoidCharge() {
  return useBillingMutation(({ id, reason }: { id: string; reason: string }) => rpc('void_charge', { p_charge_id: id, p_reason: reason }, ClientBillingSchema));
}

export function useEditChargeLine() {
  return useBillingMutation(({ lineId, label, amountCents }: { lineId: string; label: string; amountCents: number }) =>
    rpc('edit_charge_line', { p_line_id: lineId, p_label: label, p_amount_cents: amountCents }, ClientBillingSchema));
}

export function useAddAdjustment() {
  return useBillingMutation((input: { id: string; clientId: string; period: string; label: string; amountCents: number }) => rpc('add_adjustment', {
    p_id: input.id, p_client_id: input.clientId, p_period: input.period, p_label: input.label, p_amount_cents: input.amountCents,
  }, ClientBillingSchema));
}

/** Null resets to the default. */
export function useSetClientServiceRate() {
  return useBillingMutation(({ clientId, key, amountCents }: { clientId: string; key: ServiceRateKey; amountCents: number | null }) =>
    rpc('set_client_service_rate', { p_client_id: clientId, p_key: key, p_amount_cents: amountCents }, ClientBillingSchema));
}

export function useSetClientSessionRate() {
  return useBillingMutation(({ clientId, sessionType, amountCents }: { clientId: string; sessionType: string; amountCents: number | null }) =>
    rpc('set_client_session_rate', { p_client_id: clientId, p_session_type: sessionType, p_amount_cents: amountCents }, ClientBillingSchema));
}

/** A price also becomes the client's rate for that session type. Null uses the client's rate or the default. */
export function useSetMeetingBilling() {
  return useBillingMutation(({ meetingId, format, priceCents }: { meetingId: string; format: SessionFormat; priceCents: number | null }) =>
    rpc('set_meeting_billing', { p_meeting_id: meetingId, p_format: format, p_price_cents: priceCents }, MeetingBillingSchema));
}

export function useSetScheduleFormat() {
  return useBillingMutation(({ scheduleId, format }: { scheduleId: string; format: SessionFormat }) =>
    rpc('set_meeting_schedule_format', { p_schedule_id: scheduleId, p_format: format }, z.object({ scheduleId: z.string(), format: z.enum(['solo', 'partner']) })));
}

/** Admins only. */
export function useSaveBillingSettings() {
  return useBillingMutation(({ timezone, rates }: BillingSettings) => rpc('save_billing_settings', { p_timezone: timezone, p_rates: rates }, SettingsSchema));
}

/** Staff only: the address clients send e-transfers to. Blank removes it. */
export async function saveEtransferEmail(email: string) {
  const { data, error } = await requireSupabase().rpc('save_etransfer_email', { p_email: email });
  if (error) throw error.code === '22023' ? new Error('Enter a valid email address, or leave it blank.') : error;
  return z.object({ etransferEmail: z.string().nullable() }).parse(data);
}

/**
 * The client's "I've sent it" (no charges: the whole balance) or "I've paid this" (chosen charges). It never
 * changes the balance; staff confirm it by recording the payment.
 */
export function useReportPaymentSent() {
  return useBillingMutation((input: { id: string; amountCents: number; sentOn: string; message: string; chargeIds: string[] }) => rpc('report_payment_sent', {
    p_id: input.id, p_amount_cents: input.amountCents, p_sent_on: input.sentOn, p_message: input.message, p_charge_ids: input.chargeIds,
  }, PaymentDetailsSchema));
}

/**
 * Staff: pending notices across their clients, oldest first. Confirmed, dismissed and settled ones
 * (paid some other way, or nothing owed) drop out. Polls like the Activity badge, because clients
 * report payments without the coach doing anything.
 */
export function usePaymentNotices() {
  return useQuery({ queryKey: [...billingKey, 'notices'], refetchInterval: 60_000, queryFn: () => rpc('list_payment_notices', {}, PaymentNoticesSchema) });
}

export function useRecordReportedPayment() {
  return useBillingMutation((input: { noticeId: string; id: string; amountCents: number; receivedOn: string; method: PaymentMethod; note: string }) =>
    rpc('record_reported_payment', {
      p_notice_id: input.noticeId, p_payment_id: input.id, p_amount_cents: input.amountCents, p_received_on: input.receivedOn,
      p_method: input.method, p_note: input.note,
    }, ClientBillingSchema));
}

export function useDismissPaymentNotice() {
  return useBillingMutation(({ id, reason }: { id: string; reason: string }) => rpc('dismiss_payment_notice', { p_notice_id: id, p_reason: reason }, PaymentNoticesSchema));
}
