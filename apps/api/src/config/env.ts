import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.string().default('info'),
  CORS_ORIGIN: z.string().default('http://localhost:5173'),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  REDIS_URL: z.string().min(1, 'REDIS_URL is required'),

  CLERK_SECRET_KEY: z.string().min(1, 'CLERK_SECRET_KEY is required'),
  CLERK_PUBLISHABLE_KEY: z.string().min(1).optional(),
  CLERK_AUTHORIZED_PARTIES: z.string().default(''),
  CLERK_WEBHOOK_SECRET: z.string().optional().default(''),

  EXPO_ACCESS_TOKEN: z.string().optional().default(''),

  ANGEL_ONE_API_KEY: z.string().optional().default(''),
  ANGEL_ONE_CLIENT_CODE: z.string().optional().default(''),
  ANGEL_ONE_PUBLISHER_APP_ID: z.string().optional().default(''),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  throw new Error('Invalid environment configuration — see printed field errors.');
}

export const env = parsed.data;

export const clerkAuthorizedParties = env.CLERK_AUTHORIZED_PARTIES.split(',')
  .map((s) => s.trim())
  .filter(Boolean);

export const isClerkConfigured =
  !env.CLERK_SECRET_KEY.includes('REPLACE_ME') && !env.CLERK_SECRET_KEY.includes('placeholder');

export const isAngelOneConfigured = Boolean(
  env.ANGEL_ONE_API_KEY && env.ANGEL_ONE_CLIENT_CODE && env.ANGEL_ONE_PUBLISHER_APP_ID,
);

export const isExpoPushConfigured = Boolean(env.EXPO_ACCESS_TOKEN);
