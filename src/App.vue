<template>
  <a-config-provider :theme="{ algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: '#1890ff' } }">
    <div class="app-shell">
      <div class="app-custom-titlebar">
        <img src="/favicon.svg" alt="logo" class="titlebar-logo" />
        <span class="titlebar-title">BucketView</span>
        <button class="titlebar-version" title="关于 BucketView" @click="aboutOpen = true">v{{ appVersion }}</button>
      </div>
      <div class="app-main-content-wrapper" :class="{ 'dark-theme': isDarkTheme }"><router-view /></div>
    </div>

    <a-modal v-model:open="aboutOpen" title="关于 BucketView" centered :footer="null" :width="480">
      <div class="about-content">
        <div class="about-product">
          <img src="/favicon.svg" alt="BucketView" class="about-logo" />
          <div>
            <div class="about-product-name">BucketView</div>
            <div class="about-version">版本 {{ appVersion }}</div>
          </div>
        </div>

        <div class="about-description">
          BucketView 是一个面向对象存储的跨平台桌面管理工具。
        </div>
        <div class="about-copyright">
          Copyright © {{ copyrightYear }} BucketView Contributors<br />
          本项目基于 MIT License 开源发布。
        </div>
        <a class="about-link" href="https://github.com/kinboyw/bucketview" target="_blank">访问 GitHub 项目主页</a>

        <div class="about-update-card">
          <div class="about-update-head">
            <span class="about-update-title">软件更新</span>
            <a-tag :color="updateStatusColor">{{ updateStatusLabel }}</a-tag>
          </div>
          <div class="about-update-message">{{ updaterState.message }}</div>
          <a-progress
            v-if="updaterState.status === 'downloading'"
            :percent="Math.round(updaterState.progress)"
            size="small"
            :show-info="true"
          />
          <div class="about-update-actions">
            <button
              type="button"
              class="about-action-btn about-action-btn-primary"
              :class="{ 'is-loading': updaterState.status === 'checking' }"
              :disabled="updaterState.status === 'checking' || updaterState.status === 'downloading' || updaterState.status === 'downloaded' || updaterState.status === 'installing'"
              @click="handleCheckUpdate"
            >
              <span v-if="updaterState.status === 'checking'" class="about-action-spinner"></span>
              <span>{{ updaterState.status === 'checking' ? '检查中...' : '检查更新' }}</span>
            </button>
            <button
              v-if="updaterState.status === 'downloaded'"
              type="button"
              class="about-action-btn about-action-btn-primary"
              :class="{ 'is-loading': updaterState.status === 'installing' }"
              :disabled="updaterState.status === 'installing'"
              @click="handleInstallUpdate"
            >
              <span v-if="updaterState.status === 'installing'" class="about-action-spinner"></span>
              <span>{{ updaterState.status === 'installing' ? '安装中...' : '立即安装' }}</span>
            </button>
          </div>
        </div>
      </div>
    </a-modal>

    <a-modal
      v-model:open="exitConfirmOpen"
      title="退出 BucketView？"
      centered
      :mask-closable="false"
      :keyboard="false"
      @cancel="handleExitCancel"
    >
      <a-alert
        type="warning"
        show-icon
        message="退出后，后台任务将停止"
        description="正在进行的上传、下载和挂载相关后台进程将被中断；未完成的传输可在下次启动后从传输列表继续。未保存的预览编辑内容可能丢失。"
      />
      <a-checkbox v-model:checked="doNotRemindExit" class="exit-reminder-checkbox">不再提醒</a-checkbox>
      <template #footer>
        <a-button @click="handleExitCancel">取消</a-button>
        <a-button type="primary" danger @click="handleExitConfirm">退出应用</a-button>
      </template>
    </a-modal>
  </a-config-provider>
</template>
<script lang="ts">
import { computed, defineComponent, onMounted, ref } from 'vue';
import { UpdaterResponse, PreloadNative } from '../electron/preload/types';
import { useSettingStore } from './store/setting';
import { notification, theme, Modal } from 'ant-design-vue';

notification.config({
  maxCount: 3,
  placement: 'topRight',
  duration: 3,
  rtl: false,
});

