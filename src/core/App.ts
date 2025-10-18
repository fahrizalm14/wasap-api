import type { HttpServer, ModuleDefinition, GlobalMiddleware } from '@/core/http/types';
import type { Logger } from '@/shared/utils/logger';

/**
 * Fungsi yang akan dipanggil saat proses shutdown untuk membersihkan resource.
 */
type CleanupCallback = () => Promise<void> | void;

/**
 * Konfigurasi dasar untuk menjalankan aplikasi.
 */
export interface AppOptions {
  server: HttpServer;
  port: number;
  logger: Logger;
  shutdownSignals?: NodeJS.Signals[];
}

/**
 * Kelas pengelola siklus hidup aplikasi HTTP.
 * Bertanggung jawab mendaftarkan middleware, modul, dan menangani shutdown.
 */
export class App {
  private readonly server: HttpServer;

  private readonly port: number;

  private readonly logger: Logger;

  private readonly shutdownSignals: NodeJS.Signals[];

  private readonly middlewares: GlobalMiddleware[] = [];

  private readonly modules: ModuleDefinition[] = [];

  private readonly cleanupCallbacks: CleanupCallback[] = [];

  /**
   * Membuat instance App dengan server, port, logger, dan sinyal shutdown opsional.
   */
  constructor({ server, port, logger, shutdownSignals = ['SIGINT', 'SIGTERM'] }: AppOptions) {
    this.server = server;
    this.port = port;
    this.logger = logger;
    this.shutdownSignals = shutdownSignals;
    this.registerCleanup(async () => {
      await this.server.stop();
    });
  }

  /**
   * Mendaftarkan middleware global yang akan dijalankan sebelum modul.
   */
  registerMiddleware(middleware: GlobalMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Mendaftarkan modul HTTP beserta prefix dan rute-rutenya.
   */
  registerModule(module: ModuleDefinition): this {
    this.modules.push(module);
    return this;
  }

  /**
   * Menambahkan callback pembersihan yang dieksekusi saat shutdown.
   */
  registerCleanup(callback: CleanupCallback): this {
    this.cleanupCallbacks.push(callback);
    return this;
  }

  /**
   * Mengikat sinyal sistem agar aplikasi bisa shutdown dengan rapi.
   */
  private registerShutdownHooks(): void {
    for (const signal of this.shutdownSignals) {
      process.once(signal, () => {
        this.logger.info(`Received ${signal}. Shutting down gracefully...`);
        void this.runCleanup().finally(() => process.exit(0));
      });
    }
  }

  /**
   * Menjalankan seluruh callback pembersihan secara berurutan.
   */
  private async runCleanup(): Promise<void> {
    for (const callback of this.cleanupCallbacks) {
      try {
        await callback();
      } catch (error) {
        this.logger.error('Cleanup callback failed', error as Error);
      }
    }
  }

  /**
   * Menjalankan middleware, modul, mendaftarkan hook shutdown, lalu menyalakan server.
   */
  async start(): Promise<void> {
    for (const middleware of this.middlewares) {
      this.server.registerGlobalMiddleware(middleware);
    }

    for (const module of this.modules) {
      this.server.register(module);
    }

    this.registerShutdownHooks();

    await this.server.start(this.port);
    this.logger.info(`🎯 Application ready on port ${this.port}`);
  }
}
