<template>
  <a-config-provider :theme="antdTheme">
    <main :class="['preview-root', `preview-${payload?.fileType || 'loading'}`]">
      <header class="preview-titlebar">
        <div class="preview-titlebar-content">
          <span class="preview-title" :title="payload?.title || '文件预览'">{{ payload?.title || '文件预览' }}</span>
          <span v-if="formattedFileSize" class="preview-file-size">{{ formattedFileSize }}</span>
        </div>
      </header>

      <section class="preview-content">
        <div v-if="!payload" class="preview-state">
          <a-spin size="large" />
          <span>正在准备预览…</span>
        </div>

        <template v-else>
          <image-gallery
            v-if="payload.fileType === 'image'"
            :key="payload.id"
            :images="payload.images?.length ? payload.images : fallbackImages"
            :start-index="payload.imageStartIndex || 0"
          />

          <div v-else-if="payload.fileType === 'video'" class="fill-preview media-preview">
            <video-player :key="payload.id" :src="payload.url" />
          </div>

          <div v-else-if="payload.fileType === 'audio'" class="audio-preview">
            <div class="audio-artwork"><CustomerServiceOutlined /></div>
            <div class="audio-title">{{ payload.title }}</div>
            <audio controls autoplay :src="payload.url" class="audio-player" />
          </div>

          <div v-else-if="payload.fileType === 'pdf'" class="fill-preview pdf-preview">
            <pdf-viewer :key="payload.id" :src="payload.url" />
          </div>

          <div v-else-if="payload.fileType === 'model'" class="fill-preview model-preview">
            <model-viewer :key="payload.id" :src="payload.url" />
          </div>

          <div v-else-if="payload.fileType === 'office'" :class="['fill-preview', 'office-preview', { presenting: officePresentationMode }]">
            <div class="office-toolbar">
              <a-tooltip title="回到顶部">
                <button class="toolbar-button" @click="scrollOfficePreview('top')"><ArrowUpOutlined /></button>
              </a-tooltip>
              <a-tooltip title="滚到底部">
                <button class="toolbar-button" @click="scrollOfficePreview('bottom')"><ArrowDownOutlined /></button>
              </a-tooltip>
              <a-tooltip v-if="isPowerPoint" :title="officePresentationMode ? '退出放映' : '放映模式'">
                <button :class="['toolbar-button', 'toolbar-button-primary', { active: officePresentationMode }]" @click="toggleOfficePresentationMode">
                  <FullscreenExitOutlined v-if="officePresentationMode" />
                  <PlayCircleOutlined v-else />
                </button>
              </a-tooltip>
            </div>
            <div ref="officeScrollRef" class="office-scroll">
              <vue-office-docx
                v-if="isWord"
                :key="`docx-${officeRenderKey}-${payload.id}`"
                :src="payload.url"
              />
              <vue-office-excel
                v-else-if="isExcel"
                :key="`excel-${officeRenderKey}-${payload.id}`"
                :src="payload.url"
                :options="officeExcelOptions"
              />
              <vue-office-pptx
                v-else-if="isPowerPoint"
                :key="`pptx-${officeRenderKey}-${payload.id}`"
                :src="payload.url"
                :options="officePptOptions"
              />
              <div v-else class="preview-state">不支持的 Office 格式</div>
            </div>
          </div>

          <div v-else-if="payload.fileType === 'text'" class="text-preview">
            <text-editor
              ref="textEditorRef"
              :key="payload.id"
              :src="payload.url"
              :language="payload.fileExtension"
              :editable="payload.canSaveText !== false && !payload.chunked"
              :chunked="payload.chunked"
              :file-size="payload.fileSize || 0"
              :theme-mode="payload.theme"
              @save="saveText"
              @dirty-change="handleTextDirtyChange"
            />
            <footer class="text-footer">
              <span v-if="payload.chunked" class="text-hint">
                <a-spin v-if="textEditorRef?.chunkLoading" size="small" />
                {{ textEditorRef?.partialInfo || '分段读取' }}
              </span>
              <span v-else :class="['text-hint', { dirty: textDirty }]">
                <span v-if="textDirty" class="dirty-dot"></span>
                {{ payload.canSaveText === false ? '只读预览' : 'Ctrl+S 保存' }}
              </span>
              <button v-if="payload.chunked && (textEditorRef?.loadLimitReached || textDirty)" class="download-button" @click="requestDownload">
                <DownloadOutlined /> 下载至本地
              </button>
            </footer>
          </div>
        </template>
      </section>

      <a-modal
        v-model:open="closeConfirmOpen"
        title="保存更改？"
        centered
        :closable="false"
        :keyboard="false"
        :mask-closable="false"
      >
        <p class="close-confirm-message">
          “{{ payload?.title || '当前文件' }}”包含尚未保存的更改。如果不保存，这些更改将会丢失。
        </p>
        <template #footer>
          <a-button @click="closeConfirmOpen = false">取消</a-button>
          <a-button danger @click="discardChangesAndClose">放弃修改</a-button>
          <a-button type="primary" @click="saveChangesAndClose">保存并关闭</a-button>
        </template>
      </a-modal>
    </main>
  </a-config-provider>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { theme } from 'ant-design-vue';
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  CustomerServiceOutlined,
  DownloadOutlined,
  FullscreenExitOutlined,
  PlayCircleOutlined,
} from '@ant-design/icons-vue';
import VueOfficeDocx from '@vue-office/docx';
import '@vue-office/docx/lib/index.css';
import VueOfficeExcel from '@vue-office/excel';
import '@vue-office/excel/lib/index.css';
import VueOfficePptx from '@vue-office/pptx';
import ImageGallery from '../views/ImageGallery.vue';
import ModelViewer from '../views/ModelViewer.vue';
import PdfViewer from '../views/PdfViewer.vue';
import TextEditor from '../views/TextEditor.vue';
import VideoPlayer from '../views/VideoPlayer.vue';
import type { PreloadPreviewWindow, PreviewWindowPayload } from '../../electron/preload/types';

