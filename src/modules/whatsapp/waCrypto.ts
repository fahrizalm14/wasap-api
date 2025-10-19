import crypto from 'crypto';
export type EncryptedPayload = {
  alg: 'AES-256-GCM';
  kver: number;
  salt: string; // base64
  nonce: string; // base64 (12 bytes)
  ct: string; // base64
  tag: string; // base64 (16 bytes)
};
export function isEncryptedPayload(x: unknown): x is EncryptedPayload {
  const v = x as Record<string, unknown> | null;
  return (
    !!v &&
    v['alg'] === 'AES-256-GCM' &&
    typeof v['kver'] === 'number' &&
    typeof v['salt'] === 'string' &&
    typeof v['nonce'] === 'string' &&
    typeof v['ct'] === 'string' &&
    typeof v['tag'] === 'string'
  );
}
export function makeStableSalt(size = 32): Buffer {
  return crypto.randomBytes(size);
}
export function deriveKey(params: { apiKey: string; salt: Buffer }): Buffer {
  const { apiKey, salt } = params;
  // HKDF-SHA256 derive 32 bytes key
  return Buffer.from(
    crypto.hkdfSync(
      'sha256',
      Buffer.from(apiKey, 'utf8'),
      salt,
      Buffer.from('wa-creds'),
      32,
    ),
  );
}
export function encryptJson(
  value: unknown,
  params: { apiKey: string; kver: number; salt?: Buffer },
): EncryptedPayload {
  const { apiKey, kver } = params;
  const salt = params.salt ?? makeStableSalt();
  const key = deriveKey({ apiKey, salt });
  const nonce = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
  const plaintext = Buffer.from(JSON.stringify(value), 'utf8');
  const ct = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    alg: 'AES-256-GCM',
    kver,
    salt: salt.toString('base64'),
    nonce: nonce.toString('base64'),
    ct: ct.toString('base64'),
    tag: tag.toString('base64'),
  };
}
export function decryptJson(
  payload: EncryptedPayload,
  params: { apiKey: string },
): unknown {
  const { apiKey } = params;
  const salt = Buffer.from(payload.salt, 'base64');
  const key = deriveKey({ apiKey, salt });
  const nonce = Buffer.from(payload.nonce, 'base64');
  const ct = Buffer.from(payload.ct, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return JSON.parse(pt.toString('utf8'));
}
