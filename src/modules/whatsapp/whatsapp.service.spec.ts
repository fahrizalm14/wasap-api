import 'reflect-metadata';
import { container } from 'tsyringe';

import {
  IWhatsapp,
  WHATSAPP_REPOSITORY_TOKEN,
} from '@/modules/whatsapp/whatsapp.interface';
import { WhatsappService } from '@/modules/whatsapp/whatsapp.service';

const mockRepository = {
  findAll: jest.fn(),
};

describe('WhatsappService', () => {
  let service: WhatsappService;

  beforeEach(() => {
    jest.clearAllMocks();
    container.register(WHATSAPP_REPOSITORY_TOKEN, {
      useValue: mockRepository,
    });
    service = container.resolve(WhatsappService);
  });

  it('should call findAll on the repository when fetching all items', async () => {
    const mockData: IWhatsapp[] = [{ id: 1, name: 'Test Item' }];
    mockRepository.findAll.mockResolvedValue(mockData);

    const result = await service.findAll();

    expect(result).toEqual(mockData);
    expect(mockRepository.findAll).toHaveBeenCalledTimes(1);
  });
});
