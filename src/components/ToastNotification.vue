<template>
  <div class="toast-portal" aria-live="polite" aria-atomic="false">
    <transition-group name="toast-list" tag="div" class="toast-stack">
      <div
        v-for="item in toasts"
        :key="item.id"
        :class="['toast-item', `toast-${item.type}`]"
        role="alert"
        @click="dismiss(item.id)"
      >
        <!-- Icon -->
        <div class="toast-icon">
          <svg v-if="item.type === 'success'" viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          <svg v-else-if="item.type === 'error'" viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          <svg v-else-if="item.type === 'warning'" viewBox="0 0 24 24"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
          <svg v-else viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
        </div>

        <!-- Content -->
        <div class="toast-body">
          <span class="toast-label">{{ typeLabel(item.type) }}</span>
          <p class="toast-msg">{{ item.message }}</p>
        </div>

        <!-- Close -->
        <BaseIconButton class="toast-close" @click.stop="dismiss(item.id)" aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </BaseIconButton>

        <!-- Progress bar -->
        <div class="toast-progress" :style="{ animationDuration: item.duration + 'ms' }"></div>
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
    return { toasts: [] };
  },
  created() {
    toastBus.$on("toast:add", this.add);
  },
  beforeDestroy() {
    toastBus.$off("toast:add", this.add);
  },
  methods: {
    add(item) {
      this.toasts.push(item);
      setTimeout(() => this.dismiss(item.id), item.duration);
    },
    dismiss(id) {
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
  top: 20px;
  right: 20px;
  z-index: 9999;
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
  pointer-events: all;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  width: 340px;
  padding: 14px 14px 18px;
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(24px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  box-shadow:
    0 20px 50px -10px rgba(8, 24, 48, 0.2),
    0 0 0 1px rgba(0, 0, 0, 0.04);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.toast-item:hover {
  transform: translateX(-4px);
  box-shadow: 0 24px 60px -12px rgba(8, 24, 48, 0.28);
}

/* Type accents */
.toast-success { border-left: 4px solid #10b981; }
.toast-error   { border-left: 4px solid #ef4444; }
.toast-warning { border-left: 4px solid #f59e0b; }
.toast-info    { border-left: 4px solid var(--info); }

/* ── Icon ───────────────────────────────────── */
.toast-icon {
  flex: 0 0 auto;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  display: grid;
  place-items: center;
}

.toast-success .toast-icon { background: #d1fae5; color: #059669; }
.toast-error   .toast-icon { background: #fee2e2; color: #dc2626; }
.toast-warning .toast-icon { background: #fef3c7; color: #d97706; }
.toast-info    .toast-icon { background: var(--info-bg); color: var(--info); }

.toast-icon svg { width: 18px; height: 18px; fill: currentColor; }

/* ── Body ───────────────────────────────────── */
.toast-body { flex: 1; min-width: 0; }

.toast-label {
  display: block;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-bottom: 2px;
}

.toast-success .toast-label { color: #059669; }
.toast-error   .toast-label { color: #dc2626; }
.toast-warning .toast-label { color: #d97706; }
.toast-info    .toast-label { color: var(--info); }

.toast-msg {
  margin: 0;
  font-size: 13px;
  font-weight: 600;
  color: #1e293b;
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
  color: #94a3b8;
  cursor: pointer;
  display: grid;
  place-items: center;
  border-radius: 6px;
  transition: all 0.15s ease;
  padding: 0;
}
.toast-close:hover { background: rgba(0,0,0,0.05); color: #475569; }
.toast-close svg { width: 14px; height: 14px; fill: currentColor; }

/* ── Progress bar ───────────────────────────── */
.toast-progress {
  position: absolute;
  bottom: 0;
  left: 0;
  height: 3px;
  width: 100%;
  border-radius: 0 0 18px 18px;
  animation: toast-shrink linear forwards;
  transform-origin: left center;
}

.toast-success .toast-progress { background: #10b981; }
.toast-error   .toast-progress { background: #ef4444; }
.toast-warning .toast-progress { background: #f59e0b; }
.toast-info    .toast-progress { background: var(--info); }

@keyframes toast-shrink {
  from { transform: scaleX(1); }
  to   { transform: scaleX(0); }
}

/* ── List transitions ───────────────────────── */
.toast-list-enter-active {
  animation: toast-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
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
</style>
