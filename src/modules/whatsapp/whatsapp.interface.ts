import { AuthenticationCreds, SignalDataTypeMap } from '@whiskeysockets/baileys';

export type WhatsappSessionStatus =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'QR'
  | 'LOGGED_OUT'
  | 'ERROR';

export interface WhatsappSession {
  id: number;
  apiKey: string;
  displayName?: string | null;
  status: WhatsappSessionStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface StoredWhatsappCredentials {
  creds: Record<string, unknown> | null;
  keys: Record<string, Record<string, unknown>>;
}

export interface WhatsappQrResult {
  apiKey: string;
  status: WhatsappSessionStatus;
  qr?: string;
}

export interface WhatsappConnectionInfo {
  apiKey: string;
  status: WhatsappSessionStatus;
  connected: boolean;
}

export interface WhatsappAuthState {
  session: WhatsappSession;
  creds: AuthenticationCreds;
  keys: {
    get<K extends keyof SignalDataTypeMap>(
      type: K,
      ids: string[],
    ): Promise<Record<string, SignalDataTypeMap[K] | null>>;
    set(data: Partial<{ [K in keyof SignalDataTypeMap]: Record<string, SignalDataTypeMap[K] | null> }>): Promise<void>;
  };
  saveCreds(): Promise<void>;
}

export interface IWhatsappRepository {
  listSessions(): Promise<WhatsappSession[]>;
  findSessionByApiKey(apiKey: string): Promise<WhatsappSession | null>;
  ensureSession(apiKey: string, displayName?: string | null): Promise<WhatsappSession>;
  updateStatus(sessionId: number, status: WhatsappSessionStatus): Promise<void>;
  loadCreds(sessionId: number): Promise<AuthenticationCreds | null>;
  saveCreds(sessionId: number, creds: AuthenticationCreds): Promise<void>;
  loadKeys<K extends keyof SignalDataTypeMap>(
    sessionId: number,
    type: K,
    ids: string[],
  ): Promise<Record<string, SignalDataTypeMap[K] | null>>;
  setKeys(data: {
    sessionId: number;
    values: Partial<{ [K in keyof SignalDataTypeMap]: Record<string, SignalDataTypeMap[K] | null> }>;
  }): Promise<void>;
  clearSessionData(sessionId: number): Promise<void>;
  getCredentialDump(sessionId: number): Promise<StoredWhatsappCredentials>;
}

export const WHATSAPP_REPOSITORY_TOKEN = Symbol('WHATSAPP_REPOSITORY_TOKEN');

export interface IWhatsappLockRepository {
  acquire(apiKey: string, ownerId: string, ttlMs: number): Promise<boolean>;
  touch(apiKey: string, ownerId: string): Promise<void>;
  release(apiKey: string, ownerId: string): Promise<void>;
  releaseAll(ownerId: string): Promise<void>;
  getOwner(apiKey: string): Promise<string | null>;
}

export const WHATSAPP_LOCK_REPOSITORY_TOKEN = Symbol('WHATSAPP_LOCK_REPOSITORY_TOKEN');
