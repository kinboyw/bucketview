<template>
  <div class="plugin-tab-container">
    <div class="section-intro">
      <div class="section-intro-text">
        <h2 class="section-title">插件与扩展工具</h2>
        <p class="section-desc">管理本地磁盘挂载驱动 (rclone)、广播级专业媒体播放引擎 (MPV) 等外部功能扩展。</p>
      </div>
      <a-button :loading="loading" @click="$emit('refresh')">
        <ReloadOutlined /> 检测状态
      </a-button>
    </div>

    <div class="plugin-cards">
      <div v-for="plugin in plugins" :key="plugin.id" class="plugin-card">
        <!-- 头部简述与开关 -->
        <div class="plugin-card-head">
          <div class="plugin-card-meta">
            <div class="plugin-title-row">
              <span class="plugin-name">{{ plugin.name }}</span>
              <span class="platform-tag">支持多平台</span>
              <span v-if="plugin.status === 'ready'" class="badge badge-mounted" :title="plugin.source === 'system' ? '系统环境预装' : (plugin.source === 'custom' ? '用户自定义路径' : '应用自动管理')">
                <span class="badge-dot badge-dot-green"></span>已安装 {{ plugin.version ? `(v${plugin.version})` : '' }}
              </span>
              <span v-else-if="plugin.status === 'downloading'" class="badge badge-primary">
                <LoadingOutlined /> 安装中
              </span>
              <span v-else class="badge badge-off">
                <span class="badge-dot badge-dot-gray"></span>未安装
              </span>
            </div>
            <p class="plugin-description">{{ plugin.description }}</p>
          </div>

          <!-- 右侧动作区 -->
          <div class="plugin-actions">
            <template v-if="plugin.id === 'rclone'">
              <a-button
                v-if="plugin.status !== 'ready'"
                type="primary"
                :loading="actionLoading[plugin.id]"
                @click="$emit('installRclone', plugin)"
              >
                <DownloadOutlined /> 一键安装
              </a-button>
              <a-button
                v-else
                :loading="actionLoading[plugin.id]"
                @click="$emit('installRclone', plugin)"
              >
                重新安装
              </a-button>
            </template>
            <template v-else-if="plugin.id === 'winfsp'">
              <a-button
                v-if="plugin.status !== 'ready'"
                type="primary"
                :loading="actionLoading[plugin.id]"
                @click="$emit('installWinFsp', plugin)"
              >
                <DownloadOutlined /> 一键安装
              </a-button>
              <a-button
                v-else
                :loading="actionLoading[plugin.id]"
                @click="$emit('installWinFsp', plugin)"
              >
                重新安装
              </a-button>
            </template>
            <template v-else-if="plugin.id === 'mpv'">
              <a-button
                v-if="plugin.status !== 'ready'"
                type="primary"
                :loading="actionLoading[plugin.id]"
                @click="$emit('installMpv', plugin)"
              >
                <DownloadOutlined /> 一键安装
              </a-button>
              <a-button
                v-else
                :loading="actionLoading[plugin.id]"
                @click="$emit('installMpv', plugin)"
              >
                重新安装
              </a-button>
            </template>

            <!-- 折叠配置按钮 -->
            <a-button
              :type="configOpen[plugin.id] ? 'primary' : 'default'"
              :ghost="configOpen[plugin.id]"
              @click="configOpen[plugin.id] = !configOpen[plugin.id]"
            >
              <SettingOutlined /> {{ configOpen[plugin.id] ? '收起配置' : '设置' }}
            </a-button>

            <!-- 插件总开关 -->
            <a-switch
              :checked="plugin.enabled"
              @change="(val: boolean) => $emit('toggleEnabled', plugin, val)"
            />
          </div>
        </div>

        <!-- 详细设置卡片体 -->
        <div v-if="configOpen[plugin.id]" class="plugin-card-body">
          <div class="config-row">
            <label class="config-label">程序路径</label>
            <div class="config-control">
              <a-input
                :value="plugin.customPath || plugin.executablePath || ''"
                placeholder="自动管理或在系统中查找"
                readonly
                class="path-input"
              />
              <a-tooltip title="手动定位已有的可执行文件">
                <a-button @click="$emit('selectCustomPath', plugin)">
                  <FolderOpenOutlined /> 浏览
                </a-button>
              </a-tooltip>
              <a-button v-if="plugin.customPath" @click="$emit('resetCustomPath', plugin)">
                重置路径
              </a-button>
            </div>
          </div>

          <!-- rclone 专属配置 -->
          <template v-if="plugin.id === 'rclone'">
            <div class="config-row">
              <label class="config-label">缓存目录</label>
              <div class="config-control">
                <a-input
                  v-model:value="cacheDir"
                  placeholder="默认使用系统临时目录"
                  @change="$emit('updateCacheDir', cacheDir)"
                  class="path-input"
                />
                <a-tooltip title="选择挂载缓存目录">
                  <a-button @click="$emit('selectCacheDir')">
                    <FolderOpenOutlined /> 选择目录
                  </a-button>
                </a-tooltip>
              </div>
            </div>
          </template>

          <!-- mpv 专属配置 -->
          <template v-if="plugin.id === 'mpv'">
            <div class="config-row">
              <label class="config-label">播放策略</label>
              <div class="config-control">
                <a-radio-group
                  :value="plugin.config?.playMode || 'smart'"
                  @change="(e: any) => $emit('updatePluginConfig', plugin, { playMode: e.target.value })"
                >
                  <a-radio-button value="smart">智能识别 (MOV/ProRes 优先唤起，推荐)</a-radio-button>
                  <a-radio-button value="always">始终接管所有视频</a-radio-button>
                  <a-radio-button value="manual">仅手动调起</a-radio-button>
                </a-radio-group>
              </div>
            </div>
            <div class="config-row">
              <label class="config-label">硬件加速</label>
              <div class="config-control">
                <a-switch
                  :checked="plugin.config?.hwdec !== false"
                  @change="(val: boolean) => $emit('updatePluginConfig', plugin, { hwdec: val })"
                />
                <span class="control-hint">启用本地 GPU 硬件直解 (D3D11VA / NVDEC / VideoToolbox)</span>
              </div>
            </div>
            <div class="config-row">
              <label class="config-label">窗口置顶</label>
              <div class="config-control">
                <a-switch
                  :checked="plugin.config?.ontop === true"
                  @change="(val: boolean) => $emit('updatePluginConfig', plugin, { ontop: val })"
                />
                <span class="control-hint">播放器窗口始终保持在最前</span>
              </div>
            </div>
            <div class="config-row config-footer-hint">
              <label class="config-label"></label>
              <div class="config-control">
                <a-button type="link" style="padding: 0; font-size: 12px;" @click="$emit('showMpvGuide')">
                  若自动安装受限，可点击查看命令行手动安装指引
                </a-button>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, reactive, ref, watch } from 'vue';
