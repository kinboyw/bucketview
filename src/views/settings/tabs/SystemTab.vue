<template>
  <div class="system-tab-container">
    <div class="section-intro">
      <div>
        <h2 class="section-title">系统偏好设置</h2>
        <p class="section-desc">配置存储下载位置、并发负载以及窗口行为与本地诊断。</p>
      </div>
    </div>

    <div class="setting-cards">
      <!-- 存储与路径 -->
      <div class="setting-card">
        <h3 class="setting-card-title"><FolderOpenOutlined /> 目录与文件下载</h3>
        <div class="setting-rows">
          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">默认下载目录</span>
              <span class="setting-hint">留空时每次下载均会弹出系统选择框询问保存位置。</span>
            </div>
            <div class="setting-ctrl">
              <a-input
                v-model:value="downloadDir"
                placeholder="每次选择保存位置"
                style="width: 320px"
                @change="$emit('updateDownloadDir', downloadDir)"
              />
              <a-button @click="$emit('selectDownloadDir')">
                <FolderOpenOutlined /> 选择目录
              </a-button>
            </div>
          </div>
        </div>
      </div>

      <!-- 文件列表与并发 -->
      <div class="setting-card">
        <h3 class="setting-card-title"><HddOutlined /> 列表与传输性能</h3>
        <div class="setting-rows">
          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">默认列表行数</span>
              <span class="setting-hint">文件浏览时每页加载的记录数量。</span>
            </div>
            <div class="setting-ctrl">
              <a-select
                v-model:value="pageSize"
                style="width: 140px"
                @change="$emit('updatePageSize', pageSize)"
              >
                <a-select-option :value="10">10 行/页</a-select-option>
                <a-select-option :value="20">20 行/页</a-select-option>
                <a-select-option :value="50">50 行/页</a-select-option>
                <a-select-option :value="100">100 行/页</a-select-option>
              </a-select>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">列表加载模式</span>
              <span class="setting-hint">瀑布流支持向下无缝滚动；翻页模式提供传统分页控制。</span>
            </div>
            <div class="setting-ctrl">
              <a-radio-group
                v-model:value="loadMode"
                @change="$emit('updateLoadMode', loadMode)"
              >
                <a-radio-button value="waterfall">瀑布流滚动</a-radio-button>
                <a-radio-button value="pagination">传统翻页</a-radio-button>
              </a-radio-group>
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">后台传输并发度</span>
              <span class="setting-hint">控制上传与下载的同时运行任务数，推荐设为 3~4。</span>
            </div>
            <div class="setting-ctrl">
              <a-select
                v-model:value="concurrency"
                style="width: 140px"
                @change="$emit('updateConcurrency', concurrency)"
              >
                <a-select-option :value="1">1 (单任务串行)</a-select-option>
                <a-select-option :value="2">2</a-select-option>
                <a-select-option :value="3">3 (推荐)</a-select-option>
                <a-select-option :value="4">4</a-select-option>
                <a-select-option :value="6">6</a-select-option>
                <a-select-option :value="8">8 (高性能网)</a-select-option>
              </a-select>
            </div>
          </div>
        </div>
      </div>

      <!-- 退出与诊断 -->
      <div class="setting-card">
        <h3 class="setting-card-title"><CloseSquareOutlined /> 应用生命周期与诊断</h3>
        <div class="setting-rows">
          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">关闭主窗口时</span>
              <span class="setting-hint">选择隐藏至托盘可保证后台持续传输及本地挂载不中断。</span>
            </div>
            <div class="setting-ctrl">
              <a-radio-group
                v-model:value="closeBehavior"
                @change="$emit('updateCloseBehavior', closeBehavior)"
              >
                <a-radio-button value="hide">最小化到系统托盘</a-radio-button>
                <a-radio-button value="exit">直接退出程序</a-radio-button>
              </a-radio-group>
            </div>
          </div>

          <div class="setting-row" v-if="closeBehavior === 'exit'">
            <div class="setting-copy">
              <span class="setting-label">退出前二次确认</span>
              <span class="setting-hint">提示当前正在进行的传输任务或挂载可能受影响。</span>
            </div>
            <div class="setting-ctrl">
              <a-switch
                v-model:checked="confirmBeforeExit"
                @change="$emit('updateConfirmBeforeExit', confirmBeforeExit)"
              />
            </div>
          </div>

          <div class="setting-row">
            <div class="setting-copy">
              <span class="setting-label">本地排错诊断日志</span>
              <span class="setting-hint">日志仅保存在当前机器，用于排查崩溃、更新及网络故障。</span>
            </div>
            <div class="setting-ctrl">
              <a-button @click="$emit('openLogDirectory')">
                <FolderOpenOutlined /> 打开日志目录
              </a-button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, ref, watch } from 'vue';
import {
  FolderOpenOutlined,
  HddOutlined,
  CloseSquareOutlined,
} from '@ant-design/icons-vue';

export default defineComponent({
  name: 'SystemTab',
  components: {
    FolderOpenOutlined,
    HddOutlined,
    CloseSquareOutlined,
  },
  props: {
    defaultDownloadDirectory: { type: String, default: '' },
    defaultPageSize: { type: Number, default: 20 },
    listLoadMode: { type: String, default: 'waterfall' },
    transferConcurrency: { type: Number, default: 3 },
    closeBehavior: { type: String, default: 'hide' },
    confirmBeforeExit: { type: Boolean, default: true },
  },
  emits: [
    'selectDownloadDir',
    'updateDownloadDir',
    'updatePageSize',
    'updateLoadMode',
    'updateConcurrency',
    'updateCloseBehavior',
    'updateConfirmBeforeExit',
    'openLogDirectory',
  ],
  setup(props) {
    const downloadDir = ref(props.defaultDownloadDirectory);
    const pageSize = ref(props.defaultPageSize);
    const loadMode = ref(props.listLoadMode);
    const concurrency = ref(props.transferConcurrency);
    const closeBehavior = ref(props.closeBehavior);
    const confirmBeforeExit = ref(props.confirmBeforeExit);

    watch(() => props.defaultDownloadDirectory, (v) => { downloadDir.value = v; });
    watch(() => props.defaultPageSize, (v) => { pageSize.value = v; });
    watch(() => props.listLoadMode, (v) => { loadMode.value = v; });
    watch(() => props.transferConcurrency, (v) => { concurrency.value = v; });
    watch(() => props.closeBehavior, (v) => { closeBehavior.value = v; });
    watch(() => props.confirmBeforeExit, (v) => { confirmBeforeExit.value = v; });

    return {
      downloadDir,
      pageSize,
      loadMode,
      concurrency,
      closeBehavior,
      confirmBeforeExit,
    };
  },
});
</script>

<style scoped lang="less">
.system-tab-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-intro {
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

.setting-cards {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-card {
  background: var(--ant-color-bg-container, #ffffff);
  border: 1px solid var(--ant-color-border-secondary, #e2e8f0);
  border-radius: 10px;
  padding: 18px 20px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);

  .setting-card-title {
    margin: 0 0 16px;
    font-size: 14px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--ant-color-text, #0f172a);
  }
}

.setting-rows {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--ant-color-border-secondary, #f1f5f9);

  &:last-child {
    padding-bottom: 0;
    border-bottom: none;
  }

  .setting-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;

    .setting-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--ant-color-text, #1e293b);
    }

    .setting-hint {
      font-size: 12px;
      color: var(--ant-color-text-secondary, #64748b);
    }
  }

  .setting-ctrl {
    display: flex;
    align-items: center;
    gap: 10px;
  }
}
</style>
