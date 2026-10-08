<template>
  <a-modal
    :open="open"
    title="应用运行诊断日志"
    width="900px"
    centered
    :footer="null"
    @cancel="$emit('update:open', false)"
  >
    <div class="log-viewer-container">
      <!-- 顶部控制条 -->
      <div class="log-toolbar">
        <div class="toolbar-left">
          <a-input
            v-model:value="keyword"
            placeholder="过滤日志关键字..."
            size="small"
            allow-clear
            style="width: 220px;"
          >
            <template #prefix>
              <SearchOutlined style="color: #94a3b8;" />
            </template>
          </a-input>

          <a-select v-model:value="levelFilter" size="small" style="width: 110px;">
            <a-select-option value="all">全部级别</a-select-option>
            <a-select-option value="error">ERROR 错误</a-select-option>
            <a-select-option value="warn">WARN 警告</a-select-option>
            <a-select-option value="info">INFO 信息</a-select-option>
          </a-select>

          <span class="log-count">共 {{ filteredLogs.length }} 条</span>
        </div>

        <div class="toolbar-right">
          <a-button size="small" :loading="loading" @click="fetchLogs">
            <ReloadOutlined /> 刷新
          </a-button>
          <a-button size="small" @click="handleCopyLogs">
            <CopyOutlined /> 复制
          </a-button>
          <a-button size="small" @click="handleOpenFolder">
            <FolderOpenOutlined /> 打开日志目录
          </a-button>
        </div>
      </div>

      <!-- 日志列表展示区 -->
      <div ref="logScrollRef" class="log-content-area">
        <div v-for="(entry, index) in filteredLogs" :key="index" :class="['log-line', `level-${entry.level}`]">
          <span class="log-ts">{{ formatTime(entry.ts) }}</span>
          <span :class="['log-badge', entry.level]">{{ entry.level.toUpperCase() }}</span>
          <span class="log-scope">[{{ entry.scope }}]</span>
          <span class="log-msg">{{ entry.message }}</span>
          <span v-if="entry.meta" class="log-meta">{{ formatMeta(entry.meta) }}</span>
        </div>

        <div v-if="filteredLogs.length === 0" class="log-empty">
          <InfoCircleOutlined /> 暂无匹配的日志记录
        </div>
      </div>
    </div>
  </a-modal>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, nextTick } from 'vue';
import {
  SearchOutlined,
  ReloadOutlined,
  CopyOutlined,
  FolderOpenOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons-vue';
import { notification } from 'ant-design-vue';

export default defineComponent({
  name: 'LogViewerModal',
  components: {
    SearchOutlined,
    ReloadOutlined,
    CopyOutlined,
    FolderOpenOutlined,
    InfoCircleOutlined,
  },
  props: {
    open: {
      type: Boolean,
      default: false,
    },
  },
  emits: ['update:open'],
  setup(props) {
    const logs = ref<any[]>([]);
    const loading = ref(false);
    const keyword = ref('');
    const levelFilter = ref('all');
    const logScrollRef = ref<HTMLElement | null>(null);

    const fetchLogs = async () => {
      const native = (window as any).native;
      if (!native?.readRecentLogs) return;
      loading.value = true;
      try {
        const raw = await native.readRecentLogs(400);
        logs.value = Array.isArray(raw) ? raw : [];
        await nextTick();
        if (logScrollRef.value) {
          logScrollRef.value.scrollTop = logScrollRef.value.scrollHeight;
        }
      } catch (e: any) {
        console.error('[LOGGER] readRecentLogs error:', e);
      } finally {
        loading.value = false;
      }
    };

    watch(() => props.open, (val) => {
      if (val) {
        fetchLogs();
      }
    });

    const filteredLogs = computed(() => {
      const kw = keyword.value.trim().toLowerCase();
      const lvl = levelFilter.value;
      return logs.value.filter((item) => {
        if (lvl !== 'all' && item.level !== lvl) return false;
        if (!kw) return true;
        const msg = String(item.message || '').toLowerCase();
        const scope = String(item.scope || '').toLowerCase();
        const meta = typeof item.meta === 'object' ? JSON.stringify(item.meta).toLowerCase() : String(item.meta || '').toLowerCase();
        return msg.includes(kw) || scope.includes(kw) || meta.includes(kw);
      });
    });

    const formatTime = (ts: string) => {
      if (!ts) return '';
      try {
        const d = new Date(ts);
        const pad = (n: number) => n.toString().padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds().toString().padStart(3, '0')}`;
      } catch {
        return ts;
      }
    };

    const formatMeta = (meta: any) => {
      if (!meta) return '';
      if (typeof meta === 'string') return meta;
      try {
        return JSON.stringify(meta);
      } catch {
        return String(meta);
      }
    };

    const handleCopyLogs = () => {
      const text = filteredLogs.value.map(l => `[${l.ts}] [${l.level?.toUpperCase()}] [${l.scope}] ${l.message} ${l.meta ? JSON.stringify(l.meta) : ''}`).join('\n');
      const native = (window as any).native;
      if (native?.writeClipboard) {
        native.writeClipboard(text);
        notification.success({ message: '已复制当前筛选日志' });
      }
    };

    const handleOpenFolder = () => {
      const native = (window as any).native;
      native?.openLogDirectory?.();
    };

    return {
      logs,
      loading,
      keyword,
      levelFilter,
      logScrollRef,
      filteredLogs,
      fetchLogs,
      formatTime,
      formatMeta,
      handleCopyLogs,
      handleOpenFolder,
    };
  },
});
</script>

<style scoped lang="less">
.log-viewer-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.log-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);

  .toolbar-left, .toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .log-count {
    font-size: 12px;
    color: var(--ant-color-text-tertiary, #94a3b8);
  }
}

.log-content-area {
  height: 480px;
  background: #0f172a;
  color: #e2e8f0;
  border-radius: 8px;
  padding: 12px 14px;
  font-family: Consolas, Monaco, "Courier New", monospace;
  font-size: 12px;
  line-height: 1.6;
  overflow: auto;
  user-select: text;
}

.log-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
  word-break: break-all;
  white-space: pre-wrap;

  &.level-error {
    color: #f87171;
  }
  &.level-warn {
    color: #fbbf24;
  }
  &.level-info {
    color: #93c5fd;
  }

  .log-ts {
    color: #64748b;
    flex-shrink: 0;
  }

  .log-badge {
    font-size: 10px;
    padding: 0 4px;
    border-radius: 3px;
    font-weight: 600;
    flex-shrink: 0;

    &.error { background: #991b1b; color: #fee2e2; }
    &.warn { background: #92400e; color: #fef3c7; }
    &.info { background: #1e3a8a; color: #dbeafe; }
  }

  .log-scope {
    color: #38bdf8;
    font-weight: 500;
    flex-shrink: 0;
  }

  .log-msg {
    color: #f1f5f9;
  }

  .log-meta {
    color: #94a3b8;
    font-size: 11px;
  }
}

.log-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  gap: 8px;
  font-size: 13px;
}
</style>
