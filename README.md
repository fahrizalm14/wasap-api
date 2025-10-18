# Teman API Node.js – Template Modular Modern

## Daftar Isi
- [Ringkasan](#ringkasan)
- [Fitur Utama](#fitur-utama)
- [Arsitektur & Cara Kerja](#arsitektur--cara-kerja)
- [Dependency Injection](#dependency-injection)
  - [Konsep DI di Template Ini](#konsep-di-di-template-ini)
  - [Diagram Alur DI](#diagram-alur-di)
  - [Tips Menggunakan DI](#tips-menggunakan-di)
- [Struktur Direktori](#struktur-direktori)
- [Modul Bawaan](#modul-bawaan)
- [Konfigurasi Lingkungan](#konfigurasi-lingkungan)
- [Siklus Bootstrap](#siklus-bootstrap)
- [Middleware & Rate Limiter](#middleware--rate-limiter)
- [Socket Opsional](#socket-opsional)
- [Fungsi Penting](#fungsi-penting)
- [Penggunaan Harian](#penggunaan-harian)
  - [Pengembangan](#pengembangan)
  - [Pengujian](#pengujian)
  - [Build Produksi](#build-produksi)
- [Automasi Modul](#automasi-modul)
- [Deployment](#deployment)
  - [Docker](#docker)
  - [PM2](#pm2)
- [FAQ](#faq)
- [Kontribusi](#kontribusi)
- [Lisensi](#lisensi)

---

## Ringkasan
Templat ini membantu Anda membangun REST API Node.js berbasis TypeScript dengan arsitektur modular, dependency injection, dan pilihan framework HTTP (Express atau Fastify). Seluruh komponen dirancang agar plug-and-play; Anda cukup memilih middleware, mendefinisikan modul, lalu menjalankan bootstrap.

---

## Fitur Utama
- **Modular Monolith**: Setiap fitur ditempatkan dalam modul independen, siap dipecah menjadi microservice.
- **Multi HTTP Provider**: Ganti `HTTP_SERVER=express|fastify` untuk beralih framework tanpa menyentuh kode modul.
- **Dependency Injection via Tsyringe**: Kontruksi service yang eksplisit dan mudah diuji.
- **Bootstrap Terpusat**: File `main.ts` hanya mengatur middleware & modul, sedangkan kelas `App` menangani lifecycle.
- **Middleware Plug-and-Play**: Daftarkan middleware per provider dengan satu fungsi utilitas.
- **Rate Limiting**: Aktivasi otomatis via middleware global atau per modul.
- **Automasi Modul**: CLI `pnpm create:module` membuat struktur modul lengkap dengan test.
- **Infra-Ready**: Konfigurasi jelas, logger Pino, script build deploy Docker.
- **Integrasi Database Fleksibel**: Template menyertakan contoh repository Prisma sekaligus mendukung implementasi lain (in-memory, REST, dsb) tanpa mengubah service.

---

## Arsitektur & Cara Kerja
1. **Entry Point (`src/main.ts`)**
   - Memuat variabel lingkungan (`env`).
   - Membuat server HTTP sesuai provider.
   - Membuat instance `App` dan mendaftarkan middleware + modul (termasuk route health).
   - Menjalankan `app.start()`.

2. **`App` Lifecycle (`src/core/App.ts`)**
   - Menyimpan middleware, modul, dan cleanup callback.
   - Saat start:
     - Mendaftarkan middleware ke server.
     - Mendaftarkan modul ke server.
     - Mengikat sinyal shutdown.
     - Memerintahkan server listen pada port.

3. **HTTP Abstraction (`src/core/http`)**
   - `ExpressHttpServer` dan `FastifyHttpServer` mengimplementasikan kontrak `HttpServer`.
   - Wrapper menangani konversi `RouteHandler` internal ke handler framework.

4. **Modul**
   - Memperluas route dengan prefix `api/v1/<modul>`.
   - Bisa mengembalikan opsi (contoh rate limit per modul).

---

## Dependency Injection
### Konsep DI di Template Ini
- Menggunakan `tsyringe` untuk mendaftarkan service, controller, repository, dan provider infrastruktur seperti Prisma.
- Mengandalkan decorator `@injectable()` / `@singleton()` dan constructor injection sehingga dependency tidak pernah diakses secara global.
- Kontrak dipresentasikan sebagai interface + token (contoh: `IUsersRepository` + `USERS_REPOSITORY_TOKEN`) agar implementasi mudah diganti tanpa menyentuh service.
- Registrasi binding dilakukan di berkas container per modul (contoh: `users.container.ts`) supaya struktur modul tetap terisolasi.

### Diagram Alur DI
```
UsersController @injectable()
  └── constructor(@inject(UsersService))

UsersService @injectable()
  └── constructor(@inject(USERS_REPOSITORY_TOKEN) IUsersRepository)

users.container.ts
  └── container.registerSingleton(USERS_REPOSITORY_TOKEN, PrismaUsersRepository)

PrismaUsersRepository @injectable()
  └── constructor(@inject(PrismaService)) -> prisma.user.findMany()

PrismaService @singleton()
  └── PrismaClient (dikonfigurasi via env)
```

### Tips Menggunakan DI
- Registrasi otomatis via decorator sudah cukup; hindari container manual kecuali untuk pengujian.
- Gunakan interface untuk kontrak repository bila akan mengganti implementasi.
- Dalam test, gunakan `container.register` dengan `useValue` atau `useClass` untuk mengganti dependensi.
- Pastikan memanggil `container.clearInstances()` bila membuat container custom di test.
- Jika ingin menambahkan integrasi eksternal (misal S3 atau Redis), buat abstraksi baru (mis. `StorageService`), tandai dengan `@injectable()`, lalu injeksikan ke service lain. Di test, Anda bisa mengganti `StorageService` dengan mock menggunakan `container.register(StorageService, { useValue: mockObj })`.
- Hindari mengakses container secara global di dalam fungsi. Lebih baik injeksikan dependensi melalui konstruktor agar komponen tetap testable dan tidak bergantung pada state global.

### Integrasi Repository Database
- Setiap modul bisa menyediakan beberapa implementasi repository (misal in-memory, REST client, Prisma). Penamaan `users.prisma.repository.ts` menegaskan bahwa implementasi tersebut mengandalkan Prisma; sementara nama generik `users.repository.ts` cocok untuk implementasi default.
- `users.container.ts` bertugas mengikat kontrak `USERS_REPOSITORY_TOKEN` ke implementasi yang dipilih. Anda cukup mengganti binding ini bila ingin repository lain tanpa mengubah service ataupun controller.
- Infrastruktur bersama (contoh `PrismaService`) ditaruh di `src/shared/infra/...` dan disediakan sebagai dependency tersendiri sehingga modul lain dapat menggunakannya dengan tetap memenuhi prinsip Single Responsibility & Dependency Inversion.
- Untuk menambahkan repository alternatif, buat file baru (contoh `users.in-memory.repository.ts`) yang mengimplementasikan `IUsersRepository`, lalu perbarui binding pada container modul.

Contoh integrasi S3 menggunakan DI:

```ts
// storage/StorageService.ts
import { injectable } from 'tsyringe';

@injectable()
export class StorageService {
  async upload(fileName: string, buffer: Buffer): Promise<string> {
    // Integrasi S3 (contoh sederhana)
    return `https://s3.example.com/${fileName}`;
  }
}

// modules/reports/reports.service.ts
import { inject, injectable } from 'tsyringe';
import { StorageService } from '@/storage/StorageService';

@injectable()
export class ReportsService {
  constructor(@inject(StorageService) private readonly storage: StorageService) {}

  async generateReport(payload: Buffer): Promise<string> {
    const fileName = `report-${Date.now()}.pdf`;
    return this.storage.upload(fileName, payload);
  }
}

// modules/reports/reports.service.spec.ts
import 'reflect-metadata';
import { container } from 'tsyringe';
import { ReportsService } from './reports.service';
import { StorageService } from '@/storage/StorageService';

describe('ReportsService', () => {
  it('mengunggah report ke storage', async () => {
    const uploadMock = jest.fn().mockResolvedValue('https://mock/report.pdf');
    container.register(StorageService, { useValue: { upload: uploadMock } });

    const service = container.resolve(ReportsService);
    const url = await service.generateReport(Buffer.from('dummy'));

    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(url).toBe('https://mock/report.pdf');
  });
});
```

---

## Struktur Direktori
```
src/
  config/            # Konfigurasi environment
  core/
    App.ts           # Lifecycle aplikasi
    http/
      createHttpServer.ts
      createMiddlewares.ts
      ExpressHttpServer.ts
      FastifyHttpServer.ts
    middleware/      # Handler umum (error, dll)
  modules/
    loadModules.ts   # Loader modul berdasarkan konfigurasi
    users/           # Contoh modul users
    whatsapp/        # Contoh modul whatsapp
  shared/
    utils/logger.ts  # Logger Pino
  main.ts            # Entry point
```

---

## Struktur Modul

Agar konsisten, setiap modul sebaiknya memuat berkas berikut:

- **`*.routes.ts`** – Mendefinisikan prefix modul serta daftar rute yang diekspos.
- **`*.controller.ts`** – Mengelola request/response dan memanggil service yang relevan.
- **`*.service.ts`** – Menampung logika bisnis utama modul.
- **`*.repository.ts` / `*.prisma.repository.ts`** – Layer akses data; bebas memilih penamaan sesuai backend yang digunakan.
- **`*.interface.ts`** – Deklarasi tipe data yang digunakan modul.
- **`*.service.spec.ts`** – Unit test service dengan contoh mocking dependency injection.
- **`*.container.ts`** – Titik registrasi dependency modul (binding interface ke implementasi).

> Gunakan `pnpm create:module` untuk menghasilkan kerangka modul baru, lalu daftar namanya pada `availableModules` dan `devModeModules` jika ingin langsung aktif saat development.

---

## Konfigurasi Lingkungan
Variabel utama didefinisikan di `src/config/index.ts` dan tervalidasi menggunakan Zod.

| Variabel         | Default       | Deskripsi                                         |
| ---------------- | ------------- | ------------------------------------------------- |
| `NODE_ENV`       | development   | Lingkungan aplikasi                               |
| `PORT`           | 3000          | Port aplikasi                                     |
| `HTTP_SERVER`    | express       | Provider HTTP (`express`/`fastify`)               |
| `DATABASE_URL`   | file:./dev.db | Connection string Prisma (SQLite default)         |
| `SOCKET_ENABLED` | false         | Aktifkan integrasi Socket.IO ketika diset `true`  |

Contoh `.env`:
```dotenv
NODE_ENV=development
PORT=3000
HTTP_SERVER=fastify
DATABASE_URL=file:./dev.db
SOCKET_ENABLED=false
```

File contoh tersedia di `.env.example`; salin ke `.env` lalu sesuaikan nilainya.

---

## Siklus Bootstrap
1. `main.ts` memanggil `createHttpServer` dengan logger.
2. Buat instance `App` (menerima server, port, logger).
3. `createGlobalMiddlewares` mengembalikan daftar middleware sesuai provider.
4. `loadConfiguredModules` memuat modul dari `devModeModules`.
5. `app.start()` mengaktifkan middleware, modul, sinyal shutdown, lalu listen.

---

## Middleware & Rate Limiter
- **Express**: Menggunakan `cors()` dan `rateLimit()` default global.
- **Fastify**: Registrasi plugin `@fastify/cors` dan `@fastify/rate-limit`.
- Middleware tambahan dapat diregister di `main.ts` melalui `app.registerMiddleware({...})`.
- Rate limit per modul dapat ditambahkan via `module.options.rateLimit` pada file route modul.
- **Menonaktifkan CORS**: Hapus middleware CORS pada array `middlewares` di `main.ts`.
- **Menonaktifkan Rate Limit**: Hapus middleware limiter dari `main.ts` dan hilangkan konfigurasi `options.rateLimit` pada modul.

Contoh rate limit per modul (`users.routes.ts`):
```ts
export default function createUsersRoutes(): ModuleBuildResult {
  return {
    routes,
    options: { rateLimit: { windowMs: 60_000, max: 100 } },
  };
}
```

---

## Socket Opsional
- **Aktifkan** dengan menyetel `SOCKET_ENABLED=true`. Saat aktif, `main.ts` mendaftarkan adapter Socket.IO yang beroperasi di atas server HTTP yang sama.
- **Gunakan di modul** melalui DI: token `SOCKET_IO_SERVER_TOKEN` mengekspos instance `SocketIoServer`. Injeksi via constructor:
  ```ts
  import { inject, injectable } from 'tsyringe';
  import type { SocketIoServer } from '@/core/socket/socketIoAdapter';
  import { SOCKET_IO_SERVER_TOKEN } from '@/core/socket/socketIoAdapter';

  @injectable()
  export class NotificationsService {
    constructor(
      @inject(SOCKET_IO_SERVER_TOKEN)
      private readonly io: SocketIoServer,
    ) {}

    broadcast(message: string) {
      this.io.emit('notifications:new', { message });
    }
  }
  ```
- **Nonaktifkan** dengan membiarkan `SOCKET_ENABLED=false` (default) atau menghapus variabel tersebut. Adapter tidak akan didaftarkan sehingga modul tetap berjalan tanpa dependensi socket.

---

## Fungsi Penting
| Lokasi                                   | Fungsi                                                         |
|-----------------------------------------|----------------------------------------------------------------|
| `src/main.ts`                            | Entry point aplikasi                                            |
| `App.registerMiddleware`                | Menambahkan middleware global                                  |
| `App.registerModule`                    | Menambahkan modul (prefix + routes)                            |
| `App.start`                             | Menjalankan server dan mengikat shutdown hook                   |
| `createHttpServer(provider, logger)`    | Membuat instance server Express/Fastify                        |
| `createGlobalMiddlewares(provider)`     | Menghasilkan array middleware untuk provider tertentu          |
| `loadConfiguredModules(logger)`         | Memuat modul yang terdaftar di `deployment.config.ts`          |
| `PrismaUsersRepository.findAll`         | Contoh repository berbasis Prisma                              |
| `users.container.ts`                    | Mengikat kontrak `USERS_REPOSITORY_TOKEN` ke implementasi      |
| `Logger.info/error`                     | Helper logging dengan Pino                                     |

---

## Penggunaan Harian
### Pengembangan
```bash
pnpm dev
```
- Jalankan server dengan watch mode (menggunakan `tsx --watch`).
- Endpoint health: `GET /health`.

### Pengujian
```bash
pnpm test
```
- Menjalankan Jest unit test (contoh: service users & whatsapp).

### Build Produksi
```bash
pnpm build
```
- Menghasilkan bundel di `dist/` menggunakan `tsup`.
- Jalankan hasil build: `pnpm start`.

---

## Automasi Modul
```bash
pnpm create:module
```
- Wizard interaktif akan membuat controller, service, repository, route, dan test.
- Setelah selesai, tambahkan modul ke `availableModules` dan `devModeModules` (jika perlu).

---

## Deployment
### Docker
1. Build artefak deploy: `pnpm build:deploys`
2. Masuk ke salah satu target: `cd deploys/main-api`
3. Build image: `docker build -t main-api .`
4. Jalankan container: `docker run --env-file .env.production -p 3000:3000 main-api`

Tips:
- Pastikan `.env.production` berisi konfigurasi yang benar.
- Gunakan registry privat bila dibutuhkan, contoh `docker push ghcr.io/<org>/main-api:tag`.

### PM2
1. Build aplikasi: `pnpm build`
2. Jalankan menggunakan PM2:
   ```bash
   pm2 start dist/main.js --name api-template
   pm2 logs api-template
   pm2 save
   ```
3. Untuk restart otomatis saat update:
   ```bash
   pm2 restart api-template
   ```

---

## FAQ
**Bisakah menambahkan basis data?**
Ya. Contoh modul `users` sudah menggunakan Prisma melalui `PrismaUsersRepository`. Jika ingin backend lain (REST, in-memory untuk test, ORM berbeda), buat implementasi baru untuk `IUsersRepository` dan ubah binding di `users.container.ts`.

**Bagaimana menambahkan middleware custom?**
Di `main.ts`, panggil `app.registerMiddleware({ express: middlewareExpress })` atau `app.registerMiddleware({ fastify: middlewareFastify })` sesuai provider.

**Bisakah menjalankan Express & Fastify bersamaan?**
Tidak secara simultan. Pilih satu provider melalui variabel `HTTP_SERVER`.

---

## Kontribusi
- Fork repo, buat branch fitur, lalu pull request.
- Sertakan deskripsi perubahan dan tambahkan test bila relevan.
- Gunakan format commit konvensional bila memungkinkan.

---

## Lisensi
Dirilis di bawah lisensi [MIT](LICENSE).
