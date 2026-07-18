<script lang="ts">
import { defineComponent, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import {
  ColumnWidthOutlined,
  LeftOutlined,
  MinusOutlined,
  PlusOutlined,
  RightOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons-vue';
import { VuePdf, createLoadingTask } from 'vue3-pdfjs';
import type { VuePdfPropsType } from 'vue3-pdfjs/components/vue-pdf/vue-pdf-props';

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.5;
const SCALE_STEP = 0.15;

export default defineComponent({
  name: 'pdf',
  props: {
    src: String,
  },
  components: {
    VuePdf,
    ColumnWidthOutlined,
    LeftOutlined,
    MinusOutlined,
    PlusOutlined,
    RightOutlined,
    VerticalAlignBottomOutlined,
    VerticalAlignTopOutlined,
  },
  setup(props) {
    const pdfSrc = ref<VuePdfPropsType['src']>(props.src);
    const numOfPages = ref(0);
    const currentPage = ref(1);
    const pageInput = ref(1);
    const scale = ref(1);
    const fitWidthEnabled = ref(true);
    const scrollRef = ref<HTMLElement | null>(null);
    const pageRefs = ref<HTMLElement[]>([]);
    let firstPageWidth = 0;
    let loadingTask: ReturnType<typeof createLoadingTask> | null = null;

    const clampPage = (page: number) => {
      if (!numOfPages.value) return 1;
      return Math.min(numOfPages.value, Math.max(1, page));
    };

    const clampScale = (value: number) => Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));

    const fitToWidth = () => {
      const scroller = scrollRef.value;
      if (!scroller || !firstPageWidth) return;
      const availableWidth = Math.max(240, scroller.clientWidth - 60);
      scale.value = clampScale(availableWidth / firstPageWidth);
      fitWidthEnabled.value = true;
    };

    const loadPdf = () => {
      pdfSrc.value = props.src;
      numOfPages.value = 0;
      currentPage.value = 1;
      pageInput.value = 1;
      pageRefs.value = [];
      firstPageWidth = 0;
      loadingTask?.destroy?.();
      loadingTask = createLoadingTask(pdfSrc.value);
      loadingTask.promise.then(async (pdf: any) => {
        numOfPages.value = pdf.numPages;
        const firstPage = await pdf.getPage(1);
        firstPageWidth = firstPage.getViewport({ scale: 1 }).width;
        await nextTick();
        fitToWidth();
      }).catch(() => {
        numOfPages.value = 0;
      });
    };

    const setPageRef = (el: any, page: number) => {
      if (el) pageRefs.value[page - 1] = el as HTMLElement;
    };

    const scrollToPage = (page: number, behavior: ScrollBehavior = 'smooth') => {
      const nextPage = clampPage(page);
      const target = pageRefs.value[nextPage - 1];
      if (!target) return;
      const scroller = scrollRef.value;
      if (scroller) {
        scroller.scrollTo({ top: Math.max(0, target.offsetTop - 12), behavior });
      }
      currentPage.value = nextPage;
      pageInput.value = nextPage;
    };

    const handleScroll = () => {
      const scroller = scrollRef.value;
      if (!scroller || pageRefs.value.length === 0) return;
      const top = scroller.getBoundingClientRect().top;
      let closestPage = currentPage.value;
      let closestDistance = Number.POSITIVE_INFINITY;
      pageRefs.value.forEach((el, index) => {
        const distance = Math.abs(el.getBoundingClientRect().top - top - 12);
        if (distance < closestDistance) {
          closestDistance = distance;
          closestPage = index + 1;
        }
      });
      currentPage.value = closestPage;
      pageInput.value = closestPage;
    };

    const handlePageInput = () => {
      scrollToPage(Number(pageInput.value) || 1);
    };

    const setScale = async (nextScale: number) => {
      const page = currentPage.value;
      scale.value = clampScale(nextScale);
      fitWidthEnabled.value = false;
      await nextTick();
      scrollToPage(page, 'auto');
    };

    const scrollToTop = () => scrollToPage(1);

    const scrollToBottom = () => {
      const scroller = scrollRef.value;
      if (!scroller) return;
      scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
      currentPage.value = numOfPages.value || 1;
      pageInput.value = currentPage.value;
    };

    const handleResize = () => {
      if (fitWidthEnabled.value) fitToWidth();
    };

    watch(() => props.src, loadPdf);

    onMounted(() => {
      loadPdf();
      window.addEventListener('resize', handleResize);
    });

    onBeforeUnmount(() => {
      window.removeEventListener('resize', handleResize);
      loadingTask?.destroy?.();
    });

    return {
      pdfSrc,
      numOfPages,
      currentPage,
      pageInput,
      scale,
      fitWidthEnabled,
      scrollRef,
      setPageRef,
      scrollToPage,
      handleScroll,
      handlePageInput,
      setScale,
      fitToWidth,
      scrollToTop,
      scrollToBottom,
    };
  },
});
</script>

