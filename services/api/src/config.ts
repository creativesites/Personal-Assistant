import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  JWT_SECRET: z.string().min(16),
  WHATSAPP_SERVICE_URL: z.string().url().default('http://localhost:3001'),
  INTELLIGENCE_SERVICE_URL: z.string().url().default('http://localhost:8000'),
  INTERNAL_API_SECRET: z.string().default(''),
  CORS_ORIGIN: z.string().default(''),
  KB_STORAGE_DIR: z.string().default('/app/kb-storage'),
  DOC_STORAGE_DIR: z.string().default('/app/doc-storage'),
  // This API's own externally-reachable base URL — used to build the
  // shareable document link (plan §15 Phase 4) sent to customers over
  // WhatsApp. Production: http://47.84.205.81:5500 (see CLAUDE.md).
  PUBLIC_API_URL: z.string().url().default('http://localhost:3000'),
  // Zuri's own merchant mobile money numbers (docs/PRICING_PAYMENTS_PLAN.md
  // §5 step 3) — one pair for the whole platform, shown to every user at
  // checkout. Not a per-user field like business_profiles.mobile_money.
  MOBILE_MONEY_AIRTEL_NUMBER: z.string().default('097X XXX XXX'),
  MOBILE_MONEY_MTN_NUMBER: z.string().default('096X XXX XXX'),
});

export const config = envSchema.parse(process.env);
