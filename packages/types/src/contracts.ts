import { z } from 'zod';
import { BrokerId, SignalSide } from './enums.js';

// ---------- Signals ----------

export const tradePlanSchema = z
  .object({
    entry: z.number().positive(),
    stopLoss: z.number().positive(),
    target1: z.number().positive(),
    target2: z.number().positive().nullable().default(null),
    target3: z.number().positive().nullable().default(null),
    partialExitPercentages: z
      .object({
        t1: z.number().min(0).max(100).optional(),
        t2: z.number().min(0).max(100).optional(),
        t3: z.number().min(0).max(100).optional(),
      })
      .nullable()
      .default(null),
  })
  .superRefine((plan, ctx) => {
    // SL/target ordering sanity depends on side, validated again server-side with `side`.
    if (plan.target2 !== null && plan.target3 !== null) {
      // no strict numeric ordering enforced here (side-dependent) — see signal service.
    }
  });

export const brokerOrderHintSchema = z.object({
  broker: z.nativeEnum(BrokerId).default(BrokerId.ANGEL_ONE),
  exchange: z.string().min(1).max(16),
  tradingSymbol: z.string().min(1).max(64),
  symbolToken: z.string().max(64).nullable().default(null),
  side: z.nativeEnum(SignalSide),
  orderType: z.enum(['MARKET', 'LIMIT']).default('LIMIT'),
  productType: z.string().max(32).nullable().default(null),
  quantity: z.number().int().positive().nullable().default(null),
});

export const createSignalDraftSchema = z.object({
  side: z.nativeEnum(SignalSide),
  instrumentDisplayName: z.string().min(1).max(120),
  tradePlan: tradePlanSchema,
  brokerOrderHint: brokerOrderHintSchema,
  notes: z.string().max(2000).nullable().optional(),
  expiresAt: z.string().datetime().nullable().optional(),
});
export type CreateSignalDraftInput = z.infer<typeof createSignalDraftSchema>;

export const publishSignalSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

export const updateStopLossSchema = z.object({
  stopLoss: z.number().positive(),
  idempotencyKey: z.string().uuid(),
});

export const updateTargetsSchema = z.object({
  target1: z.number().positive().optional(),
  target2: z.number().positive().nullable().optional(),
  target3: z.number().positive().nullable().optional(),
  idempotencyKey: z.string().uuid(),
});

export const targetHitSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

export const exitNowSchema = z.object({
  idempotencyKey: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

export const cancelSignalSchema = z.object({
  idempotencyKey: z.string().uuid(),
  reason: z.string().max(500).optional(),
});

// ---------- Clients / Membership ----------

export const createClientSchema = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(32).nullable().optional(),
  preferredBroker: z.nativeEnum(BrokerId).default(BrokerId.ANGEL_ONE),
  email: z.string().email(), // used only to send the Clerk invitation
});
export type CreateClientInput = z.infer<typeof createClientSchema>;

export const extendMembershipSchema = z.object({
  days: z.number().int().min(1).max(3650),
  markPaymentReceived: z.boolean().default(false),
});

export const markPaymentSchema = z.object({
  note: z.string().max(500).optional(),
});

// ---------- Devices ----------

export const registerDeviceSchema = z.object({
  expoPushToken: z.string().min(10),
  platform: z.enum(['IOS', 'ANDROID']),
  deviceName: z.string().max(120).nullable().optional(),
});
