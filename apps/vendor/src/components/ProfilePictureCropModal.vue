<script setup lang="ts">
import { computed, ref } from 'vue';

const props = defineProps<{ open: boolean; file: File | null }>();
const emit = defineEmits<{ (e: 'close'): void; (e: 'done', file: File): void }>();

const zoom = ref(1);
const imgRef = ref<HTMLImageElement | null>(null);
const imageUrl = computed(() => (props.file ? URL.createObjectURL(props.file) : ''));

async function exportCropped() {
    if (!props.file || !imgRef.value) return;
    const img = imgRef.value;
    const size = 512;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const side = Math.min(img.naturalWidth, img.naturalHeight) / zoom.value;
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
    if (!blob) return;
    emit('done', new File([blob], `avatar-${Date.now()}.jpg`, { type: 'image/jpeg' }));
}
</script>

<template>
  <div v-if="open" class="m-wrap" role="presentation" @click.self="emit('close')">
    <div class="m-card bw-card" role="dialog" aria-modal="true" aria-label="Crop profile picture">
      <div class="m-head">
        <div class="m-head-copy">
          <h3 class="m-title">Crop profile picture</h3>
          <p class="m-subtitle">Center your face or team avatar. We export a clean square image.</p>
        </div>
        <button type="button" class="m-close" aria-label="Close crop dialog" @click="emit('close')">
          <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>
      <div class="crop-box">
        <img v-if="imageUrl" ref="imgRef" :src="imageUrl" alt="Crop source" />
      </div>
      <label class="m-zoom-label">
        <span class="m-zoom-text">Zoom</span>
        <input v-model.number="zoom" class="m-zoom-input" type="range" min="1" max="2.5" step="0.1" aria-label="Zoom level" />
      </label>
      <div class="m-actions">
        <button type="button" class="bw-btn" @click="emit('close')">Cancel</button>
        <button type="button" class="bw-btn primary" @click="exportCropped">Use photo</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-wrap {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: grid;
  place-items: center;
  padding: 16px;
  background: oklch(0% 0 0 / 0.58);
  backdrop-filter: blur(6px);
}

.m-card {
  width: min(92vw, 420px);
  max-height: min(90vh, 520px);
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.m-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 2px;
}

.m-head-copy {
  min-width: 0;
}

.m-title {
  margin: 0 0 4px;
  font-size: var(--t-md);
  font-weight: 700;
  color: var(--text);
}

.m-subtitle {
  margin: 0;
  font-size: var(--t-sm);
  color: var(--text-muted);
  line-height: 1.4;
}

.m-close {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: var(--r-md, 8px);
  background: var(--surface-2);
  color: var(--text-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: background var(--dur-fast), color var(--dur-fast);
}

.m-close:hover {
  background: var(--surface-3);
  color: var(--text);
}

.crop-box {
  width: 240px;
  height: 240px;
  flex: 0 0 auto;
  margin: 14px auto;
  overflow: hidden;
  border-radius: 16px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 80%, black 20%);
}

.crop-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.m-zoom-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
}

.m-zoom-text {
  font-size: var(--t-xs);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  flex: 0 0 auto;
}

.m-zoom-input {
  flex: 1;
  accent-color: var(--brand);
  cursor: pointer;
}

.m-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
