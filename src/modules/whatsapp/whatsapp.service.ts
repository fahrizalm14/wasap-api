import makeWASocket, {
  Browsers,
  ConnectionState,
  DisconnectReason,
  SignalDataTypeMap,
  WASocket,
  fetchLatestBaileysVersion,
  initAuthCreds,
} from '@whiskeysockets/baileys';
import { hostname } from 'os';
import pino from 'pino';
import { inject, singleton } from 'tsyringe';

import { env } from '@/config';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import type {
  IWhatsappRepository,
  IWhatsappLockRepository,
  StoredWhatsappCredentials,
  WhatsappConnectionInfo,
  WhatsappQrResult,
  WhatsappSession,
  WhatsappSessionStatus,
} from '@/modules/whatsapp/whatsapp.interface';
import {
  WHATSAPP_REPOSITORY_TOKEN,
  WHATSAPP_LOCK_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';
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
  connectionWaiters: Array<{ resolve: () => void; reject: (error: Error) => void }>;
  lockHeld?: boolean;
  reconnectTimer?: NodeJS.Timeout;
}

/**
 * Mengelola lifecycle sesi WhatsApp berbasis Baileys:
 * - Menyiapkan socket dan menyinkronkan kredensial
 * - Menyimpan status sesi di database
 * - Mendistribusikan update status/QR melalui SSE
 */
@singleton()
export class WhatsappService {
  private readonly sessions: Map<string, ManagedSession>;

  private readonly socketLogger = pino({ level: 'error' });

  private baileysVersion?: Promise<[number, number, number]>;

  private readonly qrTimeoutMs = 60_000;

  private readonly isDevelopment = env.NODE_ENV !== 'production';

  private readonly lockOwnerId = `${hostname()}-${process.pid}`;

  private readonly lockTtlMs = 5 * 60 * 1000;

  constructor(
    @inject(WHATSAPP_REPOSITORY_TOKEN)
    private readonly repository: IWhatsappRepository,
    @inject(WHATSAPP_LOCK_REPOSITORY_TOKEN)
    private readonly lockRepository: IWhatsappLockRepository,
    @inject(Logger) private readonly logger: Logger,
    @inject(ApiKeysService) private readonly apiKeysService: ApiKeysService,
    /**
     * Kanal distribusi SSE untuk mengirim status & QR secara real-time.
     */
    @inject(WhatsappSseService) private readonly sseService: WhatsappSseService,
  ) {
    // Share session map across potential multiple service instances within same process
    const g = globalThis as unknown as Record<string, unknown>;
    const key = '__wa_sessions__';
    if (!g[key]) {
      g[key] = new Map<string, ManagedSession>();
    }
    this.sessions = g[key] as Map<string, ManagedSession>;
  }

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
   * Menginisialisasi koneksi untuk seluruh sesi non-LOGGED_OUT secara proaktif (warm up).
   * Tidak gagal bila sebagian sesi error; hanya melakukan best-effort initializeSocket.
   */
  async warmSessions(): Promise<{
    total: number;
    attempted: number;
    connected: number;
    failed: number;
  }> {
    const sessions = await this.repository.listSessions();
    // Warm seluruh sesi yang sebelumnya CONNECTED atau DISCONNECTED supaya otomatis reconnect.
    const candidates = sessions.filter(
      (s) => s.status === 'CONNECTED' || s.status === 'DISCONNECTED',
    );
    let connected = 0;
    let failed = 0;
    for (const s of candidates) {
      try {
        // Hanya warm sesi yang sudah memiliki kredensial, agar tidak memicu QR
        const creds = await this.repository.loadCreds(s.id);
        if (!creds) {
          this.devLog(
            `[Warm] skip (no creds) apiKey=${s.apiKey} status=${s.status}`,
          );
          continue;
        }

        const state = await this.initializeSocket(s);
        // Beri waktu lebih lama agar koneksi stabil
        await this.waitUntilConnected(state, 15_000).catch(() => undefined);
        if (state.socket?.user) connected += 1;
      } catch (e) {
        failed += 1;
        this.logger.error(`Warm session failed apiKey=${s.apiKey}`, e as Error);
      }
    }
    return {
      total: sessions.length,
      attempted: candidates.length,
      connected,
      failed,
    };
  }

