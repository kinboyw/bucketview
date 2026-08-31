import {
  Storage,
  TransferObjectOption,
  CreateDirectoryResponse,
  Connection,
  MountTarget,
  DeleteObjectResponse,
  ProgressCallback,
  ListObjectsResponse,
  CancelFunction,
  SignObjectResponse,
  HeadObjectResponse,
} from '../types';
import nodeFs from 'node:fs';
import { Readable } from 'node:stream';
import nodePath from 'node:path';
import { S3Client, ListBucketsCommand, ListObjectsV2Command, PutObjectCommandInput, GetObjectCommand, ListObjectsV2CommandInput, PutObjectCommand, DeleteObjectsCommand, DeleteObjectCommand, ObjectIdentifier, HeadObjectCommand, ChecksumMode } from "@aws-sdk/client-s3";
import * as crypto from 'node:crypto';
import { Progress, Upload } from '@aws-sdk/lib-storage';
import { Logger, MakeProgress, md5sum } from './utils';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { ProxyAgent } from "proxy-agent";
const logger = new Logger("warn");

function inferContentType(filePath: string): string | undefined {
  const ext = nodePath.extname(filePath || '').toLowerCase();
  if (!ext) return undefined;

  const contentTypeMap: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.xhtml': 'application/xhtml+xml',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.mjs': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.txt': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.wasm': 'application/wasm',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.bmp': 'image/bmp',
    '.avif': 'image/avif',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.pdf': 'application/pdf',
    '.zip': 'application/zip',
    '.gz': 'application/gzip',
    '.tar': 'application/x-tar',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
  };

  return contentTypeMap[ext];
}

export class S3Storage implements Storage {
  name = 'BucketView';
  docUrl = 'https://github.com/minio/minio-js/blob/master/docs/zh_CN/API.md';
  s3Client: S3Client;
  connection: Connection;
  bucket: string;
  pathPrefix: string;

  changeConfig(connection: Connection, proxy?: string): void {
    this.connection = connection;
    this.bucket = connection.bucket || '';
    const rawPrefix = connection.pathPrefix || '';
    this.pathPrefix = rawPrefix.replace(/^\/+|\/+$/g, '');
    this._virtualBuckets = [];

    this.s3Client = new S3Client({
      region: connection.region,
      endpoint: `${connection.useSSL ? 'https' : 'http'}://${connection.endpoint}`,
      credentials: {
        accessKeyId: connection.accessKeyId,
        secretAccessKey: connection.accessKeySecret,
        sessionToken: undefined,
      },
      forcePathStyle: connection.pathStyle ?? true,
      requestHandler: new NodeHttpHandler({
        connectionTimeout: 2000,
        httpAgent: new ProxyAgent(),
        httpsAgent: new ProxyAgent(),
      }),
      logger: logger,
    });

    this.s3Client.middlewareStack.addRelativeTo(
      (next) => async (args) => {
        const request = args.request as any;
        if (request?.method === 'POST' && request?.query?.delete !== undefined && request.body && !request.headers?.['content-md5']) {
          request.headers = request.headers || {};
          request.headers['content-md5'] = crypto.createHash('md5').update(request.body).digest('base64');
        }
        return next(args);
      },
      {
        relation: 'after',
        toMiddleware: 'serializerMiddleware',
        name: 'deleteObjectsContentMd5Middleware',
        override: true,
      }
    );
  }

  setTarget(bucket: string, pathPrefix?: string): void {
    this.bucket = bucket;
    this.pathPrefix = pathPrefix ?? '';
  }

  /** S3 实际 Key：pathPrefix 为空时直接返回 key，否则拼接 */
  private resolveKey(key: string): string {
    if (!this.pathPrefix) return key;
    return key ? `${this.pathPrefix}/${key}` : this.pathPrefix;
  }

  /** 从 S3 返回的 Key 中剥离 pathPrefix（如有） */
  private stripKey(key: string): string {
    if (!this.pathPrefix) return key;
    // key 等于 pathPrefix 本身时，返回空（表示虚拟根目录）
    if (key === this.pathPrefix) return '';
    if (key.startsWith(this.pathPrefix + '/')) return key.slice(this.pathPrefix.length + 1);
    return key;
  }

