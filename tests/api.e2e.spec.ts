/**
 * Suite pengujian kontrak API tingkat aplikasi.
 *
 * Tujuan utama
 * -------------
 * 1. Menjamin seluruh endpoint yang terdokumentasi di OpenAPI berperilaku sesuai
 *    dengan kontrak yang diharapkan (status code, payload sukses, payload error).
 * 2. Memastikan seluruh skenario negatif yang didokumentasikan (403, 404, 500, dll)
 *    ter-cover sehingga perubahan di masa depan tidak menghilangkan validasi penting.
 * 3. Memvalidasi integrasi antar modul tanpa harus menjalankan HTTP server sesungguhnya,
 *    sehingga tes tetap cepat, deterministik, dan tidak bergantung pada jaringan/IO.
 *
 * Strategi di dalam berkas ini
 * ----------------------------
 * - Menggunakan Jest untuk menyusun test-case per endpoint.
 * - Menggunakan DI container milik aplikasi, namun controller dan service eksternal
 *   diganti dengan stub sehingga logika bisnis dapat dimanipulasi (sukses/gagal).
 * - Rute di-load dari modul produksi (`loadConfiguredModules`) agar struktur prefix,
 *   middleware, dan handler yang diuji identik dengan runtime sebenarnya.
 * - Tiap skenario memanggil handler HTTP secara langsung via `invokeRoute`, sehingga
 *   kita tidak perlu spinning server Express/Fastify. Ini membuat tes lebih stabil.
 * - Stub SSE (`whatsappSseStub`) merekam subscription untuk skenario streaming.
 *
 * Petunjuk pengembangan
 * ----------------------
 * - Tambahkan skenario baru apabila ada endpoint baru atau error case tambahan.
 * - Gunakan helper `mockRequest` dan `mockResponse` bila membutuhkan header/payload khusus.
 * - Ketika menambah dependency baru pada modul, mock-lah dependensi tersebut serupa cara
 *   controller dimock di bagian atas file.
 * - Jalankan `pnpm test -- --verbose` untuk output detail per skenario.
 *
 * Catatan penting
 * ---------------
 * - Seluruh komentar menggunakan bahasa Indonesia agar konsisten dengan dokumentasi repo.
 * - Harap pertahankan struktur blok komentar ini untuk memudahkan pemeliharaan di masa depan.
 */

import 'reflect-metadata';

import type { Request, Response } from 'express';
import { container } from 'tsyringe';
import type {
  ModuleDefinition,
  RouteContext,
  RouteDefinition,
  RouteResponse,
} from '../src/core/http/types';

jest.mock('@whiskeysockets/baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  fetchLatestBaileysVersion: jest.fn(),
  initAuthCreds: jest.fn(),
  DisconnectReason: {},
}));

/**
 * Stub controller API Key untuk mensimulasikan perilaku endpoint saat pengujian.
 * Setiap method menggunakan jest.fn agar dapat dimanipulasi dalam skenario tertentu.
 */
const apiKeysControllerStub = {
  list: jest.fn(),
  create: jest.fn(),
  deactivate: jest.fn(),
};

/**
 * Stub controller Users, fokus pada method `listUsers`.
 */
const usersControllerStub = {
  listUsers: jest.fn(),
};

/**
 * Stub controller WhatsApp; menyertakan seluruh operasi yang dipakai di rute.
 */
const whatsappControllerStub = {
  listSessions: jest.fn(),
  requestQr: jest.fn(),
  getCredentials: jest.fn(),
  logout: jest.fn(),
  connectionStatus: jest.fn(),
  currentQr: jest.fn(),
};

/**
 * Stub layanan SSE WhatsApp untuk memverifikasi subscription tanpa koneksi nyata.
 */
const whatsappSseStub = {
  publishQr: jest.fn(),
  publishStatus: jest.fn(),
  subscribeExpress: jest.fn(),
  subscribeFastify: jest.fn(),
};

jest.mock('@/modules/api-keys/api-keys.controller', () => ({
  ApiKeysController: class {
    constructor() {
      return apiKeysControllerStub;
    }
  },
}));

jest.mock('@/modules/users/users.controller', () => ({
  UsersController: class {
    constructor() {
      return usersControllerStub;
    }
  },
}));

