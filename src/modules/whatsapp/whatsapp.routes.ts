import type { Request, Response } from 'express';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { container } from 'tsyringe';

import {
  ModuleBuildResult,
  RouteDefinition,
  RouteResponse,
} from '@/core/http/types';
import '@/modules/api-keys/api-keys.container';
import '@/modules/whatsapp/whatsapp.container';
import { WhatsappController } from '@/modules/whatsapp/whatsapp.controller';
import { WhatsappSseService } from '@/modules/whatsapp/whatsapp.sse';

const controller = container.resolve(WhatsappController);
const sseService = container.resolve(WhatsappSseService);

function handleError(error: unknown): RouteResponse {
  if (
    error instanceof Error &&
    error.message === 'Whatsapp session not found'
  ) {
    return {
      status: 404,
      body: { status: 'error', message: error.message },
    };
  }

  if (error instanceof Error && error.message === 'API key not registered') {
    return {
      status: 403,
      body: { status: 'error', message: error.message },
    };
  }

  return {
    status: 500,
    body: { status: 'error', message: 'Internal server error' },
  };
}

const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/sessions',
    handler: async () => {
      try {
        const items = await controller.listSessions();
        return {
          status: 200,
          body: { status: 'success', data: items },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  },
  {
    method: 'GET',
    path: '/sessions/:apiKey/stream',
    handler: async (ctx) => {
      const apiKey = ctx.params.apiKey;
      try {
        const status = await controller.connectionStatus(apiKey);
        const initial = {
          status,
          qr: controller.currentQr(apiKey),
        };

        if (ctx.framework === 'express') {
          const req = ctx.raw as Request;
          const res = ctx.reply as Response;
          sseService.subscribeExpress(apiKey, req, res, initial);
        } else {
          const request = ctx.raw as FastifyRequest;
          const reply = ctx.reply as FastifyReply;
          sseService.subscribeFastify(apiKey, request, reply, initial);
        }

        return { raw: true };
      } catch (error) {
        return handleError(error);
      }
    },
  },
  {
    method: 'POST',
    path: '/sessions/:apiKey/qr',
    handler: async (ctx) => {
      const apiKey = ctx.params.apiKey;
      const body = (ctx.body ?? {}) as { displayName?: string };
      const displayName =
        typeof body.displayName === 'string' &&
        body.displayName.trim().length > 0
          ? body.displayName.trim()
          : undefined;

      try {
        const qr = await controller.requestQr(apiKey, displayName);
        return {
          status: 200,
          body: { status: 'success', data: qr },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  },
  // {
  //   method: 'GET',
  //   path: '/sessions/:apiKey/credentials',
  //   handler: async (ctx) => {
  //     const apiKey = ctx.params.apiKey;
  //     try {
  //       const data = await controller.getCredentials(apiKey);
  //       return {
  //         status: 200,
  //         body: { status: 'success', data },
  //       };
  //     } catch (error) {
  //       return handleError(error);
  //     }
  //   },
  // },
  {
    method: 'POST',
    path: '/sessions/:apiKey/logout',
    handler: async (ctx) => {
      const apiKey = ctx.params.apiKey;
      try {
        await controller.logout(apiKey);
        return {
          status: 200,
          body: { status: 'success', message: 'Logged out' },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  },
  {
    method: 'GET',
    path: '/sessions/:apiKey/status',
    handler: async (ctx) => {
      const apiKey = ctx.params.apiKey;
      try {
        const status = await controller.connectionStatus(apiKey);
        return {
          status: 200,
          body: { status: 'success', data: status },
        };
      } catch (error) {
        return handleError(error);
      }
    },
  },
  {
    method: 'POST',
    path: '/message/:apiKey/send',
    handler: async (ctx) => {
      const apiKey = ctx.params.apiKey;
      const body = (ctx.body ?? {}) as { to?: unknown; text?: unknown };
      const rawTo = typeof body.to === 'string' ? body.to : '';
      // normalize MSISDN: strip spaces, dashes, parentheses; trim leading '+'; convert leading 0 -> 62
      let to = rawTo.trim().replace(/[()\s-]/g, '');
      if (to.startsWith('+')) to = to.slice(1);
      if (to.startsWith('0')) to = '62' + to.slice(1);
      const text = typeof body.text === 'string' ? body.text : '';

      // basic validation
      const toValid = /^\d{8,15}$/.test(to);
      const textValid = text.length > 0 && text.length <= 1000;
      if (!toValid || !textValid) {
        return {
          status: 400,
          body: {
            status: 'error',
            message: !toValid
              ? "Invalid 'to' (use digits, 8-15)"
              : "Invalid 'text' (1-1000 chars)",
          },
        };
      }

      try {
        const data = await controller.sendText(apiKey, to, text);
        return { status: 200, body: { status: 'success', data } };
      } catch (error) {
        if (error instanceof Error) {
          if ((error as any).statusCode === 503) {
            return {
              status: 503,
              body: { status: 'error', message: 'Session not connected' },
            };
          }
          if (error.message === 'API key not registered') {
            return {
              status: 403,
              body: { status: 'error', message: error.message },
            };
          }
          if (error.message === 'Whatsapp session not found') {
            return {
              status: 404,
              body: { status: 'error', message: error.message },
            };
          }
        }
        return {
          status: 500,
          body: { status: 'error', message: 'Internal server error' },
        };
      }
    },
  },
];

export default function createWhatsappModule(): ModuleBuildResult {
  return { routes };
}
