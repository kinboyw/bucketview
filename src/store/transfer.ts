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
      const storage = (window as any).storage as PreloadStorage;
      if (storage?.upsertTransferRecord) {
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
      try {
        const total = storage.countTransferRecords?.() ?? 0;
        this.queue = reactive<map>({});
        // Load in pages for large datasets
        let offset = 0;
        while (offset < total) {
          const records = storage.listTransferRecords(offset, PAGE_SIZE) || [];
          for (const r of records) {
            if (r && r.uid) {
              // Skip records still in active queue (they'll be recovered)
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
        this.queue = reactive<map>({});
        this.loaded = true;
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
