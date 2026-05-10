<template>
  <transition name="success-modal">
    <div v-if="visible" class="sm-backdrop" role="dialog" aria-modal="true" @click.self="close">
      <BaseModalShell class="sm-card" body-class="sm-body-shell">
        <div class="sm-ring-wrap">
          <svg class="sm-ring-svg" viewBox="0 0 120 120">
            <circle class="sm-ring-track" cx="60" cy="60" r="52"/>
            <circle class="sm-ring-fill" cx="60" cy="60" r="52"/>
          </svg>
          <svg class="sm-check-svg" viewBox="0 0 52 52">
            <polyline class="sm-check-mark" points="8,27 22,41 44,16"/>
          </svg>
        </div>

        <h3 class="sm-title">{{ title }}</h3>
        <p class="sm-body">{{ message }}</p>

        <div v-if="detail" class="sm-detail-box">
          <span>{{ detail }}</span>
        </div>

        <template #footer>
          <BaseButton class="sm-btn" variant="primary" size="lg" @click="close">
            Done
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </BaseButton>
        </template>
      </BaseModalShell>
    </div>
  </transition>
</template>

<script>
import { toastBus } from "../services/toast.js";
import BaseButton from "./base/BaseButton.vue";
import BaseModalShell from "./base/BaseModalShell.vue";

export default {
  name: "SuccessModal",
  components: { BaseButton, BaseModalShell },
  data() {
    return {
      visible: false,
      title: "Done!",
      message: "",
      detail: ""
    };
  },
  created() {
    toastBus.$on("success:modal", this.show);
  },
  beforeDestroy() {
    toastBus.$off("success:modal", this.show);
  },
  methods: {
    show({ title = "Done!", message = "", detail = "" } = {}) {
      this.title = title;
      this.message = message;
      this.detail = detail;
      this.visible = true;
    },
    close() {
      this.visible = false;
    }
  }
};
</script>

<style scoped>
.sm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-overlay);
  backdrop-filter: blur(12px);
  font-family: var(--font-family);
}

.sm-card {
  width: 390px;
  max-width: 100%;
  border-radius: var(--modal-radius) !important;
  overflow: hidden !important;
  clip-path: none !important;
}

.sm-body-shell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px 32px 24px;
  text-align: center;
}

.sm-ring-wrap {
  position: relative;
  width: 96px;
  height: 96px;
  flex: 0 0 auto;
}

.sm-ring-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  transform: rotate(-90deg);
}

.sm-ring-track {
  fill: none;
  stroke: var(--border-color);
  stroke-width: 6;
}

.sm-ring-fill {
  fill: none;
  stroke: var(--success);
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 327;
  stroke-dashoffset: 327;
  animation: ring-draw 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards;
  filter: drop-shadow(0 0 8px var(--primary-glow));
}

@keyframes ring-draw {
  to { stroke-dashoffset: 0; }
}

.sm-check-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 24px;
}

.sm-check-mark {
  fill: none;
  stroke: var(--primary);
  stroke-width: 5;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 52;
  stroke-dashoffset: 52;
  animation: check-draw 0.4s ease-out 0.75s forwards;
}

@keyframes check-draw {
  to { stroke-dashoffset: 0; }
}

.sm-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: var(--text-strong);
  letter-spacing: -0.02em;
}

.sm-body {
  margin: 0;
  max-width: 260px;
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
  line-height: 1.55;
}

.sm-detail-box {
  max-width: 100%;
  padding: 10px 16px;
  border: 1px solid var(--border-mid);
  border-radius: 12px;
  background: var(--primary-light);
  font-size: 12px;
  font-weight: 600;
  color: var(--primary-deep);
  word-break: break-word;
}

.sm-btn {
  width: 100%;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: var(--radius-lg);
  background: linear-gradient(135deg, var(--primary), var(--theme-color));
  color: var(--text-inverse);
  font-size: 14px;
  font-weight: 700;
  font-family: var(--font-family);
  box-shadow: var(--shadow-glow-sm);
  transition: all 0.25s ease;
}

.sm-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.sm-btn svg {
  width: 18px;
  height: 18px;
  fill: currentColor;
}

.success-modal-enter-active {
  animation: sm-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.success-modal-leave-active {
  animation: sm-out 0.25s ease forwards;
}

@keyframes sm-in {
  from { opacity: 0; transform: scale(0.85); }
  to { opacity: 1; transform: scale(1); }
}

@keyframes sm-out {
  to { opacity: 0; transform: scale(0.9); }
}
</style>
