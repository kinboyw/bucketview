/**
 * 一般在容器中做这4件事
 *    1. 定义容器并导出
 *    2. 使用容器中的state
 *    3. 修改容器中的state
 *    4. 使用容器中的action
 */
import { defineStore } from "pinia";
import { reactive } from "vue";
import type { Connection, PreloadStorage } from "../../electron/preload/types";

export interface TransferInfo {
  type: "download" | "upload";
  uid: string;
  name: string;
  objectName: string;
  localPath: string;
  prefix?: string;
  bucket?: string;
  pathPrefix?: string;
  connectionId?: string;
  connection?: Connection;
  sourceDirectory?: string;
  connectionLabel?: string;
  status?: "cancel" | "error" | "waiting" | "running" | "success" | "skipped";
  errorDesc?: string;
  percentage?: string;
  speed?: string;
  remaining?: string;
  consumedBytes?: number;
  totalBytes?: number;
  createdAt?: number;
  completedAt?: number;
}

type map = { [key: string]: TransferInfo };

const PAGE_SIZE = 100;

export const useTransferStore = defineStore('transfer', {
  state: () => {
    return {
      queue: reactive<map>({}),
      loaded: false,
    }
  },
  getters: {},
  actions: {
    setRecord(uid: string, data: TransferInfo) {
      this.queue[uid] = data;
      // Persist terminal / non-progress updates immediately; throttle progress writes.
      const storage = (window as any).storage as PreloadStorage;
      if (!storage?.upsertTransferRecord) return;
      const isProgressOnly = data.status === 'running' && data.percentage !== undefined;
      if (!isProgressOnly) {
        storage.upsertTransferRecord(uid, data);
        return;
      }
      const g = globalThis as any;
      if (!g.__bvTransferPersistAt) g.__bvTransferPersistAt = Object.create(null);
      const now = Date.now();
      const last = g.__bvTransferPersistAt[uid] || 0;
      if (now - last >= 1000) {
        g.__bvTransferPersistAt[uid] = now;
        storage.upsertTransferRecord(uid, data);
      }
    },
    deleteRecord(uid: string) {
      delete this.queue[uid];
      const storage = (window as any).storage as PreloadStorage;
      if (storage?.deleteTransferRecord) {
        storage.deleteTransferRecord(uid);
      }
    },
    async loadFromStorage() {
      if (this.loaded) return;
      const storage = (window as any).storage as PreloadStorage;
      if (!storage?.listTransferRecords) return;

      // Wait for queue DB to finish opening (max ~8s) before reading history.
      if (storage.waitTransferReady) {
        try {
          await Promise.race([
            storage.waitTransferReady(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('transfer queue open timeout')), 8000)),
          ]);
        } catch (error) {
          console.warn('[transfer] queue not ready yet:', error);
          // Keep loaded=false so a later mount/retry can still hydrate.
          return;
        }
      } else if (storage.isTransferReady && !storage.isTransferReady()) {
        // Poll briefly for older builds without waitTransferReady.
        const deadline = Date.now() + 8000;
        while (Date.now() < deadline && !storage.isTransferReady()) {
          await new Promise((r) => setTimeout(r, 50));
        }
        if (!storage.isTransferReady()) return;
      }

      try {
        const total = storage.countTransferRecords?.() ?? 0;
        this.queue = reactive<map>({});
        // Load in pages for large datasets
        let offset = 0;
        while (offset < total) {
          const records = storage.listTransferRecords(offset, PAGE_SIZE) || [];
          for (const r of records) {
            if (r && r.uid) {
              // Interrupted in-flight jobs are recovered separately from the active queue.
              if (r.status === 'running' || r.status === 'waiting') {
                r.status = 'error';
                r.errorDesc = '传输中断（应用退出）';
              }
              this.queue[r.uid] = r;
            }
          }
          offset += PAGE_SIZE;
        }
        this.loaded = true;
      } catch (error) {
        // better-sqlite3 / queue may still be opening or failed in packaged builds.
        console.warn('[transfer] loadFromStorage failed:', error);
        // Do not mark loaded so startup can retry after DB becomes ready.
      }
    },
    clean() {
      Object.keys(this.queue).forEach((key) => {
        delete this.queue[key];
      });
      const storage = (window as any).storage as PreloadStorage;
      if (storage?.clearTransferRecords) {
        storage.clearTransferRecords();
      }
    },
    clearHistory() {
      this.clean();
    }
  },
})
