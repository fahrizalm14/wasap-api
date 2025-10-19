import makeWASocket, {
  Browsers,
  ConnectionState,
  DisconnectReason,
  SignalDataTypeMap,
  WASocket,
  fetchLatestBaileysVersion,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import pino from 'pino';
import { inject, singleton } from 'tsyringe';

import { env } from '@/config';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import type {
  IWhatsappRepository,
  StoredWhatsappCredentials,
  WhatsappConnectionInfo,
  WhatsappQrResult,
  WhatsappSession,
  WhatsappSessionStatus,
} from '@/modules/whatsapp/whatsapp.interface';
import { WHATSAPP_REPOSITORY_TOKEN } from '@/modules/whatsapp/whatsapp.interface';
import { WhatsappSseService } from '@/modules/whatsapp/whatsapp.sse';
import { Logger } from '@/shared/utils/logger';

interface QrWaiter {
  resolve: (qr: string) => void;
  reject: (error: Error) => void;
}

interface ManagedSession {
  info: WhatsappSession;
  socket?: WASocket;
  status: WhatsappSessionStatus;
  qr?: string;
  connectPromise?: Promise<WASocket>;
  qrWaiters: QrWaiter[];
}

/**
 * Mengelola lifecycle sesi WhatsApp berbasis Baileys:
 * - Menyiapkan socket dan menyinkronkan kredensial
 * - Menyimpan status sesi di database
 * - Mendistribusikan update status/QR melalui SSE
 */
@singleton()
export class WhatsappService {
  private readonly sessions = new Map<string, ManagedSession>();

  private readonly socketLogger = pino({ level: 'error' });

  private baileysVersion?: Promise<[number, number, number]>;

  /**
   * Identitas browser yang dikirimkan ke WhatsApp.
   * Gunakan nilai yang menyerupai browser sungguhan agar tidak dianggap mencurigakan.
   * Referensi: https://baileys.wiki/docs/socket/connecting
   */
  private readonly browser: [string, string, string] = [
    'Chrome (macOS)',
    'Chrome',
    '120.0.6099.225',
  ];

  private readonly qrTimeoutMs = 60_000;

  private readonly isDevelopment = env.NODE_ENV !== 'production';

  constructor(
    @inject(WHATSAPP_REPOSITORY_TOKEN)
    private readonly repository: IWhatsappRepository,
    @inject(Logger) private readonly logger: Logger,
    @inject(ApiKeysService) private readonly apiKeysService: ApiKeysService,
    /**
     * Kanal distribusi SSE untuk mengirim status & QR secara real-time.
     */
    @inject(WhatsappSseService) private readonly sseService: WhatsappSseService,
  ) {}

  /**
   * Cache sederhana untuk penghitung retry pesan (memenuhi kontrak CacheStore Baileys).
   */
  private readonly msgRetryCounterCache = (() => {
    const map = new Map<string, unknown>();
    return {
      get<T>(key: string): T | undefined {
        return map.get(key) as T | undefined;
      },
      set<T>(key: string, value: T): void {
        map.set(key, value as unknown);
      },
      del(key: string): void {
        map.delete(key);
      },
      flushAll(): void {
        map.clear();
      },
    };
  })();

  /**
   * Mengembalikan daftar seluruh sesi yang tersimpan di database.
   */
  listSessions(): Promise<WhatsappSession[]> {
    return this.repository.listSessions();
  }

  /**
   * Mengambil seluruh kredensial + key store untuk sesi tertentu.
   */
  async getCredentials(apiKey: string): Promise<StoredWhatsappCredentials> {
    const normalizedKey = await this.ensureActiveKey(apiKey);
    const session = await this.repository.findSessionByApiKey(normalizedKey);
    if (!session) {
      throw new Error('Whatsapp session not found');
    }

    return this.repository.getCredentialDump(session.id);
  }

  /**
   * Memastikan sesi tersedia, menyalakan socket bila perlu,
   * dan mengembalikan QR atau status terkini.
   */
  async getQr(apiKey: string, displayName?: string): Promise<WhatsappQrResult> {
    const normalizedKey = await this.ensureActiveKey(apiKey);
    const session = await this.repository.ensureSession(
      normalizedKey,
      displayName,
    );
    const state = await this.initializeSocket(session);

    if (state.status === 'CONNECTED') {
      return { apiKey: normalizedKey, status: 'CONNECTED' };
    }

    if (state.qr) {
      return { apiKey: normalizedKey, status: 'QR', qr: state.qr };
    }

    const qr = await this.waitForQr(state);
    return { apiKey: normalizedKey, status: 'QR', qr };
  }

  /**
   * Memutus sesi di sisi Baileys, membersihkan data lokal, dan memberi tahu subscriber.
   */
  async logout(apiKey: string): Promise<void> {
    const normalizedKey = await this.ensureActiveKey(apiKey);
    const session = await this.repository.findSessionByApiKey(normalizedKey);
    if (!session) {
      throw new Error('Whatsapp session not found');
    }

    const state = this.sessions.get(normalizedKey);
    if (state?.socket) {
      try {
        await state.socket.logout();
      } catch (error) {
        this.logger.error('Failed to logout from WhatsApp socket', error);
      }
      try {
        state.socket.ws.close();
      } catch {
        // ignore
      }
    }

    await this.repository.clearSessionData(session.id);
    await this.repository.updateStatus(session.id, 'LOGGED_OUT');

    this.emitQrUpdate(normalizedKey, null);

    if (state) {
      state.socket = undefined;
      state.qr = undefined;
      state.status = 'LOGGED_OUT';
      state.qrWaiters = [];
      this.emitStatusUpdate(state);
      this.sessions.delete(normalizedKey);
    } else {
      this.emitStatus(normalizedKey, 'LOGGED_OUT', false);
    }
  }

  /**
   * Membaca status koneksi terkini (menggabungkan state memori + database).
   */
  async getConnectionStatus(apiKey: string): Promise<WhatsappConnectionInfo> {
    const normalizedKey = await this.ensureActiveKey(apiKey);
    const session = await this.repository.findSessionByApiKey(normalizedKey);
    if (!session) {
      throw new Error('Whatsapp session not found');
    }

    const state = this.sessions.get(normalizedKey);
    const connected = Boolean(state?.socket?.user);
    const status = connected ? 'CONNECTED' : (state?.status ?? session.status);

    return {
      apiKey: normalizedKey,
      status,
      connected,
    };
  }

  /**
   * Mengembalikan QR terakhir yang tersimpan di memori untuk sesi tertentu.
   * Digunakan oleh endpoint SSE untuk mengirim snapshot awal.
   */
  getCurrentQr(apiKey: string): string | null {
    const normalized = apiKey.trim();
    const state = this.sessions.get(normalized);
    return state?.qr ?? null;
  }

  private devLog(message: string): void {
    if (!this.isDevelopment) {
      return;
    }

    this.logger.info(message);
  }

  /**
   * Mengirimkan update QR ke seluruh subscriber SSE untuk `apiKey`.
   */
  private emitQrUpdate(apiKey: string, qr: string | null): void {
    this.sseService.publishQr(apiKey, qr);
  }

  /**
   * Mengirimkan update status ke seluruh subscriber SSE untuk `apiKey`.
   */
  private emitStatus(
    apiKey: string,
    status: WhatsappSessionStatus,
    connected: boolean,
  ): void {
    this.sseService.publishStatus({ apiKey, status, connected });
  }

  private async ensureActiveKey(apiKey: string): Promise<string> {
    const record = await this.apiKeysService.assertActive(apiKey);
    return record.key;
  }

  /**
   * Helper untuk mengirim status berdasarkan state internal sesi.
   */
  private emitStatusUpdate(state: ManagedSession): void {
    this.emitStatus(
      state.info.apiKey,
      state.status,
      Boolean(state.socket?.user),
    );
  }

  /**
   * Menunggu QR baru dari Baileys dengan timeout default.
   * Jika QR sudah ada, langsung dikembalikan tanpa menunggu event berikutnya.
   */
  private async waitForQr(state: ManagedSession): Promise<string> {
    if (state.qr) {
      return state.qr;
    }

    return await new Promise<string>((resolve, reject) => {
      const waiter: QrWaiter = {
        resolve: (qr) => {
          clearTimeout(timeout);
          resolve(qr);
        },
        reject: (error) => {
          clearTimeout(timeout);
          reject(error);
        },
      };

      const timeout = setTimeout(() => {
        this.removeQrWaiter(state, waiter);
        reject(new Error('QR code generation timeout'));
      }, this.qrTimeoutMs);

      state.qrWaiters.push(waiter);
    });
  }

  private removeQrWaiter(state: ManagedSession, waiter: QrWaiter) {
    state.qrWaiters = state.qrWaiters.filter(
      (candidate) => candidate !== waiter,
    );
  }

  private async initializeSocket(
    session: WhatsappSession,
  ): Promise<ManagedSession> {
    let state = this.sessions.get(session.apiKey);

    if (!state) {
      state = {
        info: session,
        status: session.status,
        qrWaiters: [],
      };
      this.sessions.set(session.apiKey, state);
    } else {
      state.info = session;
    }

    if (state.socket?.user) {
      return state;
    }

    if (!state.connectPromise) {
      state.connectPromise = this.createSocket(state)
        .catch((error) => {
          this.logger.error('Failed to initialize WhatsApp socket', error);
          throw error;
        })
        .finally(() => {
          state.connectPromise = undefined;
        });
    }

    await state.connectPromise;
    return state;
  }

  private async createSocket(state: ManagedSession): Promise<WASocket> {
    try {
      const { state: authState, saveCreds } = await this.buildAuthState(
        state.info.id,
      );
      // Gunakan versi Web WA yang sesuai dengan Baileys (menghindari ketidakcocokan versi)
      const version = await this.resolveBaileysVersion();
      const socket = makeWASocket({
        auth: authState,
        version,

        printQRInTerminal: false,
        // Gunakan preset browser dari Baileys agar terlihat natural
        browser: Browsers.macOS('Firefox'),
        logger: this.socketLogger,
        /**
         * Konfigurasi tambahan mengikuti dokumentasi resmi Baileys:
         * https://baileys.wiki/docs/socket/connecting
         */
        markOnlineOnConnect: true,
        syncFullHistory: false,
        generateHighQualityLinkPreview: true,
        connectTimeoutMs: 60_000,
        keepAliveIntervalMs: 30_000,
        defaultQueryTimeoutMs: undefined,
        emitOwnEvents: true,
        msgRetryCounterCache: this.msgRetryCounterCache,
        // Implementasi getMessage minimal; sesuaikan jika menyimpan history lokal
        getMessage: async () => undefined,
      });

      state.socket = socket;
      this.devLog(`[Baileys] socket initialized session=${state.info.apiKey}`);

      socket.ev.on('creds.update', () => {
        this.devLog(`[Baileys] creds.update session=${state.info.apiKey}`);
        saveCreds().catch((error) => {
          this.logger.error('Failed to persist WhatsApp credentials', error);
        });
      });

      socket.ev.on('connection.update', (update) => {
        const statusCode = (
          update.lastDisconnect?.error as
            | { output?: { statusCode?: number } }
            | undefined
        )?.output?.statusCode;
        this.devLog(
          `[Baileys] connection.update session=${state.info.apiKey} connection=${
            update.connection ?? 'unknown'
          } hasQr=${Boolean(update.qr)} statusCode=${statusCode ?? 'n/a'}`,
        );
        void this.handleConnectionUpdate(state, update);
      });

      return socket;
    } catch (error) {
      await this.repository.updateStatus(state.info.id, 'ERROR');
      state.status = 'ERROR';
      this.emitStatusUpdate(state);
      this.emitQrUpdate(state.info.apiKey, null);
      this.rejectQrWaiters(state, error as Error);
      throw error;
    }
  }

  private async buildAuthState(sessionId: number) {
    const existingCreds = await this.repository.loadCreds(sessionId);
    const creds = existingCreds ?? initAuthCreds();

    if (!existingCreds) {
      await this.repository.saveCreds(sessionId, creds);
    }

    return {
      state: {
        creds,
        keys: {
          get: async <K extends keyof SignalDataTypeMap>(
            type: K,
            ids: string[],
          ) =>
            this.repository.loadKeys(sessionId, type, ids) as Promise<
              Record<string, SignalDataTypeMap[K]>
            >,
          set: async (
            data: Partial<{
              [K in keyof SignalDataTypeMap]: Record<
                string,
                SignalDataTypeMap[K] | null
              >;
            }>,
          ) => {
            await this.repository.setKeys({ sessionId, values: data });
          },
        },
      },
      saveCreds: async () => {
        await this.repository.saveCreds(sessionId, creds);
      },
    };
  }

  private async resolveBaileysVersion(): Promise<[number, number, number]> {
    if (!this.baileysVersion) {
      this.baileysVersion = fetchLatestBaileysVersion()
        .then(({ version }) => version)
        .catch((error) => {
          this.logger.error(
            'Failed to fetch latest Baileys version, fallback to default',
            error,
          );
          return [2, 3000, 1013973370];
        });
    }

    return this.baileysVersion;
  }

  /**
   * Handler utama event `connection.update` dari Baileys.
   * Mengatur status, QR, dan mengirimkan notifikasi SSE.
   */
  private async handleConnectionUpdate(
    state: ManagedSession,
    update: Partial<ConnectionState> & { qr?: string },
  ) {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.qr = qr;
      this.emitQrUpdate(state.info.apiKey, qr);
      this.devLog(`[Baileys] QR generated session=${state.info.apiKey}`);
      await this.updateSessionStatus(state, 'QR');
      this.resolveQrWaiters(state, qr);
    }

    if (connection === 'open') {
      state.qr = undefined;
      this.emitQrUpdate(state.info.apiKey, null);
      this.devLog(`[Baileys] connection open session=${state.info.apiKey}`);
      await this.updateSessionStatus(state, 'CONNECTED');
      this.clearQrWaiters(state);
    }

    if (connection === 'close') {
      const statusCode = (
        lastDisconnect?.error as
          | { output?: { statusCode?: number } }
          | undefined
      )?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;

      this.devLog(
        `[Baileys] connection close session=${state.info.apiKey} statusCode=${statusCode ?? 'n/a'} loggedOut=${
          loggedOut ? 'yes' : 'no'
        }`,
      );

      state.qr = undefined;
      this.emitQrUpdate(state.info.apiKey, null);

      if (loggedOut) {
        this.devLog(
          `[Baileys] session logged out session=${state.info.apiKey}`,
        );
        await this.repository.clearSessionData(state.info.id);
        await this.updateSessionStatus(state, 'LOGGED_OUT');
        this.sessions.delete(state.info.apiKey);
      } else {
        await this.updateSessionStatus(state, 'DISCONNECTED');
        // Coba reconnect otomatis untuk kasus selain loggedOut
        setTimeout(() => {
          if (!state.connectPromise && !state.socket?.user) {
            this.devLog(
              `[Baileys] attempting reconnect session=${state.info.apiKey}`,
            );
            state.connectPromise = this.createSocket(state)
              .catch((err) => {
                this.logger.error('Failed to reconnect WhatsApp socket', err);
                throw err;
              })
              .finally(() => {
                state.connectPromise = undefined;
              });
          }
        }, 1000);
      }

      state.socket = undefined;
      this.rejectQrWaiters(state, new Error('WhatsApp connection closed'));
    }
  }

  private async updateSessionStatus(
    state: ManagedSession,
    status: WhatsappSessionStatus,
  ): Promise<void> {
    state.status = status;
    try {
      await this.repository.updateStatus(state.info.id, status);
    } catch (error) {
      this.logger.error('Failed to update WhatsApp session status', error);
    }
    this.emitStatusUpdate(state);
  }

  private resolveQrWaiters(state: ManagedSession, qr: string) {
    state.qrWaiters.forEach((waiter) => waiter.resolve(qr));
    state.qrWaiters = [];
  }

  private rejectQrWaiters(state: ManagedSession, error: Error) {
    state.qrWaiters.forEach((waiter) => waiter.reject(error));
    state.qrWaiters = [];
  }

  private clearQrWaiters(state: ManagedSession) {
    state.qrWaiters = [];
  }
}
