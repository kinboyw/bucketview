import { defineStore } from "pinia";

export interface AuditLogEntry {
  id: string;
  timestamp: number;
  action: AuditAction;
  bucket: string;
  objectName?: string;
  description?: string;
  metadata?: Record<string, any>;
}

export type AuditAction =
  | 'upload'
  | 'download'
  | 'delete'
  | 'rename'
  | 'copy'
  | 'config_update'
  | 'mount'
  | 'unmount'
  | 'enable'
  | 'disable';

export type AuditActionFilter = AuditAction | 'all';

const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 3 months

export const useAuditStore = defineStore('audit', {
  state: () => ({
    entries: [] as AuditLogEntry[],
  }),
  getters: {
    filteredEntries(): AuditLogEntry[] {
      // Auto-remove expired entries on access
      const now = Date.now();
      this.entries = this.entries.filter(e => now - e.timestamp < MAX_AGE_MS);
      return this.entries;
    },
    actionOptions(): { label: string; value: AuditActionFilter }[] {
      return [
        { label: '全部', value: 'all' },
        { label: '上传', value: 'upload' },
        { label: '下载', value: 'download' },
        { label: '删除', value: 'delete' },
        { label: '重命名', value: 'rename' },
        { label: '复制', value: 'copy' },
        { label: '配置更新', value: 'config_update' },
        { label: '挂载', value: 'mount' },
        { label: '卸载', value: 'unmount' },
        { label: '启用', value: 'enable' },
        { label: '禁用', value: 'disable' },
      ];
    },
  },
  actions: {
    log(action: AuditAction, bucket: string, options?: { objectName?: string; description?: string; metadata?: Record<string, any> }) {
      this.entries.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        timestamp: Date.now(),
        action,
        bucket,
        objectName: options?.objectName,
        description: options?.description,
        metadata: options?.metadata,
      });
    },
    purgeExpired() {
      const now = Date.now();
      this.entries = this.entries.filter(e => now - e.timestamp < MAX_AGE_MS);
    },
    clearAll() {
      this.entries = [];
    },
  },
  persist: {
    key: 'audit',
    storage: localStorage,
  }
});
