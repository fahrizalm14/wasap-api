import { randomBytes } from 'crypto';
import { inject, injectable } from 'tsyringe';

import {
  API_KEYS_REPOSITORY_TOKEN,
} from '@/modules/api-keys/api-keys.interface';
import type {
  ApiKey,
  IApiKeysRepository,
} from '@/modules/api-keys/api-keys.interface';

@injectable()
export class ApiKeysService {
  private readonly keyPrefix = 'wasap_';

  constructor(
    @inject(API_KEYS_REPOSITORY_TOKEN)
    private readonly repository: IApiKeysRepository,
  ) {}

  list(): Promise<ApiKey[]> {
    return this.repository.list();
  }

  async generate(label?: string | null): Promise<ApiKey> {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const key = this.generateRandomKey();

      try {
        return await this.repository.create({
          key,
          label: label ?? null,
        });
      } catch (error) {
        if ((error as Error).message === 'API_KEY_DUPLICATED') {
          continue;
        }

        throw error;
      }
    }

    throw new Error('Failed to generate unique API key');
  }

  async assertActive(key: string): Promise<ApiKey> {
    const normalized = key.trim();
    if (!normalized) {
      throw new Error('API key not registered');
    }

    const record = await this.repository.findByKey(normalized);
    if (!record || !record.isActive) {
      throw new Error('API key not registered');
    }

    return record;
  }

  async deactivate(key: string): Promise<ApiKey | null> {
    const result = await this.repository.deactivate(key);
    if (!result) {
      return null;
    }

    return result;
  }

  private generateRandomKey(): string {
    const randomPart = randomBytes(24).toString('hex');
    return `${this.keyPrefix}${randomPart}`;
  }
}
