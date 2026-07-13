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
});

export const config = envSchema.parse(process.env);
