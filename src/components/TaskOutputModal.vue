<template>
  <div class="tom-backdrop" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <section class="tom-modal">

      <!-- Top bar -->
      <header class="tom-header">
        <div class="tom-brand">
          <div class="brand-gem">
            <svg viewBox="0 0 24 24"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
          </div>
          <span>Meter Analytics</span>
        </div>
        <button class="tom-close" type="button" @click="$emit('close')" aria-label="Close">
          <svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </header>

      <!-- Split body: orb ← → data -->
      <div class="tom-body">

        <!-- LEFT: Orb column -->
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

        <!-- RIGHT: Data column -->
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

          <!-- Decoded payload segments -->
          <div v-if="decodedSegments.length > 1" class="seg-row">
            <div v-for="seg in decodedSegments" :key="seg.label" class="seg-chip">
              <span class="seg-l">{{ seg.label }}</span>
              <span class="seg-v">{{ seg.value }}</span>
            </div>
          </div>

          <!-- Raw payload -->
          <details class="raw-block">
            <summary>
              Raw payload
              <button class="copy-btn" @click.stop.prevent="copyRaw">Copy</button>
            </summary>
            <pre>{{ rawValue }}</pre>
          </details>
        </div>
      </div>

      <!-- Footer -->
      <footer class="tom-footer">
        <button class="done-btn" type="button" @click="$emit('close')">
          Done
          <svg viewBox="0 0 24 24"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
        </button>
      </footer>
    </section>
  </div>
</template>

<script>
function decodeSegments(row) {
  const parts = String(row.dataValue || row.data || "")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (!parts.length) return [{ label: "Result", value: "No payload" }];
  const di = String(row.dataItem || "").toLowerCase();
  if (di === "credit balance") {
    return [
      { label: "Balance", value: parts[0] || "0.00" },
      { label: "Register", value: parts[1] || "N/A" },
      { label: "Flag", value: parts[2] || "N/A" }
    ];
  }
  if (di === "total consumption") return [{ label: "Total", value: parts[0] || "0.00" }];
  return parts.map((v, i) => ({ label: `Seg ${i + 1}`, value: v }));
}

export default {
  name: "TaskOutputModal",
  props: { row: { type: Object, required: true } },
  computed: {
    rawValue() { return String(this.row.dataValue || this.row.data || "No payload returned"); },
    decodedSegments() { return decodeSegments(this.row); },
    primaryValue() { return this.decodedSegments[0]?.value || "---"; },
    primaryUnit() {
      const di = String(this.row.dataItem || "").toLowerCase();
      if (di === "total consumption") return "kWh";
      if (di === "credit balance") return "Units";
      return "Val";
    },
    statusText() {
      const s = Number(this.row.status);
      return s === 1 ? "Success" : s === 2 ? "Failure" : "Pending";
    },
    statusClass() {
      return { Success: "is-success", Failure: "is-danger", Pending: "is-warning" }[this.statusText] || "is-warning";
    }
  },
  methods: {
    formatDate(d) {
      if (!d) return "N/A";
      try {
        const dt = new Date(d);
        if (isNaN(dt)) return d;
        return dt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) + " " +
               dt.toLocaleDateString([], { month: "short", day: "numeric" });
      } catch { return d; }
    },
    async copyRaw() {
      try { await navigator.clipboard.writeText(this.rawValue); } catch {}
    }
  }
};
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700;800&display=swap');

/* ── Backdrop ─────────────────────────────── */
.tom-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(4, 11, 24, 0.5);
  backdrop-filter: blur(10px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  font-family: 'Outfit', sans-serif;
}

/* ── Modal shell ──────────────────────────── */
.tom-modal {
  width: 640px;
  max-width: 100%;
  background: rgba(255,255,255,0.9);
  backdrop-filter: blur(28px);
  border-radius: 28px;
  border: 1px solid rgba(255,255,255,0.65);
  box-shadow:
    0 32px 80px -16px rgba(8,24,48,0.28),
    0 0 0 1px rgba(15,68,144,0.04);
  overflow: hidden;
  display: flex;
  flex-direction: column;
  animation: pop-in 0.38s cubic-bezier(0.34,1.56,0.64,1);
}

