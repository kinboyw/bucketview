import { safeStorage } from 'electron';

const PREFIX = 'enc:v1:';

export function isEncryptedSecret(value?: string | null): boolean {
  return typeof value === 'string' && value.startsWith(PREFIX);
}

export function encryptSecret(plain?: string | null): string {
  if (!plain) return plain || '';
  if (isEncryptedSecret(plain)) return plain;
  try {
    if (!safeStorage.isEncryptionAvailable()) return plain;
    const encrypted = safeStorage.encryptString(plain);
    return PREFIX + encrypted.toString('base64');
  } catch {
    return plain;
  }
}

export function decryptSecret(value?: string | null): string {
  if (!value) return value || '';
  if (!isEncryptedSecret(value)) return value;
  try {
    if (!safeStorage.isEncryptionAvailable()) return value;
    const raw = Buffer.from(value.slice(PREFIX.length), 'base64');
    return safeStorage.decryptString(raw);
  } catch {
    return value;
  }
}

export function encryptConnectionSecrets<T extends { accessKeySecret?: string }>(connection: T): T {
  return {
    ...connection,
    accessKeySecret: encryptSecret(connection.accessKeySecret || ''),
  };
}

export function decryptConnectionSecrets<T extends { accessKeySecret?: string }>(connection: T): T {
  return {
    ...connection,
    accessKeySecret: decryptSecret(connection.accessKeySecret || ''),
  };
}
