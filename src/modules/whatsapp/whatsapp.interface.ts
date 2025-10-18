export interface IWhatsapp {
  id: number;
  name: string;
}

export interface IWhatsappRepository {
  findAll(): Promise<IWhatsapp[]>;
}

export const WHATSAPP_REPOSITORY_TOKEN = Symbol('WHATSAPP_REPOSITORY_TOKEN');
