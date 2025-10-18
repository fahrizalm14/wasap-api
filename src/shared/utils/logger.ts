import pino from 'pino';
import { singleton } from 'tsyringe';

import { env } from '@/config';

@singleton()
/**
 * Pembungkus sederhana untuk logger Pino yang digunakan di seluruh aplikasi.
 */
export class Logger {
  private readonly pino: pino.Logger;

  constructor() {
    this.pino = pino({
      transport:
        env.NODE_ENV !== 'production' ? { target: 'pino-pretty' } : undefined,
    });
  }

  /**
   * Mencatat log untuk informasi umum.
   * @param message Pesan log
   */
  info(message: string) {
    this.pino.info(message);
  }

  /**
   * Mencatat log untuk error.
   * @param message Pesan error kustom
   * @param error Objek Error yang asli
   */
  error(message: string, error: unknown) {
    if (error instanceof Error) {
      this.pino.error({ err: error }, message);
      return;
    }

    this.pino.error({ err: error ?? 'Unknown error' }, message);
  }
}
