<template>
  <transition name="success-modal">
    <div v-if="visible" class="sm-backdrop" role="dialog" aria-modal="true" @click.self="close">
      <div class="sm-card">

        <!-- Animated check ring -->
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

        <button class="sm-btn" type="button" @click="close">
          Done
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
      </div>
    </div>
  </transition>
</template>

<script>
import { toastBus } from "../services/toast.js";

export default {
  name: "SuccessModal",
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
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');

.sm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 8000;
  background: rgba(4, 11, 24, 0.45);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-family: 'Outfit', sans-serif;
}

.sm-card {
  width: 360px;
  max-width: 100%;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(28px);
  border-radius: 28px;
  border: 1px solid rgba(255, 255, 255, 0.65);
  box-shadow: 0 32px 80px -16px rgba(8, 24, 48, 0.28);
  padding: 40px 32px 32px;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 16px;
}

/* ── Ring animation ─────────────────────────── */
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
  stroke: #d1fae5;
  stroke-width: 6;
}

.sm-ring-fill {
  fill: none;
  stroke: #10b981;
  stroke-width: 6;
  stroke-linecap: round;
  stroke-dasharray: 327;
  stroke-dashoffset: 327;
  animation: ring-draw 0.7s cubic-bezier(0.4, 0, 0.2, 1) 0.15s forwards;
  filter: drop-shadow(0 0 8px rgba(16, 185, 129, 0.5));
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
  stroke: #059669;
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

/* ── Text ───────────────────────────────────── */
.sm-title {
  margin: 0;
  font-size: 22px;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: -0.02em;
}

.sm-body {
  margin: 0;
  font-size: 13px;
  color: #64748b;
  font-weight: 500;
  line-height: 1.55;
  max-width: 260px;
}

/* ── Detail box ─────────────────────────────── */
.sm-detail-box {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 10px 16px;
  font-size: 12px;
  font-weight: 600;
  color: #065f46;
  max-width: 100%;
  word-break: break-word;
}

/* ── Button ─────────────────────────────────── */
.sm-btn {
  width: 100%;
  height: 48px;
  background: linear-gradient(135deg, #059669, #10b981);
  color: #fff;
  border: 0;
  border-radius: 16px;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  font-family: 'Outfit', sans-serif;
  transition: all 0.25s ease;
  box-shadow: 0 8px 20px -4px rgba(16, 185, 129, 0.45);
}
.sm-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 28px -6px rgba(16, 185, 129, 0.55); }
.sm-btn svg { width: 18px; height: 18px; fill: currentColor; }

/* ── Transitions ────────────────────────────── */
.success-modal-enter-active { animation: sm-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1); }
.success-modal-leave-active { animation: sm-out 0.25s ease forwards; }

@keyframes sm-in {
  from { opacity: 0; transform: scale(0.85); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes sm-out {
  to { opacity: 0; transform: scale(0.9); }
}
</style>
