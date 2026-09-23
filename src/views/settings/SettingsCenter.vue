<template>
  <SettingsWorkspace
    default-tab="bucket"
    @close="$emit('update:open', false)"
    @tab-change="handleTabSwitch"
  >
    <!-- 1. 连接与存储 Tab -->
    <template #bucket>
      <ConnectionTab
        :connections="persistentConnections"
        :active-connection-id="selectedConnId"
        :mount-targets="configStore.mountTargets"
        :mount-states="mountStates"
        :available-drives="availableDrives"
        :is-windows="isWindows"
        @select-connection="selectedConnId = $event"
        @save-connection="handleSaveConnectionFromInline"
        @test-connection="handleTestConnectionFromInline"
        @delete-connection="handleDeleteConnection"
        @share-connection="handleShareConnection"
        @import-menu-click="handleImportMenuClick"
        @toggle-connection-enable="handleConnectionEnableChange"
        @save-target="handleSaveTargetFromInline"
        @delete-target="handleDeleteTarget"
        @mount="handleMount"
        @umount="handleUmount"
        @open-local-folder="handleOpenLocalFolder"
        @select-cache-dir="handleSelectCacheDir"
      />
    </template>

    <!-- 2. 插件管理 Tab -->
    <template #plugins>
      <PluginTab
        :plugins="pluginsList"
        :loading="pluginsLoading"
        :action-loading="pluginActionLoading"
        :default-cache-directory="defaultCacheDirectoryValue"
        @refresh="loadPluginsList"
        @toggle-enabled="handleTogglePluginEnabled"
        @install-rclone="handleDownloadRclonePlugin"
        @install-winfsp="handleInstallWinFspPlugin"
        @install-mpv="handleInstallMpvPlugin"
        @select-custom-path="handleSelectPluginCustomPath"
        @reset-custom-path="handleResetPluginCustomPath"
        @select-cache-dir="handleSelectDefaultCacheDirectory"
        @update-cache-dir="handleDefaultCacheDirectoryChange"
        @update-plugin-config="handleUpdatePluginSpecificConfig"
        @show-mpv-guide="handleShowMpvInstallGuide"
      />
    </template>

    <!-- 3. 系统设置 Tab -->
    <template #system>
      <SystemTab
        :default-download-directory="defaultDownloadDirectoryValue"
        :default-page-size="defaultPageSizeValue"
        :list-load-mode="listLoadModeValue"
        :transfer-concurrency="transferConcurrencyValue"
        :close-behavior="closeBehaviorValue"
        :confirm-before-exit="confirmBeforeExitValue"
        @select-download-dir="handleSelectDefaultDownloadDirectory"
        @update-download-dir="handleDefaultDownloadDirectoryChange"
        @update-page-size="handleDefaultPageSizeChange"
        @update-load-mode="handleListLoadModeChange"
        @update-concurrency="handleTransferConcurrencyChange"
        @update-close-behavior="handleCloseBehaviorChange"
        @update-confirm-before-exit="handleConfirmBeforeExitChange"
        @open-log-directory="handleOpenLogDirectory"
      />
    </template>

    <!-- 4. 关于软件 Tab -->
    <template #about>
      <AboutTab
        :app-version="appVersion"
        :app-platform="appPlatform"
        :copyright-year="copyrightYear"
        :update-checking="updateChecking"
        :update-downloading="updateDownloading"
        :update-installing="updateInstalling"
        :update-progress="updateProgress"
        :update-available-version="updateAvailableVersion"
        :update-downloaded="updateDownloaded"
        :update-status-text="updateStatusText"
        @check-update="handleCheckUpdate"
        @download-update="handleDownloadUpdate"
        @install-update="handleInstallUpdate"
      />
    </template>
  </SettingsWorkspace>

  <!-- ── 辅助小弹窗（仅保留表单/导入等必要动作） ── -->

  <!-- 添加/编辑连接 Modal -->
  <a-modal
    :open="connectionModalState.visible"
    width="540px"
    :title="connectionModalTitle"
    @cancel="handleConnectionModalCancel"
  >
    <template #footer>
      <a-button @click="handleConnectionModalCancel">取消</a-button>
      <a-button :loading="connectionTesting" @click="handleTestConnection">测试连接</a-button>
      <a-button type="primary" @click="handleConnectionModalOk">提交</a-button>
    </template>
    <a-form
      ref="connectionModalFormRef"
      :model="connectionModalFormState"
      layout="vertical"
      name="connectionModalForm"
    >
      <div class="modal-form-section">
        <div class="modal-section-title">基本信息</div>
      </div>
      <div style="display: flex; gap: 12px;">
        <a-form-item
          name="id"
          label="连接名称"
          :rules="[{ required: true, message: '请输入连接名称' }]"
          style="flex: 1"
        >
          <a-input
            v-model:value="connectionModalFormState.id"
            :disabled="connectionIdDisabled"
            placeholder="例如: my-minio"
          />
        </a-form-item>
        <a-form-item
          name="group"
          label="分组名称（可选）"
          style="flex: 1"
        >
          <a-auto-complete
            v-model:value="connectionModalFormState.group"
            :options="existingGroupOptions"
            placeholder="默认分组"
          />
        </a-form-item>
      </div>
      <a-form-item
        name="endpoint"
        label="Endpoint"
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
      >
        <a-input
          v-model:value="connectionModalFormState.endpoint"
          placeholder="例如: s3.example.com:9000"
          @blur="handleEndpointBlur"
        >
          <template #addonBefore>
            <a-select v-model:value="endpointProtocol" style="width: 86px">
              <a-select-option value="http">http://</a-select-option>
              <a-select-option value="https">https://</a-select-option>
            </a-select>
          </template>
          <template #addonAfter>
            <a-switch v-model:checked="connectionModalFormState.pathStyle" size="small" />
            <span style="font-size: 12px; margin-left: 6px; color: #64748b" title="启用则为 http://host/bucket, 禁用则为 http://bucket.host">PathStyle</span>
          </template>
        </a-input>
      </a-form-item>
      <a-form-item name="region" label="Region（可选）">
        <a-input v-model:value="connectionModalFormState.region" placeholder="例如: cn-changsha-1" />
      </a-form-item>
      <div class="modal-form-section">
        <div class="modal-section-title">认证凭据</div>
      </div>
      <div style="display: flex; gap: 12px;">
        <a-form-item
          name="accessKeyId"
          label="AccessKeyId"
          :rules="[{ required: true, message: '请输入AccessKeyId' }]"
          style="flex: 1"
        >
          <a-input v-model:value="connectionModalFormState.accessKeyId" placeholder="访问密钥ID" />
        </a-form-item>
        <a-form-item
          name="accessKeySecret"
          label="AccessKeySecret"
          :rules="[{ required: true, message: '请输入AccessKeySecret' }]"
          style="flex: 1"
        >
          <a-input-password v-model:value="connectionModalFormState.accessKeySecret" placeholder="访问密钥密码" />
        </a-form-item>
      </div>

      <!-- 高级约束折叠 -->
      <div style="margin-top: 6px;">
        <a-collapse :bordered="false" style="background: transparent">
          <a-collapse-panel key="advanced" header="高级选项：限制连接根目录范围">
            <div style="display: flex; gap: 12px;">
              <a-form-item label="限制 Bucket" style="flex: 1">
                <a-select
                  v-if="allBucketsCache.length && !bucketListFailed"
                  v-model:value="connectionModalFormState.bucket"
                  showSearch
                  allowClear
                  placeholder="选择存储桶"
                >
                  <a-select-option v-for="b in allBucketsCache" :key="b" :value="b">{{ b }}</a-select-option>
                </a-select>
                <a-input v-else v-model:value="connectionModalFormState.bucket" placeholder="留空则访问全部 Bucket" />
              </a-form-item>
              <a-form-item label="限制前缀路径" style="flex: 1">
                <a-input
                  v-model:value="connectionModalFormState.pathPrefix"
                  :disabled="!connectionModalFormState.bucket"
                  placeholder="例如: project/sub"
                />
              </a-form-item>
            </div>
          </a-collapse-panel>
        </a-collapse>
      </div>
    </a-form>
  </a-modal>

  <!-- 导入 MC Config Modal -->
  <a-modal
    v-model:open="mcImportVisible"
    title="导入 MinIO Client (MC) 配置"
    width="680px"
    @cancel="handleMcImportCancel"
  >
    <template #footer>
      <a-button @click="handleMcImportCancel">取消</a-button>
      <a-button type="primary" :disabled="selectedMcImportCount === 0" @click="handleMcImport">
        导入选中的 {{ selectedMcImportCount }} 个连接
      </a-button>
    </template>
    <div style="display: flex; flex-direction: column; gap: 12px;">
      <a-textarea
        v-model:value="mcImportText"
        :rows="4"
        placeholder="粘贴 ~/.mc/config.json 文本内容"
        @change="handleMcImportParse"
      />
      <div style="display: flex; gap: 8px;">
        <a-button size="small" @click="handleMcImportFile">选择本地文件</a-button>
        <a-button size="small" @click="handleMcImportSelectAll(true)">全选</a-button>
        <a-button size="small" @click="handleMcImportSelectAll(false)">清空勾选</a-button>
      </div>
      <div v-if="mcImportItems.length > 0" style="max-height: 280px; overflow: auto; display: flex; flex-direction: column; gap: 8px;">
        <div
          v-for="item in mcImportItems"
          :key="item.sourceAlias"
          style="display: flex; align-items: center; justify-content: space-between; padding: 8px 12px; background: var(--ant-color-fill-quaternary); border-radius: 6px;"
        >
          <div style="display: flex; align-items: center; gap: 8px;">
            <a-checkbox v-model:checked="item.selected" />
            <span style="font-weight: 600">{{ item.sourceAlias }}</span>
            <span style="color: #64748b; font-size: 12px;">{{ item.connection.endpoint }}</span>
          </div>
          <a-radio-group v-model:value="item.connection.pathStyle" size="small">
            <a-radio-button :value="true">Path Style</a-radio-button>
            <a-radio-button :value="false">VirtualHost</a-radio-button>
          </a-radio-group>
        </div>
      </div>
    </div>
  </a-modal>

  <!-- 分享连接 Modal -->
  <a-modal
    v-model:open="shareModalState.visible"
    title="分享连接配置"
    width="540px"
    :footer="null"
  >
    <a-alert
      type="warning"
      show-icon
      message="请把完整分享地址当作密码妥善保管传递"
      style="margin-bottom: 12px"
    />
    <div style="margin-bottom: 12px;">
      <a-checkbox v-model:checked="shareReadonly">导入端仅允许使用，不展示或允许编辑敏感 Secret Key</a-checkbox>
    </div>
    <a-textarea :value="shareModalState.shareText" :rows="5" readonly />
    <div style="margin-top: 14px; display: flex; justify-content: flex-end;">
      <a-button type="primary" @click="handleCopyConnectionShare">
        <CopyOutlined /> 复制分享地址
      </a-button>
    </div>
  </a-modal>

  <!-- 导入分享连接 Modal -->
  <a-modal
    v-model:open="shareImportVisible"
    title="导入分享连接"
    width="540px"
    :ok-button-props="{ disabled: !shareImportPreview }"
    ok-text="导入连接"
    cancel-text="取消"
    @ok="handleImportConnectionShare"
    @cancel="handleShareImportCancel"
  >
    <a-textarea
      v-model:value="shareImportText"
      :rows="5"
      placeholder="在此粘贴以 bucketview:// 或加密开头的分享地址"
      @change="parseConnectionShareText"
    />
    <a-alert
      v-if="shareImportPreview"
      type="success"
      show-icon
      style="margin-top: 12px"
      :message="`识别成功: ${shareImportPreview.id} (${shareImportPreview.endpoint})`"
    />
  </a-modal>