  async listBuckets(): Promise<string[]> {
    try {
      const command = new ListBucketsCommand({});
      const response = await this.s3Client.send(command);
      return (response.Buckets || []).map(b => b.Name || '');
    } catch (err) {
      console.error('[STORAGE] listBuckets error:', err);
      throw err;
    }
  }

  async getObject(options: TransferObjectOption & { forceOverwrite?: boolean; resumeFrom?: { filePath: string; downloaded: number; total: number } }, cb: ProgressCallback, cancelFunc: CancelFunction): Promise<void> {
    try {
      const { objectName, localPath, forceOverwrite, resumeFrom, partialPath: requestedPartialPath } = options;
      const { bucket } = this;

      if (cancelFunc && cancelFunc()) {
        cb && cb({ status: "cancel", desc: '下载已取消' });
        return;
      }

      const headObjectCommand = new HeadObjectCommand({
        Bucket: bucket,
        Key: this.resolveKey(objectName),
      });
      const stat = await this.s3Client.send(headObjectCommand);
      const totalBytes = stat.ContentLength || 0;
      const remoteEtag = stat.ETag;
      const remoteVersionId = (stat as any).VersionId;

      // New downloads use a staging file. Keep accepting an older task's
      // direct target path when it is the only existing resume source.
      let stagingPath = requestedPartialPath || `${localPath}.bucketview.part`;
      if (
        resumeFrom?.filePath &&
        nodeFs.existsSync(resumeFrom.filePath) &&
        resumeFrom.filePath !== stagingPath &&
        !nodeFs.existsSync(stagingPath)
      ) {
        stagingPath = resumeFrom.filePath;
      }

      // ── forceOverwrite: delete existing file to prevent leftover garbage bytes ──
      if (forceOverwrite) {
        try { nodeFs.unlinkSync(localPath); } catch {}
        if (stagingPath !== localPath) {
          try { nodeFs.unlinkSync(stagingPath); } catch {}
        }
      }

      // Determine download offset: resume from partial file if it exists
      let downloadOffset = 0;
      if (!forceOverwrite && nodeFs.existsSync(stagingPath)) {
        const localSize = nodeFs.statSync(stagingPath).size;
        if (localSize > 0 && localSize < totalBytes) {
          // Without a stable validator, a byte-range resume cannot be made
          // safe. Restart from zero instead of silently mixing versions.
          if (!remoteEtag && !remoteVersionId) {
            try { nodeFs.unlinkSync(stagingPath); } catch {}
            downloadOffset = 0;
          } else {
          // Verify partial file boundary integrity: download last 1KB from S3 and compare
          const probeSize = Math.min(localSize, 1024);
          const probeStart = localSize - probeSize;
          try {
            const probeResp = await this.s3Client.send(new GetObjectCommand({
              Bucket: bucket,
              Key: this.resolveKey(objectName),
              Range: `bytes=${probeStart}-${localSize - 1}`,
              ...(remoteVersionId ? { VersionId: remoteVersionId } : {}),
              ...(!remoteVersionId && remoteEtag ? { IfMatch: remoteEtag } : {}),
            }));
            const probeBody = probeResp.Body as Readable;
            const probeChunks: Buffer[] = [];
            await new Promise<void>((resolve, reject) => {
              probeBody.on('data', (chunk: Buffer) => probeChunks.push(chunk));
              probeBody.on('end', resolve);
              probeBody.on('error', reject);
            });
            const probeRemote = Buffer.concat(probeChunks);
            // Read the same range from the local partial file
            const fd = nodeFs.openSync(stagingPath, 'r');
            const probeLocal = Buffer.alloc(probeSize);
            nodeFs.readSync(fd, probeLocal, 0, probeSize, probeStart);
            nodeFs.closeSync(fd);

            if (probeLocal.equals(probeRemote)) {
              downloadOffset = localSize;
              nodeFs.truncateSync(stagingPath, downloadOffset);
            } else {
              // Boundary data mismatch → partial file is corrupted, delete and start fresh
              console.warn(`[STORAGE] resume boundary mismatch at offset ${probeStart}, deleting partial file and starting fresh`);
              try { nodeFs.unlinkSync(stagingPath); } catch {}
              downloadOffset = 0;
            }
          } catch (e) {
            // Probe failed → can't verify, start fresh to guarantee correctness
            console.warn('[STORAGE] resume boundary probe failed, starting fresh:', e?.message);
            try { nodeFs.unlinkSync(stagingPath); } catch {}
            downloadOffset = 0;
          }
          }
        } else if (localSize >= totalBytes) {
          // A complete-looking staging file still needs a checksum. Since
          // compatible providers may not expose one, redownload safely.
          try { nodeFs.unlinkSync(stagingPath); } catch {}
          downloadOffset = 0;
        } else {
          // localSize == 0 → delete empty file and start fresh
          try { nodeFs.unlinkSync(stagingPath); } catch {}
          downloadOffset = 0;
        }
        // If localSize == 0, fall through to fresh download from offset 0
      }

      // ── Unified S3 SDK download (both fresh and resume) ──
      const makeProgress = new MakeProgress(totalBytes, downloadOffset);
      cb && cb({
        consumedBytes: downloadOffset,
        totalBytes: totalBytes,
        percentage: makeProgress.get(downloadOffset).percentage,
        speed: "",
        remaining: "",
        status: "running",
      });

      // Build GetObjectCommand with Range header for resume, or without for fresh
      const getCmdParams: any = {
        Bucket: bucket,
        Key: this.resolveKey(objectName),
      };
      if (remoteVersionId) getCmdParams.VersionId = remoteVersionId;
      else if (remoteEtag) getCmdParams.IfMatch = remoteEtag;
      if (downloadOffset > 0) {
        getCmdParams.Range = `bytes=${downloadOffset}-`;
      }

      // Retry logic: up to 3 retries with exponential backoff on transient errors
      const maxRetries = 3;
      let lastError: any = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        if (attempt > 0) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 30000);
          await new Promise(r => setTimeout(r, delay));
          // Re-check cancel before retrying
          if (cancelFunc && cancelFunc()) {
            cb && cb({ status: "cancel", desc: '下载已取消' });
            return;
          }
        }

