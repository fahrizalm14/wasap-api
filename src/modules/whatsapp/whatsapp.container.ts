import { container } from 'tsyringe';

import { PrismaWhatsappRepository } from '@/modules/whatsapp/whatsapp.prisma.repository';
import {
  WHATSAPP_REPOSITORY_TOKEN,
  WHATSAPP_LOCK_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';
import { PrismaWhatsappLockRepository } from '@/modules/whatsapp/whatsapp.lock.repository';

// Daftarkan repository utama + lock agar dapat injeksi via tsyringe
container.registerSingleton(
  WHATSAPP_REPOSITORY_TOKEN,
  PrismaWhatsappRepository,
);

// Pastikan repository lock juga tersedia melalui dependency injection
container.registerSingleton(
  WHATSAPP_LOCK_REPOSITORY_TOKEN,
  PrismaWhatsappLockRepository,
);
