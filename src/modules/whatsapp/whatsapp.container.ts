import { container } from 'tsyringe';

import { PrismaWhatsappRepository } from '@/modules/whatsapp/whatsapp.prisma.repository';
import {
  WHATSAPP_REPOSITORY_TOKEN,
  WHATSAPP_LOCK_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';
import { PrismaWhatsappLockRepository } from '@/modules/whatsapp/whatsapp.lock.repository';

container.registerSingleton(
  WHATSAPP_REPOSITORY_TOKEN,
  PrismaWhatsappRepository,
);

container.registerSingleton(
  WHATSAPP_LOCK_REPOSITORY_TOKEN,
  PrismaWhatsappLockRepository,
);
