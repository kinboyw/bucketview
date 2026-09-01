import nodeCrypto from 'node:crypto';
import type { Connection } from '../preload/types';
import { decryptSecret } from './secret-crypto';

const SHARE_PREFIX = 'bucketview://connection-share/';
const SHARE_VERSION = 'v1';
const SHARE_AAD = Buffer.from('bucketview:connection-share:v1', 'utf8');

const encode = (value: Buffer): string => value.toString('base64url');
const decode = (value: string): Buffer => Buffer.from(value, 'base64url');

const isString = (value: unknown): value is string => typeof value === 'string';
const validateConnection = (value: unknown): value is Connection => {
  if (!value || typeof value !== 'object') return false;
  const connection = value as Partial<Connection>;
  return isString(connection.id)
    && isString(connection.endpoint)
    && isString(connection.accessKeyId)
    && isString(connection.accessKeySecret)
    && isString(connection.region)
    && (connection.bucket === undefined || isString(connection.bucket))
    && (connection.pathPrefix === undefined || isString(connection.pathPrefix));
};

/**
 * Create an opaque share address. Possession of the complete address grants
 * access to the credentials, so it must be handled like a password.
 */
export function createConnectionShare(connection: Connection, readonly = true): string {
  const key = nodeCrypto.randomBytes(32);
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(SHARE_AAD);

  const payload = JSON.stringify({
    version: 1,
    readonly,
    connection: {
      ...connection,
      accessKeySecret: decryptSecret(connection.accessKeySecret || ''),
      readonly,
    },
  });
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${SHARE_PREFIX}${SHARE_VERSION}.${encode(key)}.${encode(iv)}.${encode(tag)}.${encode(encrypted)}`;
}

export function parseConnectionShare(input: string): { success: boolean; connection?: Connection; message?: string } {
  try {
    const value = String(input || '').trim();
    if (!value.startsWith(SHARE_PREFIX)) {
      return { success: false, message: '不是有效的 BucketView 连接分享地址' };
    }

    const parts = value.slice(SHARE_PREFIX.length).split('.');
    if (parts.length !== 5 || parts[0] !== SHARE_VERSION) {
      return { success: false, message: '分享地址版本不受支持或格式不完整' };
    }

    const key = decode(parts[1]);
    const iv = decode(parts[2]);
    const tag = decode(parts[3]);
    const encrypted = decode(parts[4]);
    if (key.length !== 32 || iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
      return { success: false, message: '分享地址内容不完整' };
    }

    const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(SHARE_AAD);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    const payload = JSON.parse(plaintext) as { version?: number; readonly?: boolean; connection?: unknown };
    if (payload.version !== 1 || typeof payload.readonly !== 'boolean' || !validateConnection(payload.connection)) {
      return { success: false, message: '分享地址内容无效' };
    }

    return {
      success: true,
      connection: {
        ...payload.connection,
        readonly: payload.readonly,
      },
    };
  } catch {
    return { success: false, message: '分享地址校验失败，可能已损坏或被修改' };
  }
}
