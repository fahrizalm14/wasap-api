import type { RequestHandler } from 'express';
import type { FastifyInstance } from 'fastify';

import type { GlobalMiddleware } from '@/core/http/types';
import { openApiDocument } from '@/core/docs/openApiDocument';
import { renderSwaggerUiHtml } from '@/core/docs/swaggerUiHtml';

const DOCS_BASE_PATH = '/docs';
const DOCS_SPEC_PATH = `${DOCS_BASE_PATH}/openapi.json`;

export function createDocsMiddleware(provider: 'express' | 'fastify'): GlobalMiddleware {
  if (provider === 'fastify') {
    return {
      fastify: async (instance: FastifyInstance) => {
        instance.get(DOCS_BASE_PATH, async (_, reply) => {
          void reply
            .type('text/html')
            .send(renderSwaggerUiHtml(DOCS_SPEC_PATH));
        });
        instance.get(DOCS_SPEC_PATH, async () => openApiDocument);
      },
    };
  }

  const handler: RequestHandler = (req, res, next) => {
    if (
      req.method === 'GET' &&
      (req.path === DOCS_BASE_PATH || req.path === `${DOCS_BASE_PATH}/`)
    ) {
      res
        .status(200)
        .type('text/html')
        .send(renderSwaggerUiHtml(DOCS_SPEC_PATH));
      return;
    }

    if (req.method === 'GET' && req.path === DOCS_SPEC_PATH) {
      res.status(200).json(openApiDocument);
      return;
    }

    next();
  };

  return { express: handler };
}
