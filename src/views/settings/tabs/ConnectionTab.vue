<template>
  <div class="connection-tab-layout">
    <!-- 左侧主栏：连接卡片列表 -->
    <section class="conn-master-list">
      <div class="conn-master-header">
        <div class="header-text">
          <h3 class="header-title">存储连接</h3>
          <span class="header-count">{{ filteredConnections.length }} 个配置</span>
        </div>
        <div class="header-actions">
          <a-button type="primary" size="small" @click="startCreateConnection">
            <PlusOutlined /> 新建
          </a-button>
          <a-dropdown :trigger="['click']">
            <a-button size="small">
              <ImportOutlined /> 导入 <DownOutlined />
            </a-button>
            <template #overlay>
              <a-menu @click="$emit('importMenuClick', $event)">
                <a-menu-item key="mc"><ImportOutlined /> 导入 MC Config</a-menu-item>
                <a-menu-item key="share"><ImportOutlined /> 导入分享连接</a-menu-item>
              </a-menu>
            </template>
          </a-dropdown>
        </div>
      </div>

      <!-- 模糊检索搜索框 -->
      <div class="conn-search-bar">
        <a-input
          v-model:value="searchKeyword"
          placeholder="搜索连接名、节点或分组..."
          size="small"
          allowClear
        >
          <template #prefix>
            <SearchOutlined style="color: #94a3b8" />
          </template>
        </a-input>
      </div>

      <div class="conn-cards-scroll">
        <div
          v-for="conn in filteredConnections"
          :key="conn.id"
          :class="['conn-card-item', { active: !isCreating && activeConnectionId === conn.id }]"
          @click="selectConnection(conn.id)"
        >
          <div class="conn-card-top">
            <div class="conn-card-brand">
              <CloudServerOutlined class="conn-icon" />
              <span class="conn-name" :class="{ disabled: conn.enabled === false }">{{ conn.id }}</span>
              <span v-if="conn.readonly" class="badge-readonly"><LockOutlined /> 只读</span>
            </div>
            <div class="conn-card-right-action" @click.stop>
              <a-switch
                :checked="conn.enabled !== false"
                size="small"
                @change="(val: boolean) => $emit('toggleConnectionEnable', conn, val)"
              />
            </div>
          </div>

          <div class="conn-card-details">
            <span class="conn-endpoint" :title="conn.endpoint">
              {{ conn.useSSL ? 'https://' : 'http://' }}{{ conn.endpoint }}
            </span>
            <div class="conn-card-tags">
              <span class="conn-tag" v-if="conn.group">{{ conn.group }}</span>
              <span class="conn-tag">{{ conn.bucket ? conn.bucket : '全部 Bucket' }}</span>
              <span class="conn-tag" v-if="getTargetCount(conn.id)">{{ getTargetCount(conn.id) }} 个挂载</span>
            </div>
          </div>
        </div>

        <a-empty v-if="filteredConnections.length === 0" description="未找到匹配的连接" class="empty-holder">
          <a-button v-if="searchKeyword" size="small" @click="searchKeyword = ''">清空搜索</a-button>
          <a-button v-else type="primary" size="small" @click="startCreateConnection">新建连接</a-button>
        </a-empty>
      </div>
    </section>

    <!-- 右侧详情栏：内联展示/编辑/新建区域 -->
    <section class="conn-detail-pane">
      <!-- 模式一：编辑或新建连接表单（完全平铺在右侧面板，不弹窗） -->
      <template v-if="isEditing || isCreating">
        <div class="detail-header">
          <div class="detail-header-left">
            <h3 class="detail-title">{{ isCreating ? '新建存储连接' : `编辑连接：${editForm.id}` }}</h3>
            <span class="detail-subtitle">直接在右侧面板配置连接参数，完成后点击保存。</span>
          </div>
          <div class="detail-header-actions">
            <a-button size="small" @click="cancelEdit">取消</a-button>
            <a-button size="small" :loading="testing" @click="testCurrentConfig">测试连接</a-button>
            <a-button type="primary" size="small" :loading="saving" @click="submitEdit">保存生效</a-button>
          </div>
        </div>

        <div class="detail-scroll-area">
          <a-form ref="formRef" :model="editForm" layout="vertical" class="inline-edit-form compact-edit-form">
            <!-- 基础配置：紧凑双栏网格排布，零滚动直达 -->
            <div class="form-compact-grid">
              <a-form-item
                label="连接 ID"
                name="id"
                :rules="[{ required: true, message: '请输入连接ID' }]"
                class="form-compact-item"
              >
                <a-input
                  v-model:value="editForm.id"
                  :disabled="!isCreating"
                  size="small"
                  placeholder="例如: my-minio"
                />
              </a-form-item>

              <a-form-item label="分组名称 (可选)" name="group" class="form-compact-item">
                <a-auto-complete
                  v-model:value="editForm.group"
                  :options="groupOptions"
                  size="small"
                  placeholder="默认分组"
                />
              </a-form-item>

              <a-form-item
                label="服务节点 (Endpoint)"
                name="endpoint"
                :rules="[
                  { required: true, message: '请输入Endpoint' },
                  {
                    async validator(_rule: any, value: string) {
                      const cleaned = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/+$/, '');
                      if (!cleaned) throw new Error('请输入Endpoint');
                      if (!/^[\w.-]+(:\d+)?$/.test(cleaned)) throw new Error('格式: host:port（例如 s3.example.com:9000）');
                    }
                  }
                ]"
                class="form-compact-item form-col-span-2"
              >
                <a-input
                  v-model:value="editForm.endpoint"
                  size="small"
                  placeholder="例如: s3.example.com:9000"
                  @blur="handleEndpointBlur"
                >
                  <template #addonBefore>
                    <a-select v-model:value="editProtocol" size="small" style="width: 80px">
                      <a-select-option value="http">http://</a-select-option>
                      <a-select-option value="https">https://</a-select-option>
                    </a-select>
                  </template>
                  <template #addonAfter>
                    <a-switch v-model:checked="editForm.pathStyle" size="small" />
                    <span style="font-size: 11px; margin-left: 5px; color: #64748b" title="启用则为 http://host/bucket, 禁用则为 http://bucket.host">PathStyle</span>
                  </template>
                </a-input>
              </a-form-item>

              <a-form-item
                label="AccessKeyId"
                name="accessKeyId"
                :rules="[{ required: true, message: '请输入AccessKeyId' }]"
                class="form-compact-item"
              >
                <a-input v-model:value="editForm.accessKeyId" size="small" placeholder="访问密钥 ID" />
              </a-form-item>

              <a-form-item
                label="AccessKeySecret"
                name="accessKeySecret"
                :rules="[{ required: true, message: '请输入AccessKeySecret' }]"
                class="form-compact-item"
              >
                <a-input-password v-model:value="editForm.accessKeySecret" size="small" placeholder="访问密钥密码" />
              </a-form-item>

              <a-form-item label="所属区域 (Region)" name="region" class="form-compact-item">
                <a-input v-model:value="editForm.region" size="small" placeholder="例如: cn-changsha-1、us-east-1" />
              </a-form-item>

              <a-form-item label="默认存储桶 (可选)" class="form-compact-item">
                <!-- 有扫描到的 Bucket 列表时：支持带搜索的下拉选择 -->
                <a-select
                  v-if="scannedBuckets.length > 0"
                  v-model:value="editForm.bucket"
                  showSearch
                  allowClear
                  placeholder="搜索选择或留空访问全部"
                  size="small"
                  :filter-option="filterBucketOption"
                >
                  <template #dropdownRender="{ menuNode }">
                    <div>
                      <component :is="menuNode" />
                      <div class="bucket-dropdown-footer">
                        <a-button type="link" size="small" :loading="scanningBuckets" @click.stop="scanBuckets">
                          <ReloadOutlined /> 重新扫描
                        </a-button>
                      </div>
                    </div>
                  </template>
                  <a-select-option v-for="b in scannedBuckets" :key="b" :value="b">{{ b }}</a-select-option>
                </a-select>

                <!-- 无扫描列表时：输入框 + 扫描存储桶按钮 -->
                <a-input
                  v-else
                  v-model:value="editForm.bucket"
                  size="small"
                  placeholder="输入桶名或点击扫描"
                  allowClear
                >
                  <template #addonAfter>
                    <span
                      class="bucket-scan-addon"
                      :class="{ loading: scanningBuckets }"
                      @click="scanBuckets"
                      title="连接存储服务扫描可用存储桶列表"
                    >
                      <LoadingOutlined v-if="scanningBuckets" />
                      <SearchOutlined v-else />
                      <span>{{ scanningBuckets ? '扫描中' : '扫描存储桶' }}</span>
                    </span>
                  </template>
                </a-input>
              </a-form-item>
            </div>

            <!-- 高级选项折叠栏：按需展开 -->
            <div class="advanced-section">
              <div class="advanced-toggle" @click="advancedOpen = !advancedOpen">
                <div class="toggle-title">
                  <CaretDownOutlined v-if="advancedOpen" />
                  <CaretRightOutlined v-else />
                  <span>高级配置</span>
                </div>
                <span class="toggle-summary">{{ advancedSummary }}</span>
              </div>

              <div v-show="advancedOpen" class="advanced-panel">
                <div class="form-compact-grid">
                  <a-form-item label="限制前缀路径 (Prefix)" class="form-compact-item form-col-span-2">
                    <a-input
                      v-model:value="editForm.pathPrefix"
                      :disabled="!editForm.bucket"
                      size="small"
                      placeholder="例如: docs/project-a (需指定特定 Bucket)"
                    />
                  </a-form-item>
                </div>
              </div>
            </div>
          </a-form>
        </div>
      </template>

      <!-- 模式二：展示当前连接详情概览与挂载列表 -->
      <template v-else-if="selectedConnection">
        <div class="detail-header">
          <div class="detail-header-left">
            <h3 class="detail-title">{{ selectedConnection.id }}</h3>
            <span class="detail-subtitle">{{ selectedConnection.useSSL ? 'https://' : 'http://' }}{{ selectedConnection.endpoint }}</span>
          </div>
          <div class="detail-header-actions">
            <a-button size="small" :disabled="selectedConnection.readonly" @click="startEditConnection">
              <EditOutlined /> 编辑配置
            </a-button>
            <a-button size="small" :disabled="selectedConnection.readonly" @click="$emit('shareConnection', selectedConnection)">
              <ShareAltOutlined /> 分享
            </a-button>
            <a-popconfirm title="确定删除此连接配置？" @confirm="$emit('deleteConnection', selectedConnection.id)">
              <a-button danger size="small">
                <DeleteOutlined /> 删除
              </a-button>
            </a-popconfirm>
          </div>
        </div>

        <div class="detail-scroll-area">
          <div class="detail-section">
            <h4 class="section-heading">连接概览</h4>
            <div class="props-grid">
              <div class="prop-item">
                <span class="prop-label">连接 ID</span>
                <span class="prop-value font-mono">{{ selectedConnection.id }}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">服务节点 (Endpoint)</span>
                <span class="prop-value">{{ selectedConnection.endpoint }}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">传输协议</span>
                <span class="prop-value">{{ selectedConnection.useSSL ? 'HTTPS (加密)' : 'HTTP' }}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">访问寻址模式</span>
                <span class="prop-value">{{ selectedConnection.pathStyle ? 'Path Style (兼容)' : 'Virtual Host' }}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">所属地域 (Region)</span>
                <span class="prop-value">{{ selectedConnection.region || '未指定' }}</span>
              </div>
              <div class="prop-item">
                <span class="prop-label">限制访问根范围</span>
                <span class="prop-value">{{ selectedConnection.bucket ? `${selectedConnection.bucket}${selectedConnection.pathPrefix ? `/${selectedConnection.pathPrefix}` : ''}` : '全部存储桶 (无前缀约束)' }}</span>
              </div>
            </div>
          </div>

          <!-- 挂载驱动目标管理区 -->
          <div class="detail-section">
            <div class="section-heading-row">
              <h4 class="section-heading">本地磁盘挂载点 (FUSE 映射)</h4>
              <a-button type="primary" size="small" @click="$emit('addTarget', selectedConnection)">
                <PlusOutlined /> 新建挂载
              </a-button>
            </div>

            <div class="targets-grid">
              <div
                v-for="target in getTargets(selectedConnection.id)"
                :key="target.id"
                class="target-card"
              >
                <div class="target-card-main">
                  <div class="target-card-top">
                    <HddOutlined class="target-icon" />
                    <span class="target-mountpoint">{{ target.mountPoint || '未指定盘符' }}</span>
                    <span v-if="mountStates[target.id]" class="badge badge-mounted">
                      <span class="badge-dot badge-dot-green"></span>已挂载
                    </span>
                    <span v-else class="badge badge-off">未挂载</span>
                  </div>
                  <div class="target-bucket-path" :title="target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket">
                    {{ target.pathPrefix ? `${target.bucket}/${target.pathPrefix}` : target.bucket }}
                  </div>
                </div>

                <div class="target-card-actions">
                  <a-tooltip v-if="mountStates[target.id]" title="在文件管理器中打开">
                    <a-button size="small" @click="$emit('openLocalFolder', target)">
                      <FolderOpenOutlined />
                    </a-button>
                  </a-tooltip>

                  <a-button
                    v-if="!mountStates[target.id]"
                    type="primary"
                    size="small"
                    :disabled="!target.mountPoint || mountStates[target.id + '_loading']"
                    @click="$emit('mount', selectedConnection, target)"
                  >
                    <PlayCircleOutlined /> 挂载
                  </a-button>
                  <a-button
                    v-else
                    danger
                    size="small"
                    :disabled="mountStates[target.id + '_loading']"
                    @click="$emit('umount', selectedConnection, target)"
                  >
                    <CloseSquareOutlined /> 卸载
                  </a-button>

                  <a-dropdown :trigger="['click']">
                    <a-button size="small"><MoreOutlined /></a-button>
                    <template #overlay>
                      <a-menu>
                        <a-menu-item key="edit" @click="$emit('editTarget', selectedConnection, target)">
                          <EditOutlined /> 编辑挂载配置
                        </a-menu-item>
                        <a-menu-divider />
                        <a-menu-item key="delete" danger @click="$emit('deleteTarget', target.id)">
                          <DeleteOutlined /> 删除挂载点
                        </a-menu-item>
                      </a-menu>
                    </template>
                  </a-dropdown>
                </div>
              </div>

              <div v-if="getTargets(selectedConnection.id).length === 0" class="empty-targets-box">
                <span class="empty-tip">当前连接尚未绑定任何本地虚拟驱动器</span>
                <a-button size="small" @click="$emit('addTarget', selectedConnection)">
                  <PlusOutlined /> 新建挂载
                </a-button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 未选中任何连接时的空态 -->
      <div v-else class="detail-empty-placeholder">
        <CloudServerOutlined class="placeholder-icon" />
        <p class="placeholder-text">从左侧选择一个存储连接以查看详情与管理挂载，或点击上方新建连接。</p>
        <a-button type="primary" @click="startCreateConnection">
          <PlusOutlined /> 新建连接
        </a-button>
      </div>
    </section>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, computed, watch, reactive, nextTick, toRaw } from 'vue';
