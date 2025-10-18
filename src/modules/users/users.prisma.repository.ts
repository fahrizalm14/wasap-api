import { inject, injectable } from 'tsyringe';

import { PrismaService } from '@/shared/infra/database/prisma';
import { IUsers, IUsersRepository } from '@/modules/users/users.interface';

@injectable()
export class PrismaUsersRepository implements IUsersRepository {
  constructor(@inject(PrismaService) private readonly prismaService: PrismaService) {}

  async findAll(): Promise<IUsers[]> {
    const prisma = this.prismaService.getClient();

    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: {
        id: 'asc',
      },
    });

    return users;
  }
}
