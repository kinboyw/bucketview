<template>
  <div class="about-tab-container">
    <div class="about-hero">
      <div class="about-app-brand">
        <div class="about-logo-badge">
          <CloudServerOutlined class="about-icon" />
        </div>
        <div class="about-app-info">
          <h2 class="about-app-name">BucketView</h2>
          <span class="about-version-tag">版本 v{{ appVersion }} ({{ appPlatform }})</span>
        </div>
      </div>
      <p class="about-summary">跨平台 S3 兼容对象存储桌面客户端，提供极致顺畅的多会话浏览、大文件分片断点传输与本地驱动挂载能力。</p>
    </div>

    <div class="about-cards">
      <!-- 检查更新卡片 -->
      <div class="about-card">
        <div class="update-header">
          <div>
            <h3 class="card-title">软件自动更新</h3>
            <p class="card-desc">{{ updateStatusText }}</p>
          </div>
          <div class="update-actions">
            <a-button
              type="primary"
              :loading="updateChecking"
              :disabled="updateDownloading || updateInstalling"
              @click="$emit('checkUpdate')"
            >
              <ReloadOutlined /> {{ updateChecking ? '检查中...' : '检查更新' }}
            </a-button>

            <a-button
              v-if="updateAvailableVersion && !updateDownloaded"
              type="primary"
              :loading="updateDownloading"
              @click="$emit('downloadUpdate')"
            >
              <DownloadOutlined /> 下载更新
            </a-button>

            <a-button
              v-if="updateDownloaded"
              type="primary"
              :loading="updateInstalling"
              @click="$emit('installUpdate')"
            >
              立即安装并重启
            </a-button>
          </div>
        </div>

        <div v-if="updateDownloading" class="update-progress-bar">
          <a-progress :percent="updateProgress" status="active" />
        </div>
      </div>

      <!-- 开源与版权信息 -->
      <div class="about-card">
        <h3 class="card-title">开源协议与项目主页</h3>
        <p class="license-copy">
          Copyright © 2023-{{ copyrightYear }} BucketView Contributors.<br />
          本项目基于 MIT License 开源发布，自由用于个人和商业存储管理。
        </p>
        <div class="about-links">
          <a class="external-link" href="https://github.com/kinboyw/bucketview" target="_blank">
            <GithubOutlined /> GitHub 开源仓库
          </a>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import {
  CloudServerOutlined,
  ReloadOutlined,
  DownloadOutlined,
  GithubOutlined,
} from '@ant-design/icons-vue';

export default defineComponent({
  name: 'AboutTab',
  components: {
    CloudServerOutlined,
    ReloadOutlined,
    DownloadOutlined,
    GithubOutlined,
  },
  props: {
    appVersion: { type: String, default: '1.0.0' },
    appPlatform: { type: String, default: '' },
    copyrightYear: { type: Number, default: 2026 },
    updateChecking: { type: Boolean, default: false },
    updateDownloading: { type: Boolean, default: false },
    updateInstalling: { type: Boolean, default: false },
    updateProgress: { type: Number, default: 0 },
    updateAvailableVersion: { type: String, default: '' },
    updateDownloaded: { type: Boolean, default: false },
    updateStatusText: { type: String, default: '' },
  },
  emits: ['checkUpdate', 'downloadUpdate', 'installUpdate'],
});
</script>

<style scoped lang="less">
.about-tab-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.about-hero {
  padding: 24px;
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  .about-app-brand {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-bottom: 12px;

    .about-logo-badge {
      width: 48px;
      height: 48px;
      border-radius: 12px;
      background: var(--ant-color-primary, #2563eb);
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 26px;
    }

    .about-app-name {
      margin: 0;
      font-size: 20px;
      font-weight: 700;
      color: var(--ant-color-text, #0f172a);
    }

    .about-version-tag {
      font-size: 12px;
      color: var(--ant-color-text-secondary, #64748b);
    }
  }

  .about-summary {
    margin: 0;
    font-size: 13px;
    line-height: 1.6;
    color: var(--ant-color-text-secondary, #475569);
  }
}

.about-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.about-card {
  padding: 20px;
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 10px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  .card-title {
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 600;
  }

  .card-desc {
    margin: 0;
    font-size: 13px;
    color: var(--ant-color-text-secondary, #64748b);
  }
}

.update-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.update-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.update-progress-bar {
  margin-top: 14px;
}

.license-copy {
  font-size: 12px;
  line-height: 1.6;
  color: var(--ant-color-text-tertiary, #64748b);
  margin: 0 0 12px;
}

.about-links {
  display: flex;
  align-items: center;
  gap: 16px;

  .external-link {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: var(--ant-color-primary, #2563eb);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}
</style>
