# Dokumentasi WhatsApp Service

Dokumentasi ini menjelaskan alur utama modul WhatsApp, cara pemakaiannya, serta syarat dan pertimbangan keamanan.

## 1. Ringkasan Fungsi Utama

- **WhatsappService**: Menyediakan lifecycle management sesi WhatsApp dengan Baileys, termasuk inisialisasi socket, penyimpanan kredensial terenkripsi, pemantauan status koneksi, dan pengiriman event SSE ke client.
- **WhatsappController / Routes**: Memetakan endpoint HTTP (Express/Fastify) ke metode service untuk operasi seperti list sesi, request QR, logout, status koneksi, dan pengiriman pesan teks.
- **PrismaWhatsappRepository**: Abstraksi penyimpanan sesi, creds, dan key store di database Prisma. Menjaga agar semua data sensitif terenkripsi sebelum disimpan.
- **PrismaWhatsappLockRepository**: Mengelola lock sesi per `apiKey` agar hanya satu instance yang membangun koneksi Baileys sekaligus.
- **WhatsappSseService**: Menyediakan streaming SSE untuk mengirimkan status/QR real-time ke dashboard atau client lain.
- **waCrypto**: Helper enkripsi AES-256-GCM dengan HKDF-SHA256 untuk menjaga kredensial WhatsApp tetap aman saat disimpan atau ditransfer.

## 2. Alur Kerja Utama

1. **Inisialisasi**: Service menyiapkan map global `ManagedSession` agar bisa dibagikan antar instance. Repository dan lock diinjeksi via tsyringe.
2. **Warm up**: `warmSessions()` membaca sesi yang sebelumnya `CONNECTED` atau `DISCONNECTED`, memastikan kredensial ada, lalu memanggil `initializeSocket()` secara best-effort untuk menjaga koneksi tetap hidup.
3. **Request QR / Status**:
   - `getQr(apiKey, displayName)` memastikan API key aktif, memastikan sesi ada/terupdate, lalu memanggil `initializeSocket`.
   - Jika sesi `LOGGED_OUT`, QR tidak dibuat; sebaliknya, event `connection.update` dari Baileys akan mengupdate QR/status dan SSE.
4. **Pengelolaan Socket**:
   - `initializeSocket` meminta lock via `PrismaWhatsappLockRepository`, membangun socket dengan Baileys (`makeWASocket`), dan mengikat event `creds.update` + `connection.update`.
   - Update status tersimpan di database dan didistribusikan ke SSE, termasuk menyimpan QR terbaru + handling reconnect/backoff.
5. **Penggunaan API**:
   - Endpoint `/message/:apiKey/send` melakukan normalisasi MSISDN, validasi sederhana, lalu memanggil `sendText`.
   - `sendText` memastikan API key aktif, sesi tidak `LOGGED_OUT`, memperoleh lock (atau mendeteksi instance lain), menunggu koneksi, lalu memanggil `socket.sendMessage`.
6. **Locking & Multi-instance**:
   - Lock disimpan di tabel `whatsappSessionLock` dengan TTL; kunci bisa diperpanjang (`touch`), dilepas (`release`), atau diganti bila kadaluarsa.
   - Saat lock ditahan oleh instance lain, permintaan pengiriman pesan mengembalikan error 423 dengan pesan untuk sticky routing.
7. **Pembersihan & Logout**:
   - `logout(apiKey)` memanggil Baileys logout, menutup websocket, membersihkan data kredensial/key, melepaskan lock, dan mengirim update status SSE.

## 3. Cara Penggunaan

1. **List sesi**: `GET /sessions` → mengembalikan semua sesi beserta statusnya.
2. **Stream status/QR**: `GET /sessions/:apiKey/stream` → SSE menyiarkan status/QR terbaru ke client (supports Express/Fastify).
3. **Minta QR**: `POST /sessions/:apiKey/qr` (opsional `displayName`) → memicu Baileys membuat QR jika belum terkoneksi.
4. **Ambil kredensial**: `GET /sessions/:apiKey/credentials` → mengekspor dump `creds` + `keys`.
5. **Logout sesi**: `POST /sessions/:apiKey/logout`.
6. **Status koneksi**: `GET /sessions/:apiKey/status`.
7. **Kirim pesan**: `POST /message/:apiKey/send` dengan body `{ "to": "628123...", "text": "..." }`. Sistem otomatis menormalisasi dan memvalidasi nomor sebelum mengirim.

## 4. Syarat dan Prasyarat

- **API Key Aktif**: Semua operasi memerlukan API key yang valid dan aktif (dicek lewat `ApiKeysService.assertActive`).
- **Database Prisma**: Tabel `whatsappSession`, `whatsappCredential`, dan `whatsappSessionLock` harus tersedia sesuai schema.
- **Konektivitas ke WhatsApp**: Service harus bisa menjangkau server WhatsApp via jaringan (menggunakan library Baileys).
- **Env & Config**: Pastikan `NODE_ENV`, logger, dan konfigurasi SSE (CORS) disesuaikan dengan lingkungan produksi/dev.

## 5. Keamanan

1. **Enkripsi Kredensial**: Semua credentials dan key store disimpan dalam bentuk terenkripsi (AES-256-GCM) menggunakan `waCrypto`. Salt/nonce disimpan dalam base64, key diturunkan lewat HKDF-SHA256.
2. **Reviver Buffer**: Saat membaca kembali kredensial, `BufferJSON.reviver` memastikan buffer yang diserialisasi dapat direkonstruksi untuk digunakan Baileys.
3. **Locking Sesi**: Hanya satu instance (ditandai `hostname-pid`) yang memegang lock per `apiKey`. Lock memiliki TTL dan bisa digantikan saat kadaluarsa atau dilepas.
4. **Validasi API**: Normalisasi dan validasi MSISDN `"to"` memastikan hanya nomor valid (8–15 digit) yang diteruskan ke WhatsApp.
5. **Error Handling**: Jika sesi tidak terkoneksi atau dicadangkan oleh instance lain, API mengembalikan kode 503 atau 423 agar klien tahu kapan harus restart/melakukan sticky routing.
6. **SSE Heartbeat**: `WhatsappSseService` mengirimkan heartbeat setiap 25 detik agar proxy tidak menutup koneksi SSE.

## 6. Catatan Tambahan

- Pastikan setiap perubahan state (QR/status) dipublikasikan via SSE `/stream` agar dashboard tetap sinkron.
- Saat melakukan pengiriman pesan di lingkungan multi-instance, pastikan ada mekanisme `sticky routing` supaya permintaan selalu diarahkan ke instance yang memegang lock.
- Jika terjadi logging out oleh Baileys (`DisconnectReason.loggedOut`), data kredensial otomatis dihapus dari database untuk mencegah reuse.
