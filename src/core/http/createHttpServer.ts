import type { Logger } from '@/shared/utils/logger';

import { ExpressHttpServer } from '@/core/http/ExpressHttpServer';
import { FastifyHttpServer } from '@/core/http/FastifyHttpServer';
import type { HttpServer } from '@/core/http/types';
import {
  createExpressErrorHandler,
  createFastifyErrorHandler,
} from '@/core/middleware/errorHandler';

/** Jenis framework HTTP yang didukung aplikasi. */
export type HttpProvider = 'express' | 'fastify';

/**
 * Membuat instance server HTTP sesuai provider yang dipilih.
 * @param provider Jenis framework HTTP yang digunakan.
 * @param logger Logger aplikasi untuk mencatat aktivitas server.
 */
export function createHttpServer(provider: HttpProvider, logger: Logger): HttpServer {
  if (provider === 'fastify') {
    const server = new FastifyHttpServer(logger);
    server.setErrorHandler(createFastifyErrorHandler(logger));
    return server;
  }

  const server = new ExpressHttpServer(logger);
  server.setErrorHandler(createExpressErrorHandler(logger));
  return server;
}
