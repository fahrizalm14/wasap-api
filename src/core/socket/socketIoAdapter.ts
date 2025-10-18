import type http from 'http';

import { Server, type ServerOptions } from 'socket.io';

import type { SocketAdapter } from '@/core/http/types';
import type { Logger } from '@/shared/utils/logger';

export interface SocketIoAdapterOptions {
  serverOptions?: Partial<ServerOptions>;
  configure?(io: Server): void;
  cleanup?(io: Server | undefined): void;
}

export const SOCKET_IO_SERVER_TOKEN = Symbol('SOCKET_IO_SERVER_TOKEN');

/**
 * Membuat adapter Socket.IO yang mematuhi kontrak `SocketAdapter`.
 * Adapter ini hanya akan aktif ketika didaftarkan secara eksplisit.
 */
export function createSocketIoAdapter(
  logger: Logger,
  options?: SocketIoAdapterOptions,
): SocketAdapter {
  let io: Server | undefined;

  return {
    onReady(server: http.Server) {
      io = new Server(server, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
        },
        ...(options?.serverOptions ?? {}),
      });

      options?.configure?.(io);

      io.on('connection', (socket) => {
        logger.info(`🔌 Socket connected: ${socket.id}`);
        socket.on('disconnect', (reason) => {
          logger.info(`🔌 Socket disconnected: ${socket.id} (${reason})`);
        });
      });
    },
    onShutdown() {
      if (!io) {
        options?.cleanup?.(io);
        return;
      }

      return new Promise<void>((resolve) => {
        options?.cleanup?.(io);
        io?.close(() => resolve());
        io = undefined;
      });
    },
  };
}

export type SocketIoServer = Server;
