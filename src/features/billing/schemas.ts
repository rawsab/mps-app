import { z } from 'zod';
import type { ClientBilling, MeetingBilling } from '@/domain/billing/billing';

// Billing documents from migration 00051 (decision 0053). Kept apart from api.ts so the HTTP tests can
// parse real responses without the browser client.

const Service = z.enum(['personal_training', 'mesocycle', 'nutrition']);
const ChargeStatus = z.enum(['unpaid', 'part_paid', 'paid', 'void']);
const Method = z.enum(['e_transfer', 'cash', 'other', 'credit']);

const ChargeSchema = z.object({
  id: z.string(), kind: z.enum(['session', 'programming', 'adjustment']), period: z.string(), occurredOn: z.string(), label: z.string(),
  meetingId: z.string().nullable(), amountCents: z.number().int(), paidCents: z.number().int(), status: ChargeStatus,
  voidedAt: z.string().nullable(), voidReason: z.string().nullable(),
  lines: z.array(z.object({
    id: z.string(), kind: z.enum(['session', 'service', 'bundle_discount', 'adjustment']), service: Service.nullable(), label: z.string(), amountCents: z.number().int(),
  })),
});

const PaymentSchema = z.object({
  id: z.string(), amountCents: z.number().int(), allocatedCents: z.number().int(), receivedOn: z.string(), method: Method, recordedAt: z.string(),
  note: z.string().nullable(), voidedAt: z.string().nullable(), voidReason: z.string().nullable(),
  allocations: z.array(z.object({ chargeId: z.string(), amountCents: z.number().int() })),
});

const SummarySchema = z.object({
  outstandingCents: z.number().int(), creditCents: z.number().int(), balanceCents: z.number().int(), carriedOverCents: z.number().int(),
  oldestUnpaidPeriod: z.string().nullable(),
});

const RateFields = { defaultCents: z.number().int().nullable(), customCents: z.number().int().nullable(), amountCents: z.number().int().nullable() };

export const ClientBillingSchema: z.ZodType<ClientBilling> = z.object({
  clientId: z.string(), currentPeriod: z.string(), summary: SummarySchema,
  rates: z.object({
    services: z.array(z.object({ key: z.enum(['mesocycle_month', 'nutrition_month', 'bundle_discount_month']), ...RateFields })),
    sessions: z.array(z.object({ sessionType: z.string(), ...RateFields })),
  }),
  planCents: z.number().int().nullable(), charges: z.array(ChargeSchema), payments: z.array(PaymentSchema),
});

export const MeetingBillingSchema: z.ZodType<MeetingBilling> = z.object({
  meetingId: z.string(), billable: z.boolean(), format: z.enum(['solo', 'partner']), sessionType: z.string(),
  priceCents: z.number().int().nullable(), resolvedPriceCents: z.number().int().nullable(),
  priceSource: z.enum(['meeting', 'client', 'default']).nullable(), charge: ChargeSchema.nullable(),
});

export const OverviewSchema = z.object({
  currentPeriod: z.string(), billedThisMonthCents: z.number().int(), receivedThisMonthCents: z.number().int(),
  clients: z.array(z.object({
    clientId: z.string(), fullName: z.string(), status: z.string(), summary: SummarySchema, planCents: z.number().int().nullable(),
    lastPaymentOn: z.string().nullable(),
  })),
});
export type BillingOverview = z.infer<typeof OverviewSchema>;
export type OverviewClient = BillingOverview['clients'][number];

export const NeedsPriceSchema = z.array(z.object({
  meetingId: z.string(), clientId: z.string(), clientName: z.string(), startsAt: z.string(), durationMinutes: z.number().int(),
  timezone: z.string(), format: z.enum(['solo', 'partner']), status: z.string(),
}));
export type SessionNeedingPrice = z.infer<typeof NeedsPriceSchema>[number];

export const SettingsSchema = z.object({ timezone: z.string(), rates: z.record(z.string(), z.number().int()) });
export type BillingSettings = z.infer<typeof SettingsSchema>;

// "I've sent it" (migration 00054, decision 0055).
const NoticeFields = {
  id: z.string(), amountCents: z.number().int(), sentOn: z.string(), message: z.string(),
  /** Empty: the whole balance. */
  chargeIds: z.array(z.string()), chargeLabels: z.array(z.string()),
  status: z.enum(['pending', 'confirmed', 'dismissed', 'settled']), reportedAt: z.string(), createdAt: z.string(), updatedAt: z.string(),
};
export const PaymentDetailsSchema = z.object({
  etransferEmail: z.string().nullable(), coachName: z.string().nullable(), balanceCents: z.number().int(),
  pendingNotices: z.array(z.object(NoticeFields)),
});
export type PaymentDetails = z.infer<typeof PaymentDetailsSchema>;
export type ClientNotice = PaymentDetails['pendingNotices'][number];

export const PaymentNoticesSchema = z.array(z.object({ ...NoticeFields, clientId: z.string(), clientName: z.string() }));
export type PaymentNotice = z.infer<typeof PaymentNoticesSchema>[number];
