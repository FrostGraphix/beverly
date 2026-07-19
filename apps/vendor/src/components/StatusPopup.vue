<script setup lang="ts">
/**
 * StatusPopup — transient success/failure/info popup, distinct from
 * ConfirmDialog (which asks for a decision). Auto-dismisses after a
 * few seconds; always closable by hand.
 */
import { ref, watch, onBeforeUnmount } from 'vue';

const props = withDefaults(defineProps<{
    open: boolean;
    tone: 'success' | 'danger' | 'info';
    title: string;
    message?: string;
    autoCloseMs?: number;
}>(), {
    message: '',
    autoCloseMs: 5000,
});

const emit = defineEmits<{
    (e: 'update:open', v: boolean): void;
}>();

let timer: ReturnType<typeof setTimeout> | null = null;
const progressKey = ref(0);

function close() {
    if (timer) { clearTimeout(timer); timer = null; }
    emit('update:open', false);
}

watch(() => props.open, (isOpen) => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (isOpen && props.autoCloseMs > 0) {
        progressKey.value += 1;
        timer = setTimeout(close, props.autoCloseMs);
    }
}, { immediate: true });

onBeforeUnmount(() => { if (timer) clearTimeout(timer); });
</script>

<template>
  <Teleport to="body">
    <Transition name="sp">
      <div v-if="open" class="sp-scrim" @click.self="close" role="presentation">
        <div class="sp-card" :class="`tone-${tone}`" role="status" aria-live="polite">
          <div class="sp-icon" aria-hidden="true">
            <svg v-if="tone === 'success'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="8 12.5 10.7 15.2 16 9.5"/>
            </svg>
            <svg v-else-if="tone === 'danger'" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="14.5" y1="9.5" x2="9.5" y2="14.5"/>
              <line x1="9.5" y1="9.5" x2="14.5" y2="14.5"/>
            </svg>
            <svg v-else width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="10.5" x2="12" y2="16"/>
              <circle cx="12" cy="7.5" r="0.5"/>
            </svg>
          </div>
          <div class="sp-body">
            <strong class="sp-title">{{ title }}</strong>
            <p v-if="message" class="sp-message">{{ message }}</p>
          </div>
          <button type="button" class="sp-close" aria-label="Dismiss" @click="close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <span v-if="autoCloseMs > 0" :key="progressKey" class="sp-progress" :style="{ animationDuration: `${autoCloseMs}ms` }" />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.sp-scrim {
  position: fixed;
  inset: 0;
  z-index: 9500;
  display: grid;
  place-items: start center;
  padding-top: min(14vh, 120px);
  pointer-events: none;
}

.sp-card {
  pointer-events: auto;
  position: relative;
  overflow: hidden;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(420px, calc(100vw - 32px));
  padding: 14px 16px;
  border-radius: var(--r-xl);
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  backdrop-filter: blur(28px) saturate(200%);
  -webkit-backdrop-filter: blur(28px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
}

.sp-icon {
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: grid;
  place-items: center;
}
.sp-card.tone-success .sp-icon { background: oklch(from var(--brand) l c h / 0.16); color: var(--brand); }
.sp-card.tone-danger .sp-icon  { background: oklch(from var(--danger) l c h / 0.16); color: var(--danger); }
.sp-card.tone-info .sp-icon    { background: oklch(from var(--warn) l c h / 0.16); color: var(--warn); }

.sp-body { flex: 1 1 auto; min-width: 0; }
.sp-title { display: block; font-size: var(--t-sm); font-weight: 700; color: var(--text); line-height: 1.3; }
.sp-message { margin: 4px 0 0; font-size: var(--t-xs); color: var(--text-dim); line-height: 1.5; }

.sp-close {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  cursor: pointer;
}
.sp-close:hover { background: var(--surface-2); color: var(--text); }

.sp-progress {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100%;
  transform-origin: left;
  animation: sp-shrink linear forwards;
}
.sp-card.tone-success .sp-progress { background: var(--brand); }
.sp-card.tone-danger .sp-progress  { background: var(--danger); }
.sp-card.tone-info .sp-progress    { background: var(--warn); }
@keyframes sp-shrink { from { transform: scaleX(1); } to { transform: scaleX(0); } }

.sp-enter-active { transition: opacity 0.2s var(--ease-out), transform 0.24s var(--ease-spring); }
.sp-leave-active { transition: opacity 0.16s var(--ease-out), transform 0.16s var(--ease-out); }
.sp-enter-from { opacity: 0; transform: translateY(-10px) scale(0.97); }
.sp-leave-to { opacity: 0; transform: translateY(-6px) scale(0.98); }

@media (max-width: 480px) {
  .sp-scrim { padding-top: 12px; }
  .sp-card { width: calc(100vw - 20px); }
}
</style>
