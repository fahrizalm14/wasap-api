export interface IUsers {
  id: number;
  name: string;
}

export interface IUsersRepository {
  findAll(): Promise<IUsers[]>;
}

export const USERS_REPOSITORY_TOKEN = Symbol('USERS_REPOSITORY_TOKEN');
