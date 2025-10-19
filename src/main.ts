import 'reflect-metadata';
import { container } from 'tsyringe';

import { env } from '@/config';
import { App } from '@/core/App';
import { createHttpServer } from '@/core/http/createHttpServer';
import { createGlobalMiddlewares } from '@/core/http/createMiddlewares';
import {
  createSocketIoAdapter,
  SOCKET_IO_SERVER_TOKEN,
} from '@/core/socket/socketIoAdapter';
import { loadConfiguredModules } from '@/modules/loadModules';
import { Logger } from '@/shared/utils/logger';

/**
 * Menyiapkan server HTTP, mendaftarkan middleware dan modul, lalu menjalankan aplikasi.
 */
async function main() {
  const logger = container.resolve(Logger);

  const httpServer = createHttpServer(env.HTTP_SERVER, logger);
  const app = new App({
    server: httpServer,
    port: env.PORT,
    logger,
  });

  if (env.SOCKET_ENABLED && httpServer.registerSocketAdapter) {
    const socketAdapter = createSocketIoAdapter(logger, {
      configure: (io) => {
        container.registerInstance(SOCKET_IO_SERVER_TOKEN, io);
      },
    });
    httpServer.registerSocketAdapter(socketAdapter);
  }

  const middlewares = createGlobalMiddlewares(env.HTTP_SERVER);
  middlewares.forEach((middleware) => app.registerMiddleware(middleware));

  app.registerModule({
    prefix: '',
    routes: [
      {
        method: 'GET',
        path: '/health',
        handler: async () => ({
          status: 200,
          body: { status: 'ok' },
        }),
      },
    ],
  });

  const modules = await loadConfiguredModules(logger);
  modules.forEach((module) => app.registerModule(module));

  await app.start();
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error('❌ Failed to start application', error);
  process.exit(1);
});
