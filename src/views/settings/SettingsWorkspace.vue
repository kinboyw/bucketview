<template>
  <div class="settings-workspace">
    <!-- 顶部导航栏 -->
    <header class="settings-header">
      <div class="settings-header-left">
        <button class="settings-back-btn" @click="$emit('close')">
          <ArrowLeftOutlined /> 返回
        </button>
        <span class="settings-header-sep">/</span>
        <h1 class="settings-title">配置中心</h1>
      </div>

      <!-- 顶部分组导航 Segmented -->
      <nav class="settings-nav">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="['settings-nav-item', { active: activeTab === tab.key }]"
          @click="switchTab(tab.key)"
        >
          <component :is="tab.icon" class="settings-nav-icon" />
          <span>{{ tab.label }}</span>
        </button>
      </nav>
    </header>

    <!-- 主体工作区容器 -->
    <main class="settings-body">
      <!-- 1. 连接管理 Tab -->
      <div v-show="activeTab === 'bucket'" class="settings-panel settings-panel-full">
        <slot name="bucket"></slot>
      </div>

      <!-- 2. 插件中心 Tab -->
      <div v-show="activeTab === 'plugins'" class="settings-panel">
        <slot name="plugins"></slot>
      </div>

      <!-- 3. 系统偏好 Tab -->
      <div v-show="activeTab === 'system'" class="settings-panel">
        <slot name="system"></slot>
      </div>

      <!-- 4. 关于软件 Tab -->
      <div v-show="activeTab === 'about'" class="settings-panel">
        <slot name="about"></slot>
      </div>
    </main>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, type Component } from 'vue';
import {
  ArrowLeftOutlined,
  CloudServerOutlined,
  AppstoreOutlined,
  SettingOutlined,
  InfoCircleOutlined,
} from '@ant-design/icons-vue';

export default defineComponent({
  name: 'SettingsWorkspace',
  components: {
    ArrowLeftOutlined,
    CloudServerOutlined,
    AppstoreOutlined,
    SettingOutlined,
    InfoCircleOutlined,
  },
  props: {
    defaultTab: {
      type: String,
      default: 'bucket',
    },
  },
  emits: ['close', 'tabChange'],
  setup(props, { emit }) {
    const activeTab = ref(props.defaultTab);

    const tabs: { key: string; label: string; icon: Component }[] = [
      { key: 'bucket', label: '连接管理', icon: CloudServerOutlined },
      { key: 'plugins', label: '扩展插件', icon: AppstoreOutlined },
      { key: 'system', label: '系统设置', icon: SettingOutlined },
      { key: 'about', label: '关于', icon: InfoCircleOutlined },
    ];

    const switchTab = (key: string) => {
      activeTab.value = key;
      emit('tabChange', key);
    };

    return {
      activeTab,
      tabs,
      switchTab,
    };
  },
});
</script>

<style scoped lang="less">
.settings-workspace {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 100;
  display: flex;
  flex-direction: column;
  background: var(--ant-color-bg-layout, #f8fafc);
  color: var(--ant-color-text, #0f172a);
  overflow: hidden;
  animation: fadeIn 0.18s ease-out;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}

.settings-header {
  height: 54px;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  background: var(--ant-color-bg-container, #ffffff);
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);
}

.settings-header-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-back-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--ant-color-border-secondary, #cbd5e1);
  background: transparent;
  color: var(--ant-color-text, #334155);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: var(--ant-color-fill-quaternary, #f1f5f9);
    border-color: var(--ant-color-border, #94a3b8);
  }
}

.settings-header-sep {
  color: var(--ant-color-text-tertiary, #94a3b8);
  font-size: 14px;
}

.settings-title {
  margin: 0;
  font-size: 15px;
  font-weight: 600;
  color: var(--ant-color-text, #0f172a);
}

.settings-nav {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--ant-color-fill-quaternary, #f1f5f9);
  padding: 3px;
  border-radius: 8px;
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
}

.settings-nav-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: var(--ant-color-text-secondary, #64748b);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;

  .settings-nav-icon {
    font-size: 14px;
  }

  &:hover {
    color: var(--ant-color-text, #0f172a);
  }

  &.active {
    background: var(--ant-color-bg-container, #ffffff);
    color: var(--ant-color-primary, #2563eb);
    font-weight: 600;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  }
}

.settings-body {
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: 24px;
  display: flex;
  flex-direction: column;
}

.settings-panel {
  flex: 1;
  min-height: 0;
  max-width: 980px;
  width: 100%;
  margin: 0 auto;
}

.settings-panel-full {
  max-width: 1280px;
}
</style>
