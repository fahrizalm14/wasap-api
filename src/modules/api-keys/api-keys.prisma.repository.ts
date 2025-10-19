import { ApiKey as PrismaApiKey, Prisma } from '@prisma/client';
import { inject, injectable } from 'tsyringe';

import {
  ApiKey,
  CreateApiKeyInput,
  IApiKeysRepository,
} from '@/modules/api-keys/api-keys.interface';
import { PrismaService } from '@/shared/infra/database/prisma';

@injectable()
export class PrismaApiKeysRepository implements IApiKeysRepository {
  constructor(
    @inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  private get prisma() {
    return this.prismaService.getClient();
  }

  async list(): Promise<ApiKey[]> {
    const keys = await this.prisma.apiKey.findMany({
      orderBy: { createdAt: 'desc' },
    });

    return keys.map((key) => this.toDomain(key));
  }

  async create(data: CreateApiKeyInput): Promise<ApiKey> {
    try {
      const created = await this.prisma.apiKey.create({
        data: {
          key: data.key,
          label: data.label ?? null,
        },
      });

      return this.toDomain(created);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const uniqueError = new Error('API_KEY_DUPLICATED');
        uniqueError.name = 'ConflictError';
        throw uniqueError;
      }

      throw error;
    }
  }

  async findByKey(key: string): Promise<ApiKey | null> {
    const result = await this.prisma.apiKey.findUnique({
      where: { key },
    });

    return result ? this.toDomain(result) : null;
  }

  async deactivate(key: string): Promise<ApiKey | null> {
    try {
      const updated = await this.prisma.apiKey.update({
        where: { key },
        data: { isActive: false },
      });

      return this.toDomain(updated);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2025'
      ) {
        return null;
      }

      throw error;
    }
  }

  private toDomain(record: PrismaApiKey): ApiKey {
    return {
      key: record.key,
      label: record.label,
      isActive: record.isActive,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }
}