import {
  ReloadOutlined,
  DownloadOutlined,
  SettingOutlined,
  FolderOpenOutlined,
  LoadingOutlined,
} from '@ant-design/icons-vue';

export default defineComponent({
  name: 'PluginTab',
  components: {
    ReloadOutlined,
    DownloadOutlined,
    SettingOutlined,
    FolderOpenOutlined,
    LoadingOutlined,
  },
  props: {
    plugins: {
      type: Array as () => any[],
      default: () => [],
    },
    loading: {
      type: Boolean,
      default: false,
    },
    actionLoading: {
      type: Object as () => Record<string, boolean>,
      default: () => ({}),
    },
    defaultCacheDirectory: {
      type: String,
      default: '',
    },
  },
  emits: [
    'refresh',
    'toggleEnabled',
    'installRclone',
    'installWinFsp',
    'installMpv',
    'selectCustomPath',
    'resetCustomPath',
    'selectCacheDir',
    'updateCacheDir',
    'updatePluginConfig',
    'showMpvGuide',
  ],
  setup(props) {
    const configOpen = reactive<Record<string, boolean>>({ rclone: false, mpv: false });
    const cacheDir = ref(props.defaultCacheDirectory);

    watch(
      () => props.defaultCacheDirectory,
      (val) => {
        cacheDir.value = val;
      }
    );

    return {
      configOpen,
      cacheDir,
    };
  },
});
</script>

<style scoped lang="less">
.plugin-tab-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #e2e8f0);

  .section-title {
    margin: 0 0 4px;
    font-size: 16px;
    font-weight: 600;
  }

  .section-desc {
    margin: 0;
    font-size: 13px;
    color: var(--ant-color-text-secondary, #64748b);
  }
}

.plugin-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plugin-card {
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  transition: border-color 0.2s;

  &:hover {
    border-color: var(--ant-color-border, #cbd5e1);
  }
}

.plugin-card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  gap: 20px;
}

.plugin-card-meta {
  flex: 1;
  min-width: 0;

  .plugin-title-row {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 6px;

    .plugin-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--ant-color-text, #0f172a);
    }

    .platform-tag {
      font-size: 11px;
      padding: 1px 8px;
      border-radius: 4px;
      background: var(--ant-color-fill-quaternary, #f1f5f9);
      color: var(--ant-color-text-tertiary, #94a3b8);
    }
  }

  .plugin-description {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--ant-color-text-secondary, #64748b);
  }
}

.plugin-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}

.plugin-card-body {
  padding: 16px 20px;
  background: var(--ant-color-fill-quaternary, #f8fafc);
  border-top: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 14px;
  animation: fadeIn 0.15s ease-out;
}

.config-row {
  display: flex;
  align-items: center;
  gap: 16px;
  font-size: 13px;

  .config-label {
    width: 80px;
    flex-shrink: 0;
    color: var(--ant-color-text-secondary, #64748b);
    font-weight: 500;
  }

  .config-control {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 10px;

    .path-input {
      max-width: 480px;
    }

    .control-hint {
      font-size: 12px;
      color: var(--ant-color-text-tertiary, #94a3b8);
    }
  }
}

.config-footer-hint {
  margin-top: -4px;
}

.badge-dot-gray {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
  margin-right: 5px;
}
</style>
