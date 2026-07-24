<template>
  <div v-if="open" class="crop-modal-backdrop" @click.self="$emit('close')">
    <div class="crop-modal-card">
      <div class="crop-modal-header">
        <h3 class="crop-modal-title">Crop Profile Picture</h3>
        <BaseIconButton aria-label="Close crop modal" class="crop-modal-close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M18 6 6 18M6 6l12 12"/>
          </svg>
        </BaseIconButton>
      </div>

      <p class="crop-modal-subtitle">Center your face or avatar. We export a high quality 1:1 square image.</p>

      <div class="crop-box">
        <img v-if="imageUrl" ref="imgRef" :src="imageUrl" alt="Crop preview" />
      </div>

      <div class="crop-zoom-control">
        <label for="crop-zoom-range">Zoom</label>
        <input id="crop-zoom-range" v-model.number="zoom" type="range" min="1" max="2.5" step="0.05" class="crop-zoom-slider" />
      </div>

      <div class="crop-modal-actions">
        <BaseButton variant="ghost" @click="$emit('close')">Cancel</BaseButton>
        <BaseButton variant="primary" :loading="exporting" @click="exportCropped">
          Use photo
        </BaseButton>
      </div>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";

export default {
  name: "ProfilePictureCropModal",
  components: { BaseButton, BaseIconButton },
  props: {
    open: { type: Boolean, default: false },
    file: { type: Object, default: null }
  },
  emits: ["close", "done"],
  data() {
    return {
      zoom: 1,
      exporting: false,
      imageUrl: ""
    };
  },
  watch: {
    file: {
      immediate: true,
      handler(newFile) {
        if (this.imageUrl) {
          URL.revokeObjectURL(this.imageUrl);
          this.imageUrl = "";
        }
        if (newFile) {
          this.imageUrl = URL.createObjectURL(newFile);
        }
        this.zoom = 1;
      }
    }
  },
  beforeUnmount() {
    if (this.imageUrl) {
      URL.revokeObjectURL(this.imageUrl);
    }
  },
  methods: {
    async exportCropped() {
      if (!this.file || !this.$refs.imgRef) return;
      this.exporting = true;
      try {
        const img = this.$refs.imgRef;
        const size = 512;
        const canvas = document.createElement("canvas");
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const side = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height) / this.zoom;
        const sx = (img.naturalWidth - side) / 2;
        const sy = (img.naturalHeight - side) / 2;

        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.92));
        if (!blob) return;

        const croppedFile = new File([blob], `staff-avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
        this.$emit("done", croppedFile);
      } finally {
        this.exporting = false;
      }
    }
  }
};
</script>

<style scoped>
.crop-modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  display: grid;
  place-items: center;
  padding: 20px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(6px);
}

.crop-modal-card {
  width: min(92vw, 440px);
  padding: 24px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3);
  color: var(--text-primary);
}

.crop-modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.crop-modal-title {
  margin: 0;
  font-size: 1.125rem;
  font-weight: 600;
}

.crop-modal-close {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-md);
}

.crop-modal-close svg {
  width: 16px;
  height: 16px;
}

.crop-modal-subtitle {
  margin: 8px 0 16px;
  font-size: 0.875rem;
  color: var(--text-secondary, #94a3b8);
}

.crop-box {
  aspect-ratio: 1;
  width: 100%;
  max-width: 320px;
  margin: 0 auto 16px;
  overflow: hidden;
  border: 1px solid var(--border-color);
  border-radius: 50%;
  background: color-mix(in srgb, var(--bg-card) 80%, black 20%);
}

.crop-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.crop-zoom-control {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 20px;
  font-size: 0.875rem;
  color: var(--text-secondary, #94a3b8);
}

.crop-zoom-slider {
  flex: 1;
  accent-color: var(--primary);
}

.crop-modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
}
</style>
