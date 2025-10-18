import fastifyCors from '@fastify/cors';
import fastifyRateLimit from '@fastify/rate-limit';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import type { FastifyInstance, FastifyRequest } from 'fastify';

import type { GlobalMiddleware } from '@/core/http/types';
import type { HttpProvider } from '@/core/http/createHttpServer';
import { createDocsMiddleware } from '@/core/http/docsMiddleware';
import { Logger } from '@/shared/utils/logger';

/**
 * Menghasilkan daftar middleware global sesuai framework HTTP yang digunakan.
 * @param provider Jenis framework HTTP aktif.
 */
export function createGlobalMiddlewares(provider: HttpProvider): GlobalMiddleware[] {
  const logger = new Logger();
  const docsMiddleware = createDocsMiddleware(provider);
  const logMiddleware: GlobalMiddleware =
    provider === 'fastify'
      ? {
          fastify: async (instance: FastifyInstance) => {
            instance.addHook('onRequest', async (request: FastifyRequest) => {
              logger.info(`[HTTP] ${request.method} ${request.url}`);
            });
          },
        }
      : {
          express: (req, _res, next) => {
            logger.info(`[HTTP] ${req.method} ${req.originalUrl || req.url}`);
            next();
          },
        };

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
      logMiddleware,
      docsMiddleware,
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
    logMiddleware,
    docsMiddleware,
  ];
}