  /**
   * Melepaskan seluruh lock sesi yang dipegang oleh proses ini (dipanggil saat shutdown).
   */
  async releaseAllLocks(): Promise<void> {
    await this.lockRepository.releaseAll(this.lockOwnerId).catch(() => undefined);
    for (const state of this.sessions.values()) {
      state.lockHeld = false;
    }
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
    // Jika sesi sudah LOGGED_OUT, jangan memulai socket lagi agar QR tidak muncul
    if (session.status === 'LOGGED_OUT') {
      return { apiKey: normalizedKey, status: 'LOGGED_OUT' };
    }
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
      this.rejectConnectionWaiters(state, new Error('Logged out'));
      if (state.lockHeld) {
        await this.lockRepository
          .release(state.info.apiKey, this.lockOwnerId)
          .catch(() => undefined);
        state.lockHeld = false;
      }
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
        connectionWaiters: [],
      };
      this.sessions.set(session.apiKey, state);
    } else {
      state.info = session;
      if (!state.connectionWaiters) {
        state.connectionWaiters = [];
      }
    }

    if (state.socket?.user) {
      return state;
    }

    if (!state.connectPromise) {
      if (!state.lockHeld) {
        const ok = await this.lockRepository.acquire(
          session.apiKey,
          this.lockOwnerId,
          this.lockTtlMs,
        );
        if (!ok) {
          this.devLog(
            `[Baileys] skip connect (lock held by another process) session=${session.apiKey}`,
          );
          return state;
        }
        state.lockHeld = true;
      } else {
        await this.lockRepository
          .touch(session.apiKey, this.lockOwnerId)
          .catch(() => undefined);
      }

      state.connectPromise = this.createSocket(state)
        .catch((error) => {
          this.logger.error('Failed to initialize WhatsApp socket', error);
          if (state.lockHeld) {
            void this.lockRepository
              .release(state.info.apiKey, this.lockOwnerId)
              .finally(() => {
                state.lockHeld = false;
              });
          }
          throw error;
        })
        .finally(() => {
          state.connectPromise = undefined;
        });
    } else if (state.lockHeld) {
      await this.lockRepository
        .touch(session.apiKey, this.lockOwnerId)
        .catch(() => undefined);
    }

    await state.connectPromise;
    if (state.lockHeld) {
      await this.lockRepository
        .touch(session.apiKey, this.lockOwnerId)
        .catch(() => undefined);
    }
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
        generateHighQualityLinkPreview: false,
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
      if (state.lockHeld) {
        await this.lockRepository
          .touch(state.info.apiKey, this.lockOwnerId)
          .catch(() => undefined);
      }
      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = undefined;
      }
      this.clearQrWaiters(state);
      this.resolveConnectionWaiters(state);
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

      const previousSocket = state.socket;
      state.qr = undefined;
      this.emitQrUpdate(state.info.apiKey, null);

      if (state.reconnectTimer) {
        clearTimeout(state.reconnectTimer);
        state.reconnectTimer = undefined;
      }

      if (previousSocket) {
        try {
          previousSocket.ws.close();
        } catch {
          // ignore
        }
      }
      state.socket = undefined;

      if (loggedOut) {
        this.devLog(
          `[Baileys] session logged out session=${state.info.apiKey}`,
        );
        await this.repository.clearSessionData(state.info.id);
        await this.updateSessionStatus(state, 'LOGGED_OUT');
        if (state.lockHeld) {
          await this.lockRepository
            .release(state.info.apiKey, this.lockOwnerId)
            .catch(() => undefined);
          state.lockHeld = false;
        }
        this.msgRetryCounterCache.del(`reconnect:${state.info.apiKey}`);
        this.sessions.delete(state.info.apiKey);
      } else {
        await this.updateSessionStatus(state, 'DISCONNECTED');
        this.scheduleReconnect(state, statusCode);
      }

      const closeError = new Error('WhatsApp connection closed');
      this.rejectQrWaiters(state, closeError);
      this.rejectConnectionWaiters(state, closeError);
    }
    // Reset backoff on successful open
    if (connection === 'open') {
      this.msgRetryCounterCache.del(`reconnect:${state.info.apiKey}`);
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

  private resolveConnectionWaiters(state: ManagedSession) {
    if (!state.connectionWaiters) return;
    state.connectionWaiters.forEach((waiter) => waiter.resolve());
    state.connectionWaiters = [];
  }

  private rejectConnectionWaiters(state: ManagedSession, error: Error) {
    if (!state.connectionWaiters) return;
    state.connectionWaiters.forEach((waiter) => waiter.reject(error));
    state.connectionWaiters = [];
  }

  private scheduleReconnect(
    state: ManagedSession,
    statusCode?: number,
  ): void {
    const attemptKey = `reconnect:${state.info.apiKey}`;
    const attempt = (this.msgRetryCounterCache.get<number>(attemptKey) ?? 0) + 1;
    this.msgRetryCounterCache.set(attemptKey, attempt);

    const cappedExponent = Math.min(attempt - 1, 5);
    const baseDelay = 1_000 * 2 ** cappedExponent;
    const delay = Math.min(30_000, baseDelay) + Math.floor(Math.random() * 500);

    if (state.reconnectTimer) {
      clearTimeout(state.reconnectTimer);
    }

    this.devLog(
      `[Baileys] scheduled reconnect session=${state.info.apiKey} attempt=${attempt} delay=${delay}ms statusCode=${statusCode ?? 'n/a'}`,
    );

    state.reconnectTimer = setTimeout(() => {
      state.reconnectTimer = undefined;

      if (state.socket?.user || state.connectPromise) {
        this.devLog(
          `[Baileys] skip reconnect (already active) session=${state.info.apiKey}`,
        );
        return;
      }

      const connectTask = (async () => {
        if (!state.lockHeld) {
          const acquired = await this.lockRepository.acquire(
            state.info.apiKey,
            this.lockOwnerId,
            this.lockTtlMs,
          );
          if (!acquired) {
            throw new Error('Failed to acquire lock for reconnect');
          }
          state.lockHeld = true;
        } else {
          await this.lockRepository
            .touch(state.info.apiKey, this.lockOwnerId)
            .catch(() => undefined);
        }

        return await this.createSocket(state);
      })();

      state.connectPromise = connectTask
        .catch((error) => {
          this.logger.error(
            `Failed to reconnect WhatsApp socket apiKey=${state.info.apiKey}`,
            error,
          );
          this.scheduleReconnect(state, statusCode);
          throw error;
        })
        .finally(() => {
          if (state.connectPromise === connectTask) {
            state.connectPromise = undefined;
          }
        });
    }, delay);
  }

  private async waitUntilConnected(state: ManagedSession, timeoutMs: number): Promise<void> {
    if (state.socket?.user) {
      return;
    }

    await new Promise<void>((resolve, reject) => {
      let finished = false;
      let timer: NodeJS.Timeout;

      const waiter = {
        resolve: () => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          state.connectionWaiters = state.connectionWaiters.filter((candidate) => candidate !== waiter);
          resolve();
        },
        reject: (error: Error) => {
          if (finished) return;
          finished = true;
          clearTimeout(timer);
          state.connectionWaiters = state.connectionWaiters.filter((candidate) => candidate !== waiter);
          reject(error);
        },
      } as { resolve: () => void; reject: (error: Error) => void };

      timer = setTimeout(() => {
        if (finished) return;
        finished = true;
        state.connectionWaiters = state.connectionWaiters.filter((candidate) => candidate !== waiter);
        reject(new Error('WhatsApp session not connected'));
      }, timeoutMs);

      state.connectionWaiters.push(waiter);
    });
  }

  /**
   * Kirim pesan teks ke JID menggunakan sesi milik apiKey.
   * Mengharuskan status CONNECTED; jika tidak, melempar error 503.
   */
  async sendText(apiKey: string, to: string, text: string): Promise<{ messageId: string }>{
    const normalizedKey = await this.ensureActiveKey(apiKey);
    const session = await this.repository.findSessionByApiKey(normalizedKey);
    if (!session) throw new Error('Whatsapp session not found');

    // Jika sesi sudah LOGGED_OUT, jangan paksa connect ketika kirim pesan
    if (session.status === 'LOGGED_OUT') {
      const err = new Error('Session is logged out');
      (err as any).statusCode = 409;
      throw err;
    }

    const state = await this.initializeSocket(session);
    // Jika instance ini tidak memegang lock, berarti sesi dimiliki instance lain.
    // Dalam skenario multi-instance, segera informasikan klien agar melakukan sticky routing.
    if (!state.lockHeld && !state.socket?.user) {
      const owner = await this.lockRepository.getOwner(session.apiKey).catch(() => null);
      const err = new Error(
        owner
          ? `Session is handled by another instance (${owner}). Use sticky routing by apiKey or single instance.`
          : 'Session is handled by another instance. Use sticky routing by apiKey or single instance.',
      );
      (err as any).statusCode = 423; // Locked
      throw err;
    }

    // Tunggu lebih lama agar koneksi stabil bila kita pemegang lock
    await this.waitUntilConnected(state, 20_000).catch(() => {
      const err = new Error('Session not connected');
      (err as any).statusCode = 503;
      throw err;
    });
    const socket = state.socket;
    if (!socket?.user) {
      const err = new Error('Session not connected');
      (err as any).statusCode = 503;
      throw err;
    }

    // Normalize MSISDN: remove spaces, dashes, parentheses; drop leading '+'; convert local 0-prefix to 62
    let msisdn = to.trim().replace(/[()\s-]/g, '');
    if (msisdn.startsWith('+')) msisdn = msisdn.slice(1);
    if (msisdn.startsWith('0')) msisdn = '62' + msisdn.slice(1);
    if (!/^\d{8,15}$/.test(msisdn)) {
      const err = new Error("Invalid 'to' (use digits, 8-15, with country code)");
      (err as any).statusCode = 400;
      throw err;
    }
    const jid = `${msisdn}@s.whatsapp.net`;
    const result = await socket.sendMessage(jid, { text });
    const messageId = result?.key?.id ?? '';
    if (state.lockHeld) {
      await this.lockRepository
        .touch(session.apiKey, this.lockOwnerId)
        .catch(() => undefined);
    }
    this.logger.info(
      `[WhatsApp] message sent apiKey=${normalizedKey} to=${msisdn} messageId=${messageId || 'unknown'}`,
    );
    return { messageId };
  }
}
