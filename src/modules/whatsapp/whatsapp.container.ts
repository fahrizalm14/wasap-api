import { container } from 'tsyringe';

import { PrismaWhatsappRepository } from '@/modules/whatsapp/whatsapp.prisma.repository';
import { WHATSAPP_REPOSITORY_TOKEN } from '@/modules/whatsapp/whatsapp.interface';

container.registerSingleton(
  WHATSAPP_REPOSITORY_TOKEN,
  PrismaWhatsappRepository,
);