const native = (window as any).native as PreloadNative;

type UpdateStatus = 'idle' | 'checking' | 'downloading' | 'downloaded' | 'installing' | 'error';

interface AutoUpdaterState {
  status: UpdateStatus;
  version?: string;
  progress: number;
  message: string;
}

export default defineComponent({
  setup() {
    const settingStore = useSettingStore();
    const appVersion = native.appVersion();
    const copyrightYear = new Date().getFullYear();
    const aboutOpen = ref(false);
    const manualCheckPending = ref(false);
    const installPromptShown = ref(false);
    const updaterState = ref<AutoUpdaterState>({
      status: 'idle',
      progress: 0,
      message: `当前版本 ${appVersion}`,
    });
    const isDarkTheme = computed(() => settingStore.themeMode === 'dark');
    const exitConfirmOpen = ref(false);
    const doNotRemindExit = ref(false);

    const updateStatusLabel = computed(() => {
      const labels: Record<UpdateStatus, string> = {
        idle: '已就绪',
        checking: '检查中',
        downloading: '后台下载中',
        downloaded: '等待安装',
        installing: '安装中',
        error: '更新异常',
      };
      return labels[updaterState.value.status];
    });

    const updateStatusColor = computed(() => {
      if (updaterState.value.status === 'downloaded') return 'green';
      if (updaterState.value.status === 'error') return 'red';
      if (updaterState.value.status === 'checking' || updaterState.value.status === 'downloading') return 'blue';
      if (updaterState.value.status === 'installing') return 'orange';
      return 'default';
    });

    const handleExitCancel = () => {
      exitConfirmOpen.value = false;
      doNotRemindExit.value = false;
    };

    const handleExitConfirm = () => {
      if (doNotRemindExit.value) settingStore.setConfirmBeforeExit(false);
      exitConfirmOpen.value = false;
      native.ipcSend('confirm-app-close');
    };

    const handleCheckUpdate = () => {
      if (updaterState.value.status === 'downloading' || updaterState.value.status === 'downloaded' || updaterState.value.status === 'installing') return;
      manualCheckPending.value = true;
      updaterState.value.status = 'checking';
      updaterState.value.message = '正在连接 GitHub 检查新版本…';
      (window as any).__bucketViewUpdateSource = 'check';
      native.ipcSend('updater-check');
    };

    const handleInstallUpdate = () => {
      updaterState.value.status = 'installing';
      updaterState.value.message = '正在准备安装，应用即将退出…';
      notification.info({
        key: 'bucketview-update',
        message: '正在准备安装更新',
        description: 'BucketView 将自动退出并完成版本替换。',
        duration: 0,
      });
      native.ipcSend('updater-install');
    };

    const showInstallPrompt = (version: string) => {
      if (installPromptShown.value) return;
      installPromptShown.value = true;
      Modal.confirm({
        title: `新版本 ${version} 已下载`,
        content: '更新已在后台下载完成。是否现在退出应用并安装？也可以稍后在“关于 BucketView”中安装。',
        okText: '立即安装',
        cancelText: '稍后安装',
        centered: true,
        onOk() {
          installPromptShown.value = false;
          handleInstallUpdate();
        },
        onCancel() {
          installPromptShown.value = false;
        },
      });
    };

    onMounted(() => {
      document.documentElement.setAttribute('data-theme', settingStore.themeMode || 'light');
    });

    native.ipc('request-app-close', () => {
      const closeBehavior = settingStore.closeBehavior === 'exit' ? 'exit' : 'hide';
      if (settingStore.closeBehavior !== closeBehavior) settingStore.setCloseBehavior(closeBehavior);
      if (closeBehavior === 'hide') {
        native.ipcSend('hide-app-window');
        return;
      }
      if (settingStore.confirmBeforeExit === false) {
        native.ipcSend('confirm-app-close');
        return;
      }
      if (!exitConfirmOpen.value) {
        doNotRemindExit.value = false;
        exitConfirmOpen.value = true;
      }
    });

    native.ipc('handler-updater', (_event, resp: UpdaterResponse) => {
      if (resp.cmd === 'checking') {
        updaterState.value.status = 'checking';
        updaterState.value.message = '正在连接 GitHub 检查新版本…';
        return;
      }

      if (resp.cmd === 'update-not-available') {
        updaterState.value.status = 'idle';
        updaterState.value.version = undefined;
        updaterState.value.progress = 0;
        updaterState.value.message = `当前已是最新版本 ${appVersion}`;
        if (manualCheckPending.value) {
          notification.success({ message: '已是最新版本', description: `当前版本为 ${appVersion}` });
        }
        manualCheckPending.value = false;
        return;
      }

      if (resp.cmd === 'update-available') {
        manualCheckPending.value = false;
        const source = (window as any).__bucketViewUpdateSource as string | null | undefined;
        const fromConfigDownload = source === 'download';
        const fromConfigCheck = source === 'check';
        const alreadyDownloading = updaterState.value.status === 'downloading' && updaterState.value.version === resp.version;
        updaterState.value.version = resp.version;
        // 配置中心关于页手动检查时先不自动下载，交给用户点“下载更新”
        if (fromConfigCheck) {
          updaterState.value.status = 'idle';
          updaterState.value.progress = 0;
          updaterState.value.message = `发现新版本 ${resp.version}，可手动下载更新`;
          (window as any).__bucketViewUpdateSource = null;
          return;
        }
        updaterState.value.status = 'downloading';
        updaterState.value.progress = 0;
        updaterState.value.message = `发现新版本 ${resp.version}，正在后台下载…`;
        if (!alreadyDownloading && !fromConfigDownload) {
          notification.info({
            key: 'bucketview-update',
            message: `发现新版本 ${resp.version}`,
            description: '更新包正在后台下载，不影响当前操作。',
          });
          native.ipcSend('updater-download');
        }
        if (fromConfigDownload) {
          (window as any).__bucketViewUpdateSource = 'download';
        }
        return;
      }

      if (resp.cmd === 'download-progress') {
        updaterState.value.status = 'downloading';
        updaterState.value.progress = resp.parent;
        updaterState.value.message = `更新包正在后台下载：${Math.round(resp.parent)}%`;
        return;
      }

      if (resp.cmd === 'update-downloaded') {
        updaterState.value.status = 'downloaded';
        updaterState.value.version = resp.version;
        updaterState.value.progress = 100;
        updaterState.value.message = `新版本 ${resp.version} 已下载完成，等待安装。`;
        notification.success({
          key: 'bucketview-update',
          message: `新版本 ${resp.version} 下载完成`,
          description: '可以立即安装，也可以稍后在“关于 BucketView”中安装。',
          duration: 5,
        });
        showInstallPrompt(resp.version);
        return;
      }

      if (resp.cmd === 'installing') {
        updaterState.value.status = 'installing';
        updaterState.value.version = resp.version;
        updaterState.value.message = '正在安装更新，请稍候…';
        return;
      }

      if (resp.cmd === 'error') {
        const checking = updaterState.value.status === 'checking';
        updaterState.value.status = 'error';
        updaterState.value.message = resp.message;
        manualCheckPending.value = false;
        notification.error({
          key: 'bucketview-update',
          message: checking ? '检查更新失败' : '更新失败',
          description: resp.message,
        });
      }
    });

    if (settingStore.fuseBin.trim().length === 0 || settingStore.appVersion !== appVersion) {
      settingStore.fuseBin = native.fuseBin();
      settingStore.appVersion = appVersion;
    }

    return {
      aboutOpen,
      appVersion,
      copyrightYear,
      updaterState,
      updateStatusLabel,
      updateStatusColor,
      handleCheckUpdate,
      handleInstallUpdate,
      theme,
      isDarkTheme,
      exitConfirmOpen,
      doNotRemindExit,
      handleExitCancel,
      handleExitConfirm,
    };
  },
});
</script>

