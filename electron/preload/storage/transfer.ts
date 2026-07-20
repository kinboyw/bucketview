import { app } from "electron";
import nodePath from "node:path";
import nodeFs from "node:fs";
import { TransferObjectOption, Storage, ProgressCallback, CancelFunction, Connection } from "../types";
import PersistentQueue from "./PersistentQueue"

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
  try {
    // Prefer main-process persisted preference via electron-store.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const Store = require('electron-store')
    const store = new Store()
    const saved = Number(store.get('app.transferConcurrency', DEFAULT_TRANSFER_CONCURRENCY))
    if (Number.isFinite(saved) && saved >= 1) {
      return Math.min(MAX_TRANSFER_CONCURRENCY, Math.floor(saved))
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
  r.completedAt = Date.now();
  queue.upsertTransferRecord(r.uid, r);
}

export class Transfer {
  private transferQueue: PersistentQueue;
  private storages: { [key: string]: Storage } = {};
  private eventBus: any

  constructor(storages: { [key: string]: Storage }, eventBus: any) {
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
      const stor = this.storages[job.key || 'minio']
      stor.changeConfig(job.connection || {})
      stor.setTarget(job.bucket || '', job.pathPrefix)

      // Clear any previous cancel mark for this uid when starting a new job
      if (job.uid) clearCancel(job.uid);

      // Update record status to running
      updateRecord(this.transferQueue, job, 'running');

      // Create a dynamic cancelFunc that checks the global cancel map
      const cancelFunc = job.uid ? makeCancelFunc(job.uid) : noop;

      let handled = false
      const handleError = (err: any) => {
        if (handled) return
        handled = true
        console.error(`[Transfer] ${job.type} failed for "${job.objectName}":`, err?.message || err)
        this.transferQueue.addFailed(job)
        updateRecord(this.transferQueue, job, 'error', err?.message || String(err));
        this.eventBus.emit(job.type, { status: 'error', desc: err?.message || String(err), ...job })
      }

      if (job.type == "download") {
        stor.getObject(
          { ...job, cancelFunc, forceOverwrite: job.forceOverwrite, resumeFrom: job.resumeFrom },
          (data: any) => {
            if (data.status == 'error') {
              this.transferQueue.addFailed(job)
              updateRecord(this.transferQueue, job, 'error', data.desc);
            }
            if (data.status == 'success') {
              this.transferQueue.addSucceeded(job)
              updateRecord(this.transferQueue, job, 'success');
            }
            this.eventBus.emit('download', {...data, ...job})
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
            }
            if (data.status == 'success') {
              this.transferQueue.addSucceeded(job)
              updateRecord(this.transferQueue, job, 'success');
            }
            this.eventBus.emit('upload', {...data, ...job})
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
    })
    this.transferQueue.open()
      .then(() => {
        this.transferQueue.start()
      })
      .catch((error) => {
        console.error('[Transfer] failed to open queue database:', error)
      })
  }

  public Add(job: TransferOptions) {
    this.transferQueue.add(job)
    if (job.record) {
      this.transferQueue.upsertTransferRecord(job.record.uid, job.record);
    }
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