const PREVIEW_TITLEBAR_HEIGHT = 32;
const previewWindow = (window as any).previewWindow as PreloadPreviewWindow;
const payload = ref<PreviewWindowPayload | null>(null);
const textEditorRef = ref<any>();
const textDirty = ref(false);
const closeConfirmOpen = ref(false);
const officeScrollRef = ref<HTMLElement | null>(null);
const officePresentationMode = ref(false);
const officeRenderKey = ref(0);
const viewportWidth = ref(window.innerWidth);
const viewportHeight = ref(window.innerHeight);
let removeDataListener: (() => void) | undefined;
let removeCloseRequestedListener: (() => void) | undefined;
let resizeTimer: ReturnType<typeof setTimeout> | undefined;

const antdTheme = computed(() => ({
  algorithm: payload.value?.theme === 'dark' ? theme.darkAlgorithm : theme.defaultAlgorithm,
  token: payload.value?.themeTokens ? { ...payload.value.themeTokens } : undefined,
}));

const extension = computed(() => payload.value?.fileExtension.toLowerCase() || '');
const isWord = computed(() => ['docx', 'doc'].includes(extension.value));
const isExcel = computed(() => ['xlsx', 'xls', 'csv'].includes(extension.value));
const isPowerPoint = computed(() => ['pptx', 'ppt'].includes(extension.value));
const fallbackImages = computed(() => payload.value ? [{ name: payload.value.title, url: payload.value.url, size: payload.value.size }] : []);
const formattedFileSize = computed(() => {
  const size = payload.value?.size ?? payload.value?.fileSize;
  if (!size || size <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const unitIndex = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / (1024 ** unitIndex);
  return `${value >= 100 || unitIndex === 0 ? Math.round(value) : value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`;
});
const officeExcelOptions = computed(() => ({ showContextmenu: true }));
const officePptOptions = computed(() => ({
  width: Math.max(320, Math.round(viewportWidth.value)),
  height: Math.max(220, Math.round(viewportHeight.value - (officePresentationMode.value ? 0 : PREVIEW_TITLEBAR_HEIGHT))),
}));

const applyThemeTokens = (nextPayload: PreviewWindowPayload) => {
  const root = document.documentElement;
  const tokens = nextPayload.themeTokens;
  const cssVariables: Record<string, string> = {
    '--ant-color-primary': tokens.colorPrimary,
    '--ant-color-bg-base': tokens.colorBgBase,
    '--ant-color-bg-layout': tokens.colorBgLayout,
    '--ant-color-bg-container': tokens.colorBgContainer,
    '--ant-color-bg-elevated': tokens.colorBgElevated,
    '--ant-color-bg-spotlight': tokens.colorBgSpotlight,
    '--ant-color-text': tokens.colorText,
    '--ant-color-text-secondary': tokens.colorTextSecondary,
    '--ant-color-text-tertiary': tokens.colorTextTertiary,
    '--ant-color-border': tokens.colorBorder,
    '--ant-color-border-secondary': tokens.colorBorderSecondary,
    '--ant-color-fill-secondary': tokens.colorFillSecondary,
    '--ant-color-fill-tertiary': tokens.colorFillTertiary,
    '--preview-bg': tokens.colorBgLayout,
    '--preview-bg-soft': tokens.colorFillTertiary,
    '--preview-panel': tokens.colorBgContainer,
    '--preview-elevated': tokens.colorBgElevated,
    '--preview-text': tokens.colorText,
    '--preview-muted': tokens.colorTextSecondary,
    '--preview-tertiary': tokens.colorTextTertiary,
    '--preview-border': tokens.colorBorderSecondary,
    '--preview-primary': tokens.colorPrimary,
    '--preview-media-bg': nextPayload.theme === 'dark' ? '#000000' : '#111827',
  };
  Object.entries(cssVariables).forEach(([name, value]) => root.style.setProperty(name, value));
};

const applyPayload = async (nextPayload: PreviewWindowPayload) => {
  const themeOnlyUpdate = payload.value?.id === nextPayload.id
    && payload.value.url === nextPayload.url
    && payload.value.fileType === nextPayload.fileType;
  payload.value = nextPayload;
  document.documentElement.setAttribute('data-theme', nextPayload.theme || 'light');
  applyThemeTokens(nextPayload);
  document.title = `${nextPayload.title} - BucketView 预览`;
  if (themeOnlyUpdate) return;

  textDirty.value = false;
  closeConfirmOpen.value = false;
  previewWindow.setTextDirty(false);
  officePresentationMode.value = false;
  await nextTick();
  officeRenderKey.value += 1;
  window.dispatchEvent(new Event('resize'));
};

const handleResize = () => {
  viewportWidth.value = window.innerWidth;
  viewportHeight.value = window.innerHeight;
  if (!payload.value || payload.value.fileType !== 'office') return;
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => {
    officeRenderKey.value += 1;
  }, 160);
};

