import { inject, injectable } from 'tsyringe';

import { WhatsappService } from '@/modules/whatsapp/whatsapp.service';
import {
  StoredWhatsappCredentials,
  WhatsappConnectionInfo,
  WhatsappQrResult,
  WhatsappSession,
} from '@/modules/whatsapp/whatsapp.interface';

@injectable()
// Kontroler ini hanya meneruskan permintaan ke WhatsappService
export class WhatsappController {
  constructor(@inject(WhatsappService) private readonly service: WhatsappService) {}

  listSessions(): Promise<WhatsappSession[]> {
    return this.service.listSessions();
  }

  requestQr(apiKey: string, displayName?: string): Promise<WhatsappQrResult> {
    return this.service.getQr(apiKey, displayName);
  }

  getCredentials(apiKey: string): Promise<StoredWhatsappCredentials> {
    return this.service.getCredentials(apiKey);
  }

  logout(apiKey: string): Promise<void> {
    return this.service.logout(apiKey);
  }

  connectionStatus(apiKey: string): Promise<WhatsappConnectionInfo> {
    return this.service.getConnectionStatus(apiKey);
  }

  currentQr(apiKey: string): string | null {
    return this.service.getCurrentQr(apiKey);
  }

  // Minta pengiriman teks via service; hanya pengenal apiKey + payload
  async sendText(apiKey: string, to: string, text: string): Promise<{ messageId: string }>{
    return this.service.sendText(apiKey, to, text);
  }
}
