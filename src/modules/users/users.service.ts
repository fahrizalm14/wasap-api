import { inject, injectable } from 'tsyringe';

import type { IUsers, IUsersRepository } from '@/modules/users/users.interface';
import { USERS_REPOSITORY_TOKEN } from '@/modules/users/users.interface';

@injectable()
export class UsersService {
  constructor(
    @inject(USERS_REPOSITORY_TOKEN) private readonly repository: IUsersRepository,
  ) {}

  findAll(): Promise<IUsers[]> {
    return this.repository.findAll();
  }
}