<style lang="less">
.exit-reminder-checkbox {
  margin-top: 16px;
}

.about-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.about-product {
  display: flex;
  align-items: center;
  gap: 14px;
}

.about-logo {
  width: 52px;
  height: 52px;
}

.about-product-name {
  font-size: 20px;
  font-weight: 600;
  color: var(--ant-color-text);
}

.about-version {
  margin-top: 2px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.about-description,
.about-copyright {
  font-size: 12px;
  line-height: 1.7;
  color: var(--ant-color-text-secondary);
}

.about-link {
  font-size: 12px;
}

.about-update-card {
  padding: 12px;
  border: 1px solid var(--ant-color-border-secondary);
  border-radius: 8px;
  background: var(--ant-color-fill-quaternary);
}

.about-update-head,
.about-update-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.about-update-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--ant-color-text);
}

.about-update-message {
  margin: 8px 0;
  min-height: 18px;
  font-size: 12px;
  color: var(--ant-color-text-secondary);
}

.about-update-actions {
  justify-content: flex-end;
}

/* Dark Theme Basic Resets */
:root[data-theme='dark'] {
  color-scheme: dark;
  body {
    background-color: var(--ant-color-bg-layout, #141414);
    color: var(--ant-color-text, rgba(255, 255, 255, 0.85));
  }
  .app-main-content-wrapper {
    background-color: var(--ant-color-bg-layout, #141414);
  }
}

.app-custom-titlebar {
  height: 32px;
  display: flex;
  align-items: center;
  padding: 0 16px;
  -webkit-app-region: drag;
  background-color: var(--ant-color-bg-container);
  border-bottom: 1px solid var(--ant-color-border-secondary);
  flex-shrink: 0;

  .titlebar-logo {
    width: 14px;
    height: 14px;
    margin-right: 8px;
    user-select: none;
    -webkit-user-drag: none;
  }

  .titlebar-title {
    font-size: 12px;
    font-weight: 600;
    color: var(--ant-color-text-secondary);
  }

  .titlebar-version {
    margin-left: 7px;
    padding: 1px 6px;
    border: 1px solid var(--ant-color-border-secondary);
    border-radius: 10px;
    background: var(--ant-color-fill-quaternary);
    color: var(--ant-color-text-tertiary);
    font-size: 10px;
    line-height: 16px;
    cursor: pointer;
    -webkit-app-region: no-drag;

    &:hover {
      color: var(--ant-color-primary);
      border-color: var(--ant-color-primary-border);
      background: var(--ant-color-primary-bg);
    }
  }
}

.about-action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 88px;
  height: 28px;
  padding: 0 12px;
  border: 1px solid var(--ant-color-border);
  border-radius: 6px;
  background: var(--ant-color-bg-container);
  color: var(--ant-color-text-secondary);
  font-size: 12px;
  line-height: 1;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
  user-select: none;

  &:hover:not(:disabled) {
    color: var(--ant-color-text);
    border-color: var(--ant-color-text-quaternary);
    background: var(--ant-color-fill-tertiary);
  }
  &:disabled { cursor: not-allowed; opacity: 0.55; }
  &.is-loading { cursor: progress; }
}
.about-action-btn-primary {
  border-color: color-mix(in srgb, var(--ant-color-text-secondary) 35%, var(--ant-color-border));
  background: var(--ant-color-fill-quaternary);
  color: var(--ant-color-text);
  font-weight: 600;
  &:hover:not(:disabled) {
    color: var(--ant-color-text);
    border-color: var(--ant-color-text-tertiary);
    background: var(--ant-color-fill-tertiary);
  }
}
.about-action-spinner {
  width: 10px;
  height: 10px;
  border: 1.5px solid currentColor;
  border-right-color: transparent;
  border-radius: 50%;
  animation: about-spin 0.7s linear infinite;
  flex-shrink: 0;
}

@keyframes about-spin {
  to { transform: rotate(360deg); }
}
</style>
<style lang="less">
html,
body,
#app {
  height: 100%;
  margin: 0;
  padding: 0;
  user-select: none;
  overflow: hidden;
}

