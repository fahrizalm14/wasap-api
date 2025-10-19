import { inject, injectable } from 'tsyringe';

import { ApiKeysService } from '@/modules/api-keys/api-keys.service';
import { ApiKey } from '@/modules/api-keys/api-keys.interface';

@injectable()
export class ApiKeysController {
  constructor(
    @inject(ApiKeysService) private readonly service: ApiKeysService,
  ) {}

  list(): Promise<ApiKey[]> {
    return this.service.list();
  }

  create(label?: string | null): Promise<ApiKey> {
    return this.service.generate(label);
  }

  deactivate(key: string): Promise<ApiKey | null> {
    return this.service.deactivate(key);
  }
}
