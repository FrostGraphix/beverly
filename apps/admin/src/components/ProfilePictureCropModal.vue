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
    emit('done', new File([blob], `staff-avatar-${Date.now()}.jpg`, { type: 'image/jpeg' }));
}
</script>

<template>
  <div v-if="open" class="m-wrap">
    <div class="m-card bw-card">
      <h3 class="bw-h3">Crop profile picture</h3>
      <p class="bw-muted">Center your face or team avatar. We export a clean square image.</p>
      <div class="crop-box">
        <img v-if="imageUrl" ref="imgRef" :src="imageUrl" alt="Crop source" />
      </div>
      <input v-model.number="zoom" class="bw-input" type="range" min="1" max="2.5" step="0.1" />
      <div class="bw-row crop-actions">
        <button class="bw-btn" @click="emit('close')">Cancel</button>
        <button class="bw-btn primary" @click="exportCropped">Use photo</button>
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
  padding: 20px;
  background: rgba(0, 0, 0, 0.56);
  backdrop-filter: blur(6px);
}

.m-card {
  width: min(92vw, 480px);
}

.crop-box {
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid var(--border);
  margin: 16px 0 12px;
  background: color-mix(in srgb, var(--panel) 84%, black 16%);
}

.crop-box img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.crop-actions {
  justify-content: flex-end;
  gap: 10px;
  margin-top: 14px;
}
</style>
