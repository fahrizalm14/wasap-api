import { container } from 'tsyringe';

import { PrismaApiKeysRepository } from '@/modules/api-keys/api-keys.prisma.repository';
import { API_KEYS_REPOSITORY_TOKEN } from '@/modules/api-keys/api-keys.interface';

container.registerSingleton(API_KEYS_REPOSITORY_TOKEN, PrismaApiKeysRepository);
