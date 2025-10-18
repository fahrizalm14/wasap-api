import { inject, injectable } from 'tsyringe';

import { UsersService } from '@/modules/users/users.service';
import { IUsers } from '@/modules/users/users.interface';

@injectable()
export class UsersController {
  constructor(@inject(UsersService) private readonly service: UsersService) {}

  async listUsers(): Promise<IUsers[]> {
    return this.service.findAll();
  }
}
