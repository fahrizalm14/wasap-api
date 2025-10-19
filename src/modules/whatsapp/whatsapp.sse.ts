import type { Request, Response } from 'express';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { singleton } from 'tsyringe';

import type { WhatsappConnectionInfo } from '@/modules/whatsapp/whatsapp.interface';

interface SseInitialState {
  status: WhatsappConnectionInfo;
  qr: string | null;
}

interface SseClient {
  send(event: string, data: unknown): void;
  comment(text: string): void;
  close(): void;
  isAlive(): boolean;
}

/**
 * Mengelola koneksi Server-Sent Events untuk setiap sesi WhatsApp.
 * Menyimpan daftar subscriber per apiKey, mengirim event status / qr,
 * serta menjaga koneksi tetap hidup dengan heartbeat periodik.
 */
@singleton()
export class WhatsappSseService {
  private readonly clients = new Map<string, Set<SseClient>>();

  private readonly heartbeatMs = 25_000;

  private readonly heartbeatTimer: NodeJS.Timeout;

  constructor() {
    this.heartbeatTimer = setInterval(() => this.dispatchHeartbeat(), this.heartbeatMs);
    this.heartbeatTimer.unref?.();
  }

  /**
   * Mendaftarkan subscriber SSE berbasis Express dan mengirim snapshot awal.
   */
  subscribeExpress(
    apiKey: string,
    request: Request,
    response: Response,
    initial?: SseInitialState,
  ): void {
    const requestOrigin = request.headers.origin;
    const origin =
      typeof requestOrigin === 'string' && requestOrigin.length > 0
        ? requestOrigin
        : '*';
    request.socket.setKeepAlive(true);
    request.socket.setTimeout(0);

    const headers: Record<string, string> = {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      // Memungkinkan konsumsi SSE lintas origin (mis. dashboard front-end terpisah).
      'Access-Control-Allow-Origin': origin,
    };
    const allowCredentials = origin !== '*' && origin !== 'null';
    if (allowCredentials) {
      headers['Access-Control-Allow-Credentials'] = 'true';
    }
    headers['Vary'] = 'Origin';

    response.writeHead(200, headers);

    response.write(': connected\n\n');

    const client = this.createClient(apiKey, {
      send: (chunk) => response.write(chunk),
      end: () => {
        if (!response.writableEnded) {
          response.end();
        }
      },
      alive: () => !response.writableEnded,
    });

    request.on('close', () => this.removeClient(apiKey, client));
    response.on('error', () => this.removeClient(apiKey, client));

    this.attachClient(apiKey, client, initial);
  }

  /**
   * Mendaftarkan subscriber SSE berbasis Fastify dan mengirim snapshot awal.
   */
  subscribeFastify(
    apiKey: string,
    request: FastifyRequest,
    reply: FastifyReply,
    initial?: SseInitialState,
  ): void {
    const socket = request.raw.socket;
    socket?.setKeepAlive(true);
    socket?.setTimeout(0);

    const originHeader = request.headers.origin;
    const originCandidate =
      typeof originHeader === 'string'
        ? originHeader
        : Array.isArray(originHeader)
          ? originHeader[0]
          : undefined;
    const origin =
      originCandidate && originCandidate.length > 0
        ? originCandidate
        : '*';

    reply.raw.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    reply.raw.setHeader('Cache-Control', 'no-cache, no-transform');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    // Memungkinkan konsumsi SSE lintas origin (mis. dashboard front-end terpisah).
    reply.raw.setHeader('Access-Control-Allow-Origin', origin);
    const allowCredentials = origin !== '*' && origin !== 'null';
    if (allowCredentials) {
      reply.raw.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    reply.raw.setHeader('Vary', 'Origin');
    reply.hijack();
    reply.raw.writeHead(200);
    reply.raw.write(': connected\n\n');

    const client = this.createClient(apiKey, {
      send: (chunk) => reply.raw.write(chunk),
      end: () => {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      },
      alive: () => !reply.raw.writableEnded,
    });

    reply.raw.on('close', () => this.removeClient(apiKey, client));
    reply.raw.on('error', () => this.removeClient(apiKey, client));

    this.attachClient(apiKey, client, initial);
  }

  /**
   * Menyebarkan event QR terbaru ke seluruh subscriber sesi
   * (null berarti QR disembunyikan).
   */
  publishQr(apiKey: string, qr: string | null): void {
    this.broadcast(apiKey, 'qr', { apiKey, qr });
  }

  /**
   * Menyebarkan status koneksi terkini ke seluruh subscriber sesi.
   */
  publishStatus(info: WhatsappConnectionInfo): void {
    this.broadcast(info.apiKey, 'status', info);
  }

  private attachClient(apiKey: string, client: SseClient, initial?: SseInitialState): void {
    const clients = this.clients.get(apiKey) ?? new Set<SseClient>();
    clients.add(client);
    this.clients.set(apiKey, clients);

    client.comment('connected');
    if (initial) {
      client.send('status', initial.status);
      if (initial.qr) {
        client.send('qr', { apiKey, qr: initial.qr });
      }
    }
  }

  private createClient(
    apiKey: string,
    actions: { send: (chunk: string) => void; end: () => void; alive: () => boolean },
  ): SseClient {
    let client: SseClient;

    const write = (event: string, payload: unknown) => {
      try {
        actions.send(`event: ${event}\n`);
        actions.send(`data: ${JSON.stringify(payload)}\n\n`);
      } catch {
        this.removeClient(apiKey, client);
      }
    };

    client = {
      send: (event, data) => {
        if (!actions.alive()) {
          this.removeClient(apiKey, client);
          return;
        }
        write(event, data);
      },
      comment: (text) => {
        if (!actions.alive()) {
          this.removeClient(apiKey, client);
          return;
        }
        try {
          actions.send(`: ${text}\n\n`);
        } catch {
          this.removeClient(apiKey, client);
        }
      },
      close: () => {
        actions.end();
        this.removeClient(apiKey, client);
      },
      isAlive: () => actions.alive(),
    };

    return client;
  }

  private removeClient(apiKey: string, client: SseClient): void {
    const clients = this.clients.get(apiKey);
    if (!clients) {
      return;
    }

    clients.delete(client);
    if (!clients.size) {
      this.clients.delete(apiKey);
    }
  }

  private broadcast(apiKey: string, event: string, payload: unknown): void {
    const clients = this.clients.get(apiKey);
    if (!clients?.size) {
      return;
    }

    for (const client of clients) {
      client.send(event, payload);
    }
  }

  private dispatchHeartbeat(): void {
    for (const clients of this.clients.values()) {
      for (const client of clients) {
        if (!client.isAlive()) {
          continue;
        }
        client.comment('keep-alive');
      }
    }
  }
}
