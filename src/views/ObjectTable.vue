<template>
  <div ref="tableWrapperRef" class="table-wrapper" @contextmenu="onBlankContextMenu">
    <a-spin :spinning="loading">
      <template #indicator>
        <div class="content-custom-loader">
          <div class="content-loader-ring"></div>
          <div class="content-loader-ring"></div>
          <div class="content-loader-ring"></div>
          <div class="content-loader-text">Loading...</div>
        </div>
      </template>
      <div class="table-content" :class="{ 'table-content-hidden': loading }">
        <a-table
          :columns="tableColumns"
          :data-source="visibleSource"
          rowKey="objectName"
          :pagination="false"
          :locale="tableLocale"
          :scroll="{ y: tableScrollHeight }"
          :row-selection="tableRowSelection"
          :customRow="customTableRow"
        >
          <template #bodyCell="{ column, record }">
            <template v-if="column.dataIndex === 'name'">
              <a
                v-if="record.type === 'directory'"
                class="file-name file-name-directory"
                @mouseenter="(e: MouseEvent) => onNavHover(record as ObjectInfo, e)"
                @mouseleave="(e: MouseEvent) => onNavLeave(e)"
              >
                <FolderOutlined class="file-icon folder-icon" />
                <span>{{ record.name }}</span>
                <span
                  v-if="isVirtualBucketList && bucketMountInfoMap[record.objectName]"
                  :class="['bucket-mount-tag', {
                    'bucket-mount-tag-mounted': bucketMountInfoMap[record.objectName].mounted,
                    'bucket-mount-tag-loading': bucketMountInfoMap[record.objectName].loading,
                  }]"
                  :title="bucketMountInfoMap[record.objectName].mounted
                    ? '已挂载'
                    : bucketMountInfoMap[record.objectName].loading
                      ? '操作中'
                      : '未挂载'"
                >{{ bucketMountInfoMap[record.objectName].mountPoint }}</span>
              </a>
              <span v-else class="file-name">
                <component :is="getFileIcon(record.name)" class="file-icon" />
                <span>{{ record.name }}</span>
              </span>
            </template>
            <template v-if="column.dataIndex === 'action'">
              <span class="action-column">
                <template v-if="record.type === 'directory'">
                  <CloudUploadOutlined
                    v-if="!isVirtualBucketList"
                    style="margin-right: 8px"
                    title="上传到此目录"
                    @click="onUploadToDirectory(record as ObjectInfo)"
                  />
                  <DownloadOutlined
                    v-if="!isVirtualBucketList"
                    style="margin-right: 8px"
                    @click="onDownload(record as ObjectInfo)"
                  />
                </template>
                <template v-else>
                  <EyeOutlined style="margin-right: 8px" @click="onPreview(record as ObjectInfo)" />
                  <DownloadOutlined style="margin-right: 8px" @click="onDownload(record as ObjectInfo)" />
                  <ShareAltOutlined style="margin-right: 8px" @click="onSign((record as ObjectInfo).objectName)" />
                </template>
                <DeleteOutlined @click="onDelete([(record as ObjectInfo).objectName])" />
              </span>
            </template>
          </template>
        </a-table>
      </div>
    </a-spin>

    <div ref="customPaginationRef" class="custom-pagination">
      <div class="status-bar">
        <span class="status-item"><FolderOutlined /> {{ directoryCount }} 个目录</span>
        <span class="status-item"><FileOutlined /> {{ fileCount }} 个文件</span>
        <span class="status-item" v-if="listLoadingMore">
          <LoadingOutlined spin /> 继续加载中…
          <template v-if="listLoadedPages > 0">（第 {{ listLoadedPages }} 批）</template>
          <a class="status-cancel-load" @click.stop="onCancelLoad">停止</a>
        </span>
        <span class="status-item" v-else-if="nextContinuationToken">还有更多对象可加载</span>
        <span class="status-item" v-if="currentDirectoryTotalSize > 0">
          <DatabaseOutlined /> {{ formatDirectorySize }}
        </span>
        <span class="status-item status-endpoint" v-if="endpoint" :title="endpoint">
          <InfoCircleOutlined /> {{ endpoint }}
        </span>
        <span class="status-item status-scope" v-if="scope" :title="scope">
          <FolderOutlined /> {{ scope }}
        </span>
        <span class="status-item status-selected" v-if="selectedRowKeys.length > 0">
          <CheckSquareOutlined /> 已选 {{ selectedRowKeys.length }}
        </span>
        <template v-if="!isVirtualBucketList && mountStatus !== 'none'">
          <span class="status-item">
            <span
              class="mount-indicator"
              :class="{
                mounted: mountStatus === 'mounted',
                'mount-loading': mountStatus === 'loading',
              }"
            ></span>
            {{
              mountStatus === 'loading'
                ? '操作中...'
                : mountStatus === 'mounted'
                  ? `已挂载 ${mountPoint}`
                  : '未挂载'
            }}
          </span>
          <span
            v-if="mountStatus === 'mounted' && vfsSyncState !== 'idle'"
            class="status-item vfs-sync-badge"
            :class="{
              'vfs-syncing': vfsSyncState === 'syncing',
              'vfs-synced': vfsSyncState === 'synced',
              'vfs-failed': vfsSyncState === 'failed',
            }"
          >
            <span class="vfs-sync-dot" :class="vfsSyncState"></span>
            {{ vfsSyncState === 'syncing' ? '同步中' : vfsSyncState === 'synced' ? '已同步' : '同步异常' }}
          </span>
          <a-tooltip v-if="vfsSyncState === 'failed' && vfsFailedFiles.length > 0" placement="topRight">
            <template #title>
              <div class="vfs-failed-popup">
                <div class="vfs-failed-title">同步异常文件</div>
                <div v-for="f in vfsFailedFiles" :key="f" class="vfs-failed-item">{{ f }}</div>
              </div>
            </template>
            <span class="vfs-failed-trigger"><QuestionCircleOutlined /></span>
          </a-tooltip>
        </template>
      </div>
      <a-pagination
        v-if="listLoadMode !== 'waterfall'"
        :total="dataSource.length"
        :current="pageCurrent"
        :pageSize="pageSize"
        :pageSizeOptions="['10', '20', '50', '100']"
        show-less-items
        show-size-changer
        @change="onPageChange"
        @showSizeChange="onPageSizeChange"
      />
    </div>
  </div>
