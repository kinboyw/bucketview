<template>
  <div class="image-gallery" @wheel="handleWheel">
    <img
      :src="currentImage.url"
      :style="{ transform: `scale(${zoom}) translate(${panX}px, ${panY}px)` }"
      @mousedown="handleMouseDown"
      @mousemove="handleMouseMove"
      @mouseup="handleMouseUp"
      @mouseleave="handleMouseUp"
      class="gallery-image"
      draggable="false"
    />
    <!-- 左侧翻页区域 -->
    <div
      v-if="currentIndex > 0"
      class="gallery-nav gallery-nav-left"
      @click="currentIndex--"
    >
      <LeftOutlined />
    </div>
    <!-- 右侧翻页区域 -->
    <div
      v-if="currentIndex < images.length - 1"
      class="gallery-nav gallery-nav-right"
      @click="currentIndex++"
    >
      <RightOutlined />
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent, computed, ref, watch } from 'vue';
import { LeftOutlined, RightOutlined } from '@ant-design/icons-vue';

export interface GalleryImage {
  name: string;
  url: string;
  size?: number;
}

export default defineComponent({
  name: 'ImageGallery',
  components: { LeftOutlined, RightOutlined },
  props: {
    images: { type: Array as () => GalleryImage[], required: true },
    startIndex: { type: Number, default: 0 },
  },
  emits: [],
  setup(props) {
    const currentIndex = ref(props.startIndex);
    const zoom = ref(1);
    const panX = ref(0);
    const panY = ref(0);
    const isPanning = ref(false);
    const lastX = ref(0);
    const lastY = ref(0);

    const currentImage = computed(() => props.images[currentIndex.value] || { name: '', url: '' });

    watch(() => props.startIndex, (v) => { currentIndex.value = v; });
    watch(currentIndex, () => { zoom.value = 1; panX.value = 0; panY.value = 0; });

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -0.15 : 0.15;
      zoom.value = Math.max(0.25, Math.min(5, zoom.value + delta));
    };

    const handleMouseDown = (e: MouseEvent) => {
      if (zoom.value > 1) {
        isPanning.value = true;
        lastX.value = e.clientX;
        lastY.value = e.clientY;
      }
    };
    const handleMouseMove = (e: MouseEvent) => {
      if (isPanning.value) {
        panX.value += e.clientX - lastX.value;
        panY.value += e.clientY - lastY.value;
        lastX.value = e.clientX;
        lastY.value = e.clientY;
      }
    };
    const handleMouseUp = () => { isPanning.value = false; };

    return { currentIndex, zoom, panX, panY, currentImage, handleWheel, handleMouseDown, handleMouseMove, handleMouseUp };
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

  .gallery-image {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    transition: transform 0.1s ease;
    user-select: none;
  }
}

.gallery-nav {
  position: absolute;
  top: 0;
  bottom: 0;
  width: calc(50% - 60px);
  display: flex;
  align-items: center;
  padding: 0 20px;
  cursor: pointer;
  font-size: 22px;
  color: transparent;
  transition: color 0.15s;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }
}

.gallery-nav-left {
  left: 0;
  justify-content: flex-start;
}

.gallery-nav-right {
  right: 0;
  justify-content: flex-end;
}
</style>
