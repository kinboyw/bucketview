import { ipcRenderer } from "electron";
import { app } from "@electron/remote";
import nodePath from "node:path";
import nodeFs from "node:fs";
import { TransferObjectOption, Storage, ProgressCallback, CancelFunction, Connection } from "../types";
import PersistentQueue from "./PersistentQueue"
import { decryptConnectionSecrets } from "../../common/secret-crypto";

function logTransfer(level: 'info' | 'warn' | 'error', message: string, meta?: any) {
  try {
    ipcRenderer.send('app-log', { level, scope: 'transfer', message, meta });
  } catch {}
}

export interface TransferOptions extends TransferObjectOption {
  type: "download" | "upload";
  key: string;  // storage key (e.g., "minio")
  connection: Connection;
  bucket: string;
  pathPrefix?: string;
  cb?: ProgressCallback;
  cancelFunc?: CancelFunction;
  record?: any;  // TransferInfo for UI persistence
  forceOverwrite?: boolean;  // true for retry: delete partial file and override
  resumeFrom?: { filePath: string; downloaded: number; total: number };  // for resume download
}

type StorageFactory = () => Storage;

const noop: any = () => false
const DEFAULT_TRANSFER_CONCURRENCY = 3
const MAX_TRANSFER_CONCURRENCY = 8

function resolveTransferConcurrency(): number {
  try {
    const raw = process.env.BUCKETVIEW_TRANSFER_CONCURRENCY
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n >= 1) return Math.min(MAX_TRANSFER_CONCURRENCY, Math.floor(n))
    }
  } catch {}
  return DEFAULT_TRANSFER_CONCURRENCY
}

// Global cancel map: uid → boolean. When UI sets cancel, this map marks it true.
const cancelledUids: Map<string, boolean> = new Map();

export function markCancel(uid: string) {
  cancelledUids.set(uid, true);
}

export function clearCancel(uid: string) {
  cancelledUids.delete(uid);
}

export function isCancelled(uid: string): boolean {
  return cancelledUids.get(uid) === true;
}

export function makeCancelFunc(uid: string): CancelFunction {
  return () => isCancelled(uid);
}

function updateRecord(queue: PersistentQueue, job: any, status: string, errorDesc?: string) {
  const r = job.record;
  if (!r) return;
  r.status = status;
  if (errorDesc) r.errorDesc = errorDesc;
  else if (status === 'running') delete r.errorDesc;
  if (status === 'success' || status === 'error' || status === 'cancel') {
    r.completedAt = Date.now();
  } else {
    delete r.completedAt;
  }
  queue.upsertTransferRecord(r.uid, r);
}

export class Transfer {
  private transferQueue: PersistentQueue;
  private storages: { [key: string]: StorageFactory } = {};
  private eventBus: any;
  private pendingJobs: TransferOptions[] = [];
  private flushingPending = false;

  constructor(storages: { [key: string]: StorageFactory }, eventBus: any) {
    this.storages = storages
    this.eventBus = eventBus

    const dbDir = (() => {
      try {
        return app.getPath('userData');
      } catch {
        return process.cwd();
      }
    })();
    try {
      nodeFs.mkdirSync(dbDir, { recursive: true });
    } catch {}
    const dbPath = nodePath.join(dbDir, 'transfer-queue.sqlite');
    this.transferQueue = new PersistentQueue(dbPath, resolveTransferConcurrency())
    this.transferQueue.setDebug(false)
    this.transferQueue.on("next", ({ id, job }) => {
      try {
        const stor = this.storages[job.key || 'minio']()
        stor.changeConfig(decryptConnectionSecrets(job.connection || {}))
        stor.setTarget(job.bucket || '', job.pathPrefix)

        // Clear any previous cancel mark for this uid when starting a new job
        if (job.uid) clearCancel(job.uid);

        // Update record status to running and notify UI
        updateRecord(this.transferQueue, job, 'running');
        logTransfer('info', `开始${job.type === 'download' ? '下载' : '上传'}: ${job.objectName || job.name}`, {
          uid: job.uid,
          bucket: job.bucket,
          totalBytes: job.totalBytes,
          localPath: job.localPath,
        });
        this.eventBus.emit(job.type, { status: 'running', percentage: 0, speed: '', remaining: '', ...job });

        // Create a dynamic cancelFunc that checks the global cancel map
        const cancelFunc = job.uid ? makeCancelFunc(job.uid) : noop;

        let handled = false
        const handleError = (err: any) => {
          if (handled) return
          handled = true
          const errMsg = err?.message || String(err);
          console.error(`[Transfer] ${job.type} failed for "${job.objectName}":`, errMsg);
          logTransfer('error', `${job.type === 'download' ? '下载' : '上传'}异常: ${job.objectName || job.name}`, {
            uid: job.uid,
            error: errMsg,
          });
          this.transferQueue.addFailed(job)
          updateRecord(this.transferQueue, job, 'error', errMsg);
          this.eventBus.emit(job.type, { status: 'error', desc: errMsg, ...job })
        }

        if (job.type == "download") {
          stor.getObject(
            { ...job, cancelFunc, forceOverwrite: job.forceOverwrite, resumeFrom: job.resumeFrom },
            (data: any) => {
              if (data.status == 'error') {
                this.transferQueue.addFailed(job)
                updateRecord(this.transferQueue, job, 'error', data.desc);
                logTransfer('error', `下载失败: ${job.objectName || job.name}`, { desc: data.desc, uid: job.uid });
              }
              if (data.status == 'success') {
                this.transferQueue.addSucceeded(job)
                updateRecord(this.transferQueue, job, 'success');
                logTransfer('info', `下载成功: ${job.objectName || job.name}`, { uid: job.uid, localPath: job.localPath });
              }
              if (data.status == 'cancel') {
                updateRecord(this.transferQueue, job, 'cancel', data.desc);
                logTransfer('warn', `下载取消: ${job.objectName || job.name}`, { uid: job.uid });
              }
              this.eventBus.emit('download', {...data, ...job, status: data.status, desc: data.desc})
            },
            cancelFunc
          )
            .catch(handleError)
            .finally(() => {
              this.eventBus.emit('download', { type: "end", ...job })
              this.transferQueue.done(id)
              // Clean up cancel mark after job finishes
              if (job.uid) clearCancel(job.uid);
            });
        } else if (job.type == "upload") {
          stor.putObject(
            job,
            (data: any) => {
              if (data.status == 'error') {
                this.transferQueue.addFailed(job)
                updateRecord(this.transferQueue, job, 'error', data.desc);
                logTransfer('error', `上传失败: ${job.objectName || job.name}`, { desc: data.desc, uid: job.uid });
              }
              if (data.status == 'success') {
                this.transferQueue.addSucceeded(job)
                updateRecord(this.transferQueue, job, 'success');
                logTransfer('info', `上传成功: ${job.objectName || job.name}`, { uid: job.uid });
              }
              if (data.status == 'cancel') {
                updateRecord(this.transferQueue, job, 'cancel', data.desc);
                logTransfer('warn', `上传取消: ${job.objectName || job.name}`, { uid: job.uid });
              }
              this.eventBus.emit('upload', {...data, ...job, status: data.status, desc: data.desc})
            },
            cancelFunc
          )
            .catch(handleError)
            .finally(() => {
              this.eventBus.emit('upload', { type: "end", ...job })
              this.transferQueue.done(id)
              if (job.uid) clearCancel(job.uid);
            });
        }
      } catch (err: any) {
        console.error(`[Transfer] sync dispatch error on job #${id}:`, err);
        this.transferQueue.done(id);
      }
    })
    this.transferQueue.open()
      .then(() => {
        logTransfer('info', 'SQLite 传输队列数据库打开成功', { dbPath, concurrency: resolveTransferConcurrency() });
        this.transferQueue.start()
        this.flushPendingJobs()
      })
      .catch((error) => {
        console.error('[Transfer] failed to open queue database:', error)
        logTransfer('error', 'SQLite 传输队列数据库打开失败', { error: error?.message || String(error) });
      })
  }

