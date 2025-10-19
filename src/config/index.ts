import 'dotenv/config';
import { z } from 'zod';

/**
 * Skema validasi untuk seluruh variabel lingkungan yang digunakan aplikasi.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  HTTP_SERVER: z.enum(['express', 'fastify']).default('express'),
  DATABASE_URL: z.string().min(1).default('file:./dev.db'),
  SOCKET_ENABLED: z.coerce.boolean().default(false),
  SECRET_KEY: z.string().min(1, 'SECRET_KEY must not be empty'),
});

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error(
    '❌ Invalid environment variables:',
    parsedEnv.error.flatten().fieldErrors,
  );
  throw new Error('Invalid environment variables.');
}

/**
 * Objek konfigurasi lingkungan yang telah tervalidasi.
 */
export const env = parsedEnv.data;