import {
  PlusOutlined,
  ImportOutlined,
  DownOutlined,
  SearchOutlined,
  CloudServerOutlined,
  LockOutlined,
  EditOutlined,
  ShareAltOutlined,
  DeleteOutlined,
  HddOutlined,
  FolderOpenOutlined,
  PlayCircleOutlined,
  CloseSquareOutlined,
  CaretDownOutlined,
  CaretRightOutlined,
  MoreOutlined,
  ReloadOutlined,
  LoadingOutlined,
} from '@ant-design/icons-vue';
import type { Connection, MountTarget } from '../../../../electron/preload/types';
import { inferS3Addressing } from '../../../common/s3Addressing';
import _ from 'lodash';

export default defineComponent({
  name: 'ConnectionTab',
  components: {
    PlusOutlined,
    ImportOutlined,
    DownOutlined,
    SearchOutlined,
    CloudServerOutlined,
    LockOutlined,
    EditOutlined,
    ShareAltOutlined,
    DeleteOutlined,
    HddOutlined,
    FolderOpenOutlined,
    PlayCircleOutlined,
    CloseSquareOutlined,
    CaretDownOutlined,
    CaretRightOutlined,
    MoreOutlined,
    ReloadOutlined,
    LoadingOutlined,
  },
  props: {
    connections: { type: Array as () => Connection[], default: () => [] },
    activeConnectionId: { type: String, default: '' },
    mountTargets: { type: Array as () => MountTarget[], default: () => [] },
    mountStates: { type: Object as () => Record<string, boolean>, default: () => ({}) },
  },
  emits: [
    'selectConnection',
    'saveConnection',
    'deleteConnection',
    'shareConnection',
    'importMenuClick',
    'toggleConnectionEnable',
    'testConnection',
    'addTarget',
    'editTarget',
    'deleteTarget',
    'mount',
    'umount',
    'openLocalFolder',
  ],
  setup(props, { emit }) {
    const searchKeyword = ref('');
    const isCreating = ref(false);
    const isEditing = ref(false);
    const formRef = ref<any>(null);
    const saving = ref(false);
    const testing = ref(false);
    const editProtocol = ref<'http' | 'https'>('http');
    const advancedOpen = ref(false);
    const scannedBuckets = ref<string[]>([]);
    const scanningBuckets = ref(false);

    const filterBucketOption = (input: string, option: any) => {
      const val = option?.value || option?.label || '';
      return String(val).toLowerCase().includes(input.toLowerCase());
    };

    const scanBuckets = async () => {
      if (!editForm.endpoint || !editForm.accessKeyId || !editForm.accessKeySecret) {
        // 使用 Ant Design 全局提示
        return;
      }
      scanningBuckets.value = true;
      try {
        const payload = _.cloneDeep(toRaw(editForm));
        payload.useSSL = editProtocol.value === 'https';
        const storage = (window as any).storage;
        if (storage?.changeConfig && storage?.listBuckets) {
          storage.changeConfig('minio', payload);
          const list = await storage.listBuckets('minio');
          if (Array.isArray(list)) {
            scannedBuckets.value = list;
          }
        }
      } catch (e: any) {
        console.warn('[STORAGE] scanBuckets error:', e);
      } finally {
        scanningBuckets.value = false;
      }
    };

    const advancedSummary = computed(() => {
      if (editForm.pathPrefix) return `Prefix: ${editForm.pathPrefix}`;
      return '默认无路径前缀限制';
    });

    const defaultEmptyConn: Connection = {
      id: '',
      endpoint: '',
      accessKeyId: '',
      accessKeySecret: '',
      region: '',
      bucket: '',
      pathPrefix: '',
      pathStyle: false,
      group: '',
      useSSL: false,
    };

    const editForm = reactive<Connection>({ ...defaultEmptyConn });

    // 模糊检索计算属性
    const filteredConnections = computed(() => {
      const kw = searchKeyword.value.trim().toLowerCase();
      if (!kw) return props.connections;
      return props.connections.filter((c) => {
        return (
          c.id.toLowerCase().includes(kw) ||
          c.endpoint.toLowerCase().includes(kw) ||
          (c.group && c.group.toLowerCase().includes(kw)) ||
          (c.bucket && c.bucket.toLowerCase().includes(kw))
        );
      });
    });

    const selectedConnection = computed(() => {
      return props.connections.find((c) => c.id === props.activeConnectionId) || props.connections[0];
    });

    const groupOptions = computed(() => {
      const s = new Set<string>();
      props.connections.forEach((c) => {
        if (c.group) s.add(c.group);
      });
      return Array.from(s).map((g) => ({ value: g }));
    });

    const getTargets = (connectionId: string) => {
      return props.mountTargets.filter((t) => t.connectionId === connectionId);
    };

    const getTargetCount = (connectionId: string) => {
      return getTargets(connectionId).length;
    };

    const selectConnection = (id: string) => {
      isCreating.value = false;
      isEditing.value = false;
      emit('selectConnection', id);
    };

    const startCreateConnection = () => {
      isCreating.value = true;
      isEditing.value = false;
      advancedOpen.value = false;
      scannedBuckets.value = [];
      Object.assign(editForm, defaultEmptyConn, { id: '' });
      editProtocol.value = 'http';
    };

    const startEditConnection = () => {
      if (!selectedConnection.value) return;
      isCreating.value = false;
      isEditing.value = true;
      scannedBuckets.value = [];
      const copy = _.cloneDeep(toRaw(selectedConnection.value));
      advancedOpen.value = !!copy.pathPrefix;
      Object.assign(editForm, copy);
      editProtocol.value = copy.useSSL ? 'https' : 'http';
    };

    const cancelEdit = () => {
      isCreating.value = false;
      isEditing.value = false;
    };

    const handleEndpointBlur = () => {
      let val = (editForm.endpoint || '').trim();
      if (/^https?:\/\//i.test(val)) {
        editProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        editForm.endpoint = val;
      }
    };

    watch(() => editForm.endpoint, (rawVal) => {
      if (!rawVal || (!isCreating.value && !isEditing.value)) return;
      let val = rawVal.trim();
      if (/^https?:\/\//i.test(val)) {
        editProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        nextTick(() => { editForm.endpoint = val; });
      }
      const advice = inferS3Addressing(val);
      editForm.pathStyle = advice.pathStyle;
      if (advice.region && isCreating.value) {
        editForm.region = advice.region;
      }
    });

    const submitEdit = async () => {
      if (!formRef.value) return;
      try {
        await formRef.value.validate();
        saving.value = true;
        const payload = _.cloneDeep(toRaw(editForm));
        payload.useSSL = editProtocol.value === 'https';
        emit('saveConnection', payload, isEditing.value, () => {
          saving.value = false;
          isCreating.value = false;
          isEditing.value = false;
        });
      } catch (err) {
        saving.value = false;
      }
    };

    const testCurrentConfig = async () => {
      if (!formRef.value) return;
      try {
        await formRef.value.validate();
        testing.value = true;
        const payload = _.cloneDeep(toRaw(editForm));
        payload.useSSL = editProtocol.value === 'https';
        emit('testConnection', payload, () => {
          testing.value = false;
        });
      } catch (err) {
        testing.value = false;
      }
    };

    return {
      searchKeyword,
      filteredConnections,
      selectedConnection,
      isCreating,
      isEditing,
      editForm,
      editProtocol,
      advancedOpen,
      advancedSummary,
      scannedBuckets,
      scanningBuckets,
      filterBucketOption,
      scanBuckets,
      formRef,
      saving,
      testing,
      groupOptions,
      getTargets,
      getTargetCount,
      selectConnection,
      startCreateConnection,
      startEditConnection,
      cancelEdit,
      handleEndpointBlur,
      submitEdit,
      testCurrentConfig,
    };
  },
});
</script>