<template>
  <div class="pdf-viewer">
    <div ref="scrollRef" class="pdf-scroll" @scroll="handleScroll">
      <div
        v-for="page in numOfPages"
        :key="page"
        :ref="(el) => setPageRef(el, page)"
        class="pdf-page"
      >
        <VuePdf :src="pdfSrc" :page="page" :scale="scale" />
      </div>
    </div>

    <div class="pdf-toolbar" role="toolbar" aria-label="PDF 阅读工具栏">
      <button class="pdf-icon-button" title="第一页" aria-label="第一页" :disabled="currentPage <= 1" @click="scrollToTop">
        <VerticalAlignTopOutlined />
      </button>
      <button class="pdf-icon-button" title="上一页" aria-label="上一页" :disabled="currentPage <= 1" @click="scrollToPage(currentPage - 1)">
        <LeftOutlined />
      </button>
      <div class="pdf-page-control">
        <input
          v-model.number="pageInput"
          class="pdf-page-input"
          type="number"
          min="1"
          :max="numOfPages || 1"
          aria-label="当前页码"
          @keydown.enter.prevent="handlePageInput"
          @blur="handlePageInput"
        />
        <span>/ {{ numOfPages || '-' }}</span>
      </div>
      <button class="pdf-icon-button" title="下一页" aria-label="下一页" :disabled="!numOfPages || currentPage >= numOfPages" @click="scrollToPage(currentPage + 1)">
        <RightOutlined />
      </button>
      <button class="pdf-icon-button" title="最后一页" aria-label="最后一页" :disabled="!numOfPages || currentPage >= numOfPages" @click="scrollToBottom">
        <VerticalAlignBottomOutlined />
      </button>
      <span class="pdf-toolbar-divider"></span>
      <button class="pdf-icon-button" title="缩小" aria-label="缩小" :disabled="scale <= 0.5" @click="setScale(scale - 0.15)">
        <MinusOutlined />
      </button>
      <span class="pdf-zoom-value">{{ Math.round(scale * 100) }}%</span>
      <button class="pdf-icon-button" title="放大" aria-label="放大" :disabled="scale >= 2.5" @click="setScale(scale + 0.15)">
        <PlusOutlined />
      </button>
      <button :class="['pdf-icon-button', { active: fitWidthEnabled }]" title="适合宽度" aria-label="适合宽度" @click="fitToWidth">
        <ColumnWidthOutlined />
      </button>
    </div>
  </div>
</template>

<style scoped>
.pdf-viewer {
  position: relative;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  background: var(--preview-bg-soft, #eef1f5);
  color: var(--preview-text, #111827);
}

.pdf-scroll {
  width: 100%;
  height: 100%;
  overflow: auto;
  padding: 58px 22px 28px;
  box-sizing: border-box;
}

.pdf-page {
  width: fit-content;
  min-width: 1px;
  margin: 0 auto 14px;
  overflow: hidden;
  background: #fff;
  box-shadow: 0 3px 14px rgba(15, 23, 42, 0.16);
}

.pdf-page :deep(canvas) {
  display: block;
  max-width: none;
  height: auto !important;
}

.pdf-toolbar {
  position: absolute;
  top: 12px;
  left: 50%;
  z-index: 8;
  transform: translateX(-50%);
  height: 36px;
  max-width: calc(100% - 24px);
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 4px 6px;
  box-sizing: border-box;
  border: 1px solid var(--preview-border, rgba(127, 127, 127, 0.22));
  border-radius: 8px;
  color: var(--preview-text, #1f2937);
  background: color-mix(in srgb, var(--preview-elevated, #ffffff) 92%, transparent);
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(12px);
  white-space: nowrap;
}

.pdf-icon-button {
  width: 28px;
  height: 28px;
  flex: 0 0 28px;
  border: 0;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  color: var(--preview-muted, #64748b);
  background: transparent;
  cursor: pointer;
  transition: color 0.15s ease, background 0.15s ease;
}

.pdf-icon-button:hover:not(:disabled),
.pdf-icon-button.active {
  color: var(--preview-text, #1f2937);
  background: var(--ant-color-fill-secondary, rgba(127, 127, 127, 0.14));
}

.pdf-icon-button:disabled {
  color: var(--preview-tertiary, rgba(100, 116, 139, 0.45));
  cursor: not-allowed;
}

.pdf-page-control {
  height: 28px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 0 5px;
  color: var(--preview-muted, #64748b);
  font-size: 12px;
}

.pdf-page-input {
  width: 38px;
  height: 24px;
  box-sizing: border-box;
  border: 1px solid var(--preview-border, rgba(127, 127, 127, 0.22));
  border-radius: 4px;
  outline: 0;
  padding: 0 4px;
  color: var(--preview-text, #1f2937);
  background: var(--preview-panel, #ffffff);
  font-size: 12px;
  text-align: center;
}

.pdf-page-input:focus {
  border-color: var(--ant-color-primary, #1677ff);
}

.pdf-page-input::-webkit-inner-spin-button,
.pdf-page-input::-webkit-outer-spin-button {
  margin: 0;
  appearance: none;
}

.pdf-toolbar-divider {
  width: 1px;
  height: 18px;
  margin: 0 4px;
  background: var(--preview-border, rgba(127, 127, 127, 0.22));
}

.pdf-zoom-value {
  min-width: 38px;
  color: var(--preview-muted, #64748b);
  font-size: 11px;
  text-align: center;
}

@media (max-width: 720px) {
  .pdf-scroll {
    padding-right: 12px;
    padding-left: 12px;
  }

  .pdf-toolbar {
    left: 8px;
    right: 8px;
    transform: none;
    overflow-x: auto;
  }
}
</style>
