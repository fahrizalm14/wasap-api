import express, { ErrorRequestHandler, Express, RequestHandler } from 'express';
import rateLimit from 'express-rate-limit';
import http from 'http';

import {
  GlobalMiddleware,
  HttpServer,
  ModuleDefinition,
  RouteDefinition,
  RouteHandler,
  SocketAdapter,
} from '@/core/http/types';
import { Logger } from '@/shared/utils/logger';

/**
 * Implementasi server HTTP berbasis Express.
 * Bertugas menangani registrasi middleware, modul, dan lifecycle server.
 */
export class ExpressHttpServer implements HttpServer {
  private readonly app: Express;
  private server?: http.Server;
  private readonly errorHandlers: ErrorRequestHandler[] = [];
  private readonly globalMiddlewares: RequestHandler[] = [];
  private readonly modules: ModuleDefinition[] = [];
  private readonly socketAdapters: SocketAdapter[] = [];

  /**
   * Menginisialisasi Express dengan konfigurasi dasar (JSON parser dan disabled x-powered-by).
   */
  constructor(private readonly logger: Logger) {
    this.app = express();
    this.app.disable('x-powered-by');
    this.app.use(express.json({ limit: '1mb' }));
    this.app.use(express.urlencoded({ extended: false, limit: '1mb' }));
  }

  /**
   * Membungkus handler internal menjadi `RequestHandler` Express standar.
   */
  private wrapHandler(handler: RouteHandler): RequestHandler {
    return async (req, res, next) => {
      try {
        const result = await handler({
          framework: 'express',
          params: req.params,
          query: req.query as Record<string, unknown>,
          body: req.body,
          raw: req,
          reply: res,
        });

        if (result?.raw) {
          return;
        }

        const status = result?.status ?? 200;
        if (result?.body === undefined) {
          res.sendStatus(status);
          return;
        }
        res.status(status).json(result.body);
      } catch (error) {
        next(error);
      }
    };
  }

  /**
   * Mendaftarkan route Express berdasarkan definisi HTTP internal.
   */
  private registerRoute(router: express.Router, route: RouteDefinition): void {
    const method = route.method.toLowerCase() as keyof express.Router;
    const handler = this.wrapHandler(route.handler);

    if (typeof router[method] !== 'function') {
      throw new Error(`Unsupported HTTP method "${route.method}" for Express`);
    }

    (router[method] as (path: string, ...handlers: RequestHandler[]) => express.Router)(
      route.path,
      handler,
    );
  }

  /**
   * Menyimpan modul yang akan dipasang saat server dijalankan.
   */
  register(module: ModuleDefinition): void {
    this.modules.push(module);
  }

  /**
   * Mengubah definisi modul menjadi router Express dan memasangnya pada prefix.
   */
  private materializeModule(module: ModuleDefinition): void {
    const router = express.Router();

    if (module.options?.rateLimit) {
      const limiter = rateLimit({
        windowMs: module.options.rateLimit.windowMs,
        max: module.options.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
      });
      router.use(limiter);
    }

    for (const route of module.routes) {
      this.registerRoute(router, route);
    }

    this.app.use(module.prefix, router);
    this.logger.info(`✅ Module loaded at prefix: ${module.prefix}`);
  }

  /**
   * Menambahkan middleware global Express.
   */
  registerGlobalMiddleware(middleware: GlobalMiddleware): void {
    if (middleware.express) {
      this.globalMiddlewares.push(middleware.express);
    }
  }

  /**
   * Menyimpan adapter socket yang akan dijalankan setelah server aktif.
   */
  registerSocketAdapter(adapter: SocketAdapter): void {
    this.socketAdapters.push(adapter);
  }

  /**
   * Menjalankan server Express dengan urutan:
   * - Pasang middleware global
   * - Panggil modul yang belum diregistrasikan
   * - Pasang error handler
   * - Mulai mendengarkan port
   */
  async start(port: number): Promise<void> {
    for (const middleware of this.globalMiddlewares) {
      this.app.use(middleware);
    }

    for (const module of this.modules) {
      this.materializeModule(module);
    }

    for (const handler of this.errorHandlers) {
      this.app.use(handler);
    }

    await new Promise<void>((resolve, reject) => {
      this.server = this.app.listen(port, () => resolve());
      this.server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') {
          reject(error);
          return;
        }

        switch (error.code) {
          case 'EACCES':
            this.logger.error(`❌ Port ${port} memerlukan hak akses administrator.`, error);
            reject(error);
            break;
          case 'EADDRINUSE':
            this.logger.error(`❌ Port ${port} sudah digunakan oleh aplikasi lain.`, error);
            reject(error);
            break;
          default:
            reject(error);
        }
      });
    });

    await this.initializeSocketAdapters();

    this.logger.info(`🚀 Express server listening on http://localhost:${port}`);
  }

  /**
   * Mendaftarkan error handler Express kustom.
   */
  setErrorHandler(handler: unknown): void {
    if (typeof handler === 'function') {
      this.errorHandlers.push(handler as ErrorRequestHandler);
    }
  }

  /**
   * Menghentikan server Express secara elegan.
   */
  async stop(): Promise<void> {
    if (!this.server) {
      return;
    }

    await this.shutdownSocketAdapters();

    await new Promise<void>((resolve, reject) => {
      this.server?.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    this.server = undefined;
    this.logger.info('🛑 Express server closed');
  }

  /**
   * Menjalankan seluruh adapter socket yang terdaftar.
   */
  private async initializeSocketAdapters(): Promise<void> {
    if (!this.server) {
      return;
    }

    for (const adapter of this.socketAdapters) {
      await adapter.onReady(this.server);
      this.logger.info('🔌 Socket adapter ready (express)');
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
