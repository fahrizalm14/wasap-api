export const openApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Wasap API',
    version: '1.0.0',
    description:
      'REST API untuk mengelola sesi WhatsApp dan menampilkan data pengguna contoh.',
  },
  servers: [
    {
      url: '/',
      description: 'Host saat ini',
    },
  ],
  tags: [
    { name: 'Health', description: 'Pemeriksaan status layanan' },
    { name: 'Users', description: 'Akses data pengguna contoh' },
    { name: 'WhatsApp', description: 'Manajemen sesi WhatsApp' },
  ],
  paths: {
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Health check',
        description: 'Memastikan layanan berjalan dengan baik.',
        responses: {
          200: {
            description: 'Layanan siap menerima request.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HealthResponse' },
                example: { status: 'ok' },
              },
            },
          },
        },
      },
    },
    '/api/v1/users': {
      get: {
        tags: ['Users'],
        summary: 'Daftar pengguna',
        description: 'Mengembalikan seluruh pengguna contoh dari basis data.',
        responses: {
          200: {
            description: 'Daftar pengguna berhasil diambil.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/UsersResponse' },
              },
            },
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions': {
      get: {
        tags: ['WhatsApp'],
        summary: 'Daftar sesi WhatsApp',
        description: 'Mengembalikan seluruh sesi WhatsApp yang tersimpan.',
        responses: {
          200: {
            description: 'Daftar sesi berhasil diambil.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WhatsappSessionsResponse' },
              },
            },
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions/{apiKey}/stream': {
      get: {
        tags: ['WhatsApp'],
        summary: 'Streaming status WhatsApp',
        description:
          'Membuka koneksi Server-Sent Events (SSE) untuk menerima update status dan QR secara real-time.',
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            description: 'API key unik untuk sesi WhatsApp.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Stream SSE aktif.',
            content: {
              'text/event-stream': {
                schema: { type: 'string', example: 'event: status\\ndata: {"status":"QR"}\\n' },
              },
            },
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions/{apiKey}/qr': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Meminta QR Code sesi',
        description:
          'Menginisialisasi sesi WhatsApp baru atau memperbarui tampilan dan mengembalikan QR code jika tersedia.',
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            description: 'API key unik untuk sesi WhatsApp.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/RequestQrPayload' },
            },
          },
        },
        responses: {
          200: {
            description: 'Berhasil mengambil status sesi QR.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WhatsappQrResponse' },
              },
            },
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions/{apiKey}/credentials': {
      get: {
        tags: ['WhatsApp'],
        summary: 'Kredensial sesi',
        description: 'Mengembalikan kredensial dan key store untuk sesi WhatsApp tertentu.',
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            description: 'API key unik untuk sesi WhatsApp.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Kredensial sesi berhasil diambil.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WhatsappCredentialsResponse',
                },
              },
            },
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions/{apiKey}/logout': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Logout sesi',
        description: 'Mengakhiri sesi WhatsApp dan membersihkan kredensial yang tersimpan.',
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            description: 'API key unik untuk sesi WhatsApp.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Berhasil melakukan logout sesi.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/WhatsappLogoutResponse' },
              },
            },
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/whatsapp/sessions/{apiKey}/status': {
      get: {
        tags: ['WhatsApp'],
        summary: 'Status koneksi sesi',
        description: 'Menampilkan status koneksi terkini untuk sesi WhatsApp tertentu.',
        parameters: [
          {
            name: 'apiKey',
            in: 'path',
            required: true,
            description: 'API key unik untuk sesi WhatsApp.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Status koneksi berhasil diambil.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/WhatsappConnectionResponse',
                },
              },
            },
          },
          404: {
            $ref: '#/components/responses/NotFoundError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
  },
  components: {
    schemas: {
      HealthResponse: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            example: 'ok',
          },
        },
        required: ['status'],
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          name: { type: 'string', example: 'John Doe' },
        },
        required: ['id', 'name'],
      },
      UsersResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/User' },
          },
        },
        required: ['status', 'data'],
      },
      WhatsappSessionStatus: {
        type: 'string',
        enum: ['CONNECTED', 'DISCONNECTED', 'QR', 'LOGGED_OUT', 'ERROR'],
      },
      WhatsappSession: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 42 },
          apiKey: { type: 'string', example: 'session-123' },
          displayName: { type: 'string', nullable: true, example: 'Marketing Bot' },
          status: { $ref: '#/components/schemas/WhatsappSessionStatus' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['id', 'apiKey', 'status', 'createdAt', 'updatedAt'],
      },
      WhatsappSessionsResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/WhatsappSession' },
          },
        },
        required: ['status', 'data'],
      },
      RequestQrPayload: {
        type: 'object',
        properties: {
          displayName: {
            type: 'string',
            description: 'Nama tampilan yang akan digunakan untuk sesi.',
            example: 'Customer Support Bot',
          },
        },
        additionalProperties: false,
      },
      WhatsappQrResult: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', example: 'session-123' },
          status: { $ref: '#/components/schemas/WhatsappSessionStatus' },
          qr: {
            type: 'string',
            nullable: true,
            description: 'Data QR code (dalam format string) bila tersedia.',
          },
        },
        required: ['apiKey', 'status'],
      },
      WhatsappQrResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/WhatsappQrResult' },
        },
        required: ['status', 'data'],
      },
      StoredWhatsappCredentials: {
        type: 'object',
        properties: {
          creds: {
            oneOf: [
              { type: 'object', additionalProperties: true },
              { type: 'null' },
            ],
          },
          keys: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              additionalProperties: true,
            },
          },
        },
        required: ['creds', 'keys'],
      },
      WhatsappCredentialsResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/StoredWhatsappCredentials' },
        },
        required: ['status', 'data'],
      },
      WhatsappLogoutResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          message: { type: 'string', example: 'Logged out' },
        },
        required: ['status', 'message'],
      },
      WhatsappConnectionInfo: {
        type: 'object',
        properties: {
          apiKey: { type: 'string', example: 'session-123' },
          status: { $ref: '#/components/schemas/WhatsappSessionStatus' },
          connected: { type: 'boolean', example: true },
        },
        required: ['apiKey', 'status', 'connected'],
      },
      WhatsappConnectionResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/WhatsappConnectionInfo' },
        },
        required: ['status', 'data'],
      },
      ErrorResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'error' },
          message: { type: 'string', example: 'Whatsapp session not found' },
        },
        required: ['status', 'message'],
      },
    },
    responses: {
      NotFoundError: {
        description: 'Resource tidak ditemukan.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { status: 'error', message: 'Whatsapp session not found' },
          },
        },
      },
      InternalServerError: {
        description: 'Terjadi kesalahan pada server.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { status: 'error', message: 'Internal server error' },
          },
        },
      },
    },
  },
} as const;
