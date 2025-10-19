import 'reflect-metadata';
import { container } from 'tsyringe';
import {
  API_KEYS_REPOSITORY_TOKEN,
  ApiKey,
} from './api-keys.interface';
import { ApiKeysService } from './api-keys.service';

describe('ApiKeysService', () => {
  let repositoryMock: {
    list: jest.Mock;
    create: jest.Mock;
    findByKey: jest.Mock;
    deactivate: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    container.clearInstances();
    repositoryMock = {
      list: jest.fn(),
      create: jest.fn(),
      findByKey: jest.fn(),
      deactivate: jest.fn(),
    };

    container.register(API_KEYS_REPOSITORY_TOKEN, {
      useValue: repositoryMock,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('generate should produce prefixed key and persist using repository', async () => {
    repositoryMock.create.mockImplementation(
      async (data: { key: string; label?: string | null }) => {
        const now = new Date('2024-01-01T00:00:00.000Z');
        return {
          key: data.key,
          label: data.label ?? null,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        } satisfies ApiKey;
      },
    );

    const service = container.resolve(ApiKeysService);
    const result = await service.generate('Support Team');

    expect(repositoryMock.create).toHaveBeenCalledTimes(1);
    const payload = repositoryMock.create.mock.calls[0][0] as {
      key: string;
      label?: string | null;
    };
    expect(payload.label).toBe('Support Team');
    expect(payload.key).toMatch(/^wasap_[0-9a-f]{48}$/);

    expect(result.key).toBe(payload.key);
    expect(result.label).toBe('Support Team');
    expect(result.isActive).toBe(true);
  });

  it('assertActive should validate stored key and reject missing entries', async () => {
    const activeKey: ApiKey = {
      key: 'wasap_active',
      label: 'Bot',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    repositoryMock.findByKey.mockResolvedValueOnce(activeKey);

    const service = container.resolve(ApiKeysService);
    await expect(service.assertActive('  wasap_active  ')).resolves.toEqual(
      activeKey,
    );
    expect(repositoryMock.findByKey).toHaveBeenCalledWith('wasap_active');

    repositoryMock.findByKey.mockResolvedValueOnce(null);
    await expect(service.assertActive('unknown')).rejects.toThrow(
      'API key not registered',
    );
  });
});