const scrollOfficePreview = (position: 'top' | 'bottom') => {
  const el = officeScrollRef.value;
  if (!el) return;
  el.scrollTo({ top: position === 'top' ? 0 : el.scrollHeight, behavior: 'smooth' });
};

const toggleOfficePresentationMode = async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
  } else {
    await document.exitFullscreen();
  }
};

const handleFullscreenChange = () => {
  officePresentationMode.value = Boolean(document.fullscreenElement);
  handleResize();
};

const handleTextDirtyChange = (dirty: boolean) => {
  textDirty.value = dirty;
  previewWindow.setTextDirty(dirty);
};

const saveText = (content: string) => {
  if (!payload.value || payload.value.canSaveText === false) return;
  previewWindow.saveText({ previewId: payload.value.id, content });
  textEditorRef.value?.markSaved?.();
  handleTextDirtyChange(false);
};

const saveChangesAndClose = () => {
  const content = textEditorRef.value?.getCurrentContent?.();
  if (typeof content !== 'string') return;
  saveText(content);
  closeConfirmOpen.value = false;
  previewWindow.confirmClose();
};

const discardChangesAndClose = () => {
  closeConfirmOpen.value = false;
  handleTextDirtyChange(false);
  previewWindow.confirmClose();
};

const handleCloseRequested = () => {
  if (!textDirty.value) {
    previewWindow.confirmClose();
    return;
  }
  closeConfirmOpen.value = true;
};

const requestDownload = () => {
  if (!payload.value) return;
  previewWindow.requestDownload({ previewId: payload.value.id });
};

watch(() => payload.value?.theme, (value) => {
  if (value) document.documentElement.setAttribute('data-theme', value);
});

onMounted(() => {
  removeDataListener = previewWindow.onData(applyPayload);
  removeCloseRequestedListener = previewWindow.onCloseRequested(handleCloseRequested);
  previewWindow.ready();
  window.addEventListener('resize', handleResize);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
});

onBeforeUnmount(() => {
  removeDataListener?.();
  removeCloseRequestedListener?.();
  if (resizeTimer) clearTimeout(resizeTimer);
  window.removeEventListener('resize', handleResize);
  document.removeEventListener('fullscreenchange', handleFullscreenChange);
});
</script>

<style lang="less">
:root,
body,
#preview-app {
  width: 100%;
  height: 100%;
  margin: 0;
  overflow: hidden;
}

