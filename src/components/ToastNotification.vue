<template>
  <div class="toast-portal" aria-live="polite" aria-atomic="false" aria-relevant="additions">
    <transition-group name="toast-list" tag="div" class="toast-stack">
      <div
        v-for="item in toasts"
        :key="item.id"
        :class="['toast-item', `toast-${item.type}`]"
        :role="item.type === 'error' || item.type === 'warning' ? 'alert' : 'status'"
      >
        <!-- Icon -->
        <div class="toast-icon">
          <svg v-if="item.type === 'success'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></svg>
          <svg v-else-if="item.type === 'error'" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="m9 9 6 6m0-6-6 6"/></svg>
          <svg v-else-if="item.type === 'warning'" viewBox="0 0 24 24"><path d="M10.3 4.2 2.8 17.1A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.9L13.7 4.2a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4m0 3h.01"/></svg>
          <svg v-else viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 11v5m0-8h.01"/></svg>
        </div>

        <!-- Content -->
        <div class="toast-body">
          <span class="toast-label">{{ typeLabel(item.type) }}</span>
          <p class="toast-msg">{{ item.message }}</p>
        </div>

        <!-- Close -->
        <BaseIconButton class="toast-close" @click="dismiss(item.id)" aria-label="Dismiss notification">
          <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>
        </BaseIconButton>

        <!-- Progress bar -->
        <div class="toast-progress" :style="{ animationDuration: item.duration + 'ms' }" aria-hidden="true"></div>
      </div>
    </transition-group>
  </div>
</template>

<script>
import BaseIconButton from "./base/BaseIconButton.vue";
import { toastBus } from "../services/toast.js";

export default {
  name: "ToastNotification",
  components: { BaseIconButton },
  data() {
    return { toasts: [], timers: new Map() };
  },
  created() {
    toastBus.$on("toast:add", this.add);
  },
  beforeUnmount() {
    toastBus.$off("toast:add", this.add);
    for (const timer of this.timers.values()) clearTimeout(timer);
  },
  methods: {
    add(item) {
      while (this.toasts.length >= 3) this.dismiss(this.toasts[0].id);
      this.toasts.push(item);
      this.timers.set(item.id, setTimeout(() => this.dismiss(item.id), item.duration));
    },
    dismiss(id) {
      clearTimeout(this.timers.get(id));
      this.timers.delete(id);
      const idx = this.toasts.findIndex((t) => t.id === id);
      if (idx !== -1) this.toasts.splice(idx, 1);
    },
    typeLabel(type) {
      return { success: "Success", error: "Error", warning: "Warning", info: "Info" }[type] || "Notice";
    }
  }
};
</script>

<style scoped>
.toast-portal {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: var(--z-toast, 9999);
  pointer-events: none;
  font-family: var(--font-family);
}

.toast-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-end;
}

/* ── Toast item ─────────────────────────────── */
.toast-item {
  --toast-accent: var(--info);
  pointer-events: all;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: min(360px, calc(100vw - 32px));
  padding: 14px 12px 17px;
  border: 1px solid color-mix(in srgb, var(--toast-accent) 35%, var(--border-color));
  border-left: 4px solid var(--toast-accent);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg-card) 92%, transparent);
  backdrop-filter: blur(18px);
  box-shadow: var(--shadow-lg);
  position: relative;
  overflow: hidden;
  color: var(--text-main);
}

/* Type accents */
.toast-success { --toast-accent: var(--success); }
.toast-error   { --toast-accent: var(--danger); }
.toast-warning { --toast-accent: var(--warning); }

/* ── Icon ───────────────────────────────────── */
.toast-icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 6px;
  display: grid;
  place-items: center;
  background: color-mix(in srgb, var(--toast-accent) 14%, transparent);
  color: var(--toast-accent);
}

.toast-icon svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }

/* ── Body ───────────────────────────────────── */
.toast-body { flex: 1; min-width: 0; }

.toast-label {
  display: block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0;
  margin-bottom: 2px;
  color: var(--toast-accent);
}

.toast-msg {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  line-height: 1.45;
  word-break: break-word;
}

/* ── Close ──────────────────────────────────── */
.toast-close {
  flex: 0 0 auto;
  width: 22px;
  height: 22px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  display: grid;
  place-items: center;
  border-radius: 6px;
  transition: all 0.15s ease;
  padding: 0;
}
.toast-close:hover { background: color-mix(in srgb, var(--text-main) 8%, transparent); color: var(--text-main); }
.toast-close svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }

/* ── Progress bar ───────────────────────────── */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  border-radius: 0 0 6px 6px;
  animation: toast-shrink linear forwards;
  transform-origin: left center;
  background: var(--toast-accent);
}

@keyframes toast-shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ── List transitions ───────────────────────── */
.toast-list-enter-active {
  animation: toast-in 0.24s ease-out;
}
.toast-list-leave-active {
  animation: toast-out 0.28s ease forwards;
}
.toast-list-move {
  transition: transform 0.3s ease;
}

@keyframes toast-in {
  from { opacity: 0; transform: translateX(60px) scale(0.92); }
  to   { opacity: 1; transform: translateX(0) scale(1); }
}
@keyframes toast-out {
  to { opacity: 0; transform: translateX(60px) scale(0.88); }
}

@media (max-width: 640px) {
  .toast-portal { inset: 12px 12px auto; }
  .toast-stack { align-items: stretch; }
  .toast-item { width: 100%; }
}

@media (prefers-reduced-motion: reduce) {
  .toast-list-enter-active,
  .toast-list-leave-active,
  .toast-progress { animation: none; }
}
</style>