        try {
          const resp = await this.s3Client.send(new GetObjectCommand(getCmdParams));
          const body = resp.Body as Readable;

          if (downloadOffset > 0) {
            const expectedLength = totalBytes - downloadOffset;
            const contentRange = String((resp as any).ContentRange || '');
            const expectedPrefix = `bytes ${downloadOffset}-`;
            if (!contentRange.startsWith(expectedPrefix) || (resp.ContentLength !== undefined && resp.ContentLength !== expectedLength)) {
              throw new Error(`续传响应范围无效：${contentRange || '缺少 Content-Range'}`);
            }
          }

          // WriteStream: append mode for resume, overwrite for fresh
          const writeFlags = downloadOffset > 0 ? 'r+' : 'w';
          const writeStart = downloadOffset > 0 ? downloadOffset : undefined;
          const writeStream = nodeFs.createWriteStream(stagingPath, {
            flags: writeFlags,
            start: writeStart,
          });

          let bytesWritten = 0;
          let lastEmitTime = 0;
          let cancelled = false;
          let cancelReported = false;
          const reportCancel = () => {
            if (cancelReported) return;
            cancelReported = true;
            cb && cb({ status: "cancel", desc: '下载已取消' });
          };
          let settled = false;
          lastError = null;

          await new Promise<void>((resolve, reject) => {
            const settle = (fn: 'resolve' | 'reject', arg?: any) => {
              if (settled) return;
              settled = true;
              if (fn === 'resolve') resolve();
              else reject(arg);
            };

            body.on('data', (chunk: Buffer) => {
              if (cancelFunc && cancelFunc()) {
                cancelled = true;
                body.destroy();
                writeStream.end();
                return;
              }
              const ok = writeStream.write(chunk);
              bytesWritten += chunk.length;
              const now = Date.now();
              if (now - lastEmitTime >= 1000) {
                lastEmitTime = now;
                const p = makeProgress.get(downloadOffset + bytesWritten);
                cb && cb({
                  consumedBytes: downloadOffset + bytesWritten,
                  totalBytes: totalBytes,
                  percentage: p.percentage,
                  speed: p.speed,
                  remaining: p.remaining,
                  status: "running",
                });
              }
              if (!ok) {
                body.pause();
                writeStream.once('drain', () => body.resume());
              }
            });
            body.on('end', () => {
              writeStream.end();
            });
            body.on('error', (err) => {
              writeStream.end();
              if (cancelled) {
                reportCancel();
                settle('resolve');
              } else {
                settle('reject', err);
              }
            });
            writeStream.on('error', (err) => {
              if (!cancelled) {
                body.destroy();
                settle('reject', err);
              }
            });
            writeStream.on('finish', () => {
              if (cancelled) {
                reportCancel();
                const actualSize = downloadOffset + bytesWritten;
                try { nodeFs.truncateSync(stagingPath, actualSize); } catch {}
                settle('resolve');
                return;
              }
              // Ensure file is exactly totalBytes
              try { nodeFs.truncateSync(stagingPath, totalBytes); } catch {}
              const finalSize = downloadOffset + bytesWritten;
              if (finalSize >= totalBytes) {
                try {
                  const fd = nodeFs.openSync(stagingPath, 'r');
                  nodeFs.fsyncSync(fd);
                  nodeFs.closeSync(fd);
                  if (stagingPath !== localPath) {
                    try { nodeFs.unlinkSync(localPath); } catch {}
                    nodeFs.renameSync(stagingPath, localPath);
                  }
                } catch (finalizeError: any) {
                  cb && cb({ status: "error", desc: `下载完成但无法保存文件：${finalizeError?.message || finalizeError}` });
                  settle('resolve');
                  return;
                }
                cb && cb({ status: "success", percentage: 100, remaining: '0s' });
              } else {
                cb && cb({ status: "error", desc: `下载不完整：${finalSize}/${totalBytes} 字节` });
              }
              settle('resolve');
            });
          });

          // Download completed successfully or cancelled — no need to retry
          return;
        } catch (err: any) {
          lastError = err;
          // Only retry on transient/network errors, not on auth or range errors
          const status = err?.$metadata?.httpStatusCode;
          if (status === 403 || status === 404 || status === 416) {
            // Auth/range error: don't retry
            break;
          }
          if (/续传响应范围无效/.test(err?.message || '')) break;
          console.warn(`[STORAGE] download attempt ${attempt + 1} failed:`, err?.message);
        }
      }

      // All retries exhausted
      if (cancelFunc && cancelFunc()) cb && cb({ status: "cancel", desc: '下载已取消' });
      else cb && cb({ status: "error", desc: lastError?.message || '下载失败' });
    } catch (err) {
      console.log('[STORAGE] get object api, ' + err)
      if (cancelFunc && cancelFunc()) cb && cb({ status: "cancel", desc: '下载已取消' });
      else cb && cb({ status: "error", desc: err.message })
    }
  }

  async putObject(options: TransferObjectOption, cb: ProgressCallback, cancelFunc: CancelFunction): Promise<void> {
    try {
      const { objectName, localPath } = options;
      const { bucket = '' } = this;
      if (cancelFunc && cancelFunc()) {
        cb && cb({ status: "cancel", desc: '上传已取消' });
        return;
      }
      const stat = nodeFs.statSync(localPath);
      const makeProgress = new MakeProgress(stat.size)

      cb && cb({
        consumedBytes: 0,
        totalBytes: stat.size,
        percentage: "0",
        speed: "",
        remaining: "",
        status: "running",
      });

      const fileStream = nodeFs.createReadStream(localPath);
      const readableStream = Readable.from(fileStream);

      // const md5Hash = await md5sum(localPath);
      const uploadParams: PutObjectCommandInput = {
        Bucket: bucket,
        Key: this.resolveKey(objectName),
        Body: readableStream,
        ContentType: inferContentType(objectName || localPath),
        ChecksumAlgorithm: "CRC32C",
        // ContentMD5: md5Hash
      };

      let partSize = stat.size / 1024 / 1024 / 9999 > 10 ? Math.ceil(stat.size / 9999) : 10 * 1024 * 1024;
      const upload = new Upload({
        client: this.s3Client,
        params: uploadParams,
        leavePartsOnError: false,
        queueSize: 4,
        partSize: partSize,
      });

      upload.on("httpUploadProgress", (progress: Progress) => {
        const p = makeProgress.get(progress.loaded || 0);
        cb && cb({
          consumedBytes: progress.loaded || 0,
          totalBytes: stat.size,
          percentage: p.percentage,
          speed: p.speed,
          remaining: p.remaining,
          status: "running",
        })
        if (cancelFunc && cancelFunc()) {
          void upload.abort().catch(() => undefined)
        }
      })

      await upload.done()
      // Upload.done() is successful even when a compatible provider does not
      // return Location (and for single-part uploads). Treat resolution as
      // the success signal instead of depending on an optional response field.
      cb && cb({
        status: "success",
        percentage: 100,
        remaining: '0s',
        filesize: stat.size,
      })
    } catch (err) {
      console.log('[STORAGE] pub object api, ' + err);
      if (cancelFunc && cancelFunc()) {
        cb && cb({ status: "cancel", desc: '上传已取消' });
      } else {
        cb && cb({
          status: "error",
          desc: err.message as string
        });
      }
    }
  }

  /** 根目录虚拟层：bucket 为空时，根目录列出有权限的桶 */
  private _virtualBuckets: string[] = [];

  async listObjects(prefix: string, nextContinuationToken: string | null, options?: { abortSignal?: AbortSignal }): Promise<ListObjectsResponse> {
    try {
      // ── 虚拟桶目录层：connection 未指定 bucket 且在根级 ──
      if (!this.bucket && !prefix) {
        if (nextContinuationToken == null) return { success: false, objectInfos: [], desc: "没有更多内容了" };
        if (nextContinuationToken === '' || !this._virtualBuckets.length) {
          this._virtualBuckets = await this.listBuckets();
        }
        return { success: true, objectInfos: this._virtualBuckets.map(b => ({
          name: b,
          objectName: b,
          type: 'directory' as const,
        })), nextContinuationToken: null };
      }

      // ── 正常 bucket 内列表 ──
      return this._listObjectsInBucket(prefix, nextContinuationToken, options);
    } catch (err: any) {
      const name = err?.name || '';
      const message = (err?.message || String(err)) as string;
      if (name === 'AbortError' || /aborted|abort/i.test(message)) {
        return { success: false, objectInfos: [], desc: 'aborted' };
      }
      return { success: false, objectInfos: [], desc: message }
    }
  }

  /** bucket 内部的 listObjects 实现 */
  private async _listObjectsInBucket(prefix: string, nextContinuationToken: string | null, options?: { abortSignal?: AbortSignal }): Promise<ListObjectsResponse> {
    const { bucket = '' } = this;
    const effectivePrefix = this.resolveKey(prefix);

    if (nextContinuationToken == null) return { success: false, objectInfos: [], desc: "没有更多内容了" };

    const input: ListObjectsV2CommandInput = {
      Bucket: bucket,
      MaxKeys: 1000,
      Delimiter: "/",
    }
    if (effectivePrefix.length > 0) input.Prefix = effectivePrefix.endsWith('/') ? effectivePrefix : `${effectivePrefix}/`;
    if (nextContinuationToken.length > 0) input.ContinuationToken = nextContinuationToken;
    const command = new ListObjectsV2Command(input);
    const response = await this.s3Client.send(command, options?.abortSignal ? { abortSignal: options.abortSignal } : undefined);

    const listObjects: ListObjectsResponse = { success: true, objectInfos: [] };

    response.Contents?.forEach((item) => {
      if (item.Key?.endsWith('/')) {
        return
      }
      const strippedKey = this.stripKey(item.Key || '');
      listObjects.objectInfos.push({
        name: nodePath.basename(strippedKey),
        objectName: strippedKey,
        lastModified: item.LastModified,
        size: item.Size
      });
    });

    response.CommonPrefixes?.forEach((item) => {
      const strippedPrefix = this.stripKey(item.Prefix || '');
      listObjects.objectInfos.push({
        name: nodePath.basename(strippedPrefix),
        objectName: strippedPrefix,
        type: 'directory'
      });
    });
    listObjects.nextContinuationToken = response.NextContinuationToken;
    return listObjects;
  }

  async deleteObject(objectNames: string[]): Promise<DeleteObjectResponse> {
    try {
      const { bucket = '' } = this;

      const objectsToDelete: ObjectIdentifier[] = []
      for (let index = 0; index < objectNames.length; index++) {
        const key = objectNames[index];
        if (key.endsWith("/")) {
          const resp = await this.deleteDirectory(key);
          if (!resp.success) {
            return resp;
          }
          continue;
        }
        objectsToDelete.push({ Key: this.resolveKey(key) })
      }

      for (let index = 0; index < objectsToDelete.length; index += 1000) {
        const objects = objectsToDelete.slice(index, index + 1000);
        if (objects.length === 0) continue;
        const deleteObjectsCommand = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects,
            Quiet: true,
          },
        });
        await this.s3Client.send(deleteObjectsCommand);
      }
      return { success: true };
    } catch (err) {
      return { success: false, desc: err.message };
    }
  }

  async deleteDirectory(prefix: string): Promise<DeleteObjectResponse> {
    try {
      const { bucket = '' } = this;

      const command = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: this.resolveKey(prefix),
      });
      const response = await this.s3Client.send(command);
      const objects = (response.Contents || []).map(({ Key }) => ({ Key })).filter(({ Key }) => Boolean(Key)) as ObjectIdentifier[];

      for (let index = 0; index < objects.length; index += 1000) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: {
            Objects: objects.slice(index, index + 1000),
            Quiet: true,
          },
        });
        await this.s3Client.send(deleteCommand);
      }

      if (response.IsTruncated) {
        await this.deleteDirectory(prefix);
      }
      return { success: true };
    } catch (err) {
      return { success: false, desc: err.message };
    }
  }

  async signObject(objectName: string): Promise<SignObjectResponse> {
    try {
      const { bucket = '' } = this;
      const command = new GetObjectCommand({ Bucket: bucket, Key: this.resolveKey(objectName) });
      const signedUrl = await getSignedUrl(this.s3Client, command, {
        expiresIn: 24 * 3600,
      });
      return { success: true, url: signedUrl };
    } catch (err) {
      return { success: false, desc: err.message };
    }
  }

  async createDirectory(prefix: string): Promise<CreateDirectoryResponse> {
    try {
      const { bucket = '' } = this;
      const putObjectCommand = new PutObjectCommand({
        Bucket: bucket,
        Key: `${this.resolveKey(prefix)}__XLDIR__`,
        Body: Buffer.from(''),
      });
      const response = await this.s3Client.send(putObjectCommand)
      return { success: true };
    } catch (err) {
      return { success: false, desc: err.message };
    }
  }

  async headObject(objectName: string): Promise<HeadObjectResponse> {
    try {
      const { bucket = '' } = this;
      const command = new HeadObjectCommand({
        Bucket: bucket,
        Key: this.resolveKey(objectName),
      });
      const resp = await this.s3Client.send(command);
      return {
        exists: true,
        size: resp.ContentLength,
        etag: resp.ETag,
        checksumCRC32C: resp.ChecksumCRC32C,
        lastModified: resp.LastModified,
      };
    } catch (err: any) {
      if (err.$metadata?.httpStatusCode === 404 || err.Code === 'NotFound' || err.name === 'NotFound') {
        return { exists: false };
      }
      return { exists: false, desc: err.message };
    }
  }
}
