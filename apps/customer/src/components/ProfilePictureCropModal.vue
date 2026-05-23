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
    canvas.width = size; canvas.height = size;
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
  <div v-if="open" class="m-wrap">
    <div class="m-card bw-card">
      <h3 class="bw-h3">Crop profile picture</h3>
      <div class="crop-box">
        <img v-if="imageUrl" ref="imgRef" :src="imageUrl" alt="Crop source" />
      </div>
      <input type="range" min="1" max="2.5" step="0.1" v-model.number="zoom" class="bw-input" />
      <div class="bw-row" style="justify-content:flex-end; gap:8px">
        <button class="bw-btn" @click="emit('close')">Cancel</button>
        <button class="bw-btn primary" @click="exportCropped">Use photo</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.m-wrap { position: fixed; inset: 0; background: rgba(0,0,0,.5); display:grid; place-items:center; z-index:100; }
.m-card { width:min(92vw, 460px); }
.crop-box { aspect-ratio:1; overflow:hidden; border-radius:12px; border:1px solid var(--bw-border); margin-bottom:12px; }
.crop-box img { width:100%; height:100%; object-fit:cover; }
</style>
