<template>
  <div class="video-wrapper">
    <video ref="videoPlayer" class="video-js vjs-big-play-centered"></video>
    <div v-if="showMpvPrompt" class="mpv-hint-overlay">
      <div class="mpv-hint-card">
        <div class="mpv-hint-title">播放遇到格式限制</div>
        <div class="mpv-hint-desc">当前视频可能包含 ProRes、多轨未压缩 PCM 或时间码等专业格式，浏览器内核无法直接解码。</div>
        <div class="mpv-hint-actions">
          <button class="mpv-play-btn" @click="handlePlayWithMpv">
            使用 MPV 专业播放器打开
          </button>
        </div>
      </div>
    </div>
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
    title: {
      type: String,
      default: '',
    },
    fileExtension: {
      type: String,
      default: '',
    },
  },
  data() {
    return {
      player: null,
      showMpvPrompt: false,
    };
  },
  mounted() {
    const isProfessionalFormat = ['mov', 'mxf', 'mkv', 'avi'].includes((this.fileExtension || '').toLowerCase());
    const options = {
      autoplay: !isProfessionalFormat,
      controls: true,
      fill: true,
      preload: 'auto',
      controlBar: { fullscreenToggle: true },
      sources: this.src ? [{ src: this.src }] : [],
    };
    this.player = videojs(this.$refs.videoPlayer, options);
    this.player.on('error', () => {
      this.showMpvPrompt = true;
    });

    if (isProfessionalFormat) {
      // 预先检测，如果支持则自动提供切换建议
      window.native?.checkMpvAvailable?.().then((res) => {
        if (res?.available && isProfessionalFormat) {
          this.showMpvPrompt = true;
        }
      });
    }
  },
  watch: {
    src(nextSrc) {
      if (!this.player || !nextSrc) return;
      this.showMpvPrompt = false;
      this.player.src({ src: nextSrc });
      this.player.play()?.catch(() => {
        this.showMpvPrompt = true;
      });
    },
  },
  methods: {
    async handlePlayWithMpv() {
      if (!this.src) return;
      try {
        const res = await window.native?.playWithMpv?.({
          url: this.src,
          title: this.title || 'BucketView 视频预览',
        });
        if (!res?.success && res?.message) {
          alert(res.message);
        }
      } catch (e) {
        alert(e instanceof Error ? e.message : String(e));
      }
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
  position: relative;
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

.mpv-hint-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
}

.mpv-hint-card {
  max-width: 380px;
  background: #18181b;
  border: 1px solid #3f3f46;
  border-radius: 8px;
  padding: 20px;
  text-align: center;
  color: #f4f4f5;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
}

.mpv-hint-title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 8px;
  color: #e4e4e7;
}

.mpv-hint-desc {
  font-size: 13px;
  line-height: 1.5;
  color: #a1a1aa;
  margin-bottom: 16px;
}

.mpv-play-btn {
  background: #2563eb;
  color: #fff;
  border: none;
  border-radius: 6px;
  padding: 8px 16px;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s;
}

.mpv-play-btn:hover {
  background: #1d4ed8;
}
</style>
