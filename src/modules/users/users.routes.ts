import { container } from 'tsyringe';

import { ModuleBuildResult, RouteDefinition } from '@/core/http/types';
import { UsersController } from '@/modules/users/users.controller';
import '@/modules/users/users.container';

const controller = container.resolve(UsersController);

const routes: RouteDefinition[] = [
  {
    method: 'GET',
    path: '/',
    handler: async () => {
      const users = await controller.listUsers();

      return {
        status: 200,
        body: { status: 'success', data: users },
      };
    },
  },
];

export default function createUsersRoutes(): ModuleBuildResult {
  return { routes };
}
