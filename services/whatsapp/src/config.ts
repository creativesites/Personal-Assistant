import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  DATABASE_URL: z.string().url(),
  REDIS_URL: z.string().url(),
  API_URL: z.string().url().default('http://localhost:3000'),
  OPEN_WA_LICENSE_KEY: z.string().optional(),
});

export const config = envSchema.parse(process.env);
