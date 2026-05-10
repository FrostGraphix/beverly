<template>
  <div class="tom-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <BaseModalShell class="tom-modal">
      <template #header>
        <header class="tom-header">
          <div class="tom-brand">
            <div class="brand-gem">
              <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
            </div>
            <span>Meter Analytics</span>
          </div>
          <BaseIconButton class="tom-close" @click="$emit('close')" aria-label="Close">
            <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
          </BaseIconButton>
        </header>
      </template>

      <div class="tom-body">
        <div class="tom-orb-col">
          <div :class="['tom-orb', statusClass]">
            <div class="tom-orb-ring"></div>
            <div class="tom-orb-core">
              <span class="orb-tag">{{ row.dataItem || "Reading" }}</span>
              <div class="orb-val">{{ primaryValue }}</div>
              <span class="orb-unit">{{ primaryUnit }}</span>
            </div>
          </div>
          <p class="orb-status-label" :class="statusClass">{{ statusText }}</p>
        </div>

        <div class="tom-data-col">
          <h3 class="data-name">{{ row.customerName || "Customer" }}</h3>
          <p class="data-meter">{{ row.meterId || "Unknown" }}</p>

          <div class="chip-row">
            <div class="chip">
              <span class="chip-l">Station</span>
              <span class="chip-v">{{ row.stationId || "N/A" }}</span>
            </div>
            <div class="chip">
              <span class="chip-l">Created</span>
              <span class="chip-v">{{ formatDate(row.createDate) }}</span>
            </div>
            <div class="chip">
              <span class="chip-l">Updated</span>
              <span class="chip-v">{{ formatDate(row.updateDate) }}</span>
            </div>
          </div>

          <div v-if="decodedSegments.length > 1" class="seg-row">
            <div v-for="seg in decodedSegments" :key="seg.label" class="seg-chip">
              <span class="seg-l">{{ seg.label }}</span>
              <span class="seg-v">{{ seg.value }}</span>
            </div>
          </div>

          <details class="raw-block">
            <summary>
              Raw payload
              <BaseButton class="copy-btn" size="sm" variant="quiet" @click.stop.prevent="copyRaw">Copy</BaseButton>
            </summary>
            <pre>{{ rawValue }}</pre>
          </details>
        </div>
      </div>

      <template #footer>
        <footer class="tom-footer">
          <BaseButton class="done-btn" variant="primary" size="lg" @click="$emit('close')">
            Done
            <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
          </BaseButton>
        </footer>
      </template>
    </BaseModalShell>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseModalShell from "./base/BaseModalShell.vue";

function decodeSegments(row) {
  const parts = String(row.dataValue || row.data || "")
    .split(",").map((segment) => segment.trim()).filter(Boolean);
  if (!parts.length) return [{ label: "Result", value: "No payload" }];
  const dataItem = String(row.dataItem || "").toLowerCase();
  if (dataItem === "credit balance") {
    return [
      { label: "Balance", value: parts[0] || "0.00" },
      { label: "Register", value: parts[1] || "N/A" },
      { label: "Flag", value: parts[2] || "N/A" }
    ];
  }
  if (dataItem === "total consumption") return [{ label: "Total", value: parts[0] || "0.00" }];
  return parts.map((value, index) => ({ label: `Seg ${index + 1}`, value }));
}

export default {
  name: "TaskOutputModal",
  components: { BaseButton, BaseIconButton, BaseModalShell },
  props: {
    row: { type: Object, required: true }
  },
  computed: {
    rawValue() {
      return String(this.row.dataValue || this.row.data || "No payload returned");
    },
    decodedSegments() {
      return decodeSegments(this.row);
    },
    primaryValue() {
      return this.decodedSegments[0]?.value || "---";
    },
    primaryUnit() {
      const dataItem = String(this.row.dataItem || "").toLowerCase();
      if (dataItem === "total consumption") return "kWh";
      if (dataItem === "credit balance") return "Units";
      return "Val";
    },
    statusText() {
      const status = Number(this.row.status);
      return status === 1 ? "Success" : status === 2 ? "Failure" : "Pending";
    },
    statusClass() {
      return { Success: "is-success", Failure: "is-danger", Pending: "is-warning" }[this.statusText] || "is-warning";
    }
  },
  methods: {
    formatDate(value) {
      if (!value) return "N/A";
      try {
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return value;
        return `${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} ${date.toLocaleDateString([], { month: "short", day: "numeric" })}`;
      } catch {
        return value;
      }
    },
    async copyRaw() {
      try {
        await navigator.clipboard.writeText(this.rawValue);
      } catch {
        // Ignore clipboard failures.
      }
    }
  }
};
</script>

<style scoped>
.tom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background: var(--bg-overlay);
  backdrop-filter: blur(10px);
  font-family: var(--font-family);
}

.tom-modal {
  width: min(760px, calc(100vw - 32px));
  max-width: 100%;
  max-height: calc(100vh - 32px);
  border-radius: var(--modal-radius) !important;
  overflow: hidden !important;
  clip-path: none !important;
  animation: pop-in 0.38s cubic-bezier(0.34, 1.56, 0.64, 1);
}

