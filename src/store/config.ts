import { defineStore } from "pinia";
import _ from "lodash";
import { Connection, MountTarget, LegacyStorageConfig } from "../../electron/preload/types";

export const defaultStorage = "minio";

const defaultConnection: Connection = {
  id: "",
  endpoint: "",
  accessKeyId: "",
  accessKeySecret: "",
  region: "",
  group: "",
};

/** 从旧版存储配置迁移到 Connection + MountTarget */
export function migrateLegacyStorageConfigToConnections(configs: LegacyStorageConfig[]): { connections: Connection[], mountTargets: MountTarget[] } {
  const connections: Connection[] = [];
  const mountTargets: MountTarget[] = [];
  for (const config of configs) {
    connections.push({
      id: config.bucket,
      endpoint: config.endpoint,
      accessKeyId: config.accessKeyId,
      accessKeySecret: config.accessKeySecret,
      region: config.region,
      useSSL: config.useSSL,
      pathStyle: config.pathStyle,
      bucket: config.bucket,
      enabled: config.enabled ?? true,
      group: "",
    });
    mountTargets.push({
      id: config.bucket,
      connectionId: config.bucket,
      bucket: config.bucket,
      pathPrefix: "",
      mountPoint: config.mountPoint,
      cacheDirectory: config.cacheDirectory,
      enabled: config.enabled ?? true,
    });
  }
  return { connections, mountTargets };
}