</template>

<script lang="ts">
import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
  watch,
  type PropType,
} from 'vue';
import type { TableColumnType } from 'ant-design-vue';
import {
  CheckSquareOutlined,
  CloudUploadOutlined,
  CodeOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EyeOutlined,
  FileExcelOutlined,
  FileImageOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileTextOutlined,
  FileWordOutlined,
  FileZipOutlined,
  FolderOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
  QuestionCircleOutlined,
  ShareAltOutlined,
  SoundOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons-vue';
import type { ObjectInfo } from '../../electron/preload/types';
import StringUtil from '../common/stringUtil';
import { useSettingStore } from '../store/setting';

export type MountStatus = 'none' | 'mounted' | 'unmounted' | 'loading';
export type VfsSyncState = 'idle' | 'syncing' | 'synced' | 'failed';

export interface BucketMountInfo {
  mountPoint: string;
  mounted: boolean;
  loading: boolean;
}

export default defineComponent({
  name: 'ObjectTable',
  components: {
    CheckSquareOutlined,
    CloudUploadOutlined,
    DatabaseOutlined,
    DeleteOutlined,
    DownloadOutlined,
    EyeOutlined,
    FileOutlined,
    FolderOutlined,
    InfoCircleOutlined,
    LoadingOutlined,
    QuestionCircleOutlined,
    ShareAltOutlined,
  },
  props: {
    dataSource: { type: Array as PropType<ObjectInfo[]>, default: () => [] },
    loading: { type: Boolean, default: false },
    selectedRowKeys: { type: Array as PropType<Array<string | number>>, default: () => [] },
    isVirtualBucketList: { type: Boolean, default: false },
    bucketMountInfoMap: {
      type: Object as PropType<Record<string, BucketMountInfo>>,
      default: () => ({}),
    },
    listLoadingMore: { type: Boolean, default: false },
    listLoadedPages: { type: Number, default: 0 },
    nextContinuationToken: { type: [String, null] as unknown as PropType<string | null>, default: null },
    endpoint: { type: String, default: '' },
    scope: { type: String, default: '' },
    mountStatus: { type: String as PropType<MountStatus>, default: 'none' },
    mountPoint: { type: String, default: '' },
    vfsSyncState: { type: String as PropType<VfsSyncState>, default: 'idle' },
    vfsFailedFiles: { type: Array as PropType<string[]>, default: () => [] },
    pageCurrent: { type: Number, default: 1 },
    pageSize: { type: Number, default: 20 },
  },
  emits: [
    'update:selectedRowKeys',
    'selection-change',
    'row-select',
    'row-click',
    'row-dblclick',
    'row-contextmenu',
    'blank-contextmenu',
    'nav-hover',
    'nav-leave',
    'upload-to-directory',
    'download',
    'preview',
    'sign',
    'delete',
    'cancel-load',
    'update:pageCurrent',
    'update:pageSize',
    'page-change',
    'page-size-change',
  ],
  setup(props, { emit }) {
    const settingStore = useSettingStore();
    const tableWrapperRef = ref<HTMLElement | null>(null);
    const customPaginationRef = ref<HTMLElement | null>(null);
    const tableScrollHeight = ref(400);
    const windowHeight = ref(typeof window !== 'undefined' ? window.innerHeight : 800);

    const calcTableScrollHeight = () => {
      const wrapper = tableWrapperRef.value;
      if (!wrapper) {
        tableScrollHeight.value = Math.max(windowHeight.value - 124, 200);
        return;
      }
      const rect = wrapper.getBoundingClientRect();
      const paginationH = customPaginationRef.value?.offsetHeight || 42;
      const available = windowHeight.value - rect.top - paginationH - 8;
      tableScrollHeight.value = Math.max(available, 200);
    };

    const onResize = () => {
      windowHeight.value = window.innerHeight;
      calcTableScrollHeight();
    };

    onMounted(() => {
      window.addEventListener('resize', onResize);
      nextTick(() => {
        calcTableScrollHeight();
        if (tableWrapperRef.value) {
          tableWrapperRef.value.addEventListener('scroll', handleTableBodyScroll, {
            capture: true,
            passive: true,
          } as any);
        }
      });
    });

    onUnmounted(() => {
      window.removeEventListener('resize', onResize);
      if (tableWrapperRef.value) {
        tableWrapperRef.value.removeEventListener('scroll', handleTableBodyScroll, true as any);
      }
    });

    watch(
      () => [props.dataSource.length, props.loading, props.listLoadingMore, props.pageSize, props.pageCurrent],
      () => nextTick(calcTableScrollHeight),
    );

    const listLoadMode = computed(() => settingStore.listLoadMode || 'waterfall');
    const WATERFALL_PAGE = 80;
    const waterfallLimit = ref(WATERFALL_PAGE);

    const visibleSource = computed(() => {
      const rows = props.dataSource || [];
      if (listLoadMode.value === 'waterfall') {
        return rows.slice(0, waterfallLimit.value);
      }
      const start = (props.pageCurrent - 1) * props.pageSize;
      return rows.slice(start, start + props.pageSize);
    });

    watch(
      () => props.dataSource,
      (next, prev) => {
        // Reset window when list is replaced/cleared, not when progressive append grows it.
        if (!Array.isArray(next) || next.length === 0) {
          waterfallLimit.value = WATERFALL_PAGE;
          return;
        }
        if (!Array.isArray(prev) || prev.length === 0) {
          waterfallLimit.value = WATERFALL_PAGE;
          return;
        }
        // Different array identity with smaller/equal size => directory switch or silent refresh.
        if (next !== prev && next.length <= prev.length) {
          waterfallLimit.value = WATERFALL_PAGE;
        }
      },
    );

    let waterfallScrollRaf = 0;
    const handleTableBodyScroll = (e: Event) => {
      const target = e.target as HTMLElement | null;
      if (!target?.classList?.contains('ant-table-body')) return;
      if (listLoadMode.value !== 'waterfall') return;
      if (waterfallScrollRaf) return;
      waterfallScrollRaf = requestAnimationFrame(() => {
        waterfallScrollRaf = 0;
        if (target.scrollTop + target.clientHeight < target.scrollHeight - 80) return;
        if (waterfallLimit.value >= props.dataSource.length) return;
        waterfallLimit.value = Math.min(
          props.dataSource.length,
          waterfallLimit.value + WATERFALL_PAGE,
        );
      });
    };

    const listStats = computed(() => {
      let directoryCount = 0;
      let fileCount = 0;
      let totalSize = 0;
      const rows = props.dataSource || [];
      for (let i = 0; i < rows.length; i++) {
        const item = rows[i];
        if (item.type === 'directory') directoryCount += 1;
        else {
          fileCount += 1;
          totalSize += item.size || 0;
        }
      }
      return { directoryCount, fileCount, totalSize };
    });
    const directoryCount = computed(() => listStats.value.directoryCount);
    const fileCount = computed(() => listStats.value.fileCount);
    const currentDirectoryTotalSize = computed(() => listStats.value.totalSize);
    const formatDirectorySize = computed(() =>
      StringUtil.formatFileSize(currentDirectoryTotalSize.value),
    );

    const tableLocale = computed(() => (props.loading ? { emptyText: ' ' } : undefined));

    const getFileIconInfo = (filename: string) => {
      const ext = (filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : '').toLowerCase();
      if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'].includes(ext)) {
        return { icon: FileImageOutlined, color: '#13c2c2' };
      }
      if (['pdf'].includes(ext)) return { icon: FilePdfOutlined, color: '#ff4d4f' };
      if (['xls', 'xlsx', 'csv'].includes(ext)) return { icon: FileExcelOutlined, color: '#52c41a' };
      if (['doc', 'docx'].includes(ext)) return { icon: FileWordOutlined, color: '#1677ff' };
      if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return { icon: FileZipOutlined, color: '#faad14' };
      if (['mp4', 'mkv', 'mov', 'avi', 'webm'].includes(ext)) return { icon: VideoCameraOutlined, color: '#722ed1' };
      if (['mp3', 'wav', 'flac', 'aac', 'ogg'].includes(ext)) return { icon: SoundOutlined, color: '#eb2f96' };
      if (['txt', 'md', 'json', 'xml', 'yml', 'yaml', 'log', 'ini', 'conf'].includes(ext)) {
        return { icon: FileTextOutlined, color: '#8c8c8c' };
      }
      if (['js', 'ts', 'tsx', 'jsx', 'vue', 'py', 'go', 'java', 'c', 'cpp', 'rs', 'sh'].includes(ext)) {
        return { icon: CodeOutlined, color: '#2f54eb' };
      }
      if (['db', 'sqlite', 'sql'].includes(ext)) return { icon: DatabaseOutlined, color: '#faad14' };
      return { icon: FileOutlined, color: '#8c8c8c' };
    };

    const fileIconCache = new Map<string, any>();
    const getFileIcon = (filename: string) => {
      const ext = (filename.includes('.') ? filename.slice(filename.lastIndexOf('.') + 1) : '').toLowerCase();
      const key = ext || filename;
      const cached = fileIconCache.get(key);
      if (cached) return cached;
      const icon = getFileIconInfo(filename).icon;
      fileIconCache.set(key, icon);
      return icon;
    };

    const tableColumns: TableColumnType<ObjectInfo>[] = [
      { title: '文件名', dataIndex: 'name', key: 'name', ellipsis: true },
      {
        title: '文件大小',
        dataIndex: 'size',
        key: 'size',
        width: 120,
        ellipsis: false,
        customRender: (opt: any) => {
          const size = opt.record.size;
          return size ? StringUtil.formatFileSize(size) : '-';
        },
      },
      {
        title: '更新时间',
        dataIndex: 'lastModified',
        key: 'lastModified',
        width: 180,
        ellipsis: false,
        customRender: (opt: any) => {
          const date = opt.record.lastModified;
          return date ? StringUtil.formatDate(date) : '-';
        },
      },
      { title: '操作', dataIndex: 'action', key: 'action', width: 150 },
    ];

    const tableRowSelection = computed(() => ({
      selectedRowKeys: props.selectedRowKeys,
      onChange: (selectedRowKeys: Array<string | number>, selectedRows: ObjectInfo[]) => {
        emit('update:selectedRowKeys', selectedRowKeys);
        emit('selection-change', selectedRowKeys, selectedRows);
      },
      onSelect: (
        record: ObjectInfo,
        selected: boolean,
        selectedRows: ObjectInfo[],
        nativeEvent: Event,
      ) => {
        emit('row-select', record, selected, selectedRows, nativeEvent);
      },
    }));

    const customTableRow = (record: ObjectInfo) => ({
      onContextmenu: (e: MouseEvent) => emit('row-contextmenu', e, record),
      onClick: (e: MouseEvent) => emit('row-click', e, record),
      onDblclick: (e: MouseEvent) => emit('row-dblclick', e, record),
    });

    const onBlankContextMenu = (e: MouseEvent) => emit('blank-contextmenu', e);

    const onPageChange = (page: number) => {
      emit('update:pageCurrent', page);
      emit('page-change', page);
    };
    const onPageSizeChange = (current: number, size: number) => {
      emit('update:pageSize', size);
      emit('page-size-change', current, size);
    };

    const onNavHover = (record: ObjectInfo, e: MouseEvent) => emit('nav-hover', record, e);
    const onNavLeave = (e: MouseEvent) => emit('nav-leave', e);
    const onUploadToDirectory = (record: ObjectInfo) => emit('upload-to-directory', record);
    const onDownload = (record: ObjectInfo) => emit('download', record);
    const onPreview = (record: ObjectInfo) => emit('preview', record);
    const onSign = (objectName: string) => emit('sign', objectName);
    const onDelete = (objectNames: string[]) => emit('delete', objectNames);
    const onCancelLoad = () => emit('cancel-load');

    return {
      tableWrapperRef,
      customPaginationRef,
      tableScrollHeight,
      tableColumns,
      tableLocale,
      visibleSource,
      tableRowSelection,
      customTableRow,
      getFileIcon,
      directoryCount,
      fileCount,
      currentDirectoryTotalSize,
      formatDirectorySize,
      listLoadMode,
      onBlankContextMenu,
      onPageChange,
      onPageSizeChange,
      onNavHover,
      onNavLeave,
      onUploadToDirectory,
      onDownload,
      onPreview,
      onSign,
      onDelete,
      onCancelLoad,
    };
  },
});
</script>

