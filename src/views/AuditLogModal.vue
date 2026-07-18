<template>
  <a-modal
    :open="visible"
    title="审计日志"
    width="800"
    :footer="null"
    destroyOnClose
    @cancel="$emit('update:open', false)"
  >
    <div class="audit-filter">
      <a-select
        v-model:value="actionFilter"
        :options="auditStore.actionOptions"
        style="width: 120px"
        size="small"
      />
      <a-input-search
        v-model:value="searchKeyword"
        placeholder="搜索对象名/描述"
        size="small"
        style="width: 200px"
      />
      <a-button size="small" @click="auditStore.clearAll()" danger>清除全部</a-button>
    </div>
    <a-table
      :columns="columns"
      :data-source="filteredEntries"
      :scroll="{ y: 480 }"
      rowKey="id"
      :pagination="{ pageSize: 50, showSizeChanger: false, showTotal: (total: number) => `${total} 条` }"
      size="small"
    >
      <template #bodyCell="{ column, record }">
        <template v-if="column.dataIndex === 'action'">
          <span :class="['action-tag', `action-${record.action}`]">{{ actionLabel(record.action) }}</span>
        </template>
        <template v-if="column.dataIndex === 'timestamp'">
          {{ formatTime(record.timestamp) }}
        </template>
        <template v-if="column.dataIndex === 'objectName'">
          <span class="object-name">{{ record.objectName || '-' }}</span>
        </template>
        <template v-if="column.dataIndex === 'description'">
          {{ record.description || '-' }}
        </template>
      </template>
    </a-table>
  </a-modal>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch } from 'vue';
import { useAuditStore, AuditAction, AuditActionFilter, AuditLogEntry } from '../store/audit';

const actionLabels: Record<AuditAction, string> = {
  upload: '上传',
  download: '下载',
  delete: '删除',
  rename: '重命名',
  copy: '复制',
  config_update: '配置更新',
  mount: '挂载',
  unmount: '卸载',
  enable: '启用',
  disable: '禁用',
};

export default defineComponent({
  setup() {
    const auditStore = useAuditStore();
    const actionFilter = ref<AuditActionFilter>('all');
    const searchKeyword = ref('');

    const filteredEntries = computed(() => {
      auditStore.purgeExpired();
      let entries = auditStore.filteredEntries;
      if (actionFilter.value !== 'all') {
        entries = entries.filter(e => e.action === actionFilter.value);
      }
      if (searchKeyword.value.trim()) {
        const kw = searchKeyword.value.trim().toLowerCase();
        entries = entries.filter(e =>
          (e.objectName?.toLowerCase().includes(kw)) ||
          (e.description?.toLowerCase().includes(kw)) ||
          (e.bucket?.toLowerCase().includes(kw))
        );
      }
      return entries.sort((a, b) => b.timestamp - a.timestamp);
    });

    const actionLabel = (action: AuditAction) => actionLabels[action] || action;

    const formatTime = (ts: number) => {
      const d = new Date(ts);
      const pad = (n: number) => n.toString().padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    };

    const columns = [
      { title: '时间', dataIndex: 'timestamp', key: 'timestamp', width: 160 },
      { title: '操作', dataIndex: 'action', key: 'action', width: 80 },
      { title: '存储桶', dataIndex: 'bucket', key: 'bucket', width: 120 },
      { title: '对象', dataIndex: 'objectName', key: 'objectName', ellipsis: true },
      { title: '描述', dataIndex: 'description', key: 'description', width: 180, ellipsis: true },
    ];

    return {
      auditStore,
      actionFilter,
      searchKeyword,
      filteredEntries,
      actionLabel,
      formatTime,
      columns,
    };
  },
  props: {
    visible: Boolean,
  },
  emits: ['update:open'],
});
</script>

<style lang="less" scoped>
.audit-filter {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 12px;
}

.action-tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  line-height: 1.4;

  &.action-upload {
    background: #dbeafe;
    color: #1d4ed8;
  }
  &.action-download {
    background: #dcfce7;
    color: #15803d;
  }
  &.action-delete {
    background: #fee2e2;
    color: #b91c1c;
  }
  &.action-rename {
    background: #f3f4f6;
    color: #4b5563;
  }
  &.action-copy {
    background: #fef3c7;
    color: #92400e;
  }
  &.action-config_update {
    background: #e0e7ff;
    color: #4338ca;
  }
  &.action-mount {
    background: #d1fae5;
    color: #047857;
  }
  &.action-unmount {
    background: #f3f4f6;
    color: #6b7280;
  }
  &.action-enable {
    background: #dcfce7;
    color: #15803d;
  }
  &.action-disable {
    background: #fee2e2;
    color: #b91c1c;
  }
}

.object-name {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  display: inline-block;
}
</style>
