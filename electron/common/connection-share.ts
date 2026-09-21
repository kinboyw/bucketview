import nodeCrypto from 'node:crypto';
import type { Connection } from '../preload/types';
import { decryptSecret } from './secret-crypto';

const SHARE_PREFIX = 'bucketview://connection-share/';
const OPEN_PREFIX = 'bucketview://open/';
const SHARE_VERSION = 'v1';
const SHARE_AAD = Buffer.from('bucketview:connection-share:v1', 'utf8');
const OPEN_AAD = Buffer.from('bucketview:open:v1', 'utf8');

export interface BucketViewOpenTarget {
  bucket: string;
  pathPrefix?: string;
  /** An optional object to preview after its parent directory loads. */
  objectName?: string;
}

export interface BucketViewTemporaryAccess {
  connection: Connection;
  target: BucketViewOpenTarget;
  expiresAt?: number;
}

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

const validateOpenTarget = (value: unknown): value is BucketViewOpenTarget => {
  if (!value || typeof value !== 'object') return false;
  const target = value as Partial<BucketViewOpenTarget>;
  return isString(target.bucket)
    && target.bucket.trim().length > 0
    && (target.pathPrefix === undefined || isString(target.pathPrefix))
    && (target.objectName === undefined || isString(target.objectName));
};

const validateExpiry = (expiresAt: unknown): expiresAt is number =>
  Number.isFinite(expiresAt) && Number(expiresAt) > 0;

const encryptPayload = (prefix: string, aad: Buffer, payload: unknown): string => {
  const key = nodeCrypto.randomBytes(32);
  const iv = nodeCrypto.randomBytes(12);
  const cipher = nodeCrypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${prefix}${SHARE_VERSION}.${encode(key)}.${encode(iv)}.${encode(tag)}.${encode(encrypted)}`;
};

const decryptPayload = (input: string, prefix: string, aad: Buffer): unknown => {
  const value = String(input || '').trim();
  if (!value.startsWith(prefix)) throw new Error('prefix mismatch');
  const parts = value.slice(prefix.length).split('.');
  if (parts.length !== 5 || parts[0] !== SHARE_VERSION) throw new Error('invalid version');
  const key = decode(parts[1]);
  const iv = decode(parts[2]);
  const tag = decode(parts[3]);
  const encrypted = decode(parts[4]);
  if (key.length !== 32 || iv.length !== 12 || tag.length !== 16 || encrypted.length === 0) {
    throw new Error('invalid encryption data');
  }
  const decipher = nodeCrypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plaintext);
};

/**
 * Create an opaque share address. Possession of the complete address grants
 * access to the credentials, so it must be handled like a password.
 */
export function createConnectionShare(connection: Connection, readonly = true, expiresAt?: number): string {
  if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
    throw new Error('分享有效期必须是未来时间');
  }
  return encryptPayload(SHARE_PREFIX, SHARE_AAD, {
    version: 1,
    readonly,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    connection: {
      ...connection,
      accessKeySecret: decryptSecret(connection.accessKeySecret || ''),
      readonly,
    },
  });
}

export function parseConnectionShare(input: string): { success: boolean; connection?: Connection; expiresAt?: number; message?: string } {
  try {
    const value = String(input || '').trim();
    if (!value.startsWith(SHARE_PREFIX)) {
      return { success: false, message: '不是有效的 BucketView 连接分享地址' };
    }
    const payload = decryptPayload(value, SHARE_PREFIX, SHARE_AAD) as { version?: number; readonly?: boolean; expiresAt?: number; connection?: unknown };
    if (payload.version !== 1 || typeof payload.readonly !== 'boolean' || (payload.expiresAt !== undefined && !validateExpiry(payload.expiresAt)) || !validateConnection(payload.connection)) {
      return { success: false, message: '分享地址内容无效' };
    }
    if (payload.expiresAt !== undefined && payload.expiresAt <= Date.now()) {
      return { success: false, message: `分享地址已于 ${new Date(payload.expiresAt).toLocaleString()} 过期` };
    }

    return {
      success: true,
      ...(payload.expiresAt === undefined ? {} : { expiresAt: payload.expiresAt }),
      connection: {
        ...payload.connection,
        readonly: payload.readonly,
      },
    };
  } catch {
    return { success: false, message: '分享地址校验失败，可能已损坏或被修改' };
  }
}

/**
 * Create an ephemeral, readonly access URI for a bucket, directory, or object.
 * The URI holds credentials and must be treated as a password.
 */
export function createTemporaryAccess(
  connection: Connection,
  target: BucketViewOpenTarget,
  expiresAt?: number,
): string {
  if (!validateOpenTarget(target)) throw new Error('访问目标无效');
  if (expiresAt !== undefined && (!Number.isFinite(expiresAt) || expiresAt <= Date.now())) {
    throw new Error('访问有效期必须是未来时间');
  }
  return encryptPayload(OPEN_PREFIX, OPEN_AAD, {
    version: 1,
    readonly: true,
    temporary: true,
    ...(expiresAt === undefined ? {} : { expiresAt }),
    connection: {
      ...connection,
      accessKeySecret: decryptSecret(connection.accessKeySecret || ''),
      readonly: true,
    },
    target: {
      bucket: target.bucket.trim(),
      ...(target.pathPrefix ? { pathPrefix: target.pathPrefix } : {}),
      ...(target.objectName ? { objectName: target.objectName } : {}),
    },
  });
}

export function parseTemporaryAccess(input: string): { success: boolean; access?: BucketViewTemporaryAccess; message?: string } {
  try {
    const value = String(input || '').trim();
    if (!value.startsWith(OPEN_PREFIX)) {
      return { success: false, message: '不是有效的 BucketView 临时访问地址' };
    }
    const payload = decryptPayload(value, OPEN_PREFIX, OPEN_AAD) as {
      version?: number;
      readonly?: boolean;
      temporary?: boolean;
      expiresAt?: number;
      connection?: unknown;
      target?: unknown;
    };
    if (payload.version !== 1 || payload.readonly !== true || payload.temporary !== true
      || (payload.expiresAt !== undefined && !validateExpiry(payload.expiresAt))
      || !validateConnection(payload.connection) || !validateOpenTarget(payload.target)) {
      return { success: false, message: '临时访问地址内容无效' };
    }
    if (payload.expiresAt !== undefined && payload.expiresAt <= Date.now()) {
      return { success: false, message: `临时访问地址已于 ${new Date(payload.expiresAt).toLocaleString()} 过期` };
    }
    return {
      success: true,
      access: {
        connection: { ...payload.connection, readonly: true },
        target: {
          bucket: payload.target.bucket.trim(),
          ...(payload.target.pathPrefix ? { pathPrefix: payload.target.pathPrefix } : {}),
          ...(payload.target.objectName ? { objectName: payload.target.objectName } : {}),
        },
        ...(payload.expiresAt === undefined ? {} : { expiresAt: payload.expiresAt }),
      },
    };
  } catch {
    return { success: false, message: '临时访问地址校验失败，可能已损坏或被修改' };
  }
}