</template>

<script lang="ts">
import { defineComponent, reactive, ref, computed, watch, onMounted, toRaw, h, nextTick } from 'vue';
import {
  CopyOutlined,
} from '@ant-design/icons-vue';
import { Connection, MountTarget, PreloadStorage, PreloadNative, PreloadFuse, UpdaterResponse } from '../../../electron/preload/types';
import { FormInstance, notification, Modal } from 'ant-design-vue';
import { defaultStorage, useConfigStore } from '../../store/config';
import { defaultConnectionColorGroups, useSettingStore } from '../../store/setting';
import StringUtil from '../../common/stringUtil';
import { inferS3Addressing, type S3AddressingAdvice } from '../../common/s3Addressing';
import _ from "lodash";

import SettingsWorkspace from './SettingsWorkspace.vue';
import ConnectionTab from './tabs/ConnectionTab.vue';
import PluginTab from './tabs/PluginTab.vue';
import SystemTab from './tabs/SystemTab.vue';
import AboutTab from './tabs/AboutTab.vue';

const storage = (window as any).storage as PreloadStorage;
const native = (window as any).native as PreloadNative;
const fuse = (window as any).fuse as PreloadFuse;

const isWindows = native.osType() === "Windows_NT";
const defaultDrives: string[] = [];
if (isWindows) {
  for (let i = 67; i <= 90; i++) {
    defaultDrives.push(String.fromCharCode(i) + ":");
  }
}

