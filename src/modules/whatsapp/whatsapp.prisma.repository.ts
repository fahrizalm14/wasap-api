import { Prisma } from '@prisma/client';
import {
  AuthenticationCreds,
  BufferJSON,
  SignalDataTypeMap,
  proto,
} from '@whiskeysockets/baileys';
import { inject, injectable } from 'tsyringe';

import {
  IWhatsappRepository,
  StoredWhatsappCredentials,
  WhatsappSession,
  WhatsappSessionStatus,
} from '@/modules/whatsapp/whatsapp.interface';
import { PrismaService } from '@/shared/infra/database/prisma';

@injectable()
export class PrismaWhatsappRepository implements IWhatsappRepository {
  constructor(
    @inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  private get prisma() {
    return this.prismaService.getClient();
  }

  async listSessions(): Promise<WhatsappSession[]> {
    const sessions = await this.prisma.whatsappSession.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return sessions.map((session) => this.toDomain(session));
  }

  async findSessionByApiKey(apiKey: string): Promise<WhatsappSession | null> {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { apiKey },
    });

    return session ? this.toDomain(session) : null;
  }

  async ensureSession(
    apiKey: string,
    displayName?: string | null,
  ): Promise<WhatsappSession> {
    const session = await this.prisma.whatsappSession.upsert({
      where: { apiKey },
      create: {
        apiKey,
        displayName: displayName ?? null,
      },
      update: {
        displayName: displayName ?? null,
      },
    });

    return this.toDomain(session);
  }

  async updateStatus(
    sessionId: number,
    status: WhatsappSessionStatus,
  ): Promise<void> {
    await this.prisma.whatsappSession.update({
      where: { id: sessionId },
      data: { status },
    });
  }

  async loadCreds(sessionId: number): Promise<AuthenticationCreds | null> {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: { creds: true },
    });

    if (!session?.creds) {
      return null;
    }

    return this.fromJsonValue<AuthenticationCreds>(session.creds);
  }

  async saveCreds(
    sessionId: number,
    creds: AuthenticationCreds,
  ): Promise<void> {
    await this.prisma.whatsappSession.update({
      where: { id: sessionId },
      data: {
        creds: this.toJsonValue(creds),
      },
    });
  }

  async loadKeys<K extends keyof SignalDataTypeMap>(
    sessionId: number,
    type: K,
    ids: string[],
  ): Promise<Record<string, SignalDataTypeMap[K] | null>> {
    if (!ids.length) {
      return {};
    }

    const records = await this.prisma.whatsappCredential.findMany({
      where: {
        sessionId,
        type: type as string,
        keyId: { in: ids },
      },
    });

    const result: Record<string, SignalDataTypeMap[K] | null> = {};
    ids.forEach((id) => {
      result[id] = null;
    });

    for (const record of records) {
      const value = this.fromJsonValue<SignalDataTypeMap[K]>(record.value);
      if (value && type === 'app-state-sync-key') {
        const appStateKey = proto.Message.AppStateSyncKeyData.fromObject(
          value as proto.Message.IAppStateSyncKeyData,
        );
        result[record.keyId] = appStateKey as unknown as SignalDataTypeMap[K];
      } else {
        result[record.keyId] = value;
      }
    }

    return result;
  }

  async setKeys(data: {
    sessionId: number;
    values: Partial<{
      [K in keyof SignalDataTypeMap]: Record<
        string,
        SignalDataTypeMap[K] | null
      >;
    }>;
  }): Promise<void> {
    const { sessionId, values } = data;
    const tasks: Promise<unknown>[] = [];

    for (const category of Object.keys(values) as (keyof SignalDataTypeMap)[]) {
      const entries = values[category];

      if (!entries) {
        continue;
      }

      for (const [keyId, value] of Object.entries(entries)) {
        if (value) {
          const normalized = this.normalizeValueForStorage(
            category as string,
            value,
          );
          const storedValue = this.toJsonValue(normalized);

          tasks.push(
            this.prisma.whatsappCredential.upsert({
              where: {
                sessionId_type_keyId: {
                  sessionId,
                  type: category as string,
                  keyId,
                },
              },
              create: {
                sessionId,
                type: category as string,
                keyId,
                value: storedValue,
              },
              update: {
                value: storedValue,
              },
            }),
          );
        } else {
          tasks.push(
            this.prisma.whatsappCredential.deleteMany({
              where: {
                sessionId,
                type: category as string,
                keyId,
              },
            }),
          );
        }
      }
    }

    await Promise.all(tasks);
  }

  private normalizeValueForStorage(
    category: string,
    value: SignalDataTypeMap[keyof SignalDataTypeMap],
  ): unknown {
    if (category === 'app-state-sync-key' && value) {
      const candidate = value as unknown as {
        toJSON?: () => unknown;
        toObject?: () => unknown;
      };
      if (typeof candidate.toJSON === 'function') {
        return candidate.toJSON();
      }
      if (typeof candidate.toObject === 'function') {
        return candidate.toObject();
      }
    }

    return value;
  }

  async clearSessionData(sessionId: number): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.whatsappCredential.deleteMany({
        where: { sessionId },
      }),
      this.prisma.whatsappSession.update({
        where: { id: sessionId },
        data: { creds: Prisma.DbNull },
      }),
    ]);
  }

  async getCredentialDump(
    sessionId: number,
  ): Promise<StoredWhatsappCredentials> {
    const session = await this.prisma.whatsappSession.findUnique({
      where: { id: sessionId },
      select: {
        creds: true,
        credentials: true,
      },
    });

    if (!session) {
      throw new Error('Whatsapp session not found');
    }

    const creds = session.creds
      ? (JSON.parse(JSON.stringify(session.creds)) as Record<string, unknown>)
      : null;

    const keys: Record<string, Record<string, unknown>> = {};

    for (const credential of session.credentials) {
      if (!keys[credential.type]) {
        keys[credential.type] = {};
      }

      keys[credential.type][credential.keyId] = credential.value
        ? (JSON.parse(JSON.stringify(credential.value)) as Record<
            string,
            unknown
          >)
        : null;
    }

    return { creds, keys };
  }

  private toDomain(session: {
    id: number;
    apiKey: string;
    displayName: string | null;
    status: WhatsappSessionStatus;
    createdAt: Date;
    updatedAt: Date;
  }): WhatsappSession {
    return {
      id: session.id,
      apiKey: session.apiKey,
      displayName: session.displayName,
      status: session.status,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  private toJsonValue(value: unknown): Prisma.InputJsonValue {
    return JSON.parse(
      JSON.stringify(value, BufferJSON.replacer),
    ) as Prisma.InputJsonValue;
  }

  private fromJsonValue<T>(value: Prisma.JsonValue | null): T | null {
    if (value === null || value === undefined) {
      return null;
    }

    return JSON.parse(JSON.stringify(value), BufferJSON.reviver) as T;
  }
}
