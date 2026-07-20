<template>
  <div
    class="image-gallery"
    :class="{ 'is-zoomed': zoom > 1, 'is-panning': isPanning }"
    @wheel.prevent="handleWheel"
    @mousedown="handlePointerDown"
    @mousemove="handlePointerMove"
    @mouseup="handlePointerUp"
    @mouseleave="handlePointerUp"
  >
    <img
      :src="currentImage.url"
      :alt="currentImage.name"
      class="gallery-image"
      :style="{ transform: `translate(${panX}px, ${panY}px) scale(${zoom})` }"
      draggable="false"
    />

    <!-- 仅在未缩放时提供窄边翻页热区；缩放后优先平移，避免抢占拖拽 -->
    <button
      v-if="canGoPrev && zoom <= 1"
      type="button"
      class="gallery-nav gallery-nav-left"
      title="上一张"
      aria-label="上一张"
      @mousedown.stop
      @click.stop="goPrev"
    >
      <LeftOutlined />
    </button>
    <button
      v-if="canGoNext && zoom <= 1"
      type="button"
      class="gallery-nav gallery-nav-right"
      title="下一张"
      aria-label="下一张"
      @mousedown.stop
      @click.stop="goNext"
    >
      <RightOutlined />
    </button>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch, onMounted, onBeforeUnmount } from 'vue';
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue';

export interface GalleryImage {
  name: string;
  url: string;
  size?: number;
}

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 5;
const ZOOM_STEP = 0.15;
// 点击与拖拽阈值：超过该位移视为平移/拖动，不触发翻页意图
const DRAG_THRESHOLD_PX = 6;

export default defineComponent({
  name: 'ImageGallery',
  components: { LeftOutlined, RightOutlined },
  props: {
    images: { type: Array as () => GalleryImage[], required: true },
    startIndex: { type: Number, default: 0 },
  },
  setup(props) {
    const currentIndex = ref(props.startIndex);
    const zoom = ref(1);
    const panX = ref(0);
    const panY = ref(0);
    const isPanning = ref(false);
    const lastX = ref(0);
    const lastY = ref(0);
    const pointerActive = ref(false);
    const pointerStartX = ref(0);
    const pointerStartY = ref(0);
    const didDrag = ref(false);

    const currentImage = computed(() => props.images[currentIndex.value] || { name: '', url: '' });
    const canGoPrev = computed(() => currentIndex.value > 0);
    const canGoNext = computed(() => currentIndex.value < props.images.length - 1);

    const resetView = () => {
      zoom.value = 1;
      panX.value = 0;
      panY.value = 0;
      isPanning.value = false;
      pointerActive.value = false;
      didDrag.value = false;
    };

    watch(() => props.startIndex, (v) => {
      currentIndex.value = Math.max(0, Math.min(v, Math.max(props.images.length - 1, 0)));
    });
    watch(currentIndex, resetView);
    watch(() => props.images.length, () => {
      if (currentIndex.value > props.images.length - 1) {
        currentIndex.value = Math.max(props.images.length - 1, 0);
      }
    });

    const goPrev = () => {
      if (!canGoPrev.value) return;
      currentIndex.value -= 1;
    };

    const goNext = () => {
      if (!canGoNext.value) return;
      currentIndex.value += 1;
    };

    const handleWheel = (e: WheelEvent) => {
      const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP;
      const next = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom.value + delta));
      zoom.value = Number(next.toFixed(3));
      if (zoom.value <= 1) {
        panX.value = 0;
        panY.value = 0;
      }
    };

    const handlePointerDown = (e: MouseEvent) => {
      // 仅左键参与图片交互
      if (e.button !== 0) return;
      // 导航按钮自身已 stop，这里不会到

      pointerActive.value = true;
      didDrag.value = false;
      pointerStartX.value = e.clientX;
      pointerStartY.value = e.clientY;
      lastX.value = e.clientX;
      lastY.value = e.clientY;

      // 缩放态：直接进入可平移模式
      if (zoom.value > 1) {
        isPanning.value = true;
        e.preventDefault();
      }
    };

    const handlePointerMove = (e: MouseEvent) => {
      if (!pointerActive.value) return;

      const dx = e.clientX - pointerStartX.value;
      const dy = e.clientY - pointerStartY.value;
      if (!didDrag.value && (Math.abs(dx) > DRAG_THRESHOLD_PX || Math.abs(dy) > DRAG_THRESHOLD_PX)) {
        didDrag.value = true;
        // 未缩放时也允许轻微拖动判定，避免后续扩展冲突；真正平移仍要求 zoom>1
        if (zoom.value > 1) isPanning.value = true;
      }

      if (isPanning.value && zoom.value > 1) {
        panX.value += e.clientX - lastX.value;
        panY.value += e.clientY - lastY.value;
        lastX.value = e.clientX;
        lastY.value = e.clientY;
        e.preventDefault();
      }
    };

    const handlePointerUp = () => {
      pointerActive.value = false;
      isPanning.value = false;
      // didDrag 留给 click 逻辑判断；下一轮 mousedown 会重置
    };

    const handleKeydown = (e: KeyboardEvent) => {
      // 输入框内不劫持方向键
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goNext();
      } else if (e.key === '0' || e.key === 'Escape') {
        // 快捷复位视图，缩放后快速回到可翻页状态
        if (zoom.value !== 1 || panX.value !== 0 || panY.value !== 0) {
          e.preventDefault();
          resetView();
        }
      }
    };

    onMounted(() => {
      window.addEventListener('keydown', handleKeydown);
    });
    onBeforeUnmount(() => {
      window.removeEventListener('keydown', handleKeydown);
    });

    return {
      currentIndex,
      zoom,
      panX,
      panY,
      isPanning,
      currentImage,
      canGoPrev,
      canGoNext,
      handleWheel,
      handlePointerDown,
      handlePointerMove,
      handlePointerUp,
      goPrev,
      goNext,
    };
  },
});
</script>

<style lang="less" scoped>
.image-gallery {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--preview-media-bg, #1a1a1a);
  overflow: hidden;
  cursor: default;
  position: relative;
  user-select: none;
  touch-action: none;

  &.is-zoomed {
    cursor: grab;
  }

  &.is-panning {
    cursor: grabbing;
  }

  .gallery-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.08s ease-out;
    user-select: none;
    pointer-events: none; // 手势统一由容器接管，避免 img 与热区争抢
  }
}

/* 常规方案：窄边热区 + 缩放时隐藏，优先保证拖拽平移 */
.gallery-nav {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 72px; // 从接近半屏收窄到侧边热区
  max-width: 18%;
  display: flex;
  align-items: center;
  padding: 0 14px;
  border: 0;
  margin: 0;
  background: transparent;
  cursor: pointer;
  font-size: 22px;
  color: transparent;
  z-index: 2;
  transition: color 0.15s, background 0.15s;

  &:hover,
  &:focus-visible {
    color: rgba(255, 255, 255, 0.88);
    background: linear-gradient(
      to right,
      rgba(0, 0, 0, 0.28),
      rgba(0, 0, 0, 0)
    );
    outline: none;
  }
}

.gallery-nav-left {
  left: 0;
  justify-content: flex-start;

  &:hover,
  &:focus-visible {
    background: linear-gradient(
      to right,
      rgba(0, 0, 0, 0.28),
      rgba(0, 0, 0, 0)
    );
  }
}

.gallery-nav-right {
  right: 0;
  justify-content: flex-end;

  &:hover,
  &:focus-visible {
    background: linear-gradient(
      to left,
      rgba(0, 0, 0, 0.28),
      rgba(0, 0, 0, 0)
    );
  }
}
</style>
