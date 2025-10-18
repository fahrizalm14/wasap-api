import { inject, injectable } from 'tsyringe';

import {
  IWhatsapp,
  IWhatsappRepository,
  WHATSAPP_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';

@injectable()
export class WhatsappService {
  constructor(
    @inject(WHATSAPP_REPOSITORY_TOKEN)
    private readonly repository: IWhatsappRepository,
  ) {}

  findAll(): Promise<IWhatsapp[]> {
    return this.repository.findAll();
  }
}