<style scoped lang="less">
.connection-tab-layout {
  display: flex;
  height: 100%;
  gap: 20px;
}

.conn-master-list {
  width: 320px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
}

.conn-master-header {
  padding: 14px 16px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;

  .header-text {
    display: flex;
    align-items: baseline;
    gap: 8px;

    .header-title {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
    }

    .header-count {
      font-size: 12px;
      color: var(--ant-color-text-tertiary, #94a3b8);
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.conn-search-bar {
  padding: 8px 12px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #f1f5f9);
}

.conn-cards-scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.conn-card-item {
  padding: 12px 14px;
  border-radius: 8px;
  border: 1px solid var(--ant-color-border-secondary, #f1f5f9);
  background: var(--ant-color-fill-quaternary, #f8fafc);
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    border-color: var(--ant-color-border, #cbd5e1);
    background: var(--ant-color-bg-container, #ffffff);
  }

  &.active {
    background: var(--ant-color-bg-container, #ffffff);
    border-color: var(--ant-color-primary, #2563eb);
    box-shadow: 0 1px 3px rgba(37, 99, 235, 0.12);
  }

  .conn-card-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;

    .conn-card-brand {
      display: flex;
      align-items: center;
      gap: 6px;
      font-weight: 600;
      font-size: 13px;

      .conn-icon {
        color: var(--ant-color-primary, #2563eb);
      }

      .conn-name.disabled {
        color: var(--ant-color-text-tertiary, #94a3b8);
      }
    }
  }

  .conn-card-details {
    display: flex;
    flex-direction: column;
    gap: 4px;

    .conn-endpoint {
      font-size: 11px;
      color: var(--ant-color-text-secondary, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .conn-card-tags {
      display: flex;
      align-items: center;
      gap: 6px;

      .conn-tag {
        font-size: 11px;
        padding: 1px 6px;
        border-radius: 4px;
        background: var(--ant-color-fill-tertiary, #e2e8f0);
        color: var(--ant-color-text-secondary, #475569);
      }
    }
  }
}

.badge-readonly {
  font-size: 10px;
  padding: 1px 5px;
  border-radius: 4px;
  background: #fef3c7;
  color: #92400e;
  display: inline-flex;
  align-items: center;
  gap: 2px;
}

.conn-detail-pane {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
}

.detail-header {
  padding: 16px 24px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  display: flex;
  align-items: center;
  justify-content: space-between;

  .detail-header-left {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .detail-title {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }

    .detail-subtitle {
      font-size: 12px;
      color: var(--ant-color-text-tertiary, #64748b);
    }
  }

  .detail-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }
}

.detail-scroll-area {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.compact-edit-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-compact-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 14px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 8px;
  padding: 16px;
}

.form-compact-item {
  margin-bottom: 0 !important;

  :deep(.ant-form-item-label) {
    padding-bottom: 4px;
    label {
      font-size: 12px;
      font-weight: 500;
      color: var(--ant-color-text-secondary, #475569);
    }
  }
}

.form-col-span-2 {
  grid-column: span 2;
}

.advanced-section {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
  background: var(--ant-color-bg-container, #ffffff);
}

.advanced-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
  cursor: pointer;
  user-select: none;
  transition: background 0.15s;

  &:hover {
    background: var(--ant-color-fill-tertiary, #f1f5f9);
  }

  .toggle-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 500;
    color: var(--ant-color-text, #1e293b);
  }

  .toggle-summary {
    font-size: 11px;
    color: var(--ant-color-text-tertiary, #94a3b8);
  }
}

.advanced-panel {
  padding: 14px;
  border-top: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  background: var(--ant-color-bg-container, #ffffff);

  .form-compact-grid {
    padding: 12px;
    background: transparent;
    border: none;
  }
}

.detail-section {
  display: flex;
  flex-direction: column;
  gap: 12px;

  .section-heading {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }

  .section-heading-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }
}

.bucket-scan-addon {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  cursor: pointer;
  color: var(--ant-color-primary, #2563eb);
  font-size: 11px;
  user-select: none;
  transition: opacity 0.15s;

  &:hover {
    opacity: 0.8;
  }

  &.loading {
    cursor: wait;
    opacity: 0.6;
  }
}

.bucket-dropdown-footer {
  padding: 4px 8px;
  border-top: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  display: flex;
  justify-content: center;
}

.props-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px;
  padding: 16px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 8px;

  .prop-item {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .prop-label {
      font-size: 12px;
      color: var(--ant-color-text-secondary, #64748b);
    }

    .prop-value {
      font-size: 13px;
      font-weight: 500;
      color: var(--ant-color-text, #0f172a);
    }
  }
}

.targets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}

.target-card {
  padding: 14px;
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  background: var(--ant-color-bg-container, #ffffff);
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;

  .target-card-main {
    flex: 1;
    min-width: 0;

    .target-card-top {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 4px;

      .target-icon {
        color: var(--ant-color-text-secondary, #64748b);
      }

      .target-mountpoint {
        font-weight: 600;
        font-size: 14px;
      }
    }

    .target-bucket-path {
      font-size: 12px;
      color: var(--ant-color-text-secondary, #64748b);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }

  .target-card-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }
}

.empty-targets-box {
  grid-column: 1 / -1;
  padding: 32px 16px;
  border: 1px dashed var(--ant-color-border, #cbd5e1);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;

  .empty-tip {
    font-size: 13px;
    color: var(--ant-color-text-secondary, #64748b);
  }
}

.detail-empty-placeholder {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px;
  gap: 12px;
  color: var(--ant-color-text-secondary, #64748b);

  .placeholder-icon {
    font-size: 48px;
    color: var(--ant-color-text-tertiary, #cbd5e1);
  }

  .placeholder-text {
    margin: 0 0 8px;
    font-size: 14px;
    max-width: 360px;
    text-align: center;
  }
}
</style>
