import StringUtil from './stringUtil';
import type { TransferInfo } from '../store/transfer';

/** Format total size for transfer drawer rows (matches previous UI). */
export function formatTransferSize(value: TransferInfo): string {
  if (!value.totalBytes) return '-';
  return StringUtil.formatFileSize(value.totalBytes);
}

/** Relative completion time label for transfer history rows. */
export function formatTransferTime(value: TransferInfo): string {
  if (!value.completedAt) return '';
  const diff = Date.now() - value.completedAt;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  return `${days}天前`;
}

/** Sort transfer map entries newest-first for drawer windowing. */
export function sortTransferEntries(entries: [string, TransferInfo][]): [string, TransferInfo][] {
  return entries.sort((a, b) => {
    const ta = a[1].createdAt || 0;
    const tb = b[1].createdAt || 0;
    return tb - ta;
  });
}