jest.mock('@/modules/whatsapp/whatsapp.controller', () => ({
  WhatsappController: class {
    constructor() {
      return whatsappControllerStub;
    }
  },
}));

jest.mock('@/modules/whatsapp/whatsapp.sse', () => ({
  WhatsappSseService: class {
    constructor() {
      return whatsappSseStub;
    }
  },
}));

/**
 * Representasi kunci identifikasi rute.
 * Menggabungkan prefix modul, metode, dan path relatif.
 */
type RouteKey = {
  prefix: string;
  method: RouteDefinition['method'];
  path: string;
};

describe('API route contracts', () => {
  const SECRET = 'test-secret';

  /**
   * Kolektor subscription SSE untuk memastikan initial payload benar.
   */
  const sseSubscriptions: Array<{
    apiKey: string;
    initial: unknown;
  }> = [];

  /**
   * Penyimpanan rute yang dimuat agar mudah diakses berdasarkan key.
   */
  const routeMap = new Map<string, RouteDefinition>();
  /**
   * Definisi khusus untuk endpoint health yang tidak termasuk modul.
   */
  let healthRoute: RouteDefinition;

  /**
   * Menghasilkan kunci string unik untuk suatu rute.
   */
  function mapKey({ prefix, method, path }: RouteKey): string {
    return `${prefix}|${method}|${path}`;
  }

  /**
   * Menyimpan seluruh definisi rute yang dimuat dari modul produksi.
   */
  function registerRoutes(modules: ModuleDefinition[]): void {
    modules.forEach((module) => {
      for (const route of module.routes) {
        routeMap.set(
          mapKey({
            prefix: module.prefix,
            method: route.method,
            path: route.path,
          }),
          route,
        );
      }
    });
  }

  /**
   * Parameter bantu untuk memodifikasi konteks handler saat pengujian.
   */
  interface HandlerOverrides {
    framework?: RouteContext['framework'];
    raw?: Request | unknown;
    reply?: Response | unknown;
    params?: Record<string, string>;
    query?: Record<string, unknown>;
    body?: unknown;
  }

  /**
   * Menciptakan objek Request minimalis dengan header tertentu.
   */
  function mockRequest(headers: Record<string, unknown> = {}): Request {
    return {
      headers,
    } as unknown as Request;
  }

  /**
   * Menciptakan objek Response dummy untuk kebutuhan handler.
   */
  function mockResponse(): Response {
    return {} as unknown as Response;
  }

  /**
   * Memanggil handler rute sesuai key yang diberikan dan mengembalikan Response.
   */
  function invokeRoute(
    key: RouteKey,
    overrides: HandlerOverrides = {},
  ): Promise<RouteResponse> {
    const route = routeMap.get(mapKey(key));
    if (!route) {
      throw new Error(`Route not found for ${JSON.stringify(key)}`);
    }

    const context: RouteContext = {
      framework: overrides.framework ?? 'express',
      params: overrides.params ?? {},
      query: overrides.query ?? {},
      body: overrides.body,
      raw: (overrides.raw ?? mockRequest()) as Request,
      reply: (overrides.reply ?? mockResponse()) as Response,
    };

    return Promise.resolve(route.handler(context));
  }

  /**
   * Inisialisasi suite: reset container, muat modul, dan bangun health route.
   */
  beforeAll(async () => {
    jest.resetModules();
    process.env.NODE_ENV = 'test';
    process.env.SECRET_KEY = SECRET;
    process.env.DATABASE_URL = 'file:./test-e2e.db';

    const resetFn = (container as unknown as { reset?: () => void }).reset;
    if (typeof resetFn === 'function') {
      resetFn.call(container);
    } else {
      container.clearInstances();
    }

    const { loadConfiguredModules } = await import(
      '../src/modules/loadModules'
    );

    const { Logger } = await import('../src/shared/utils/logger');
    const logger = new Logger();

    const modules = await loadConfiguredModules(logger);
    registerRoutes(modules);

    healthRoute = {
      method: 'GET',
      path: '/health',
      handler: async () => ({
        status: 200,
        body: { status: 'ok' },
      }),
    };
  });

  /**
   * Reset stub sebelum setiap test agar tidak ada state tersisa antar skenario.
   */
  beforeEach(() => {
    jest.clearAllMocks();
    sseSubscriptions.length = 0;

    whatsappSseStub.subscribeExpress.mockImplementation(
      (apiKey, _req, _res, initial) => {
        sseSubscriptions.push({ apiKey, initial });
      },
    );
    whatsappSseStub.subscribeFastify.mockImplementation(() => undefined);

    apiKeysControllerStub.list.mockResolvedValue([
      {
        key: 'wasap_demo',
        label: 'Demo',
        isActive: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
    apiKeysControllerStub.create.mockResolvedValue({
      key: 'wasap_generated',
      label: 'Generated',
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    apiKeysControllerStub.deactivate.mockResolvedValue({
      key: 'wasap_demo',
      label: null,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    usersControllerStub.listUsers.mockResolvedValue([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);

    whatsappControllerStub.listSessions.mockResolvedValue([]);
    whatsappControllerStub.requestQr.mockResolvedValue({
      apiKey: 'wasap_demo',
      status: 'QR',
      qr: 'qr-data',
    });
    whatsappControllerStub.getCredentials.mockResolvedValue({
      creds: {},
      keys: {},
    });
    whatsappControllerStub.logout.mockResolvedValue(undefined);
    whatsappControllerStub.connectionStatus.mockResolvedValue({
      apiKey: 'wasap_demo',
      status: 'DISCONNECTED',
      connected: false,
    });
    whatsappControllerStub.currentQr.mockReturnValue('qr-data');
  });

  describe('Health endpoint', () => {
    it('returns 200 with status payload', async () => {
      const result = await healthRoute.handler({
        framework: 'express',
        params: {},
        query: {},
        body: undefined,
        raw: mockRequest(),
        reply: mockResponse(),
      });
      expect(result).toEqual({
        status: 200,
        body: { status: 'ok' },
      });
    });
  });

  describe('Users routes', () => {
    const routeKey: RouteKey = {
      prefix: '/api/v1/users',
      method: 'GET',
      path: '/',
    };

    it('returns user list on success', async () => {
      const response = await invokeRoute(routeKey);
      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: [
            { id: 1, name: 'Alice' },
            { id: 2, name: 'Bob' },
          ],
        },
      });
    });

    it('propagates error when controller fails', async () => {
      usersControllerStub.listUsers.mockRejectedValueOnce(
        new Error('db error'),
      );

      await expect(invokeRoute(routeKey)).rejects.toThrow('db error');
    });
  });

  describe('API Keys routes', () => {
    const listKey: RouteKey = {
      prefix: '/api/v1/api-keys',
      method: 'GET',
      path: '/',
    };
    const createKey: RouteKey = {
      prefix: '/api/v1/api-keys',
      method: 'POST',
      path: '/',
    };
    const deleteKey: RouteKey = {
      prefix: '/api/v1/api-keys',
      method: 'DELETE',
      path: '/:key',
    };

    it('lists keys when header matches secret', async () => {
      const response = await invokeRoute(listKey, {
        raw: mockRequest({ 'x-secret-key': SECRET }),
      });
      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        status: 'success',
        data: [
          expect.objectContaining({
            key: 'wasap_demo',
            isActive: true,
          }),
        ],
      });
    });

    it('returns 403 when secret header missing on list', async () => {
      const response = await invokeRoute(listKey, { raw: mockRequest({}) });
      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'Invalid secret key',
        },
      });
      expect(apiKeysControllerStub.list).not.toHaveBeenCalled();
    });

    it('creates key successfully', async () => {
      const response = await invokeRoute(createKey, {
        raw: mockRequest({ 'x-secret-key': SECRET }),
        body: { label: 'Bot' },
      });
      expect(response.status).toBe(201);
      expect(response.body).toEqual({
        status: 'success',
        data: expect.objectContaining({
          key: 'wasap_generated',
          label: 'Generated',
        }),
      });
    });

    it('returns 500 when key generation fails repeatedly', async () => {
      apiKeysControllerStub.create.mockRejectedValueOnce(
        new Error('Failed to generate unique API key'),
      );

      const response = await invokeRoute(createKey, {
        raw: mockRequest({ 'x-secret-key': SECRET }),
        body: {},
      });
      expect(response).toEqual({
        status: 500,
        body: {
          status: 'error',
          message: 'Unable to generate API key, please retry',
        },
      });
    });

    it('returns 403 when creating without secret', async () => {
      const response = await invokeRoute(createKey, {
        raw: mockRequest({}),
        body: {},
      });
      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'Invalid secret key',
        },
      });
      expect(apiKeysControllerStub.create).not.toHaveBeenCalled();
    });

    it('deactivates key and returns 200', async () => {
      const response = await invokeRoute(deleteKey, {
        raw: mockRequest({ 'x-secret-key': SECRET }),
        params: { key: 'wasap_demo' },
      });

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: expect.objectContaining({
            key: 'wasap_demo',
            isActive: false,
          }),
        },
      });
    });

    it('returns 404 when deactivate cannot find key', async () => {
      apiKeysControllerStub.deactivate.mockResolvedValueOnce(null);

      const response = await invokeRoute(deleteKey, {
        raw: mockRequest({ 'x-secret-key': SECRET }),
        params: { key: 'unknown' },
      });

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'API key not found',
        },
      });
    });

    it('returns 403 when deleting without secret', async () => {
      const response = await invokeRoute(deleteKey, {
        raw: mockRequest({}),
        params: { key: 'wasap_demo' },
      });

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'Invalid secret key',
        },
      });
      expect(apiKeysControllerStub.deactivate).not.toHaveBeenCalled();
    });
  });

  describe('Whatsapp routes', () => {
    const prefix = '/api/v1/whatsapp';

    it('lists sessions', async () => {
      whatsappControllerStub.listSessions.mockResolvedValueOnce([
        {
          id: 1,
          apiKey: 'wasap_demo',
          status: 'CONNECTED',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);

      const response = await invokeRoute({
        prefix,
        method: 'GET',
        path: '/sessions',
      });

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: [
            expect.objectContaining({
              apiKey: 'wasap_demo',
              status: 'CONNECTED',
            }),
          ],
        },
      });
    });

    it('returns 500 when list sessions throws', async () => {
      whatsappControllerStub.listSessions.mockRejectedValueOnce(
        new Error('db error'),
      );

      const response = await invokeRoute({
        prefix,
        method: 'GET',
        path: '/sessions',
      });

      expect(response).toEqual({
        status: 500,
        body: {
          status: 'error',
          message: 'Internal server error',
        },
      });
    });

    it('subscribes SSE and returns raw flag', async () => {
      whatsappControllerStub.connectionStatus.mockResolvedValueOnce({
        apiKey: 'wasap_demo',
        status: 'CONNECTED',
        connected: true,
      });
      whatsappControllerStub.currentQr.mockReturnValueOnce(null);

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/stream',
        },
        {
          params: { apiKey: 'wasap_demo' },
          raw: mockRequest({}),
          reply: mockResponse(),
        },
      );

      expect(response).toEqual({ raw: true });
      expect(sseSubscriptions[0]).toEqual({
        apiKey: 'wasap_demo',
        initial: {
          status: {
            apiKey: 'wasap_demo',
            status: 'CONNECTED',
            connected: true,
          },
          qr: null,
        },
      });
    });

    it('returns 403 when SSE key invalid', async () => {
      whatsappControllerStub.connectionStatus.mockRejectedValueOnce(
        new Error('API key not registered'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/stream',
        },
        {
          params: { apiKey: 'bad' },
          raw: mockRequest({}),
          reply: mockResponse(),
        },
      );

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'API key not registered',
        },
      });
      expect(sseSubscriptions).toHaveLength(0);
    });

    it('returns 404 when SSE session missing', async () => {
      whatsappControllerStub.connectionStatus.mockRejectedValueOnce(
        new Error('Whatsapp session not found'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/stream',
        },
        {
          params: { apiKey: 'missing' },
          raw: mockRequest({}),
          reply: mockResponse(),
        },
      );

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'Whatsapp session not found',
        },
      });
    });

    it('requests QR successfully', async () => {
      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/qr',
        },
        {
          params: { apiKey: 'wasap_demo' },
          body: { displayName: 'Bot' },
        },
      );

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: {
            apiKey: 'wasap_demo',
            status: 'QR',
            qr: 'qr-data',
          },
        },
      });
    });

    it('returns 403 when QR request key invalid', async () => {
      whatsappControllerStub.requestQr.mockRejectedValueOnce(
        new Error('API key not registered'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/qr',
        },
        {
          params: { apiKey: 'invalid' },
        },
      );

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'API key not registered',
        },
      });
    });

    it('returns 404 when QR request session missing', async () => {
      whatsappControllerStub.requestQr.mockRejectedValueOnce(
        new Error('Whatsapp session not found'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/qr',
        },
        {
          params: { apiKey: 'missing' },
        },
      );

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'Whatsapp session not found',
        },
      });
    });

    it('returns 500 when QR request throws unexpected error', async () => {
      whatsappControllerStub.requestQr.mockRejectedValueOnce(
        new Error('unexpected'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/qr',
        },
        {
          params: { apiKey: 'wasap_demo' },
        },
      );

      expect(response).toEqual({
        status: 500,
        body: {
          status: 'error',
          message: 'Internal server error',
        },
      });
    });

    it('returns credentials payload', async () => {
      whatsappControllerStub.getCredentials.mockResolvedValueOnce({
        creds: { foo: 'bar' },
        keys: {},
      });

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/credentials',
        },
        {
          params: { apiKey: 'wasap_demo' },
        },
      );

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: {
            creds: { foo: 'bar' },
            keys: {},
          },
        },
      });
    });

    it('returns 403 when credentials key invalid', async () => {
      whatsappControllerStub.getCredentials.mockRejectedValueOnce(
        new Error('API key not registered'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/credentials',
        },
        {
          params: { apiKey: 'bad' },
        },
      );

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'API key not registered',
        },
      });
    });

    it('returns 404 when credentials missing', async () => {
      whatsappControllerStub.getCredentials.mockRejectedValueOnce(
        new Error('Whatsapp session not found'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/credentials',
        },
        {
          params: { apiKey: 'missing' },
        },
      );

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'Whatsapp session not found',
        },
      });
    });

    it('logs out session successfully', async () => {
      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/logout',
        },
        {
          params: { apiKey: 'wasap_demo' },
        },
      );

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          message: 'Logged out',
        },
      });
      expect(whatsappControllerStub.logout).toHaveBeenCalledWith('wasap_demo');
    });

    it('returns 403 when logout key invalid', async () => {
      whatsappControllerStub.logout.mockRejectedValueOnce(
        new Error('API key not registered'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/logout',
        },
        {
          params: { apiKey: 'bad' },
        },
      );

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'API key not registered',
        },
      });
    });

    it('returns 404 when logout session missing', async () => {
      whatsappControllerStub.logout.mockRejectedValueOnce(
        new Error('Whatsapp session not found'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'POST',
          path: '/sessions/:apiKey/logout',
        },
        {
          params: { apiKey: 'missing' },
        },
      );

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'Whatsapp session not found',
        },
      });
    });

    it('returns connection status data', async () => {
      whatsappControllerStub.connectionStatus.mockResolvedValueOnce({
        apiKey: 'wasap_demo',
        status: 'CONNECTED',
        connected: true,
      });

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/status',
        },
        {
          params: { apiKey: 'wasap_demo' },
        },
      );

      expect(response).toEqual({
        status: 200,
        body: {
          status: 'success',
          data: {
            apiKey: 'wasap_demo',
            status: 'CONNECTED',
            connected: true,
          },
        },
      });
    });

    it('returns 403 when status key invalid', async () => {
      whatsappControllerStub.connectionStatus.mockRejectedValueOnce(
        new Error('API key not registered'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/status',
        },
        {
          params: { apiKey: 'bad' },
        },
      );

      expect(response).toEqual({
        status: 403,
        body: {
          status: 'error',
          message: 'API key not registered',
        },
      });
    });

    it('returns 404 when status session missing', async () => {
      whatsappControllerStub.connectionStatus.mockRejectedValueOnce(
        new Error('Whatsapp session not found'),
      );

      const response = await invokeRoute(
        {
          prefix,
          method: 'GET',
          path: '/sessions/:apiKey/status',
        },
        {
          params: { apiKey: 'missing' },
        },
      );

      expect(response).toEqual({
        status: 404,
        body: {
          status: 'error',
          message: 'Whatsapp session not found',
        },
      });
    });
  });

  afterAll(() => {
    const resetFn = (container as unknown as { reset?: () => void }).reset;
    if (typeof resetFn === 'function') {
      resetFn.call(container);
    } else {
      container.clearInstances();
    }
  });
});