* {
  box-sizing: border-box;
}

:root {
  color-scheme: light;
}

:root[data-theme='dark'] {
  color-scheme: dark;
}

.preview-root {
  --preview-bg: var(--ant-color-bg-layout, #f1f5f9);
  --preview-panel: var(--ant-color-bg-container, #ffffff);
  --preview-elevated: var(--ant-color-bg-elevated, #ffffff);
  --preview-text: var(--ant-color-text, #1f2937);
  --preview-muted: var(--ant-color-text-secondary, #64748b);
  --preview-border: var(--ant-color-border-secondary, #e2e8f0);
  --preview-primary: var(--ant-color-primary, #1890ff);
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-rows: 32px minmax(0, 1fr);
  background: var(--preview-bg);
  color: var(--preview-text);
}

.preview-titlebar {
  position: relative;
  z-index: 1000;
  width: 100%;
  height: 32px;
  min-width: 0;
  border-bottom: 1px solid var(--preview-border);
  background: var(--preview-panel);
  color: var(--preview-muted);
  -webkit-app-region: drag;
  user-select: none;
}

.preview-titlebar-content {
  height: 100%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 148px 0 16px;
}

.preview-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  font-weight: 600;
  color: var(--preview-muted);
}

.preview-file-size {
  flex: 0 0 auto;
  font-size: 11px;
  font-weight: 400;
  color: var(--preview-tertiary, var(--preview-muted));
}

.preview-content {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

:root:fullscreen .preview-root {
  grid-template-rows: minmax(0, 1fr);
}

:root:fullscreen .preview-titlebar {
  display: none;
}

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

.close-confirm-message {
  margin: 0;
  line-height: 1.7;
  color: var(--preview-muted);
}

.preview-state {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: var(--preview-muted);
}

.fill-preview,
.media-preview,
.pdf-preview,
.model-preview {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.media-preview,
.preview-image,
.model-preview {
  background: var(--preview-media-bg, #000);
}

.audio-preview {
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  padding: 48px;
  background:
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--preview-primary) 18%, transparent), transparent 34%),
    var(--preview-bg);
}

.audio-artwork {
  width: 124px;
  height: 124px;
  border-radius: 30px;
  display: grid;
  place-items: center;
  font-size: 54px;
  color: #fff;
  background: linear-gradient(145deg, var(--preview-primary), color-mix(in srgb, var(--preview-primary) 55%, #7c3aed));
  box-shadow: 0 20px 48px color-mix(in srgb, var(--preview-primary) 28%, transparent);
}

.audio-title {
  max-width: min(720px, 86vw);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  font-weight: 600;
}

.audio-player {
  width: min(720px, 86vw);
}

.office-preview {
  position: relative;
  background: var(--preview-bg);
}

.office-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.office-toolbar {
  position: absolute;
  z-index: 20;
  top: 12px;
  right: 18px;
  display: flex;
  gap: 4px;
  padding: 5px;
  border: 1px solid var(--preview-border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--preview-elevated) 88%, transparent);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.24);
  backdrop-filter: blur(12px);
}

.toolbar-button {
  width: 32px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  display: grid;
  place-items: center;
  cursor: pointer;
  color: var(--preview-muted);
  background: transparent;
}

.toolbar-button:hover,
.toolbar-button.active {
  color: var(--preview-text);
  background: var(--ant-color-fill-secondary, rgba(127, 127, 127, 0.14));
}

.toolbar-button-primary {
  color: var(--preview-primary);
}

.office-preview.presenting .office-toolbar {
  opacity: 0;
  transition: opacity 0.2s;
}

.office-preview.presenting:hover .office-toolbar {
  opacity: 1;
}

.text-preview {
  width: 100%;
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: minmax(0, 1fr) 36px;
  background: var(--preview-panel);
}

.text-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 12px;
  color: var(--preview-muted);
  background: var(--preview-elevated);
  border-top: 1px solid var(--preview-border);
  font-size: 12px;
}

.text-hint {
  display: inline-flex;
  align-items: center;
  gap: 7px;
}

.text-hint.dirty {
  color: #fbbf24;
}

.dirty-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #f59e0b;
}

.download-button {
  margin-left: auto;
  border: 1px solid var(--preview-border);
  border-radius: 6px;
  padding: 3px 10px;
  color: var(--preview-primary);
  background: color-mix(in srgb, var(--preview-primary) 14%, transparent);
  cursor: pointer;
}
</style>
