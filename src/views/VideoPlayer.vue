<template>
  <div class="video-wrapper">
    <video ref="videoPlayer" class="video-js vjs-big-play-centered"></video>
  </div>
</template>

<script>
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export default {
  name: 'VideoPlayer',
  props: {
    src: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      player: null,
    };
  },
  mounted() {
    const options = {
      autoplay: true,
      controls: true,
      fill: true,
      preload: 'auto',
      controlBar: { fullscreenToggle: true },
      sources: this.src ? [{ src: this.src }] : [],
    };
    this.player = videojs(this.$refs.videoPlayer, options);
  },
  watch: {
    src(nextSrc) {
      if (!this.player || !nextSrc) return;
      this.player.src({ src: nextSrc });
      this.player.play()?.catch(() => undefined);
    },
  },
  beforeUnmount() {
    if (this.player) {
      this.player.dispose();
      this.player = null;
    }
  },
};
</script>

<style scoped>
.video-wrapper {
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  display: flex;
  background: #000;
}

.video-wrapper :deep(.video-js) {
  width: 100% !important;
  height: 100% !important;
  max-width: 100%;
  max-height: 100%;
  background: #000;
}

.video-wrapper :deep(.video-js .vjs-tech) {
  object-fit: contain;
}

.video-wrapper :deep(.video-js .vjs-control-bar) {
  display: flex !important;
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}

.video-wrapper :deep(.video-js.vjs-user-inactive.vjs-playing .vjs-control-bar) {
  visibility: visible !important;
  opacity: 1 !important;
  pointer-events: auto !important;
}
</style>
