import type { Request } from 'express';
import type { FastifyRequest } from 'fastify';
import { container } from 'tsyringe';

import { env } from '@/config';
import { ModuleBuildResult, RouteDefinition, RouteHandler } from '@/core/http/types';
import { ApiKeysController } from '@/modules/api-keys/api-keys.controller';
import '@/modules/api-keys/api-keys.container';

const controller = container.resolve(ApiKeysController);

function getHeaderValue(raw: Request | FastifyRequest, header: string): string | null {
  const headers = raw.headers as Record<string, unknown>;
  const lower = header.toLowerCase();
  const upper = header.toUpperCase();
  const value = headers[lower] ?? headers[header] ?? headers[upper];

  if (Array.isArray(value)) {
    const candidate = value[0];
    return typeof candidate === 'string' ? candidate : null;
  }

  return typeof value === 'string' ? value : null;
}

function withSecretGuard(handler: RouteHandler): RouteHandler {
  return async (ctx) => {
    const raw = ctx.raw as Request | FastifyRequest;
    const provided = getHeaderValue(raw, 'x-secret-key');

    if (provided !== env.SECRET_KEY) {
      return {
        status: 403,
        body: {
          status: 'error',
          message: 'Invalid secret key',
        },
      };
    }

    return handler(ctx);
  };
}

const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: withSecretGuard(async () => {
      const items = await controller.list();
      return {
        status: 200,
        body: {
          status: 'success',
          data: items,
        },
      };
    }),
  },
  {
    method: 'POST',
    path: '/',
    handler: withSecretGuard(async (ctx) => {
      const payload = (ctx.body ?? {}) as { label?: unknown };
      const label =
        typeof payload.label === 'string' && payload.label.trim().length > 0
          ? payload.label.trim()
          : null;

      try {
        const created = await controller.create(label);
        return {
          status: 201,
          body: {
            status: 'success',
            data: created,
          },
        };
      } catch (error) {
        if ((error as Error).message === 'Failed to generate unique API key') {
          return {
            status: 500,
            body: {
              status: 'error',
              message: 'Unable to generate API key, please retry',
            },
          };
        }

        throw error;
      }
    }),
  },
  {
    method: 'DELETE',
    path: '/:key',
    handler: withSecretGuard(async (ctx) => {
      const { key } = ctx.params;
      if (!key) {
        return {
          status: 400,
          body: {
            status: 'error',
            message: 'Key parameter is required',
          },
        };
      }

      const result = await controller.deactivate(key);
      if (!result) {
        return {
          status: 404,
          body: {
            status: 'error',
            message: 'API key not found',
          },
        };
      }

      return {
        status: 200,
        body: {
          status: 'success',
          data: result,
        },
      };
    }),
  },
];

export default function createApiKeysModule(): ModuleBuildResult {
  return { routes };
}
