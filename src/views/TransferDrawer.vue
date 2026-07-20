<template>
  <a-drawer
    :title="`传输列表(${transferTotalLength}) - 剩余(${transferLength})`"
    width="760"
    :open="open"
    :rootClassName="settingStore.themeMode === 'dark' ? 'dark-theme right-side-drawer' : 'right-side-drawer'"
    @close="closeDrawer"
  >
    <div class="transfer-summary">
      <span><CloudUploadOutlined class="summary-upload-icon" /> 上传 {{ transferUploadSpeed }}</span>
      <span><CloudDownloadOutlined class="summary-download-icon" /> 下载 {{ transferDownloadSpeed }}</span>
      <span class="transfer-summary-spacer"></span>
      <a-tooltip title="重试全部失败任务">
        <a-button type="text" size="small" :disabled="failedTransferCount === 0" @click="handleRetryAllFailedTransfers" class="recover-btn">
          <template #icon><ReloadOutlined /></template>
          <span v-if="failedTransferCount > 0" style="margin-left: 2px">{{ failedTransferCount }}</span>
        </a-button>
      </a-tooltip>
      <a-tooltip title="恢复中断的传输任务">
        <a-button type="text" size="small" @click="handleRecoverInterrupted" class="recover-btn">
          <template #icon><ThunderboltOutlined /></template>
        </a-button>
      </a-tooltip>
      <a-tooltip title="清除记录">
        <a-button type="text" size="small" danger @click="handleClearTransferHistory" class="clear-history-btn">
          <template #icon><DeleteOutlined /></template>
        </a-button>
      </a-tooltip>
    </div>
    <div
      ref="transferListRef"
      class="transfer-list"
      @scroll.passive="handleTransferListScroll"
    >
      <div class="transfer-list-phantom" :style="{ height: transferVirtualTotalHeight + 'px' }">
        <div class="transfer-list-window" :style="{ transform: `translateY(${transferVirtualOffset}px)` }">
          <div v-for="{ uid, value } in visibleTransferEntries" :key="uid" class="transfer-item">
            <div class="transfer-row">
              <div class="transfer-info">
                <span class="transfer-arrow">
                  <ArrowUpOutlined v-if="value.type === 'upload'" style="color: #52c41a; font-size: 12px" />
                  <ArrowDownOutlined v-else style="color: #fa8c16; font-size: 12px" />
                </span>
                <span
                  class="transfer-filename"
                  :class="{ 'transfer-error': value.status == 'error' || value.status == 'cancel' }"
                >{{ value.name }}</span>
                <a-tooltip>
                  <template #title>
                    <div v-if="value.bucket">存储桶: {{ value.bucket }}</div>
                    <div>本地: {{ value.localPath }}</div>
                    <div>远程: {{ value.objectName }}</div>
                  </template>
                  <span class="transfer-info-btn"><InfoCircleOutlined /></span>
                </a-tooltip>
                <span class="transfer-size">{{ formatTransferSize(value) }}</span>
              </div>
              <div class="transfer-meta">
                <span class="transfer-speed">{{ value.speed || '-' }}</span>
                <span class="transfer-time">{{ formatTransferTime(value) }}</span>
                <span class="transfer-status">
                  <span v-if="value.status === 'running' || value.status === 'waiting'" class="progress-wrap">
                    <a-progress
                      type="circle"
                      :percent="Number(value.percentage) || 0"
                      :width="80"
                      :stroke-width="8"
                      :show-info="false"
                    />
                  </span>
                  <CheckCircleFilled v-else-if="value.status === 'success'" style="color: #52c41a; font-size: 16px" />
                  <a-tooltip v-else-if="value.status === 'error' || value.status === 'cancel'" :title="value.errorDesc || ''">
                    <CloseCircleFilled :style="{ color: '#ff4d4f', fontSize: '16px', cursor: value.errorDesc ? 'help' : 'default' }" />
                  </a-tooltip>
                  <ThunderboltOutlined v-else-if="value.status === 'skipped'" style="color: #1890ff; font-size: 16px" />
                </span>
                <span class="transfer-cancel">
                  <a v-if="value.status == 'running'" @click="handleFileTransferCancel(uid)">取消</a>
                  <a-tooltip v-else-if="value.status === 'success' && value.type === 'download' && value.localPath" title="打开本地目录">
                    <FolderOpenOutlined class="transfer-action-icon" @click="handleOpenLocalFile(value.localPath)" />
                  </a-tooltip>
                  <a-tooltip v-else-if="value.status === 'error' || value.status === 'cancel'" title="重试">
                    <ReloadOutlined class="transfer-action-icon" @click="handleTransferRetry(uid)" />
                  </a-tooltip>
                  <a-tooltip v-else-if="value.status === 'skipped'" title="强制上传（跳过闪传检测）">
                    <CloudUploadOutlined class="transfer-action-icon" @click="handleTransferForceOverwrite(uid)" />
                  </a-tooltip>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </a-drawer>

  <div class="transfer-fab-wrapper" @mouseenter="transferFabHover = true" @mouseleave="transferFabHover = false">
    <div
      class="transfer-fab"
      :class="{ 'transfer-fab-visible': transferFabHover || transferLength > 0 }"
      title="传输列表"
      @click="toggleDrawer()"
    >
      <div class="red-dot-fab" v-if="transferLength > 0">
        <i>{{ transferLength }}</i>
      </div>
      <SwapOutlined style="transform: rotate(90deg)" />
    </div>
  </div>