@keyframes pop-in {
  from { opacity: 0; transform: scale(0.88) translateY(18px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Header ───────────────────────────────── */
.tom-header {
  padding: 14px 18px 0;
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
  color: #1e293b;
  letter-spacing: -0.01em;
}

.brand-gem {
  width: 24px; height: 24px;
  background: linear-gradient(135deg, #3b82f6, #1d4ed8);
  border-radius: 8px;
  display: grid;
  place-items: center;
  color: #fff;
  box-shadow: 0 3px 10px rgba(59,130,246,0.45);
}
.brand-gem svg { width: 13px; height: 13px; fill: currentColor; }

.tom-close {
  width: 28px; height: 28px;
  border: 0;
  background: rgba(0,0,0,0.04);
  border-radius: 50%;
  color: #64748b;
  cursor: pointer;
  display: grid;
  place-items: center;
  transition: all 0.2s;
}
.tom-close:hover { background: #fee2e2; color: #ef4444; transform: rotate(90deg); }
.tom-close svg { width: 16px; height: 16px; fill: currentColor; }

/* ── Split body ───────────────────────────── */
.tom-body {
  display: flex;
  gap: 0;
  padding: 14px 18px;
  align-items: center;
}

/* ── Orb column ───────────────────────────── */
.tom-orb-col {
  flex: 0 0 auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding-right: 18px;
  border-right: 1px solid rgba(0,0,0,0.06);
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

/* Glow background pulse */
.tom-orb::before {
  content: '';
  position: absolute;
  inset: 8px;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(255,255,255,0.9) 40%, rgba(240,249,255,0.4) 100%);
  animation: pulse-bg 3s ease-in-out infinite;
}

@keyframes pulse-bg {
  0%,100% { opacity: 0.7; transform: scale(0.97); }
  50%      { opacity: 1;   transform: scale(1); }
}

/* Spinning ring */
.tom-orb-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 3px solid rgba(0,0,0,0.04);
}
.tom-orb-ring::before,
.tom-orb-ring::after {
  content: '';
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
  border-bottom-color: currentColor;
  animation: spin 4s linear infinite reverse;
  opacity: 0.35;
  inset: 8px;
}

@keyframes spin { 100% { transform: rotate(360deg); } }

/* Status colour tokens */
.is-success { color: #10b981; }
.is-success .tom-orb-ring::before { filter: drop-shadow(0 0 6px #10b981); }
.is-danger  { color: #ef4444; }
.is-danger  .tom-orb-ring::before { filter: drop-shadow(0 0 6px #ef4444); }
.is-warning { color: #f59e0b; }

/* Orb core content */
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
  color: #94a3b8;
}

.orb-val {
  font-size: 46px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.05em;
  background: linear-gradient(160deg, #0f172a 30%, #475569);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.is-success .orb-val { background: linear-gradient(160deg, #064e3b, #10b981); -webkit-background-clip: text; }
.is-danger  .orb-val { background: linear-gradient(160deg, #7f1d1d, #ef4444); -webkit-background-clip: text; }

.orb-unit {
  font-size: 11px;
  font-weight: 600;
  color: #94a3b8;
}

.orb-status-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}

/* ── Data column ──────────────────────────── */
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
  color: #0f172a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.data-meter {
  margin: 0;
  font-size: 11px;
  color: #64748b;
  font-weight: 600;
}

/* Chips */
.chip-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.chip {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: rgba(0,0,0,0.025);
  border-radius: 8px;
  padding: 5px 9px;
  border: 1px solid rgba(0,0,0,0.03);
}

.chip-l { font-size: 10px; color: #94a3b8; font-weight: 600; }
.chip-v { font-size: 11px; color: #1e293b; font-weight: 700; }

/* Decoded segments */
.seg-row {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.seg-chip {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 4px 8px;
  display: flex;
  flex-direction: column;
  min-width: 56px;
}

.seg-l { font-size: 9px; color: #3b82f6; font-weight: 700; text-transform: uppercase; }
.seg-v { font-size: 12px; color: #1e40af; font-weight: 700; }

/* Raw payload */
.raw-block {
  background: #0f172a;
  border-radius: 10px;
  overflow: hidden;
  font-size: 11px;
}

.raw-block summary {
  padding: 7px 11px;
  color: #94a3b8;
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: space-between;
  list-style: none;
  user-select: none;
}
.raw-block summary::-webkit-details-marker { display: none; }

.copy-btn {
  padding: 2px 8px;
  background: rgba(255,255,255,0.1);
  border: 0;
  border-radius: 6px;
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.04em;
}
.copy-btn:hover { background: rgba(255,255,255,0.2); }

.raw-block pre {
  margin: 0;
  padding: 0 11px 10px;
  color: #38bdf8;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

/* ── Footer ───────────────────────────────── */
.tom-footer {
  padding: 0 18px 16px;
}

.done-btn {
  width: 100%;
  height: 42px;
  background: linear-gradient(135deg, #1e293b, #0f172a);
  color: #fff;
  border: 0;
  border-radius: 14px;
  font-size: 13px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 8px 16px -4px rgba(15,23,42,0.38);
  font-family: 'Outfit', sans-serif;
}
.done-btn:hover { transform: translateY(-2px); box-shadow: 0 12px 24px -6px rgba(15,23,42,0.5); }
.done-btn svg { width: 16px; height: 16px; fill: currentColor; }
</style>
