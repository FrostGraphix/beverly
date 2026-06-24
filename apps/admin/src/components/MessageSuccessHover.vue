<script setup lang="ts">
defineProps<{
  open: boolean;
  title?: string;
  message: string;
}>();

defineEmits<{
  close: [];
}>();
</script>

<template>
  <Teleport to="body">
    <transition name="msh" appear>
      <aside v-if="open" class="msh" role="status" aria-live="polite" data-testid="message-success-hover">
        <div class="msh-icon" aria-hidden="true">
          <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M4 10.5l4 4L16 6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        </div>
        <div class="msh-copy">
          <strong>{{ title || 'Message sent' }}</strong>
          <span>{{ message }}</span>
        </div>
        <button type="button" class="msh-close" aria-label="Dismiss" @click="$emit('close')">×</button>
        <span class="msh-bar" aria-hidden="true" />
      </aside>
    </transition>
  </Teleport>
</template>

<style scoped>
.msh {
  position: fixed;
  top: calc(var(--s-5, 24px) + 56px);
  right: var(--s-5, 24px);
  z-index: 2147483000;
  width: min(360px, calc(100vw - 32px));
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 32px;
  gap: var(--s-3, 12px);
  align-items: center;
  padding: var(--s-3, 12px);
  border: 1px solid color-mix(in oklab, var(--brand), transparent 55%);
  border-radius: var(--r-lg, 16px);
  background:
    linear-gradient(135deg, color-mix(in oklab, var(--brand), transparent 78%), transparent),
    var(--surface);
  box-shadow: 0 18px 42px color-mix(in oklab, black, transparent 72%);
  overflow: hidden;
  pointer-events: auto;
}

.msh-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-md, 12px);
  color: var(--brand);
  background: color-mix(in oklab, var(--brand), transparent 84%);
}

.msh-icon svg {
  width: 22px;
  height: 22px;
}

.msh-copy {
  min-width: 0;
  display: grid;
  gap: 2px;
}

.msh-copy strong {
  color: var(--text);
  font-size: var(--t-sm);
}

.msh-copy span {
  color: var(--text-muted);
  font-size: var(--t-xs);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msh-close {
  width: 32px;
  height: 32px;
  border: 0;
  border-radius: var(--r-sm, 8px);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: var(--t-xl);
  line-height: 1;
}

.msh-bar {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3px;
  width: 100%;
  background: var(--brand);
  animation: msh-life 8s linear forwards;
}

.msh-close:hover {
  background: color-mix(in oklab, var(--surface-2), transparent 20%);
  color: var(--text);
}

@keyframes msh-life {
  from { transform: scaleX(1); transform-origin: left center; }
  to { transform: scaleX(0); transform-origin: left center; }
}

.msh-enter-active,
.msh-leave-active {
  transition: opacity .18s ease, transform .18s ease;
}

.msh-enter-from,
.msh-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(.98);
}

@media (max-width: 760px) {
  .msh {
    top: calc(var(--s-4, 16px) + 64px);
    right: var(--s-3, 12px);
    bottom: auto;
    width: calc(100vw - 24px);
  }
}
</style>
