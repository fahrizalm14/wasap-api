export interface ApiKey {
  key: string;
  label?: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateApiKeyInput {
  key: string;
  label?: string | null;
}

export interface IApiKeysRepository {
  list(): Promise<ApiKey[]>;
  create(data: CreateApiKeyInput): Promise<ApiKey>;
  findByKey(key: string): Promise<ApiKey | null>;
  deactivate(key: string): Promise<ApiKey | null>;
}

export const API_KEYS_REPOSITORY_TOKEN = Symbol('API_KEYS_REPOSITORY_TOKEN');
