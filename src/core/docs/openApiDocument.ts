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
    { name: 'API Keys', description: 'Manajemen API key untuk akses fitur' },
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
    '/api/v1/whatsapp/message/{apiKey}/send': {
      post: {
        tags: ['WhatsApp'],
        summary: 'Kirim pesan teks',
        description: 'Mengirim pesan teks menggunakan sesi WhatsApp yang sudah CONNECTED.',
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
          required: true,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendTextPayload' },
              example: { to: '6281234567890', text: 'Halo dari Baileys!' },
            },
          },
        },
        responses: {
          200: {
            description: 'Pesan berhasil dikirim.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SendTextResponse' },
              },
            },
          },
          400: { $ref: '#/components/responses/BadRequestError' },
          403: { $ref: '#/components/responses/ForbiddenError' },
          404: { $ref: '#/components/responses/NotFoundError' },
          503: {
            description: 'Sesi tidak tersambung (not connected).',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ErrorResponse' },
                example: { status: 'error', message: 'Session not connected' },
              },
            },
          },
          500: { $ref: '#/components/responses/InternalServerError' },
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
    '/api/v1/api-keys': {
      get: {
        tags: ['API Keys'],
        summary: 'Daftar API key',
        description: 'Mengembalikan seluruh API key yang terdaftar.',
        parameters: [
          {
            name: 'x-secret-key',
            in: 'header',
            required: true,
            description: 'Secret internal yang diset melalui variabel lingkungan `SECRET_KEY`.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'Daftar API key berhasil diambil.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiKeysResponse' },
              },
            },
          },
          403: {
            $ref: '#/components/responses/ForbiddenError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
      post: {
        tags: ['API Keys'],
        summary: 'Generate API key',
        description: 'Menciptakan API key baru yang dapat digunakan untuk mengakses fitur WhatsApp.',
        parameters: [
          {
            name: 'x-secret-key',
            in: 'header',
            required: true,
            description: 'Secret internal yang diset melalui variabel lingkungan `SECRET_KEY`.',
            schema: { type: 'string' },
          },
        ],
        requestBody: {
          required: false,
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CreateApiKeyPayload' },
            },
          },
        },
        responses: {
          201: {
            description: 'API key baru berhasil dibuat.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiKeyResponse' },
              },
            },
          },
          403: {
            $ref: '#/components/responses/ForbiddenError',
          },
          500: {
            $ref: '#/components/responses/InternalServerError',
          },
        },
      },
    },
    '/api/v1/api-keys/{key}': {
      delete: {
        tags: ['API Keys'],
        summary: 'Menonaktifkan API key',
        description: 'Menandai API key sebagai tidak aktif sehingga tidak dapat dipakai kembali.',
        parameters: [
          {
            name: 'key',
            in: 'path',
            required: true,
            description: 'API key yang akan dinonaktifkan.',
            schema: { type: 'string' },
          },
          {
            name: 'x-secret-key',
            in: 'header',
            required: true,
            description: 'Secret internal yang diset melalui variabel lingkungan `SECRET_KEY`.',
            schema: { type: 'string' },
          },
        ],
        responses: {
          200: {
            description: 'API key berhasil dinonaktifkan.',
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ApiKeyResponse' },
              },
            },
          },
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
          403: {
            $ref: '#/components/responses/ForbiddenError',
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
      ApiKey: {
        type: 'object',
        properties: {
          key: { type: 'string', example: 'wasap_5f2c8df6c0b34e4f8e2d1f9a4c6b8e12' },
          label: { type: 'string', nullable: true, example: 'Team Support' },
          isActive: { type: 'boolean', example: true },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
        required: ['key', 'isActive', 'createdAt', 'updatedAt'],
      },
      ApiKeysResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: {
            type: 'array',
            items: { $ref: '#/components/schemas/ApiKey' },
          },
        },
        required: ['status', 'data'],
      },
      ApiKeyResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/ApiKey' },
        },
        required: ['status', 'data'],
      },
      CreateApiKeyPayload: {
        type: 'object',
        properties: {
          label: {
            type: 'string',
            description: 'Label opsional untuk membantu mengidentifikasi pemilik API key.',
            example: 'Marketing Automation',
          },
        },
        additionalProperties: false,
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
      SendTextPayload: {
        type: 'object',
        properties: {
          to: {
            type: 'string',
            description: 'Nomor tujuan dalam format MSISDN tanpa plus, 8–15 digit.',
            example: '6281234567890',
          },
          text: {
            type: 'string',
            description: 'Isi pesan teks 1–1000 karakter.',
            example: 'Halo dari Baileys!',
          },
        },
        required: ['to', 'text'],
        additionalProperties: false,
      },
      SendTextResult: {
        type: 'object',
        properties: {
          messageId: { type: 'string', example: 'wamid.HBgM...' },
        },
        required: ['messageId'],
      },
      SendTextResponse: {
        type: 'object',
        properties: {
          status: { type: 'string', example: 'success' },
          data: { $ref: '#/components/schemas/SendTextResult' },
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
      BadRequestError: {
        description: 'Permintaan tidak valid.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { status: 'error', message: 'Invalid "to"' },
          },
        },
      },
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
      ForbiddenError: {
        description: 'API key tidak terdaftar atau telah dinonaktifkan.',
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorResponse' },
            example: { status: 'error', message: 'API key not registered' },
          },
        },
      },
    },
  },
} as const;
