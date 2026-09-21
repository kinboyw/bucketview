const CONNECTION_SHARE_PREFIX = 'bucketview://connection-share/';
const TEMPORARY_OPEN_PREFIX = 'bucketview://open/';
const VERSION = 'v1';
const encoder = new TextEncoder();

const toBase64Url = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const normalizePath = (value) => String(value || '')
  .replace(/\\/g, '/')
  .split('/')
  .filter(Boolean)
  .join('/');

const validateConnection = (connection) => {
  const required = ['id', 'endpoint', 'accessKeyId', 'accessKeySecret', 'region'];
  if (!connection || typeof connection !== 'object') throw new TypeError('connection is required');
  for (const key of required) {
    if (typeof connection[key] !== 'string') throw new TypeError(`connection.${key} must be a string`);
  }
};

const resolveExpiry = (options = {}) => {
  if (options.expiresAt !== undefined) {
    const value = options.expiresAt instanceof Date ? options.expiresAt.getTime() : Number(options.expiresAt);
    if (!Number.isFinite(value) || value <= Date.now()) throw new RangeError('expiresAt must be a future time');
    return value;
  }
  if (options.expiresInMs !== undefined) {
    const value = Number(options.expiresInMs);
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('expiresInMs must be greater than zero');
    return Date.now() + value;
  }
  if (options.expiresInSeconds !== undefined) {
    const value = Number(options.expiresInSeconds);
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('expiresInSeconds must be greater than zero');
    return Date.now() + value * 1000;
  }
  return undefined;
};

const encryptUri = async (prefix, aad, payload) => {
  if (!globalThis.crypto?.subtle || !globalThis.crypto?.getRandomValues) {
    throw new Error('Web Crypto API is required to create a BucketView URI');
  }
  const keyBytes = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'AES-GCM' }, false, ['encrypt']);
  const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt({
    name: 'AES-GCM',
    iv,
    additionalData: encoder.encode(aad),
    tagLength: 128,
  }, key, encoder.encode(JSON.stringify(payload))));
  const tag = encryptedWithTag.slice(-16);
  const ciphertext = encryptedWithTag.slice(0, -16);
  return `${prefix}${VERSION}.${toBase64Url(keyBytes)}.${toBase64Url(iv)}.${toBase64Url(tag)}.${toBase64Url(ciphertext)}`;
};

const readonlyConnection = (connection) => ({
  ...connection,
  readonly: true,
});

/**
 * Browser SDK for BucketView deep links.
 * A generated URI includes credentials. Treat it as a password and use an
 * expiry whenever the link can leave a trusted browser session.
 */
export const BucketView = {
  async createReadonlyConnectionUri(connection, options = {}) {
    validateConnection(connection);
    const expiresAt = resolveExpiry(options);
    return encryptUri(CONNECTION_SHARE_PREFIX, 'bucketview:connection-share:v1', {
      version: 1,
      readonly: true,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      connection: readonlyConnection(connection),
    });
  },

  async createDirectoryUri(connection, target, options = {}) {
    validateConnection(connection);
    const bucket = String(target?.bucket || '').trim();
    if (!bucket) throw new TypeError('target.bucket is required');
    const pathPrefix = normalizePath(target?.pathPrefix);
    const expiresAt = resolveExpiry(options);
    return encryptUri(TEMPORARY_OPEN_PREFIX, 'bucketview:open:v1', {
      version: 1,
      readonly: true,
      temporary: true,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      connection: readonlyConnection(connection),
      target: {
        bucket,
        ...(pathPrefix ? { pathPrefix } : {}),
      },
    });
  },

  async createFileUri(connection, target, options = {}) {
    validateConnection(connection);
    const bucket = String(target?.bucket || '').trim();
    const objectName = normalizePath(target?.objectName);
    if (!bucket) throw new TypeError('target.bucket is required');
    if (!objectName) throw new TypeError('target.objectName is required');
    const explicitPrefix = normalizePath(target?.pathPrefix);
    const parentPrefix = objectName.includes('/') ? objectName.slice(0, objectName.lastIndexOf('/')) : '';
    const pathPrefix = explicitPrefix || parentPrefix;
    const expiresAt = resolveExpiry(options);
    return encryptUri(TEMPORARY_OPEN_PREFIX, 'bucketview:open:v1', {
      version: 1,
      readonly: true,
      temporary: true,
      ...(expiresAt === undefined ? {} : { expiresAt }),
      connection: readonlyConnection(connection),
      target: {
        bucket,
        ...(pathPrefix ? { pathPrefix } : {}),
        objectName,
      },
    });
  },

  open(uri) {
    if (typeof uri !== 'string' || !uri.startsWith('bucketview://')) {
      throw new TypeError('uri must be a BucketView URI');
    }
    window.location.assign(uri);
  },
};

export default BucketView;
