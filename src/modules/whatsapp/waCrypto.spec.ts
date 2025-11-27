import {
  isEncryptedPayload,
  makeStableSalt,
  deriveKey,
  encryptJson,
  decryptJson,
} from './waCrypto';

describe('waCrypto', () => {
  const apiKey = 'test-api-key-123';
  const kver = 1;

  test('isEncryptedPayload identifies valid shape', () => {
    const payload = encryptJson({ a: 1 }, { apiKey, kver });
    expect(isEncryptedPayload(payload)).toBe(true);

    // ubah salah satu field agar type guard tidak terpenuhi
    const invalid: any = { ...payload, kver: '1' };
    expect(isEncryptedPayload(invalid)).toBe(false);
  });

  test('makeStableSalt returns requested size', () => {
    const s16 = makeStableSalt(16);
    const s32 = makeStableSalt(32);
    expect(s16).toBeInstanceOf(Buffer);
    expect(s32).toBeInstanceOf(Buffer);
    expect(s16.length).toBe(16);
    expect(s32.length).toBe(32);
  });

  test('deriveKey returns 32-byte key and is deterministic for same inputs', () => {
    const salt = Buffer.from('a'.repeat(32));
    const k1 = deriveKey({ apiKey, salt });
    const k2 = deriveKey({ apiKey, salt });
    expect(k1.equals(k2)).toBe(true);
    expect(k1.length).toBe(32);
  });

  test('encryptJson then decryptJson round-trips the value', () => {
    const obj = { a: 1, b: 'two', arr: [3, true], nested: { x: null } };
    const payload = encryptJson(obj, { apiKey, kver });
    expect(isEncryptedPayload(payload)).toBe(true);
    const out = decryptJson(payload, { apiKey });
    expect(out).toEqual(obj);
  });

  test('encryption uses provided salt for determinism of key (but nonce randomizes ct)', () => {
    const salt = Buffer.alloc(32, 7);
    const obj = { msg: 'hello' };
    const p1 = encryptJson(obj, { apiKey, kver, salt });
    const p2 = encryptJson(obj, { apiKey, kver, salt });
    // Salt sama mengarah pada kunci turunan yang identik, meski nonce berbeda
    expect(p1.salt).toBe(p2.salt);
    // Nonce seharusnya berbeda agar ciphertext tetap unique
    expect(p1.nonce).not.toBe(p2.nonce);
    // Keduanya tetap bisa didekripsi dengan benar
    expect(decryptJson(p1, { apiKey })).toEqual(obj);
    expect(decryptJson(p2, { apiKey })).toEqual(obj);
  });

  test('decryptJson throws on wrong apiKey (auth tag mismatch)', () => {
    const obj = { secure: true };
    const payload = encryptJson(obj, { apiKey, kver });
    expect(() => decryptJson(payload, { apiKey: 'wrong-key' })).toThrow();
  });
});