  public whenReady(): Promise<void> {
    return this.transferQueue.whenReady();
  }

  public isReady(): boolean {
    return this.transferQueue.isOpen();
  }

  public Add(job: TransferOptions) {
    logTransfer('info', `Transfer.Add 收到任务: ${job.name || job.objectName}`, {
      uid: job.uid,
      isOpen: this.transferQueue.isOpen(),
      queueLength: this.transferQueue.getLength(),
    });
    if (!this.transferQueue.isOpen()) {
      this.pendingJobs.push(job);
      this.flushPendingJobs();
      return;
    }
    this.enqueueJob(job);
  }

  private enqueueJob(job: TransferOptions) {
    if (job.record) {
      this.transferQueue.upsertTransferRecord(job.record.uid, job.record);
    }
    const insertId = this.transferQueue.add(job);
    logTransfer('info', `任务入队成功 (RowID: ${insertId}): ${job.name || job.objectName}`, { uid: job.uid });
  }

  private flushPendingJobs() {
    if (this.flushingPending) return;
    this.flushingPending = true;
    void this.transferQueue.whenReady()
      .then(() => {
        const jobs = this.pendingJobs.splice(0, this.pendingJobs.length);
        for (const job of jobs) this.enqueueJob(job);
      })
      .catch((error) => {
        console.error('[Transfer] pending jobs dropped; queue failed to open:', error);
        this.pendingJobs = [];
      })
      .finally(() => {
        this.flushingPending = false;
        if (this.pendingJobs.length && this.transferQueue.isOpen()) this.flushPendingJobs();
      });
  }

  // ── Transfer records (UI persistence) ──

  public upsertTransferRecord(uid: string, data: any) {
    this.transferQueue.upsertTransferRecord(uid, data);
  }

  public getTransferRecord(uid: string): string | null {
    return this.transferQueue.getTransferRecord(uid);
  }

  public listTransferRecords(offset: number, limit: number): any[] {
    const records = this.transferQueue.listTransferRecords(offset, limit);
    return records.map((r: string) => JSON.parse(r));
  }

  public countTransferRecords(): number {
    return this.transferQueue.countTransferRecords();
  }

  public deleteTransferRecord(uid: string) {
    this.transferQueue.deleteTransferRecord(uid);
  }

  public clearTransferRecords() {
    this.transferQueue.clearTransferRecords();
  }

  public recoverInterrupted(): any[] {
    const records = this.transferQueue.recoverInterrupted();
    return records.map((r: string) => JSON.parse(r));
  }

  // ── Legacy queue accessors ──

  public listFailedQueue(offset: number, limit: number) {
    return this.transferQueue.listFailedQueue(offset, limit)
  }

  public listSuccededQueue(offset: number, limit: number) {
    return this.transferQueue.listSuccededQueue(offset, limit)
  }


  public listQueue(offset: number, limit: number) {
    return this.transferQueue.listQueue(offset, limit)
  }
}