@keyframes pop-in {
  from { opacity: 0; transform: scale(0.88) translateY(18px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}

.tom-header {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.tom-brand {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 700;
  font-size: 12px;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.brand-gem {
  width: 24px;
  height: 24px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: linear-gradient(135deg, var(--primary), var(--primary-deep));
  color: #fff;
  box-shadow: var(--shadow-glow-sm);
}

.brand-gem svg {
  width: 13px;
  height: 13px;
  fill: currentColor;
}

.tom-close {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary-light);
  color: var(--text-muted);
  transition: all 0.2s;
}

.tom-close:hover {
  background: var(--danger-bg);
  color: var(--danger);
  transform: rotate(90deg);
}

.tom-close svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

.tom-body {
  display: flex;
  align-items: flex-start;
  gap: 0;
}

.tom-orb-col {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-right: 18px;
  border-right: 1px solid var(--border-color);
}

.tom-orb {
  position: relative;
  width: 200px;
  height: 200px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
}

.tom-orb::before {
  content: "";
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--bg-card) 40%, var(--primary-light) 100%);
  animation: pulse-bg 3s ease-in-out infinite;
}

@keyframes pulse-bg {
  0%, 100% { opacity: 0.7; transform: scale(0.97); }
  50% { opacity: 1; transform: scale(1); }
}

.tom-orb-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid var(--border-color);
}

.tom-orb-ring::before,
.tom-orb-ring::after {
  content: "";
  position: absolute;
  inset: -3px;
  border-radius: 50%;
  border: 3px solid transparent;
}

.tom-orb-ring::before {
  border-top-color: currentColor;
  animation: spin 2.4s linear infinite;
  opacity: 0.9;
}

.tom-orb-ring::after {
  inset: 8px;
  border-bottom-color: currentColor;
  animation: spin 4s linear infinite reverse;
  opacity: 0.35;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

.is-success {
  color: var(--success);
}

.is-success .tom-orb-ring::before {
  filter: drop-shadow(0 0 6px var(--success));
}

.is-danger {
  color: var(--danger);
}

.is-danger .tom-orb-ring::before {
  filter: drop-shadow(0 0 6px var(--danger));
}

.is-warning {
  color: var(--warning);
}

.tom-orb-core {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.orb-tag {
  font-size: 9px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--text-muted);
}

.orb-val {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.05em;
  background: linear-gradient(160deg, var(--text-strong) 30%, var(--primary));
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.is-success .orb-val {
  background: linear-gradient(160deg, var(--primary-deep), var(--success));
  -webkit-background-clip: text;
}

.is-danger .orb-val {
  background: linear-gradient(160deg, var(--danger), var(--text-strong));
  -webkit-background-clip: text;
}

.orb-unit {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
}

.orb-status-label {
  margin: 0;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.tom-data-col {
  flex: 1;
  min-width: 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.data-name {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text-strong);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-meter {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}

.chip-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 5px 9px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-page);
}

.chip-l {
  font-size: 10px;
  color: var(--text-muted);
  font-weight: 600;
}

.chip-v {
  font-size: 11px;
  color: var(--text-strong);
  font-weight: 700;
}

.seg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.seg-chip {
  min-width: 56px;
  display: flex;
  flex-direction: column;
  padding: 4px 8px;
  border: 1px solid var(--border-mid);
  border-radius: 8px;
  background: var(--primary-light);
}

.seg-l {
  font-size: 9px;
  color: var(--primary);
  font-weight: 700;
  text-transform: uppercase;
}

.seg-v {
  font-size: 12px;
  color: var(--primary-deep);
  font-weight: 700;
}

.raw-block {
  overflow: hidden;
  border-radius: 10px;
  background: var(--text-strong);
  font-size: 11px;
}

.raw-block summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 11px;
  color: var(--text-inverse);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  list-style: none;
  user-select: none;
}

.raw-block summary::-webkit-details-marker {
  display: none;
}

.copy-btn {
  min-height: 22px;
  height: 22px;
  padding: 0 8px;
  border-radius: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
}

.raw-block pre {
  margin: 0;
  padding: 0 11px 10px;
  color: var(--theme-color-bright);
  font-family: var(--font-mono);
  font-size: 10px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.tom-footer {
  width: 100%;
}

.done-btn {
  width: 100%;
  height: 42px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border-radius: 14px;
  background: linear-gradient(135deg, var(--primary), var(--primary-deep));
  font-size: 13px;
  font-weight: 700;
  box-shadow: var(--shadow-glow-sm);
  transition: all 0.25s ease;
  font-family: var(--font-family);
}

.done-btn:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow);
}

.done-btn svg {
  width: 16px;
  height: 16px;
  fill: currentColor;
}

@media (max-width: 720px) {
  .tom-body {
    flex-direction: column;
    gap: 18px;
  }

  .tom-orb-col {
    width: 100%;
    padding-right: 0;
    padding-bottom: 18px;
    border-right: 0;
    border-bottom: 1px solid var(--border-color);
  }

  .tom-data-col {
    width: 100%;
    padding-left: 0;
  }
}
</style>