const defaultConnection: Connection = {
  id: "",
  endpoint: "",
  accessKeyId: "",
  accessKeySecret: "",
  region: "",
  bucket: "",
  pathPrefix: "",
  pathStyle: false,
};

interface McImportItem {
  sourceAlias: string;
  selected: boolean;
  protocol: 'http' | 'https';
  connection: Connection;
  addressing: S3AddressingAdvice;
}

export default defineComponent({
  name: 'SettingsCenter',
  components: {
    SettingsWorkspace,
    ConnectionTab,
    PluginTab,
    SystemTab,
    AboutTab,
    CopyOutlined,
  },
  props: {
    open: { type: Boolean, default: false },
    initialConnectionId: { type: String, default: '' },
    mountStates: { type: Object as () => Record<string, boolean>, default: undefined },
  },
  emits: ['update:open', 'mountChanged'],
  setup(props, { emit }) {
    const configStore = useConfigStore();
    const settingStore = useSettingStore();
    const persistentConnections = computed(() => configStore.connections.filter(conn => !conn.temporary));
    const selectedConnId = ref(props.initialConnectionId || persistentConnections.value[0]?.id || '');

    watch(() => props.initialConnectionId, (id) => {
      if (id) selectedConnId.value = id;
    });

    const endpointProtocol = ref<string>('http');
    const defaultCacheDirectoryValue = ref<string>(settingStore.defaultCacheDirectory || '');
    const defaultPageSizeValue = ref<number>(settingStore.defaultPageSize || 20);
    const defaultDownloadDirectoryValue = ref<string>(settingStore.defaultDownloadDirectory || '');
    const listLoadModeValue = ref<'pagination' | 'waterfall'>(settingStore.listLoadMode || 'waterfall');
    const transferConcurrencyValue = ref<number>(settingStore.transferConcurrency || 3);
    const closeBehaviorValue = ref<'hide' | 'exit'>(settingStore.closeBehavior === 'exit' ? 'exit' : 'hide');
    const confirmBeforeExitValue = ref<boolean>(settingStore.confirmBeforeExit !== false);

    const localMountStates = reactive<Record<string, boolean>>({});
    const mountStates = props.mountStates || localMountStates;

    const refreshLocalMountStates = () => {
      for (const target of configStore.mountTargets) {
        if (target.mountPoint && target.mountPoint.length > 0) {
          fuse.getMountStatus(_.cloneDeep(toRaw(target))).then((res: any) => {
            mountStates[target.id] = res.status === 'mounted';
          }).catch(() => {
            mountStates[target.id] = false;
          });
        } else {
          mountStates[target.id] = false;
        }
      }
    };
    const bucketOptions = ref<string[]>([]);
    const bucketFetching = ref(false);
    const availableDrives = ref<string[]>([]);
    const allBucketsCache = ref<string[]>([]);
    const bucketListFailed = ref(false);

    // ── 插件状态与交互 ──
    const defaultPluginsList: any[] = [
      {
        id: 'rclone',
        name: '本地虚拟驱动器 (rclone)',
        category: 'filesystem',
        description: '支持将 S3 对象存储实时挂载为 Windows 本地盘符（或 macOS/Linux 文件夹），如本地磁盘般透明读写。',
        supportedPlatforms: ['Windows', 'macOS', 'Linux'],
        enabled: true,
        status: 'missing',
        version: '',
        config: {},
      },
      {
        id: 'mpv',
        name: '专业音视频播放引擎 (MPV)',
        category: 'media',
        description: '提供广播影视级专业视音频无损拉流解码（支持 Apple ProRes 全系列、多轨未压缩 PCM 音频与时间码轨）。',
        supportedPlatforms: ['Windows', 'macOS', 'Linux'],
        enabled: true,
        status: 'missing',
        version: '',
        config: { playMode: 'smart', hwdec: true },
      },
    ];
    const pluginsList = ref<any[]>([...defaultPluginsList]);
    const pluginsLoading = ref(false);
    const pluginActionLoading = reactive<Record<string, boolean>>({});

    const loadPluginsList = async () => {
      if (!native?.getPlugins) return;
      pluginsLoading.value = true;
      try {
        const res = await native.getPlugins();
        if (Array.isArray(res) && res.length > 0) {
          pluginsList.value = res;
        }
      } catch (e) {
        console.error('[PLUGINS] Failed to load plugins:', e);
      } finally {
        pluginsLoading.value = false;
      }
    };

    const handleTabSwitch = (key: string) => {
      if (key === 'plugins') {
        void loadPluginsList();
      }
    };

    const handleTogglePluginEnabled = async (plugin: any, val: boolean) => {
      plugin.enabled = val;
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { enabled: val });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: `${plugin.name} 已${val ? '启用' : '禁用'}` });
      } catch (e: any) {
        notification.error({ message: '更新插件状态失败', description: e.message });
      }
    };

    const handleUpdatePluginSpecificConfig = async (plugin: any, configUpdates: Record<string, any>) => {
      const mergedConfig = { ...(plugin.config || {}), ...configUpdates };
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { config: mergedConfig });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: '配置已更新' });
      } catch (e: any) {
        notification.error({ message: '保存插件配置失败', description: e.message });
      }
    };

    const handleSelectPluginCustomPath = (plugin: any) => {
      const filters = isWindows
        ? [{ name: '可执行文件', extensions: ['exe'] }]
        : [{ name: '可执行文件', extensions: ['*'] }];
      const paths = native.getLocalFilename(filters);
      if (paths) {
        native.updatePluginConfig?.(plugin.id, { customPath: paths }).then((updated: any) => {
          if (updated) {
            const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
            if (idx !== -1) pluginsList.value[idx] = updated;
          }
          notification.success({ message: `已设置 ${plugin.name} 路径` });
        });
      }
    };

    const handleResetPluginCustomPath = async (plugin: any) => {
      try {
        const updated = await native.updatePluginConfig?.(plugin.id, { customPath: '' });
        if (updated) {
          const idx = pluginsList.value.findIndex(p => p.id === plugin.id);
          if (idx !== -1) pluginsList.value[idx] = updated;
        }
        notification.success({ message: `已重置 ${plugin.name} 路径为默认检测` });
      } catch (e: any) {
        notification.error({ message: '重置路径失败', description: e.message });
      }
    };

    const handleDownloadRclonePlugin = async (plugin: any) => {
      pluginActionLoading[plugin.id] = true;
      try {
        notification.info({ message: '正在自动下载 rclone 挂载驱动…' });
        const res = await native.ensurePluginRclone?.();
        if (res?.success) {
          notification.success({ message: 'rclone 驱动下载就绪！' });
          await loadPluginsList();
        } else {
          notification.error({ message: '下载失败', description: res?.message });
        }
      } catch (e: any) {
        notification.error({ message: '下载异常', description: e.message });
      } finally {
        pluginActionLoading[plugin.id] = false;
      }
    };

    const handleInstallWinFspPlugin = async (plugin: any) => {
      pluginActionLoading[plugin.id] = true;
      try {
        notification.info({ message: '正在下载并准备安装 WinFsp 内核驱动…', description: 'Windows 挂载必备底层组件，请稍候…' });
        const res = await native.ensurePluginWinFsp?.();
        if (res?.success) {
          notification.success({ message: 'WinFsp 驱动安装就绪！' });
          await loadPluginsList();
        } else {
          notification.warning({ message: '驱动安装未完全成功', description: res?.message });
        }
      } catch (e: any) {
        notification.error({ message: '安装异常', description: e.message });
      } finally {
        pluginActionLoading[plugin.id] = false;
      }
    };

    const handleInstallMpvPlugin = async (plugin: any) => {
      pluginActionLoading[plugin.id] = true;
      try {
        notification.info({ message: '正在准备安装 MPV 播放引擎…', description: '后台静默下载安装中，请稍候…' });
        const res = await native.ensurePluginMpv?.();
        if (res?.success) {
          notification.success({ message: 'MPV 播放引擎安装就绪！' });
          await loadPluginsList();
        } else {
          notification.warning({ message: '自动安装未成功', description: res?.message || '已打开手动安装指引' });
          handleShowMpvInstallGuide();
        }
      } catch (e: any) {
        notification.error({ message: '安装异常', description: e.message });
        handleShowMpvInstallGuide();
      } finally {
        pluginActionLoading[plugin.id] = false;
      }
    };

    const handleShowMpvInstallGuide = () => {
      Modal.info({
        title: '安装 MPV 播放器指引',
        width: 500,
        content: () => h('div', { style: 'font-size: 13px; line-height: 1.6; margin-top: 12px;' }, [
          h('p', null, 'MPV 是用于广播影视级高码率视音频（如 Apple ProRes、多轨未压缩 PCM 等）的硬件加速播放引擎。'),
          h('div', { style: 'background: rgba(0,0,0,0.06); padding: 8px 12px; border-radius: 4px; font-family: monospace; margin: 8px 0;' },
            isWindows ? 'winget install shinchiro.mpv' : 'brew install mpv'
          ),
          h('p', { style: 'color: #8c8c8c; font-size: 12px;' }, '安装后刷新检测，或点击上方文件夹图标手动定位 mpv 可执行文件。'),
        ]),
        okText: '我知道了',
      });
    };

    // ── 软件更新与系统属性 ──
    const appVersion = ref(native.appVersion() || '0.0.0');
    const appPlatform = ref(native.osType() || '-');
    const copyrightYear = new Date().getFullYear();
    const updateChecking = ref(false);
    const updateDownloading = ref(false);
    const updateInstalling = ref(false);
    const updateProgress = ref(0);
    const updateAvailableVersion = ref('');
    const updateDownloaded = ref(false);
    const updateStatusText = ref('点击“检查更新”查询是否有新版本');

    const handleCheckUpdate = () => {
      if (updateChecking.value || updateDownloading.value || updateInstalling.value) return;
      updateChecking.value = true;
      updateStatusText.value = '正在检查更新...';
      (window as any).__bucketViewUpdateSource = 'check';
      native.ipcSend('updater-check');
    };

    const handleDownloadUpdate = () => {
      if (updateDownloading.value || updateInstalling.value) return;
      updateDownloading.value = true;
      updateStatusText.value = '正在后台下载更新包...';
      native.ipcSend('updater-download');
    };

    const handleInstallUpdate = () => {
      if (updateInstalling.value) return;
      updateInstalling.value = true;
      updateStatusText.value = '正在准备安装，应用即将重启...';
      native.ipcSend('updater-install');
    };

    const handleAboutUpdater = (_event: any, resp: UpdaterResponse) => {
      if (!resp) return;
      if (resp.cmd === 'checking') updateChecking.value = true;
      if (resp.cmd === 'update-not-available') {
        updateChecking.value = false;
        updateStatusText.value = `当前已是最新版本 (v${appVersion.value})`;
      }
      if (resp.cmd === 'update-available') {
        updateChecking.value = false;
        updateAvailableVersion.value = resp.version || '';
        updateStatusText.value = `发现新版本 v${resp.version}`;
      }
      if (resp.cmd === 'download-progress') {
        updateProgress.value = resp.parent || 0;
      }
      if (resp.cmd === 'update-downloaded') {
        updateDownloading.value = false;
        updateDownloaded.value = true;
        updateStatusText.value = '更新包已下载完毕，可立即安装。';
      }
      if (resp.cmd === 'error') {
        updateChecking.value = false;
        updateDownloading.value = false;
        updateStatusText.value = resp.message || '更新检查失败';
      }
    };

    // ── 连接表单相关 ──
    const connectionModalFormState = ref<Connection>(_.cloneDeep(defaultConnection));
    const connectionModalFormRef = ref<FormInstance>();
    const connectionModalState = reactive<{ visible: boolean; editing: boolean }>({ visible: false, editing: false });
    const connectionTesting = ref(false);
    const mcImportEditingItem = ref<McImportItem | null>(null);

    const connectionModalTitle = computed(() => connectionModalState.editing ? '编辑连接' : '添加连接');
    const connectionIdDisabled = computed(() => connectionModalState.editing && !mcImportEditingItem.value);

    const existingGroupOptions = computed(() => {
      const groups = new Set<string>();
      configStore.connections.forEach(conn => {
        if (conn.group) groups.add(conn.group);
      });
      return Array.from(groups).map(g => ({ value: g }));
    });

    const handleAddConnection = () => {
      mcImportEditingItem.value = null;
      connectionModalFormState.value = _.cloneDeep(defaultConnection);
      endpointProtocol.value = 'http';
      connectionModalState.visible = true;
      connectionModalState.editing = false;
    };

    const handleEditConnection = (conn: Connection) => {
      mcImportEditingItem.value = null;
      connectionModalFormState.value = _.cloneDeep(toRaw(conn));
      endpointProtocol.value = conn.useSSL ? 'https' : 'http';
      connectionModalState.visible = true;
      connectionModalState.editing = true;
    };

    const handleSaveConnectionFromInline = async (conn: Connection, isEditing: boolean, done: () => void) => {
      try {
        const payload = _.cloneDeep(toRaw(conn));
        payload.bucket = payload.bucket || '';
        payload.pathPrefix = StringUtil.trim(payload.pathPrefix || '', '/');
        configStore.addConnection(payload);
        configStore.openTab(payload.id);
        selectedConnId.value = payload.id;
        const targets = configStore.targetsByConnectionId(payload.id);
        await Promise.all(targets.map(target => fuse.syncAutoMount(_.cloneDeep(toRaw(payload)), _.cloneDeep(toRaw(target)))));
        notification.success({ message: isEditing ? "修改连接成功" : "添加连接成功", description: payload.id });
        done();
      } catch (err: any) {
        notification.error({ message: "保存连接失败", description: err.message });
        done();
      }
    };

    const handleTestConnectionFromInline = async (conn: Connection, done: () => void) => {
      try {
        const payload = _.cloneDeep(toRaw(conn));
        storage.changeConfig(defaultStorage, payload);
        const buckets = await storage.listBuckets(defaultStorage);
        notification.success({ message: '连接成功', description: `测试通过，成功读取到 ${buckets.length} 个存储桶 (Bucket)` });
      } catch (e: any) {
        notification.error({ message: '测试连接失败', description: e.message });
      } finally {
        done();
      }
    };

    const handleConnectionModalCancel = () => {
      connectionModalState.visible = false;
      mcImportEditingItem.value = null;
    };

    const handleConnectionModalOk = () => {
      connectionModalFormRef.value?.validateFields().then(async () => {
        const conn = _.cloneDeep(toRaw(connectionModalFormState.value));
        conn.useSSL = endpointProtocol.value === 'https';
        conn.bucket = conn.bucket || '';
        conn.pathPrefix = StringUtil.trim(conn.pathPrefix || '', '/');
        if (mcImportEditingItem.value) {
          mcImportEditingItem.value.connection = conn;
          mcImportEditingItem.value.protocol = endpointProtocol.value === 'https' ? 'https' : 'http';
          connectionModalState.visible = false;
          mcImportEditingItem.value = null;
          return;
        }
        configStore.addConnection(conn);
        configStore.openTab(conn.id);
        selectedConnId.value = conn.id;
        const targets = configStore.targetsByConnectionId(conn.id);
        await Promise.all(targets.map(target => fuse.syncAutoMount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)))));
        notification.success({ message: connectionModalState.editing ? "修改连接成功" : "添加连接成功", description: conn.id });
        connectionModalState.visible = false;
      });
    };

    const handleTestConnection = async () => {
      connectionTesting.value = true;
      try {
        await connectionModalFormRef.value?.validateFields();
        const conn = _.cloneDeep(toRaw(connectionModalFormState.value));
        conn.useSSL = endpointProtocol.value === 'https';
        storage.changeConfig(defaultStorage, conn);
        const buckets = await storage.listBuckets(defaultStorage);
        notification.success({ message: '连接成功', description: `成功连接，读取到 ${buckets.length} 个 Bucket` });
      } catch (e: any) {
        notification.error({ message: '测试连接失败', description: e.message });
      } finally {
        connectionTesting.value = false;
      }
    };

    const handleDeleteConnection = (connectionId: string) => {
      configStore.removeConnection(connectionId);
      if (selectedConnId.value === connectionId) {
        selectedConnId.value = persistentConnections.value[0]?.id || '';
      }
      notification.success({ message: '已删除连接' });
    };

    const handleConnectionEnableChange = (conn: Connection, val: boolean) => {
      conn.enabled = val;
      configStore.addConnection(conn);
    };

    // ── 分享与导入 ──
    const shareModalState = reactive({ visible: false, shareText: '', connectionName: '' });
    const shareReadonly = ref(true);
    const shareExpiry = ref('never');
    const shareImportVisible = ref(false);
    const shareImportText = ref('');
    const shareImportPreview = ref<any>(null);

    const handleShareConnection = (conn: Connection) => {
      shareModalState.connectionName = conn.id;
      const plainConn = JSON.parse(JSON.stringify(toRaw(conn)));
      shareModalState.shareText = native.createConnectionShare(plainConn, shareReadonly.value);
      shareModalState.visible = true;
    };

    const handleCopyConnectionShare = () => {
      if (shareModalState.shareText) {
        native.writeClipboard(shareModalState.shareText);
        notification.success({ message: '已复制分享地址' });
      }
    };

    const parseConnectionShareText = () => {
      if (!shareImportText.value) return;
      const res = native.parseConnectionShare(shareImportText.value.trim());
      if (res.success && res.connection) {
        shareImportPreview.value = res.connection;
      } else {
        shareImportPreview.value = null;
      }
    };

    const handleImportConnectionShare = () => {
      if (!shareImportPreview.value) return;
      configStore.addConnection(shareImportPreview.value);
      configStore.openTab(shareImportPreview.value.id);
      selectedConnId.value = shareImportPreview.value.id;
      notification.success({ message: '导入分享连接成功' });
      shareImportVisible.value = false;
    };

    const handleShareImportCancel = () => {
      shareImportVisible.value = false;
      shareImportText.value = '';
      shareImportPreview.value = null;
    };

    const handleImportMenuClick = ({ key }: { key: string }) => {
      if (key === 'mc') mcImportVisible.value = true;
      if (key === 'share') shareImportVisible.value = true;
    };

    // ── MC 导入 ──
    const mcImportVisible = ref(false);
    const mcImportText = ref('');
    const mcImportItems = ref<McImportItem[]>([]);
    const selectedMcImportCount = computed(() => mcImportItems.value.filter(i => i.selected).length);

    const handleMcImportParse = () => {
      try {
        const json = JSON.parse(mcImportText.value.trim());
        const aliases = json.aliases || json.hosts || {};
        const parsedItems: McImportItem[] = [];
        for (const [alias, conf] of Object.entries(aliases) as [string, any][]) {
          const endpointRaw = String(conf.url || '');
          const isHttps = endpointRaw.startsWith('https://');
          const cleanHost = endpointRaw.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
          const addressing = inferS3Addressing(cleanHost);
          parsedItems.push({
            sourceAlias: alias,
            selected: true,
            protocol: isHttps ? 'https' : 'http',
            connection: {
              id: alias,
              endpoint: cleanHost,
              accessKeyId: conf.accessKey || '',
              accessKeySecret: conf.secretKey || '',
              pathStyle: addressing.pathStyle,
              useSSL: isHttps,
              region: addressing.region || '',
            },
            addressing,
          });
        }
        mcImportItems.value = parsedItems;
      } catch {}
    };

    const handleMcImportSelectAll = (val: boolean) => {
      mcImportItems.value.forEach(i => i.selected = val);
    };

    const handleMcImportFile = () => {
      const file = native.getLocalFilename([{ name: 'JSON Config', extensions: ['json'] }]);
      if (file) {
        try {
          mcImportText.value = native.readLocalFile(file);
          handleMcImportParse();
        } catch {}
      }
    };

    const handleMcImportCancel = () => {
      mcImportVisible.value = false;
      mcImportText.value = '';
      mcImportItems.value = [];
    };

    const handleMcImport = () => {
      mcImportItems.value.filter(i => i.selected).forEach(i => {
        configStore.addConnection(i.connection);
      });
      notification.success({ message: `已导入 ${selectedMcImportCount.value} 个连接` });
      mcImportVisible.value = false;
    };

    // ── 挂载点内联保存 ──
    const handleSaveTargetFromInline = (target: MountTarget, done: () => void) => {
      try {
        if (!target.bucket || !target.mountPoint) {
          notification.error({ message: '请完整填写存储桶与挂载点' });
          done();
          return;
        }
        configStore.addMountTarget(_.cloneDeep(toRaw(target)));
        notification.success({ message: '挂载配置已保存' });
        done();
      } catch (err: any) {
        notification.error({ message: '保存挂载失败', description: err.message });
        done();
      }
    };

    const handleDeleteTarget = (targetId: string) => {
      configStore.removeMountTarget(targetId);
      notification.success({ message: '已删除挂载点' });
    };

    const handleMount = async (conn: Connection, target: MountTarget) => {
      mountStates[target.id + '_loading'] = true;
      try {
        const ensure = await native.ensureRclone(settingStore.fuseBin || '');
        if (!ensure?.success || !ensure.path) throw new Error('挂载驱动未准备好');
        const resp = await fuse.mount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)), ensure.path);
        if (resp.success) {
          mountStates[target.id] = true;
          notification.success({ message: `挂载成功: ${target.mountPoint}` });
          emit('mountChanged');
        } else {
          notification.error({ message: '挂载失败', description: resp.desc });
        }
      } catch (e: any) {
        notification.error({ message: '挂载异常', description: e.message });
      } finally {
        mountStates[target.id + '_loading'] = false;
        refreshLocalMountStates();
      }
    };

    const handleUmount = async (conn: Connection, target: MountTarget) => {
      mountStates[target.id + '_loading'] = true;
      try {
        const resp = await fuse.umount(_.cloneDeep(toRaw(conn)), _.cloneDeep(toRaw(target)));
        if (resp.success) {
          mountStates[target.id] = false;
          notification.success({ message: `已卸载: ${target.mountPoint}` });
          emit('mountChanged');
        } else {
          notification.error({ message: '卸载失败', description: resp.desc });
        }
      } catch (e: any) {
        notification.error({ message: '卸载异常', description: e.message });
      } finally {
        mountStates[target.id + '_loading'] = false;
        refreshLocalMountStates();
      }
    };

    const handleOpenLocalFolder = (target: MountTarget) => {
      if (target.mountPoint) native.openLocalFolder(target.mountPoint);
    };

    const handleSelectCacheDir = (cb?: (dir: string) => void) => {
      const paths = native.getLocalSaveFolder();
      if (paths?.length) {
        if (typeof cb === 'function') {
          cb(paths[0]);
        }
      }
    };

    // ── 系统设置同步 ──
    const handleSelectDefaultDownloadDirectory = () => {
      const paths = native.getLocalSaveFolder();
      if (paths?.length) {
        defaultDownloadDirectoryValue.value = paths[0];
        settingStore.setDefaultDownloadDirectory(paths[0]);
      }
    };
    const handleDefaultDownloadDirectoryChange = (val: string) => { settingStore.setDefaultDownloadDirectory(val); };
    const handleSelectDefaultCacheDirectory = () => {
      const paths = native.getLocalSaveFolder();
      if (paths?.length) {
        defaultCacheDirectoryValue.value = paths[0];
        settingStore.setDefaultCacheDirectory(paths[0]);
      }
    };
    const handleDefaultCacheDirectoryChange = (val: string) => { settingStore.setDefaultCacheDirectory(val); };
    const handleDefaultPageSizeChange = (val: number) => { settingStore.setDefaultPageSize(val); };
    const handleListLoadModeChange = (val: any) => { settingStore.setListLoadMode(val); };
    const handleTransferConcurrencyChange = (val: number) => { settingStore.setTransferConcurrency(val); };
    const handleCloseBehaviorChange = (val: any) => { settingStore.setCloseBehavior(val); };
    const handleConfirmBeforeExitChange = (val: boolean) => { settingStore.setConfirmBeforeExit(val); };
    const handleOpenLogDirectory = async () => { await native.openLogDirectory?.(); };

    const handleEndpointBlur = () => {
      let val = (connectionModalFormState.value.endpoint || '').trim();
      if (/^https?:\/\//i.test(val)) {
        endpointProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        connectionModalFormState.value.endpoint = val;
      }
    };

    watch(() => connectionModalFormState.value.endpoint, (rawVal) => {
      if (!rawVal || !connectionModalState.visible) return;
      let val = rawVal.trim();
      if (/^https?:\/\//i.test(val)) {
        endpointProtocol.value = val.toLowerCase().startsWith('https://') ? 'https' : 'http';
        val = val.replace(/^https?:\/\//i, '').replace(/\/+$/, '');
        nextTick(() => { connectionModalFormState.value.endpoint = val; });
      }
      const advice = inferS3Addressing(val);
      connectionModalFormState.value.pathStyle = advice.pathStyle;
      if (advice.region && !connectionModalState.editing) {
        connectionModalFormState.value.region = advice.region;
      }
    });

    onMounted(() => {
      native.ipc('handler-updater', handleAboutUpdater);
      refreshLocalMountStates();
      emit('mountChanged');
      if (isWindows) {
        fuse.driveList().then((occupied) => {
          availableDrives.value = defaultDrives.filter(d => !occupied.includes(d));
        }).catch(() => {});
      }
    });

    return {
      configStore,
      persistentConnections,
      selectedConnId,
      endpointProtocol,
      defaultCacheDirectoryValue,
      defaultDownloadDirectoryValue,
      defaultPageSizeValue,
      listLoadModeValue,
      transferConcurrencyValue,
      closeBehaviorValue,
      confirmBeforeExitValue,
      mountStates,
      isWindows,
      availableDrives,
      allBucketsCache,
      bucketListFailed,
      pluginsList,
      pluginsLoading,
      pluginActionLoading,
      loadPluginsList,
      handleTabSwitch,
      handleTogglePluginEnabled,
      handleUpdatePluginSpecificConfig,
      handleSelectPluginCustomPath,
      handleResetPluginCustomPath,
      handleDownloadRclonePlugin,
      handleInstallWinFspPlugin,
      handleInstallMpvPlugin,
      handleShowMpvInstallGuide,
      appVersion,
      appPlatform,
      copyrightYear,
      updateChecking,
      updateDownloading,
      updateInstalling,
      updateProgress,
      updateAvailableVersion,
      updateDownloaded,
      updateStatusText,
      handleCheckUpdate,
      handleDownloadUpdate,
      handleInstallUpdate,
      connectionModalState,
      connectionModalFormState,
      connectionModalFormRef,
      connectionModalTitle,
      connectionIdDisabled,
      existingGroupOptions,
      connectionTesting,
      handleSaveConnectionFromInline,
      handleTestConnectionFromInline,
      handleAddConnection,
      handleEditConnection,
      handleDeleteConnection,
      handleConnectionModalCancel,
      handleConnectionModalOk,
      handleTestConnection,
      handleConnectionEnableChange,
      shareModalState,
      shareReadonly,
      shareExpiry,
      shareImportVisible,
      shareImportText,
      shareImportPreview,
      handleShareConnection,
      handleCopyConnectionShare,
      parseConnectionShareText,
      handleImportConnectionShare,
      handleShareImportCancel,
      handleImportMenuClick,
      mcImportVisible,
      mcImportText,
      mcImportItems,
      selectedMcImportCount,
      handleMcImportParse,
      handleMcImportSelectAll,
      handleMcImportFile,
      handleMcImportCancel,
      handleMcImport,
      handleSaveTargetFromInline,
      handleDeleteTarget,
      handleMount,
      handleUmount,
      handleOpenLocalFolder,
      handleSelectCacheDir,
      handleSelectDefaultDownloadDirectory,
      handleDefaultDownloadDirectoryChange,
      handleSelectDefaultCacheDirectory,
      handleDefaultCacheDirectoryChange,
      handleDefaultPageSizeChange,
      handleListLoadModeChange,
      handleTransferConcurrencyChange,
      handleCloseBehaviorChange,
      handleConfirmBeforeExitChange,
      handleOpenLogDirectory,
      handleEndpointBlur,
    };
  },
});
</script>

<style scoped lang="less">
.modal-form-section {
  margin: 12px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);

  .modal-section-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--ant-color-text, #0f172a);
  }
}
</style>
