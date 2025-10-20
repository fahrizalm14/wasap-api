import { Prisma } from '@prisma/client';
import { inject, injectable } from 'tsyringe';

import {
  IWhatsappLockRepository,
} from '@/modules/whatsapp/whatsapp.interface';
import { PrismaService } from '@/shared/infra/database/prisma';

@injectable()
export class PrismaWhatsappLockRepository implements IWhatsappLockRepository {
  constructor(
    @inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  private get prisma() {
    return this.prismaService.getClient();
  }

  async acquire(apiKey: string, ownerId: string, ttlMs: number): Promise<boolean> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - ttlMs);

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.whatsappSessionLock.findUnique({
          where: { apiKey },
        });

        if (!existing) {
          await tx.whatsappSessionLock.create({
            data: { apiKey, ownerId, acquiredAt: now },
          });
          return true;
        }

        if (existing.ownerId === ownerId) {
          await tx.whatsappSessionLock.update({
            where: { apiKey },
            data: { acquiredAt: now },
          });
          return true;
        }

        if (existing.acquiredAt < staleBefore) {
          await tx.whatsappSessionLock.update({
            where: { apiKey },
            data: { ownerId, acquiredAt: now },
          });
          return true;
        }

        return false;
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      ) {
        return false;
      }
      throw error;
    }
  }

  async touch(apiKey: string, ownerId: string): Promise<void> {
    const now = new Date();
    await this.prisma.whatsappSessionLock.updateMany({
      where: { apiKey, ownerId },
      data: { acquiredAt: now },
    });
  }

  async release(apiKey: string, ownerId: string): Promise<void> {
    await this.prisma.whatsappSessionLock.deleteMany({
      where: { apiKey, ownerId },
    });
  }

  async releaseAll(ownerId: string): Promise<void> {
    await this.prisma.whatsappSessionLock.deleteMany({
      where: { ownerId },
    });
  }
}
