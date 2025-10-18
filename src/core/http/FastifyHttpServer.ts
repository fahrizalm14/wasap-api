import type http from 'http';

import Fastify, { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import {
  GlobalMiddleware,
  HttpServer,
  ModuleDefinition,
  RouteHandler,
  SocketAdapter,
} from '@/core/http/types';
import { Logger } from '@/shared/utils/logger';

/**
 * Implementasi server HTTP berbasis Fastify yang mematuhi antarmuka `HttpServer`.
 */
export class FastifyHttpServer implements HttpServer {
  private readonly app: FastifyInstance;
  private readonly globalMiddlewares: ((
    instance: FastifyInstance,
  ) => Promise<void> | void)[] = [];
  private readonly modules: ModuleDefinition[] = [];
  private readonly socketAdapters: SocketAdapter[] = [];

  /**
   * Membuat instance server Fastify tanpa logger internal (delegasi ke logger aplikasi).
   */
  constructor(private readonly logger: Logger) {
    this.app = Fastify({ logger: false });
  }

  /**
   * Membungkus handler route agar sesuai kontrak `RouteHandler` internal.
   */
  private wrapHandler(handler: RouteHandler) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      const result = await handler({
        framework: 'fastify',
        params: request.params as Record<string, string>,
        query: request.query as Record<string, unknown>,
        body: request.body,
        raw: request,
        reply,
      });

      const status = result?.status ?? 200;
      if (result?.body === undefined) {
        void reply.status(status).send();
        return;
      }

      void reply.status(status).send(result.body);
    };
  }

  register(module: ModuleDefinition): void {
    this.modules.push(module);
  }

  /**
   * Mendaftarkan seluruh route milik modul ke instance Fastify.
   */
  private registerModule(module: ModuleDefinition): void {
    this.app.register(async (instance) => {
      if (module.options?.rateLimit) {
        await instance.register(fastifyRateLimit, {
          max: module.options.rateLimit.max,
          timeWindow: module.options.rateLimit.windowMs,
        });
      }

      for (const route of module.routes) {
        instance.route({
          method: route.method,
          url: route.path,
          handler: this.wrapHandler(route.handler),
        });
      }
    }, { prefix: module.prefix });
    this.logger.info(`✅ Module loaded at prefix: ${module.prefix}`);
  }

  /**
   * Menyimpan middleware global yang akan dieksekusi sebelum modul dipasang.
   */
  registerGlobalMiddleware(middleware: GlobalMiddleware): void {
    if (middleware.fastify) {
      this.globalMiddlewares.push(middleware.fastify);
    }
  }

  /**
   * Menyimpan adapter socket yang akan dijalankan setelah server aktif.
   */
  registerSocketAdapter(adapter: SocketAdapter): void {
    this.socketAdapters.push(adapter);
  }

  /**
   * Menetapkan error handler kustom untuk instance Fastify.
   */
  setErrorHandler(handler: unknown): void {
    if (typeof handler === 'function') {
      this.app.setErrorHandler(handler as Parameters<FastifyInstance['setErrorHandler']>[0]);
    }
  }

  /**
   * Menjalankan server Fastify:
   * - Menjalankan middleware global
   * - Mendaftarkan modul
   * - Memulai proses listen
   */
  async start(port: number): Promise<void> {
    for (const middleware of this.globalMiddlewares) {
      await middleware(this.app);
    }

    for (const module of this.modules) {
      this.registerModule(module);
    }
    await this.app.ready();
    await this.app.listen({ port, host: '0.0.0.0' });
    await this.initializeSocketAdapters();
    this.logger.info(`🚀 Fastify server listening on http://localhost:${port}`);
  }

  /**
   * Menutup instance Fastify.
   */
  async stop(): Promise<void> {
    await this.shutdownSocketAdapters();
    await this.app.close();
    this.logger.info('🛑 Fastify server closed');
  }

  /**
   * Menjalankan seluruh adapter socket yang terdaftar.
   */
  private async initializeSocketAdapters(): Promise<void> {
    const server = this.app.server as http.Server | undefined;

    if (!server) {
      return;
    }

    for (const adapter of this.socketAdapters) {
      await adapter.onReady(server);
      this.logger.info('🔌 Socket adapter ready (fastify)');
    }
  }

  /**
   * Memanggil hook shutdown untuk setiap adapter socket sebelum server berhenti.
   */
  private async shutdownSocketAdapters(): Promise<void> {
    for (const adapter of this.socketAdapters) {
      await adapter.onShutdown?.();
    }
  }
}
