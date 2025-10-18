import { container } from 'tsyringe';

import { PrismaUsersRepository } from '@/modules/users/users.prisma.repository';
import { USERS_REPOSITORY_TOKEN } from '@/modules/users/users.interface';

container.registerSingleton(USERS_REPOSITORY_TOKEN, PrismaUsersRepository);
