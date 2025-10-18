import 'reflect-metadata';
import { container } from 'tsyringe';
import { IUsers, USERS_REPOSITORY_TOKEN } from './users.interface';
import { UsersService } from './users.service';

// 1. Buat mock untuk dependensi (Repository)
const mockUsersRepository = {
  findAll: jest.fn(),
};

// 2. Deskripsikan test suite Anda
describe('UsersService', () => {
  let service: UsersService;

  // 3. Atur ulang dan daftarkan mock sebelum setiap tes
  beforeEach(() => {
    jest.clearAllMocks();
    container.register(USERS_REPOSITORY_TOKEN, {
      useValue: mockUsersRepository,
    });
    service = container.resolve(UsersService);
  });

  // 4. Tulis test case pertama Anda
  it('should call findAll on the repository when fetching all items', async () => {
    // Arrange: Siapkan data palsu dan perilaku mock
    const mockData: IUsers[] = [{ id: 1, name: 'Test Item' }];
    mockUsersRepository.findAll.mockResolvedValue(mockData);

    // Act: Jalankan fungsi yang diuji
    const result = await service.findAll();

    // Assert: Pastikan hasilnya sesuai harapan
    expect(result).toEqual(mockData);
    expect(mockUsersRepository.findAll).toHaveBeenCalledTimes(1);
  });
});
