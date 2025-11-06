# Dokumentasi API - Wasap API

Dokumentasi singkat untuk integrasi WhatsApp API menggunakan TypeScript.

## Base URL
```
http://localhost:3000
```

## Daftar Isi
- [Generate API Key](#generate-api-key)
- [Meminta QR Code Sesi](#meminta-qr-code-sesi)
- [Logout Sesi](#logout-sesi)
- [Status Koneksi Sesi](#status-koneksi-sesi)
- [Streaming SSE](#streaming-sse)

---

## Generate API Key

**Endpoint:** `POST /api/v1/api-keys`

Membuat API key baru untuk mengakses fitur WhatsApp.

### Request
```typescript
// Headers
{
  'x-secret-key': 'your-secret-key'  // Required
}

// Body (optional)
{
  label?: string
}
```

### Response
```typescript
{
  status: 'success',
  data: {
    key: string,
    label: string | null,
    isActive: boolean,
    createdAt: string,
    updatedAt: string
  }
}
```

### Contoh TypeScript
```typescript
async function generateApiKey(label?: string) {
  const response = await fetch('http://localhost:3000/api/v1/api-keys', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-secret-key': process.env.SECRET_KEY!
    },
    body: JSON.stringify({ label })
  });

  return await response.json();
}

// Penggunaan
const { data } = await generateApiKey('Marketing Bot');
console.log('API Key:', data.key);
```

---

## Meminta QR Code Sesi

**Endpoint:** `POST /api/v1/whatsapp/sessions/{apiKey}/qr`

Menginisialisasi sesi WhatsApp dan mendapatkan QR code untuk di-scan.

### Request
```typescript
// Body (optional)
{
  displayName?: string
}
```

### Response
```typescript
type SessionStatus = 'CONNECTED' | 'DISCONNECTED' | 'QR' | 'LOGGED_OUT' | 'ERROR';

{
  status: 'success',
  data: {
    apiKey: string,
    status: SessionStatus,
    qr?: string  // Tersedia jika status = 'QR'
  }
}
```

### Contoh TypeScript
```typescript
async function requestQrCode(apiKey: string, displayName?: string) {
  const response = await fetch(
    `http://localhost:3000/api/v1/whatsapp/sessions/${apiKey}/qr`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName })
    }
  );

  return await response.json();
}

// Penggunaan
const { data } = await requestQrCode('your-api-key', 'Support Bot');
if (data.qr) {
  console.log('QR Code:', data.qr);
}
```

---

## Logout Sesi

**Endpoint:** `POST /api/v1/whatsapp/sessions/{apiKey}/logout`

Mengakhiri sesi WhatsApp dan membersihkan kredensial.

### Response
```typescript
{
  status: 'success',
  message: 'Logged out'
}
```

### Contoh TypeScript
```typescript
async function logoutSession(apiKey: string) {
  const response = await fetch(
    `http://localhost:3000/api/v1/whatsapp/sessions/${apiKey}/logout`,
    { method: 'POST' }
  );

  return await response.json();
}

// Penggunaan
const result = await logoutSession('your-api-key');
console.log(result.message);
```

---

## Status Koneksi Sesi

**Endpoint:** `GET /api/v1/whatsapp/sessions/{apiKey}/status`

Memeriksa status koneksi sesi WhatsApp.

### Response
```typescript
type SessionStatus = 'CONNECTED' | 'DISCONNECTED' | 'QR' | 'LOGGED_OUT' | 'ERROR';

{
  status: 'success',
  data: {
    apiKey: string,
    status: SessionStatus,
    connected: boolean
  }
}
```

### Contoh TypeScript
```typescript
async function getSessionStatus(apiKey: string) {
  const response = await fetch(
    `http://localhost:3000/api/v1/whatsapp/sessions/${apiKey}/status`
  );

  return await response.json();
}

// Penggunaan
const { data } = await getSessionStatus('your-api-key');
console.log('Connected:', data.connected);
console.log('Status:', data.status);
```

---

## Streaming SSE

**Endpoint:** `GET /api/v1/whatsapp/sessions/{apiKey}/stream`

Monitoring real-time status dan QR code menggunakan Server-Sent Events.

### Event Types
- `status` - Status sesi berubah
- `qr` - QR code baru tersedia
- `connected` - Sesi berhasil terhubung
- `error` - Terjadi error

### Contoh TypeScript (EventSource)
```typescript
type SessionStatus = 'CONNECTED' | 'DISCONNECTED' | 'QR' | 'LOGGED_OUT' | 'ERROR';

function setupSSE(apiKey: string) {
  const eventSource = new EventSource(
    `http://localhost:3000/api/v1/whatsapp/sessions/${apiKey}/stream`
  );

  eventSource.addEventListener('status', (e: MessageEvent) => {
    const { status } = JSON.parse(e.data);
    console.log('Status:', status);
  });

  eventSource.addEventListener('qr', (e: MessageEvent) => {
    const { qr } = JSON.parse(e.data);
    console.log('QR Code:', qr);
    // Tampilkan QR code dengan library qrcode.js
  });

  eventSource.addEventListener('connected', (e: MessageEvent) => {
    const { message } = JSON.parse(e.data);
    console.log('✓ Connected:', message);
    eventSource.close();
  });

  eventSource.onerror = () => {
    console.error('SSE error');
    eventSource.close();
  };

  return eventSource;
}

// Penggunaan
const es = setupSSE('your-api-key');
```

### Contoh React Component
```typescript
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';

function WhatsAppMonitor({ apiKey }: { apiKey: string }) {
  const [status, setStatus] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');

  useEffect(() => {
    const es = new EventSource(
      `http://localhost:3000/api/v1/whatsapp/sessions/${apiKey}/stream`
    );

    es.addEventListener('status', (e: MessageEvent) => {
      setStatus(JSON.parse(e.data).status);
    });

    es.addEventListener('qr', async (e: MessageEvent) => {
      const { qr } = JSON.parse(e.data);
      const url = await QRCode.toDataURL(qr);
      setQrUrl(url);
    });

    es.addEventListener('connected', () => {
      setStatus('CONNECTED');
      es.close();
    });

    return () => es.close();
  }, [apiKey]);

  return (
    <div>
      <h2>Status: {status}</h2>
      {qrUrl && <img src={qrUrl} alt="QR Code" />}
    </div>
  );
}
```

---

## Quick Start

```typescript
// 1. Generate API Key
const { data: apiKey } = await generateApiKey('My Bot');

// 2. Setup SSE untuk monitoring
const es = setupSSE(apiKey.key);

// 3. Request QR Code
await requestQrCode(apiKey.key, 'Support Bot');

// 4. Scan QR dengan WhatsApp (wait for 'connected' event)

// 5. Cek status
const { data: status } = await getSessionStatus(apiKey.key);
if (status.connected) {
  console.log('Ready to send messages!');
}

// 6. Logout ketika selesai
await logoutSession(apiKey.key);
```