#app > div.app-shell,
#app .app-shell {
  height: 100%;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

#app .app-custom-titlebar {
  height: 32px;
  flex: 0 0 32px;
}

#app .app-main-content-wrapper {
  flex: 1 1 auto;
  min-height: 0;
  height: auto !important;
  overflow: hidden;
}

#app .ant-spin-nested-loading {
  height: 100%;
}

#app .ant-spin-container {
  height: 100%;
  display: flex;
  flex-direction: column;
}

/* Custom modern loading spinner to replace Ant Design default */
#app .ant-spin-dot {
  width: 28px !important;
  height: 28px !important;
  border-radius: 50% !important;
  background: conic-gradient(transparent 10%, var(--ant-color-primary)) !important;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black 0) !important;
  mask: radial-gradient(farthest-side, transparent calc(100% - 3px), black 0) !important;
  animation: custom-spin 1s infinite linear !important;
  transform: none !important;
  font-size: 0 !important;
  margin: auto;
}

#app .ant-spin-dot i {
  display: none !important;
}

#app .ant-spin-sm .ant-spin-dot {
  width: 16px !important;
  height: 16px !important;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black 0) !important;
  mask: radial-gradient(farthest-side, transparent calc(100% - 2px), black 0) !important;
}

#app .ant-spin-lg .ant-spin-dot {
  width: 40px !important;
  height: 40px !important;
  -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black 0) !important;
  mask: radial-gradient(farthest-side, transparent calc(100% - 4px), black 0) !important;
}