</template>

<script lang="ts">
import { computed, defineComponent, nextTick, ref, toRaw, watch, type PropType } from 'vue';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CheckCircleFilled,
  CloseCircleFilled,
  CloudDownloadOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
  ReloadOutlined,
  SwapOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue';
import { notification } from 'ant-design-vue';
import { defaultStorage } from '../store/config';
import { useSettingStore } from '../store/setting';
import { useTransferStore, type TransferInfo } from '../store/transfer';
import { formatTransferSize, formatTransferTime, sortTransferEntries } from '../common/transfer-list';

declare const storage: any;
declare const native: any;

export default defineComponent({
  name: 'TransferDrawer',
  components: {
    ArrowDownOutlined,
    ArrowUpOutlined,
    CheckCircleFilled,
    CloseCircleFilled,
    CloudDownloadOutlined,
    CloudUploadOutlined,
    DeleteOutlined,
    FolderOpenOutlined,
    InfoCircleOutlined,
    ReloadOutlined,
    SwapOutlined,
    ThunderboltOutlined,
  },
  props: {
    open: { type: Boolean, default: false },
    ensureRecordContext: {
      type: Function as PropType<(task: TransferInfo) => TransferInfo>,
      required: true,
    },
  },
  emits: ['update:open'],
  setup(props, { emit }) {
    const settingStore = useSettingStore();
    const transferStore = useTransferStore();
    const transferFabHover = ref(false);

    const transferLength = computed(
      () => Object.values(transferStore.queue).filter((item) => item.status == 'running' || item.status == 'waiting').length,
    );
    const transferTotalLength = computed(() => Object.values(transferStore.queue).length);

    const parseSpeed = (speed = '') => {
      const match = speed.match(/^([\d.]+)\s*(B|KB|MB)\/s$/i);
      if (!match) return 0;
      const value = Number(match[1]);
      const unit = match[2].toUpperCase();
      if (unit === 'MB') return value * 1024 * 1024;
      if (unit === 'KB') return value * 1024;
      return value;
    };
    const formatSpeed = (bytes: number) => {
      if (bytes <= 0) return '0 B/s';
      if (bytes < 1024) return `${bytes.toFixed(2)} B/s`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB/s`;
      return `${(bytes / 1024 / 1024).toFixed(2)} MB/s`;
    };
    const sumTransferSpeed = (type: 'upload' | 'download') => {
      return Object.values(transferStore.queue)
        .filter((item) => item.type === type && item.status === 'running')
        .reduce((sum, item) => sum + parseSpeed(item.speed), 0);
    };
    const transferUploadSpeed = computed(() => formatSpeed(sumTransferSpeed('upload')));
    const transferDownloadSpeed = computed(() => formatSpeed(sumTransferSpeed('download')));
    const transferListEntries = computed(() =>
      sortTransferEntries(Object.entries(transferStore.queue) as [string, TransferInfo][]),
    );

    const TRANSFER_ROW_HEIGHT = 49;
    const TRANSFER_OVERSCAN = 8;
    const transferListRef = ref<HTMLElement | null>(null);
    const transferScrollTop = ref(0);
    const transferViewportHeight = ref(480);
    const transferVirtualTotalHeight = computed(() => transferListEntries.value.length * TRANSFER_ROW_HEIGHT);
    const transferVirtualStart = computed(() => {
      const start = Math.floor(transferScrollTop.value / TRANSFER_ROW_HEIGHT) - TRANSFER_OVERSCAN;
      return Math.max(0, start);
    });
    const transferVirtualOffset = computed(() => transferVirtualStart.value * TRANSFER_ROW_HEIGHT);
    const visibleTransferEntries = computed(() => {
      const all = transferListEntries.value;
      const start = transferVirtualStart.value;
      const visibleCount = Math.ceil(transferViewportHeight.value / TRANSFER_ROW_HEIGHT) + TRANSFER_OVERSCAN * 2;
      const end = Math.min(all.length, start + visibleCount);
      const rows: { uid: string; value: TransferInfo }[] = [];
      for (let idx = start; idx < end; idx++) {
        const entry = all[idx];
        if (!entry) continue;
        rows.push({ uid: entry[0], value: entry[1] });
      }
      return rows;
    });
    const handleTransferListScroll = (e: Event) => {
      const el = e.target as HTMLElement | null;
      if (!el) return;
      transferScrollTop.value = el.scrollTop;
      transferViewportHeight.value = el.clientHeight || transferViewportHeight.value;
    };
    const measureTransferListViewport = () => {
      const el = transferListRef.value;
      if (!el) return;
      transferViewportHeight.value = el.clientHeight || 480;
    };
    const clampTransferListScroll = () => {
      const el = transferListRef.value;
      if (!el) return;
      const maxScroll = Math.max(0, el.scrollHeight - el.clientHeight);
      if (el.scrollTop > maxScroll) el.scrollTop = maxScroll;
      transferScrollTop.value = el.scrollTop;
      transferViewportHeight.value = el.clientHeight || transferViewportHeight.value;
    };
    watch(() => props.open, (open) => {
      if (!open) return;
      nextTick(() => {
        measureTransferListViewport();
        transferScrollTop.value = transferListRef.value?.scrollTop || 0;
      });
    });
    watch(() => transferListEntries.value.length, () => {
      nextTick(clampTransferListScroll);
    });

    const closeDrawer = () => emit('update:open', false);
    const toggleDrawer = (visible?: boolean) => {
      emit('update:open', visible ?? !props.open);
    };

    const handleClearTransferHistory = () => {
      transferStore.clearHistory();
    };

    const handleRecoverInterrupted = () => {
      const interrupted = storage.recoverInterrupted();
      if (!interrupted || interrupted.length === 0) {
        notification.info({ message: '没有中断的传输任务' });
        return;
      }
      let recovered = 0;
      for (const job of interrupted) {
        if (!job.uid) continue;
        storage.clearCancel(job.uid);
        const existing = transferStore.queue[job.uid];
        if (existing && (existing.status === 'running' || existing.status === 'waiting' || existing.status === 'success')) continue;
        const t: TransferInfo = {
          type: job.type || 'upload',
          uid: job.uid,
          name: job.name || (job.objectName ? native.pathBasename(job.objectName) : ''),
          objectName: job.objectName || '',
          localPath: job.localPath || '',
          prefix: job.prefix || '',
          bucket: job.bucket || '',
          pathPrefix: job.pathPrefix || '',
          connectionId: job.connectionId || job.connection?.id || '',
          connection: job.connection,
          sourceDirectory: job.sourceDirectory || job.prefix || '',
          connectionLabel: job.connectionLabel || job.connectionId || job.connection?.id || '',
          status: 'waiting',
          totalBytes: job.totalBytes || 0,
          createdAt: job.createdAt || Date.now(),
        };
        transferStore.setRecord(job.uid, t);
        if (job.type === 'upload') storage.putObject(defaultStorage, t);
        else storage.getObject(defaultStorage, t);
        recovered++;
      }
      if (recovered > 0) notification.success({ message: `已恢复 ${recovered} 个传输任务` });
      else notification.info({ message: '没有需要恢复的传输任务' });
    };

    const handleFileTransferCancel = (uid: string) => {
      storage.markCancel(uid);
      Object.assign(transferStore.queue[uid], { status: 'cancel' });
    };

    const handleOpenLocalFile = (localPath: string) => {
      native.showLocalFile(localPath);
    };

    const handleTransferRetry = (uid: string) => {
      const t = transferStore.queue[uid];
      if (!t) return;
      storage.clearCancel(uid);

      if (t.type === 'download' && t.localPath && t.totalBytes) {
        const localSize = native.localFileSize(t.localPath);
        if (localSize !== null && localSize > 0 && localSize < t.totalBytes) {
          Object.assign(t, {
            status: 'waiting',
            percentage: ((localSize / t.totalBytes) * 100).toFixed(2),
            speed: undefined,
            remaining: undefined,
            consumedBytes: localSize,
            totalBytes: t.totalBytes,
            errorDesc: undefined,
            completedAt: undefined,
          });
          const resumeOptions = Object.assign({}, toRaw(props.ensureRecordContext(t)), {
            resumeFrom: { filePath: t.localPath, downloaded: localSize, total: t.totalBytes },
          });
          storage.getObject(defaultStorage, resumeOptions);
          return;
        }
        if (localSize !== null) {
          Object.assign(t, {
            status: 'waiting',
            percentage: undefined,
            speed: undefined,
            remaining: undefined,
            consumedBytes: undefined,
            errorDesc: undefined,
            completedAt: undefined,
          });
          const overwriteOptions = Object.assign({}, toRaw(props.ensureRecordContext(t)), {
            forceOverwrite: true,
          });
          storage.getObject(defaultStorage, overwriteOptions);
          return;
        }
      }

      Object.assign(t, {
        status: 'waiting',
        percentage: undefined,
        speed: undefined,
        remaining: undefined,
        consumedBytes: undefined,
        errorDesc: undefined,
        completedAt: undefined,
      });
      if (t.type === 'upload') {
        storage.putObject(defaultStorage, toRaw(props.ensureRecordContext(t)) as TransferInfo);
      } else {
        storage.getObject(defaultStorage, Object.assign({}, toRaw(props.ensureRecordContext(t)), { forceOverwrite: true }));
      }
    };

    const failedTransferCount = computed(() =>
      Object.values(transferStore.queue).filter((item) => item.status === 'error' || item.status === 'cancel').length,
    );

    const handleRetryAllFailedTransfers = () => {
      const failed = Object.entries(transferStore.queue)
        .filter(([, item]) => item.status === 'error' || item.status === 'cancel')
        .map(([uid]) => uid);
      if (failed.length === 0) {
        notification.info({ message: '没有失败的传输任务' });
        return;
      }
      failed.forEach((uid) => handleTransferRetry(uid));
      notification.success({ message: `已重新排队 ${failed.length} 个失败任务` });
    };

    const handleTransferForceOverwrite = (uid: string) => {
      const t = transferStore.queue[uid];
      if (!t) return;
      Object.assign(t, {
        status: 'waiting',
        percentage: undefined,
        speed: undefined,
        remaining: undefined,
        consumedBytes: undefined,
        errorDesc: undefined,
      });
      storage.putObject(defaultStorage, toRaw(props.ensureRecordContext(t)) as TransferInfo);
    };

    return {
      settingStore,
      open: computed(() => props.open),
      transferFabHover,
      transferLength,
      transferTotalLength,
      transferUploadSpeed,
      transferDownloadSpeed,
      failedTransferCount,
      transferListRef,
      visibleTransferEntries,
      transferVirtualTotalHeight,
      transferVirtualOffset,
      handleTransferListScroll,
      formatTransferSize,
      formatTransferTime,
      closeDrawer,
      toggleDrawer,
      handleClearTransferHistory,
      handleRecoverInterrupted,
      handleFileTransferCancel,
      handleOpenLocalFile,
      handleTransferRetry,
      handleRetryAllFailedTransfers,
      handleTransferForceOverwrite,
    };
  },
});
</script>

<style lang="less">
.transfer-fab-wrapper {
  position: fixed;
  right: 0;
  bottom: 8px;
  z-index: 100;
  padding: 8px 4px 8px 8px;
}

.transfer-fab {
  position: relative;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #475569;
  color: #ffffff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  transform: translateX(calc(100% - 8px));
  opacity: 1;
  transition: transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1), background 0.15s ease, box-shadow 0.15s ease;

  .dark-theme & {
    background: #475569;
    color: #ffffff;
  }

  &:hover {
    background: #334155;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.2);

    .dark-theme & {
      background: #334155;
    }
  }

  &.transfer-fab-visible {
    transform: translateX(0);
  }

  .red-dot-fab {
    position: absolute;
    top: -4px;
    right: -4px;
    min-width: 16px;
    height: 16px;
    border-radius: 8px;
    background: #ff4d4f;
    color: #fff;
    font-size: 10px;
    line-height: 16px;
    text-align: center;
    padding: 0 4px;
  }
}

.ant-drawer-body {
  .transfer-summary {
    display: flex;
    gap: 16px;
    padding: 8px 0;
    margin-bottom: 8px;
    font-size: 13px;
    color: #595959;
    border-bottom: 1px solid #f0f0f0;

    .summary-upload-icon {
      color: var(--ant-color-primary);
      font-size: 14px;
    }

    .summary-download-icon {
      color: #52c41a;
      font-size: 14px;
    }

    .transfer-summary-spacer {
      flex: 1;
    }
  }

  .transfer-list {
    max-height: calc(100vh - 180px);
    overflow-y: auto;
    position: relative;

    .transfer-list-phantom {
      position: relative;
      width: 100%;
    }

    .transfer-list-window {
      position: absolute;
      left: 0;
      right: 0;
      top: 0;
      will-change: transform;
    }

    .transfer-item {
      width: 100%;
      height: 49px;
      box-sizing: border-box;
      padding: 6px 0;
      border-bottom: 1px solid #f5f5f5;
    }

    .transfer-row {
      width: 100%;
      display: grid;
      grid-template-columns: minmax(0, 1fr) 318px;
      column-gap: 32px;
      align-items: center;
      font-size: 12px;
    }

    .transfer-info {
      min-width: 0;
      display: grid;
      grid-template-columns: 24px minmax(0, 1fr) 20px 90px;
      column-gap: 8px;
      align-items: center;
    }

    .transfer-meta {
      display: grid;
      grid-template-columns: 120px 70px 24px 24px;
      column-gap: 12px;
      align-items: center;
    }

    .transfer-arrow {
      width: 24px;
      text-align: center;
    }

    .transfer-filename {
      min-width: 0;
      text-align: left;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #262626;

      .dark-theme & {
        color: rgba(255, 255, 255, 0.85);
      }
    }

    .transfer-info-btn {
      color: #bfbfbf;
      font-size: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;

      &:hover {
        color: var(--ant-color-primary);
      }
    }

    .transfer-size {
      width: 90px;
      text-align: left;
      color: #8c8c8c;
      font-size: 11px;
      white-space: nowrap;

      .dark-theme & {
        color: rgba(255, 255, 255, 0.45);
      }
    }

    .transfer-speed {
      width: 120px;
      text-align: right;
      color: #595959;
      font-size: 11px;
      white-space: nowrap;

      .dark-theme & {
        color: rgba(255, 255, 255, 0.65);
      }
    }

    .transfer-time {
      width: 70px;
      text-align: right;
      color: #8c8c8c;
      font-size: 10px;
      white-space: nowrap;

      .dark-theme & {
        color: rgba(255, 255, 255, 0.45);
      }
    }

    .transfer-status {
      flex-shrink: 0;
    }

    .progress-wrap {
      display: inline-block;
      overflow: hidden;
      zoom: 0.15;
      vertical-align: middle;
      line-height: 0;
      font-size: 0;
    }

    .transfer-cancel {
      text-align: center;
      white-space: nowrap;
    }

    .transfer-action-icon {
      font-size: 14px;
      color: var(--ant-color-primary);
      cursor: pointer;

      &:hover {
        color: #40a9ff;
      }
    }
  }
}

.transfer-error {
  color: red;
}
</style>
