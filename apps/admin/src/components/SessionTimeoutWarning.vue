<script setup lang="ts">
defineProps<{
    secondsLeft: number;
    visible: boolean;
}>();
const emit = defineEmits<{
    (e: 'stay'): void;
    (e: 'logout'): void;
}>();

function mmss(s: number) {
    const m = Math.floor(s / 60);
    const ss = s % 60;
    return m > 0 ? `${m}m ${ss}s` : `${ss}s`;
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="visible" class="session-scrim" role="dialog" aria-modal="true" aria-labelledby="session-title">
        <div class="session-modal">
          <div class="session-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
          <h2 id="session-title" class="session-title">Are you still there?</h2>
          <p class="session-body">
            You'll be signed out in <strong>{{ mmss(secondsLeft) }}</strong> for your security.
          </p>
          <div class="session-actions">
            <button class="bw-btn" @click="emit('logout')">Sign out now</button>
            <button class="bw-btn primary" @click="emit('stay')">Stay signed in</button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.session-scrim {
  position: fixed;
  inset: 0;
  background: oklch(0% 0 0 / 0.55);
  backdrop-filter: blur(4px);
  z-index: 9999;
  display: grid;
  place-items: center;
  padding: var(--s-5);
}

.session-modal {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-xl);
  padding: var(--s-6);
  width: 100%;
  max-width: 380px;
  text-align: center;
  box-shadow: 0 24px 64px oklch(0% 0 0 / 0.45);
}

.session-icon {
  width: 48px; height: 48px;
  border-radius: 50%;
  background: oklch(from var(--warn) l c h / 0.15);
  color: var(--warn);
  display: grid; place-items: center;
  margin: 0 auto var(--s-3);
}

.session-title {
  margin: 0 0 var(--s-2);
  font-size: var(--t-xl);
  font-weight: 700;
  color: var(--text);
}

.session-body {
  margin: 0 0 var(--s-5);
  font-size: var(--t-sm);
  color: var(--text-dim);
  line-height: 1.5;
}

.session-actions {
  display: flex;
  gap: var(--s-2);
  justify-content: center;
}
.session-actions .bw-btn { flex: 1; justify-content: center; }

.fade-enter-active, .fade-leave-active { transition: opacity 0.18s var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
