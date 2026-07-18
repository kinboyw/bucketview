<template>
  <div ref="containerRef" class="model-viewer">
    <vue3dLoader
      :lights="lights"
      :backgroundColor="0x1a1a1a"
      :width="viewportWidth"
      :height="viewportHeight"
      :filePath="[src || '']"
      :mtlPath="[mtl || '']"
    />
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import vue3dLoader from './components/3dLoader/vue3dLoader.vue';

defineProps<{
  src?: string;
  mtl?: string;
}>();

const containerRef = ref<HTMLElement | null>(null);
const viewportWidth = ref(750);
const viewportHeight = ref(420);
let resizeObserver: ResizeObserver | null = null;

const lights = [
  { type: 'AmbientLight', color: 'white' },
  {
    type: 'DirectionalLight',
    position: { x: 100, y: 10, z: 100 },
    color: 'white',
    intensity: 0.8,
  },
  {
    type: 'PointLight',
    color: '#000000',
    position: { x: 200, y: -200, z: 100 },
    intensity: 1,
  },
  {
    type: 'HemisphereLight',
    skyColor: '#ffffff',
    groundColor: '#000000',
    position: { x: 200, y: -200, z: 100 },
  },
];

const syncSize = () => {
  const el = containerRef.value;
  if (!el) return;
  viewportWidth.value = Math.max(1, Math.round(el.clientWidth));
  viewportHeight.value = Math.max(1, Math.round(el.clientHeight));
};

onMounted(() => {
  syncSize();
  resizeObserver = new ResizeObserver(syncSize);
  if (containerRef.value) resizeObserver.observe(containerRef.value);
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  resizeObserver = null;
});
</script>

<style scoped>
.model-viewer {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: #1a1a1a;
}
</style>