<style lang="less">
.table-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: var(--ant-color-bg-container);
  overflow: hidden;

  .table-content {
    transition: opacity 0.2s ease;
  }

  .table-content-hidden {
    opacity: 0;
    pointer-events: none;
  }

  .content-custom-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    padding: 0;
    position: relative;
    width: 80px;
    height: 80px;
    margin: 0 auto;

    .content-loader-ring {
      position: absolute;
      width: 100%;
      height: 100%;
      border-radius: 50%;
      border: 3px solid transparent;

      &:nth-child(1) {
        border-top-color: #1890ff;
        animation: object-table-spin1 1.5s linear infinite;
      }
      &:nth-child(2) {
        border-right-color: #52c41a;
        animation: object-table-spin2 1.8s linear infinite;
      }
      &:nth-child(3) {
        border-bottom-color: #722ed1;
        animation: object-table-spin3 2.1s linear infinite;
      }
    }

    .content-loader-text {
      position: absolute;
      bottom: -32px;
      font-size: 13px;
      font-weight: 500;
      letter-spacing: 2px;
      color: var(--ant-color-text-secondary);
    }
  }

  > .ant-spin-nested-loading,
  > .ant-spin-nested-loading > .ant-spin-container {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }

  > .ant-spin-nested-loading > div > .ant-spin {
    inset: 0;
    max-height: none;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  > .ant-spin-nested-loading > div > .ant-spin .ant-spin-dot {
    position: static;
    width: auto;
    height: auto;
    margin: 0;
    transform: none;
  }

  .ant-table-wrapper {
    flex: 1;
    min-height: 0;
    overflow: hidden;
  }

  .ant-table {
    background: var(--ant-color-bg-container);

    .ant-table-thead > tr > th {
      padding: 8px 12px;
      font-size: 12px;
      font-weight: 600;
      background: var(--ant-color-bg-layout);
      border-bottom: 1px solid var(--ant-color-border);
      color: var(--ant-color-text-secondary);
    }

    .ant-table-tbody > tr > td {
      padding: 6px 12px;
      font-size: 12px;
      line-height: 20px;
      border-bottom: 1px solid var(--ant-color-fill-tertiary);
    }

    .ant-table-tbody > tr:hover > td {
      background: var(--ant-color-bg-layout);
    }

    .ant-table-tbody > tr.ant-table-row-selected > td {
      background: #eff6ff;
      border-bottom-color: #dbeafe;
      .dark-theme & {
        background: rgba(255, 255, 255, 0.08);
        border-bottom-color: rgba(255, 255, 255, 0.12);
      }
    }

    .ant-table-row:hover .file-name {
      color: var(--theme-color, #4f46e5);
    }
  }

  .action-column {
    display: inline-flex;
    align-items: center;
  }

  .file-name {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    color: var(--ant-color-text);

    .file-icon {
      font-size: 14px;
      flex-shrink: 0;
      color: var(--ant-color-text-secondary);
    }

    &.file-name-directory {
      font-weight: 500;
      color: var(--ant-color-text);

      .file-icon {
        color: var(--theme-color, var(--ant-color-text-secondary));
      }

      .bucket-mount-tag {
        font-size: 10px;
        line-height: 1;
        padding: 1px 4px;
        border-radius: 3px;
        background: #fff7ed;
        color: #d97706;
        border: 1px solid #fde68a;
        margin-left: 6px;
        flex-shrink: 0;

        &.bucket-mount-tag-mounted {
          background: #f0fdf4;
          color: #16a34a;
          border-color: #bbf7d0;
        }

        &.bucket-mount-tag-loading {
          background: #fffbeb;
          color: #d97706;
          border-color: #fde68a;
          animation: object-table-tag-pulse 1s ease-in-out infinite;
        }
      }
    }
  }
}

.custom-pagination {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  align-self: stretch;
  width: 100%;
  box-sizing: border-box;
  margin: 0 !important;
  padding: 6px 12px;
  border-top: 1px solid var(--ant-color-border-secondary);
  background: transparent;
  border-radius: 0 0 12px 12px;

  .status-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 11px;
    color: var(--ant-color-text-secondary);
    min-width: 0;

    .status-item {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      white-space: nowrap;

      .anticon {
        font-size: 12px;
        color: var(--ant-color-text-tertiary);
      }
    }

    .status-endpoint,
    .status-scope {
      max-width: 260px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--ant-color-text-tertiary);
    }

    .status-selected {
      color: #4f46e5;
      font-weight: 600;

      .anticon {
        color: #4f46e5;
      }
    }

    .mount-indicator {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--ant-color-text-quaternary);

      &.mounted {
        background: #22c55e;
      }

      &.mount-loading {
        background: #f59e0b;
        animation: object-table-dot-pulse 1s ease-in-out infinite;
      }
    }

    .vfs-sync-badge {
      font-size: 12px;
      display: inline-flex;
      align-items: center;
      gap: 4px;

      .vfs-sync-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;

        &.syncing {
          background: #f59e0b;
          animation: object-table-vfs-breathing 1.5s ease-in-out infinite;
        }

        &.synced {
          background: #22c55e;
          animation: object-table-vfs-flash 0.6s ease-out;
        }

        &.failed {
          background: #ef4444;
          animation: object-table-vfs-breathing-red 1.5s ease-in-out infinite;
        }
      }

      &.vfs-syncing { color: #f59e0b; }
      &.vfs-synced { color: #22c55e; }
      &.vfs-failed { color: #ef4444; }
    }

    .vfs-failed-trigger {
      color: #ef4444;
      cursor: pointer;
      font-size: 12px;
      margin-left: 2px;
    }
  }

  .vfs-failed-popup {
    .vfs-failed-title {
      font-weight: 600;
      margin-bottom: 4px;
      color: #ef4444;
    }

    .vfs-failed-item {
      font-size: 12px;
      color: var(--ant-color-text-tertiary);
      line-height: 18px;
    }
  }

  .ant-pagination {
    font-size: 12px;

    .ant-pagination-item,
    .ant-pagination-prev,
    .ant-pagination-next {
      min-width: 24px;
      height: 24px;
      line-height: 22px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--ant-color-text-secondary);
      margin-right: 2px;
      font-size: 12px;

      a {
        color: var(--ant-color-text-secondary);
        padding: 0 6px;
      }

      &:hover {
        background: var(--ant-color-fill-tertiary);

        a {
          color: var(--ant-color-text);
        }
      }
    }

    .ant-pagination-item-active {
      background: var(--ant-color-bg-container);
      border-color: var(--ant-color-border);
      font-weight: 600;

      a {
        color: var(--theme-color, var(--ant-color-text));
      }
    }

    .ant-pagination-jump-prev .ant-pagination-item-link-icon,
    .ant-pagination-jump-next .ant-pagination-item-link-icon {
      color: var(--ant-color-text-tertiary);
    }

    .ant-pagination-options {
      .ant-select {
        font-size: 12px;

        .ant-select-selector {
          height: 24px !important;
          min-height: 24px !important;
          padding: 0 4px !important;
          border-color: var(--ant-color-border) !important;
        }

        .ant-select-selection-item {
          line-height: 22px !important;
          font-size: 12px;
        }

        .ant-select-arrow {
          inset-inline-end: 4px;
        }
      }
    }
  }
}

.status-cancel-load {
  margin-left: 8px;
  color: var(--ant-color-primary);
  cursor: pointer;
}
.status-cancel-load:hover {
  text-decoration: underline;
}

@keyframes object-table-spin1 {
  to { transform: rotate(360deg); }
}
@keyframes object-table-spin2 {
  to { transform: rotate(-360deg); }
}
@keyframes object-table-spin3 {
  to { transform: rotate(360deg); }
}
@keyframes object-table-tag-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes object-table-dot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
@keyframes object-table-vfs-breathing {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
@keyframes object-table-vfs-breathing-red {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}
@keyframes object-table-vfs-flash {
  0% { transform: scale(1.4); opacity: 0.4; }
  100% { transform: scale(1); opacity: 1; }
}
</style>

