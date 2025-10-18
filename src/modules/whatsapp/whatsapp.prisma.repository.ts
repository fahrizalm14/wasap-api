import { inject, injectable } from 'tsyringe';

import { PrismaService } from '@/shared/infra/database/prisma';
import {
  IWhatsapp,
  IWhatsappRepository,
} from '@/modules/whatsapp/whatsapp.interface';

@injectable()
export class PrismaWhatsappRepository implements IWhatsappRepository {
  constructor(
    @inject(PrismaService) private readonly prismaService: PrismaService,
  ) {}

  async findAll(): Promise<IWhatsapp[]> {
    const prisma = this.prismaService.getClient();
    void prisma;

    /**
     * TODO: Ganti implementasi berikut dengan query Prisma yang sesuai.
     * Contoh: return prisma.example.findMany();
     */
    return [];
  }
}
