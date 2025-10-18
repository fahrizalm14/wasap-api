import { inject, injectable } from 'tsyringe';

import { WhatsappService } from '@/modules/whatsapp/whatsapp.service';
import { IWhatsapp } from '@/modules/whatsapp/whatsapp.interface';

@injectable()
export class WhatsappController {
  constructor(
    @inject(WhatsappService) private readonly service: WhatsappService,
  ) {}

  async list(): Promise<IWhatsapp[]> {
    return this.service.findAll();
  }
}
