<template>
  <a-config-provider :theme="{ algorithm: isDarkTheme ? theme.darkAlgorithm : theme.defaultAlgorithm, token: { colorPrimary: '#1890ff' } }">
    <a-spin :delay="200" :spinning="updaterState.visible" :tip="updaterState.tip">
      <div class="app-custom-titlebar">
        <img src="/favicon.svg" alt="logo" class="titlebar-logo" />
        <span class="titlebar-title">BucketView</span>
      </div>
      <div class="app-main-content-wrapper" :class="{ 'dark-theme': isDarkTheme }"><router-view /></div>
    </a-spin>
  </a-config-provider>
</template>
<script lang="ts">
import { defineComponent, ref, computed, onMounted } from 'vue';
import { UpdaterResponse, PreloadNative } from '../electron/preload/types';
import { useSettingStore } from './store/setting';
import { notification, theme, Modal } from 'ant-design-vue';

// 全局设置
notification.config({
  maxCount: 2,
  placement: "topRight",
  duration: 3,
  rtl: false,
  closeOnClick: true,
});

const native = (window as any).native as PreloadNative;

interface AutoUpdater {
  visible: boolean;
  version?: string;
  parent: number;
  tip: string;
}

export default defineComponent({
  setup() {
    const settingStore = useSettingStore();
    const updaterState = ref<AutoUpdater>({
      visible: false,
      parent: 0,
      tip: '',
    });
    const isDarkTheme = computed(() => settingStore.themeMode === 'dark');

    onMounted(() => {
      document.documentElement.setAttribute('data-theme', settingStore.themeMode || 'light');
    });

    // 处理退出弹窗
    native.ipc("request-app-close", () => {
      Modal.confirm({
        title: '提示',
        content: '退出将中断传输，再次启动时可在传输列表恢复传输',
        okText: '退出',
        cancelText: '取消',
        centered: true,
        onOk() {
          (native as any).ipcSend('confirm-app-close');
        }
      });
    });

    // 更新流程：启动时只提示，用户确认后才下载，下载完成后再由用户确认安装。
    native.ipc("handler-updater", (event, resp: UpdaterResponse) => {
      if (resp.cmd == "update-available") {
        updaterState.value.version = resp.version;
        Modal.confirm({
          title: `发现新版本 ${resp.version}`,
          content: '是否现在下载更新包？下载完成后会再次提示安装。',
          okText: '下载更新',
          cancelText: '稍后',
          centered: true,
          onOk() {
            updaterState.value.visible = true;
            updaterState.value.parent = 0;
            updaterState.value.tip = '[0%] 正在下载更新包...';
            (native as any).ipcSend('updater-download');
          }
        });
      }
      if (resp.cmd == "download-progress") {
        updaterState.value.visible = true;
        updaterState.value.parent = resp.parent;
        updaterState.value.tip = `[${resp.parent}%] 正在下载更新包...`;
      }
      if (resp.cmd == "update-downloaded") {
        updaterState.value.visible = false;
        updaterState.value.parent = 100;
        updaterState.value.tip = '';
        Modal.confirm({
          title: `新版本 ${resp.version} 已下载`,
          content: '是否现在安装？安装时应用会自动退出并完成替换。',
          okText: '立即安装',
          cancelText: '稍后安装',
          centered: true,
          onOk() {
            updaterState.value.visible = true;
            updaterState.value.tip = '正在准备安装更新...';
            (native as any).ipcSend('updater-install');
          }
        });
      }
      if (resp.cmd == "installing") {
        updaterState.value.visible = true;
        updaterState.value.parent = 100;
        updaterState.value.tip = '正在安装更新，请稍候...';
      }
      if (resp.cmd == "error") {
        updaterState.value.visible = false;
        updaterState.value.tip = '';
        notification.error({ message: "更新失败", description: resp.message });
      }
    })

    // 如果更新版本则自动替换为内置版本
    if (settingStore.fuseBin.trim().length == 0 || settingStore.appVersion != native.appVersion()) {
      settingStore.fuseBin = native.fuseBin();
      settingStore.appVersion = native.appVersion();
    }

    return {
      updaterState,
      theme,
      isDarkTheme,
    };
  }
});
</script>

<style lang="less">
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

#app > div {
  height: 100%;
  display: flex;
  flex-direction: column;
}

#app .app-main-content-wrapper {
  flex: 1;
  min-height: 0;
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
