import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { FastifyInstance } from 'fastify';

import type { GlobalMiddleware } from '@/core/http/types';
import type { HttpProvider } from '@/core/http/createHttpServer';

/**
 * Menghasilkan daftar middleware global sesuai framework HTTP yang digunakan.
 * @param provider Jenis framework HTTP aktif.
 */
export function createGlobalMiddlewares(provider: HttpProvider): GlobalMiddleware[] {
  if (provider === 'fastify') {
    return [
      {
        fastify: async (instance: FastifyInstance) => {
          await instance.register(fastifyCors);
        },
      },
      {
        fastify: async (instance: FastifyInstance) => {
          await instance.register(fastifyRateLimit, {
            max: 500,
            timeWindow: 60_000,
          });
        },
      },
    ];
  }

  return [
    {
      express: cors(),
    },
    {
      express: rateLimit({
        windowMs: 60_000,
        max: 500,
        standardHeaders: true,
        legacyHeaders: false,
      }),
    },
  ];
}
