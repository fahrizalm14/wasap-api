import { inject, singleton } from 'tsyringe';

import { env } from '@/config';
import { Logger } from '@/shared/utils/logger';
import { PrismaClient } from '@prisma/client';

type ShutdownSignal = 'SIGINT' | 'SIGTERM';

@singleton()
/**
 * Menyediakan satu-satunya instance PrismaClient dan mengatur daur hidupnya.
 */
export class PrismaService {
  private readonly client: PrismaClient;

  private isDisconnected = false;

  constructor(@inject(Logger) private readonly logger: Logger) {
    this.client = new PrismaClient({
      datasources: {
        db: {
          url: env.DATABASE_URL,
        },
      },
    });

    this.attachShutdownHooks();
  }

  /**
   * Mengembalikan instance PrismaClient yang siap digunakan.
   */
  getClient(): PrismaClient {
    return this.client;
  }

  private attachShutdownHooks() {
    process.once('beforeExit', () => {
      void this.disconnect('beforeExit');
    });

    const signals: ShutdownSignal[] = ['SIGINT', 'SIGTERM'];
    signals.forEach((signal) =>
      process.once(signal, () => {
        void this.disconnect(signal);
      }),
    );
  }

  private async disconnect(context: ShutdownSignal | 'beforeExit') {
    if (this.isDisconnected) {
      return;
    }

    try {
      await this.client.$disconnect();
      this.isDisconnected = true;
      this.logger.info(`Prisma disconnected gracefully on ${context}`);
    } catch (error) {
      this.logger.error('Failed to disconnect Prisma cleanly', error);
    }
  }
}
