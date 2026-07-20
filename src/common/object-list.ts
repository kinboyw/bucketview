import type { ObjectInfo } from '../../electron/preload/types';

/** Stable S3 object sort: directories first, then locale-aware names. */
export function sortObjectInfos<T extends ObjectInfo>(objectInfos: T[]): T[] {
  return objectInfos.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
    return a.name.localeCompare(b.name, 'zh-Hans-CN', { numeric: true });
  });
}