@keyframes custom-spin {
  to { transform: rotate(1turn); }
}

.app-main-content-wrapper {
  position: relative;
  flex: 1;
  min-height: 0;
  width: 100%;
  overflow: hidden;
}

// 全局覆盖 Notification 样式（灰度紧凑主题，宽度自适应内容）
.ant-notification {
  z-index: 1060;

  .ant-notification-notice {
    padding: 8px 12px;
    border-radius: 4px;
    border: 1px solid #e5e7eb;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
    width: auto;
    max-width: 380px;
    min-width: 120px;

    .ant-notification-notice-message {
      font-size: 12px;
      font-weight: 500;
      line-height: 18px;
      color: #1f2937;
      margin-bottom: 0;
    }

    .ant-notification-notice-description {
      font-size: 11px;
      line-height: 16px;
      color: #6b7280;
      margin-top: 1px;
    }

    .ant-notification-notice-close {
      top: 6px;
      inset-inline-end: 8px;
      color: #9ca3af;
      &:hover { color: #6b7280; }
    }

    .ant-notification-notice-icon {
      font-size: 14px;
      top: 10px;
      margin-inline-end: 8px;
    }

    .ant-notification-notice-with-icon .ant-notification-notice-message {
      margin-inline-start: 36px;
    }

    .ant-notification-notice-with-icon .ant-notification-notice-description {
      margin-inline-start: 36px;
    }
  }

  // success: 绿色系
  .ant-notification-notice-success {
    background: #f0fdf4;
    border-color: #bbf7d0;
    .ant-notification-notice-icon { color: #22c55e; }
  }

  // info: 灰蓝色系
  .ant-notification-notice-info {
    background: #f8fafc;
    border-color: #e2e8f0;
    .ant-notification-notice-icon { color: #64748b; }
  }

  // warning: 暖灰色系
  .ant-notification-notice-warning {
    background: #fffbeb;
    border-color: #fde68a;
    .ant-notification-notice-icon { color: #d97706; }
  }

  // error: 低饱和度红色
  .ant-notification-notice-error {
    background: #fef2f2;
    border-color: #fecaca;
    .ant-notification-notice-icon { color: #b91c1c; }
  }
}

:root[data-theme='dark'] {
  .ant-notification {
    .ant-notification-notice {
      background: #1f1f1f;
      border-color: #333333;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);

      .ant-notification-notice-message {
        color: rgba(255, 255, 255, 0.88);
      }

      .ant-notification-notice-description {
        color: rgba(255, 255, 255, 0.65);
      }

      .ant-notification-notice-close {
        color: rgba(255, 255, 255, 0.45);
        &:hover { color: rgba(255, 255, 255, 0.75); }
      }
    }

    .ant-notification-notice-success {
      background: #162312;
      border-color: #274916;
      .ant-notification-notice-icon { color: #49aa19; }
    }

    .ant-notification-notice-info {
      background: #111a2c;
      border-color: #15325b;
      .ant-notification-notice-icon { color: #1668dc; }
    }

    .ant-notification-notice-warning {
      background: #2b2111;
      border-color: #594214;
      .ant-notification-notice-icon { color: #d89614; }
    }

    .ant-notification-notice-error {
      background: #2a1215;
      border-color: #5c2223;
      .ant-notification-notice-icon { color: #dc4446; }
    }
  }
}

.ant-popover.ant-popconfirm {
  z-index: 1200;
}

// 全局覆盖 Message 样式（灰度紧凑主题）
.ant-message {
  .ant-message-notice-content {
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 12px;
    line-height: 18px;
    background: #f9fafb;
    border: 1px solid #e5e7eb;
    color: #374151;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.06);
  }
}

// 全局覆盖 Modal.confirm 样式（极致紧凑）
.ant-modal-confirm {
  .ant-modal {
    padding-bottom: 0;
  }

  .ant-modal-content {
    border-radius: 4px;
    border: 1px solid #e0e1e3;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    padding: 10px 14px 8px;
  }

  .ant-modal-body {
    padding: 0;
  }

  .ant-modal-confirm-body-wrapper {
    padding: 0;
  }

  .ant-modal-confirm-body {
    .ant-modal-confirm-title {
      font-size: 12px;
      font-weight: 500;
      color: #374151;
      line-height: 16px;
    }

    .ant-modal-confirm-content {
      font-size: 11px;
      line-height: 15px;
      color: #6b7280;
      margin-top: 1px;
      margin-inline-start: 0;
    }
  }

  .ant-modal-confirm-btns {
    margin-top: 6px;

    .ant-btn {
      height: 22px;
      padding: 0 8px;
      font-size: 11px;
      line-height: 20px;
      border-radius: 3px;
      border-color: #e5e7eb;
      color: #6b7280;
    }

    .ant-btn-primary {
      background: #4b5563;
      border-color: #4b5563;
      color: #fff;

      &:hover {
        background: #374151;
        border-color: #374151;
      }
    }
  }

  .ant-modal-confirm-icon {
    margin-inline-end: 6px;

    .anticon-exclamation-circle {
      color: #d97706;
      font-size: 14px;
    }
  }
}

// 全局预览弹窗样式（简约紧凑风格）
.preview-modal-wrap {
  .ant-modal {
    .ant-modal-content {
      border-radius: 6px;
      border: 1px solid #e5e7eb;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.12);
      overflow: hidden;
    }

    // 紧凑标题栏
    .ant-modal-header {
      padding: 8px 16px;
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
    }

    .ant-modal-title {
      font-size: 13px;
      font-weight: 500;
      color: #374151;
      line-height: 20px;
    }

    // 紧凑关闭按钮
    .ant-modal-close {
      top: 4px;
      right: 4px;
      width: 28px;
      height: 28px;
      line-height: 28px;

      .ant-modal-close-x {
        font-size: 12px;
        width: 28px;
        height: 28px;
        line-height: 28px;
      }
    }

    // 紧凑内容区
    .ant-modal-body {
      padding: 0;
    }

    // 紧凑底部
    .ant-modal-footer {
      padding: 8px 16px;
      border-top: 1px solid #f0f0f0;
      background: #fafafa;
    }
  }

  // 最大化模式：填满整个视口
  .ant-modal.preview-modal-maximized {
    width: 100% !important;
    max-width: 100% !important;
    top: 0 !important;
    margin: 0 !important;
    padding: 0 !important;

    .ant-modal-content {
      border-radius: 0;
      border: none;
      box-shadow: none;
      height: 100vh;
    }

    .ant-modal-header {
      border-radius: 0;
    }
  }
}

// 最大化时移除 wrap 的默认 padding
.preview-modal-wrap.preview-modal-maximized-wrap {
  padding: 0 !important;
}
// 全局滚动条样式
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-thumb {
  background: rgba(144, 147, 153, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(144, 147, 153, 0.5);
}

::-webkit-scrollbar-track {
  background: transparent;
}
</style>
