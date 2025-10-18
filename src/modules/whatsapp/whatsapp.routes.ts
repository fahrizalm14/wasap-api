import { container } from 'tsyringe';

import { ModuleBuildResult, RouteDefinition } from '@/core/http/types';
import { WhatsappController } from '@/modules/whatsapp/whatsapp.controller';
import '@/modules/whatsapp/whatsapp.container';

const controller = container.resolve(WhatsappController);

const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: async () => {
      const items = await controller.list();

      return {
        status: 200,
        body: { status: 'success', data: items },
      };
    },
  },
];

export default function createWhatsappModule(): ModuleBuildResult {
  return { routes };
}