export const useConfigStore = defineStore('config', {
  state: () => ({
    connections: [] as Connection[],
    mountTargets: [] as MountTarget[],
    activeConnectionId: "",
    activeTabConnectionIds: [] as string[],
    defaultTargetId: "",
    // 迁移标记
    _migrated: false,
  }),
  getters: {
    /** 当前激活的 Connection */
    activeConnection(): Connection | undefined {
      return this.connections.find(c => c.id === this.activeConnectionId);
    },
    /** 通过 id 找 Connection */
    getConnectionById(): (id: string) => Connection | undefined {
      return (id: string) => this.connections.find(c => c.id === id);
    },
    /** 所有启用的 Connection */
    enabledConnections(): Connection[] {
      return this.connections.filter(c => c.enabled !== false);
    },
    /** 所有启用的 MountTarget */
    enabledTargets(): MountTarget[] {
      return this.mountTargets.filter(t => t.enabled !== false);
    },
    /** 某个 connection 下的所有 MountTarget */
    targetsByConnectionId(): (connectionId: string) => MountTarget[] {
      return (connectionId: string) => this.mountTargets.filter(t => t.connectionId === connectionId);
    },
    /** 某个 connection 下的已启用 MountTarget */
    enabledTargetsByConnectionId(): (connectionId: string) => MountTarget[] {
      return (connectionId: string) => this.mountTargets.filter(t => t.connectionId === connectionId && t.enabled !== false);
    },
    /** 通过 id 找 MountTarget */
    getTargetById(): (id: string) => MountTarget | undefined {
      return (id: string) => this.mountTargets.find(t => t.id === id);
    },
    /** 通过 targetId 找所属 Connection */
    getConnectionByTargetId(): (targetId: string) => Connection | undefined {
      return (targetId: string) => {
        const target = this.mountTargets.find(t => t.id === targetId);
        return target ? this.connections.find(c => c.id === target.connectionId) : undefined;
      };
    },
  },
  actions: {
    addConnection(connection: Connection): void {
      if (connection.id.length === 0) return;
      const index = this.connections.findIndex(c => c.id === connection.id);
      if (index === -1) {
        this.connections.push(connection);
      } else {
        this.connections[index] = connection;
      }
    },
    removeConnection(connectionId: string): void {
      _.remove(this.connections, c => c.id === connectionId);
      // 同时删除该 connection 下的所有挂载目标
      _.remove(this.mountTargets, t => t.connectionId === connectionId);
      this.closeTab(connectionId);
    },
    addMountTarget(target: MountTarget): void {
      if (target.id.length === 0) return;
      const idx = this.mountTargets.findIndex(t => t.id === target.id);
      if (idx === -1) {
        this.mountTargets.push(target);
      } else {
        this.mountTargets[idx] = target;
      }
    },
    removeMountTarget(targetId: string): void {
      _.remove(this.mountTargets, t => t.id === targetId);
    },
    setActiveConnection(connectionId: string): void {
      this.activeConnectionId = connectionId;
    },
    openTab(connectionId: string): void {
      if (!this.activeTabConnectionIds.includes(connectionId)) {
        this.activeTabConnectionIds.push(connectionId);
      }
      this.activeConnectionId = connectionId;
    },
    closeTab(connectionId: string): void {
      _.remove(this.activeTabConnectionIds, id => id === connectionId);
      if (this.activeConnectionId === connectionId) {
        const remaining = this.activeTabConnectionIds;
        this.activeConnectionId = remaining.length > 0 ? remaining[remaining.length - 1] : "";
      }
    },
    setDefaultTarget(targetId: string): void {
      this.defaultTargetId = targetId;
    },
    /** 首次加载旧格式数据时自动迁移 */
    migrateFromOldFormat(configs: LegacyStorageConfig[], activeBucket: string, defaultBucket: string): void {
      if (this._migrated) return;
      const result = migrateLegacyStorageConfigToConnections(configs);
      this.connections = result.connections;
      this.mountTargets = result.mountTargets;
      this.activeConnectionId = activeBucket;
      this.defaultTargetId = defaultBucket;
      this._migrated = true;
    },
  },
  persist: {
    key: 'config',
    storage: localStorage,
    serializer: {
      serialize(value) {
        try {
          const g = globalThis as any;
          const native = (window as any).native as { encryptSecret?: (v: string) => string } | undefined;
          // Tab switches only touch active ids; reuse last encrypted connections payload.
          const connections = (value as any)?.connections;
          let encryptedConnections = g.__bvEncryptedConnections;
          if (connections !== g.__bvConnectionsRef || !encryptedConnections) {
            const cloneConnections = JSON.parse(JSON.stringify(connections || []));
            if (Array.isArray(cloneConnections) && native?.encryptSecret) {
              encryptedConnections = cloneConnections.map((conn: any) => ({
                ...conn,
                accessKeySecret: native.encryptSecret?.(conn.accessKeySecret || '') || conn.accessKeySecret,
              }));
            } else {
              encryptedConnections = cloneConnections;
            }
            g.__bvConnectionsRef = connections;
            g.__bvEncryptedConnections = encryptedConnections;
          }
          return JSON.stringify({
            ...value,
            connections: encryptedConnections,
          });
        } catch {
          return JSON.stringify(value);
        }
      },
      deserialize(value) {
        try {
          const native = (window as any).native as { decryptSecret?: (v: string) => string } | undefined;
          const parsed = JSON.parse(value);
          if (Array.isArray(parsed.connections) && native?.decryptSecret) {
            parsed.connections = parsed.connections.map((conn: any) => ({
              ...conn,
              accessKeySecret: native.decryptSecret?.(conn.accessKeySecret || '') || conn.accessKeySecret,
            }));
          }
          return parsed;
        } catch {
          return JSON.parse(value);
        }
      },
    },
    afterHydrate: (ctx) => {
      const store = ctx.store as ReturnType<typeof useConfigStore>;
      // Ensure in-memory secrets are plaintext even if hydrate raced ahead of preload.
      try {
        const native = (window as any).native as { decryptSecret?: (v: string) => string } | undefined;
        if (native?.decryptSecret && Array.isArray(store.connections)) {
          store.connections = store.connections.map((conn) => ({
            ...conn,
            accessKeySecret: native.decryptSecret?.(conn.accessKeySecret || '') || conn.accessKeySecret,
          }));
        }
      } catch {}
      if (!store.activeTabConnectionIds) {
        store.activeTabConnectionIds = [];
      }
      if (store.connections.length === 0) {
        const raw = localStorage.getItem('config');
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed.configs && Array.isArray(parsed.configs) && !parsed._migrated) {
              store.migrateFromOldFormat(
                parsed.configs,
                parsed.activeBucket || "",
                parsed.defaultBucket || ""
              );
            }
          } catch {}
        }
      }
      if (store.activeTabConnectionIds.length === 0 && store.activeConnectionId) {
        store.activeTabConnectionIds.push(store.activeConnectionId);
      }
      store.activeTabConnectionIds = store.activeTabConnectionIds.filter(id =>
        store.connections.some(c => c.id === id && c.enabled !== false)
      );
      if (store.activeConnectionId && !store.activeTabConnectionIds.includes(store.activeConnectionId)) {
        store.activeConnectionId = store.activeTabConnectionIds.length > 0 ? store.activeTabConnectionIds[store.activeTabConnectionIds.length - 1] : "";
      }
      // Re-persist to encrypt any legacy plaintext secrets already in localStorage.
      try {
        (store as any).$persist?.();
      } catch {}
    },
  },
});

// 导出旧模型的 defaultConfig 以便迁移参考（后续可删除）
export const defaultConfig: LegacyStorageConfig = { endpoint: "", region: "", bucket: "", accessKeyId: "", accessKeySecret: "", enabled: true };
