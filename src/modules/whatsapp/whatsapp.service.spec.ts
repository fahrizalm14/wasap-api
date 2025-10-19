import 'reflect-metadata';
import { container } from 'tsyringe';

jest.mock('baileys', () => ({
  __esModule: true,
  default: jest.fn(),
  fetchLatestBaileysVersion: jest.fn().mockResolvedValue({ version: [2, 3000, 0] }),
  initAuthCreds: jest.fn(() => ({
    noiseKey: {},
    signedIdentityKey: {},
    signedPreKey: { keyPair: {}, signature: Buffer.from(''), keyId: 1 },
    registrationId: 1,
    advSecretKey: 'secret',
    me: undefined,
    account: undefined,
    signalIdentities: [],
    lastAccountSyncTimestamp: 0,
    platformType: 'unknown',
    processedHistoryMessages: [],
    nextPreKeyId: 1,
    firstUnuploadedPreKeyId: 1,
    accountSettings: { unarchiveChats: false },
    backupToken: Buffer.from(''),
    registration: {} as never,
    pairingEphemeralKeyPair: { privKey: Buffer.from(''), pubKey: Buffer.from('') },
    deviceSyncCounter: 0,
    deviceSyncTimestamp: 0,
    lastFullSyncTimestamp: 0,
  })),
  DisconnectReason: { loggedOut: 401 },
}));

import { ApiKey } from '@/modules/api-keys/api-keys.interface';
import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import {
  StoredWhatsappCredentials,
  WhatsappSession,
  WHATSAPP_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';
import { WhatsappService } from '@/modules/whatsapp/whatsapp.service';
import { Logger } from '@/shared/utils/logger';
import { WhatsappSseService } from '@/modules/whatsapp/whatsapp.sse';

describe('WhatsappService', () => {
  const repositoryMock = {
    listSessions: jest.fn<Promise<WhatsappSession[]>, []>(),
    findSessionByApiKey: jest.fn(),
    ensureSession: jest.fn(),
    updateStatus: jest.fn(),
    loadCreds: jest.fn(),
    saveCreds: jest.fn(),
    loadKeys: jest.fn(),
    setKeys: jest.fn(),
    clearSessionData: jest.fn(),
    getCredentialDump: jest.fn<Promise<StoredWhatsappCredentials>, [number]>(),
  } as const;

  const loggerMock: Logger = {
    info: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger;

  const sseMock: WhatsappSseService = {
    publishQr: jest.fn(),
    publishStatus: jest.fn(),
    subscribeExpress: jest.fn(),
    subscribeFastify: jest.fn(),
  } as unknown as WhatsappSseService;

  let assertActiveMock: jest.Mock;
  let apiKeysServiceMock: ApiKeysService;
  let service: WhatsappService;

  beforeEach(() => {
    jest.clearAllMocks();
    container.clearInstances();
    const activeKey: ApiKey = {
      key: 'wasap_active',
      label: null,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    assertActiveMock = jest.fn().mockResolvedValue(activeKey);
    apiKeysServiceMock = {
      assertActive: assertActiveMock,
    } as unknown as ApiKeysService;
    container.register(Logger, { useValue: loggerMock });
    container.register(WHATSAPP_REPOSITORY_TOKEN, {
      useValue: repositoryMock,
    });
    container.register(ApiKeysService, { useValue: apiKeysServiceMock });
    container.register(WhatsappSseService, { useValue: sseMock });
    service = container.resolve(WhatsappService);
  });

  it('listSessions should delegate to repository', async () => {
    const sessions: WhatsappSession[] = [
      {
        id: 1,
        apiKey: 'key-1',
        displayName: 'Bot',
        status: 'DISCONNECTED',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ];
    repositoryMock.listSessions.mockResolvedValueOnce(sessions);

    await expect(service.listSessions()).resolves.toEqual(sessions);
    expect(repositoryMock.listSessions).toHaveBeenCalledTimes(1);
  });

  it('getCredentials should throw when session is missing', async () => {
    repositoryMock.findSessionByApiKey.mockResolvedValueOnce(null);

    await expect(service.getCredentials('unknown')).rejects.toThrow('Whatsapp session not found');
  });
});
