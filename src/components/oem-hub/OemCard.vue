<template>
  <article class="oem-card" :class="{ 'oem-card--seed': oem.isSeedDefault }">
    <div class="oem-card__menu" :class="{ 'oem-card__menu--open': menuOpen }" ref="menu">
      <button
        type="button"
        class="oem-card__menu-trigger"
        aria-haspopup="menu"
        :aria-expanded="menuOpen ? 'true' : 'false'"
        aria-label="OEM options"
        @click.stop="toggleMenu"
      >
        <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="5" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="12" cy="19" r="1.6" />
        </svg>
      </button>
      <ul v-if="menuOpen" class="oem-card__menu-panel" role="menu" @click.stop>
        <li role="none">
          <button type="button" role="menuitem" @click="emitAndClose('edit')">Edit name/details</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" @click="emitAndClose('settings')">Settings</button>
        </li>
        <li role="none">
          <button type="button" role="menuitem" class="oem-card__menu-danger" @click="emitAndClose('delete')">Delete</button>
        </li>
      </ul>
    </div>

    <div class="oem-card__surface" @click="$emit('select', oem)" role="button" tabindex="0" @keydown.enter.stop="$emit('select', oem)" @keydown.space.stop="$emit('select', oem)">
      <header class="oem-card__head">
        <div class="oem-card__logo" aria-hidden="true">
          <img v-if="oem.logoStoragePath" :src="oem.logoStoragePath" :alt="`${oem.displayName} logo`" />
          <span v-else class="oem-card__initials">{{ initials }}</span>
          <span v-if="warmState" class="oem-card__warm" :class="warmStateClass" :title="warmStateTitle" aria-hidden="true"></span>
        </div>
        <div class="oem-card__heading">
          <h3 class="oem-card__name">{{ oem.displayName }}</h3>
          <span class="oem-card__badge" :class="statusBadgeClass">{{ statusLabel }}</span>
        </div>
      </header>

      <dl class="oem-card__meta">
        <div class="oem-card__meta-row">
          <svg class="oem-card__meta-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M3 21h18" /><path d="M5 21V7l7-4 7 4v14" /><path d="M9 9h1M9 13h1M14 9h1M14 13h1" />
          </svg>
          <dt class="oem-card__meta-label">Communities</dt>
          <dd class="oem-card__meta-value">
            <select v-if="oem.stations && oem.stations.length > 0" class="oem-card__station-select" @click.stop @keydown.stop>
              <option value="" disabled selected>{{ oem.communityCount }} Station(s)</option>
              <option v-for="station in oem.stations" :key="station.stationId" :value="station.stationId">
                {{ station.communityLabel || station.stationId }} ({{ station.stationId }})
              </option>
            </select>
            <span v-else>0</span>
          </dd>
        </div>
        <div class="oem-card__meta-row">
          <svg class="oem-card__meta-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"></path>
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .92V20a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-.92 1.7 1.7 0 0 0-1.88.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.92-1H4a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 .92-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.92V4a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 .92 1.7 1.7 0 0 0 1.88-.34l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c.13.36.43.69.92 1H20a2 2 0 1 1 0 4h-.09c-.49.31-.79.64-.51 1z"></path>
          </svg>
          <dt class="oem-card__meta-label">Capabilities</dt>
          <dd class="oem-card__meta-value">{{ enabledCapabilityCount }} of {{ totalCapabilityCount }}</dd>
        </div>
        <div class="oem-card__meta-row">
          <svg class="oem-card__meta-icon" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="2" /><path d="M6 12h.01M10 12h4" />
          </svg>
          <dt class="oem-card__meta-label">Vending</dt>
          <dd class="oem-card__meta-value">{{ vendingLabel }}</dd>
        </div>
      </dl>

      <footer class="oem-card__foot">
        <span class="oem-card__cta">
          Enter workspace
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
        </span>
      </footer>
    </div>
  </article>
</template>

<script>
import { CAPABILITY_DEFINITIONS } from "./oem-capabilities.mjs";

export default {
  name: "OemCard",
  props: {
    oem: {
      type: Object,
      required: true
    },
    warmState: {
      type: Object,
      default: null
    }
  },
  emits: ["select", "edit", "settings", "delete"],
  data() {
    return { menuOpen: false };
  },
  computed: {
    initials() {
      return String(this.oem.displayName || "?")
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((word) => word[0].toUpperCase())
        .join("");
    },
    statusLabel() {
      if (this.oem.status === "active") return "Active";
      if (this.oem.status === "disabled") return "Disabled";
      return "Draft";
    },
    statusBadgeClass() {
      if (this.oem.status === "active") return "oem-card__badge--success";
      if (this.oem.status === "disabled") return "oem-card__badge--rejected";
      return "oem-card__badge--pending";
    },
    totalCapabilityCount() {
      return CAPABILITY_DEFINITIONS.length;
    },
    enabledCapabilityCount() {
      const caps = this.oem.capabilities || {};
      return CAPABILITY_DEFINITIONS.filter((def) => caps[def.key]).length;
    },
    vendingLabel() {
      return this.oem.vendingStrategy === "direct_credit" ? "Direct credit" : "STS token";
    },
    warmStateClass() {
      if (!this.warmState) return "";
      if (this.warmState.status === "error" || this.warmState.error) return "oem-card__warm--error";
      return this.warmState.status === "ready" ? "oem-card__warm--ready" : "oem-card__warm--loading";
    },
    warmStateTitle() {
      if (!this.warmState) return "";
      if (this.warmState.status === "error" || this.warmState.error) return "Dashboard preload failed";
      return this.warmState.status === "ready" ? "Dashboard ready" : "Warming up dashboard…";
    }
  },
  mounted() {
    document.addEventListener("click", this.onOutsideClick);
    document.addEventListener("keydown", this.onKeydown);
  },
  beforeUnmount() {
    document.removeEventListener("click", this.onOutsideClick);
    document.removeEventListener("keydown", this.onKeydown);
  },
  methods: {
    toggleMenu() {
      this.menuOpen = !this.menuOpen;
    },
    closeMenu() {
      this.menuOpen = false;
    },
    emitAndClose(eventName) {
      this.closeMenu();
      this.$emit(eventName, this.oem);
    },
    onOutsideClick(event) {
      if (this.menuOpen && !this.$refs.menu?.contains(event.target)) this.closeMenu();
    },
    onKeydown(event) {
      if (event.key === "Escape") this.closeMenu();
    }
  }
};
</script>

<style scoped>
.oem-card {
  position: relative;
  border-radius: var(--r-xl, var(--r-lg));
  background: var(--glass-bg, var(--surface));
  border: 1px solid var(--glass-border, var(--border));
  box-shadow: var(--glass-shadow-card, var(--shadow-2));
  transition: transform 0.15s ease, box-shadow 0.15s ease, border-color 0.15s ease;
}
.oem-card:hover { transform: translateY(-2px); box-shadow: var(--glass-shadow-float, var(--shadow-3)); border-color: var(--border-strong, var(--border)); }
.oem-card--seed { border-color: color-mix(in srgb, var(--brand) 30%, var(--glass-border, var(--border))); }

.oem-card__surface {
  display: flex;
  flex-direction: column;
  gap: var(--s-4);
  width: 100%;
  padding: var(--s-5);
  background: transparent;
  border: none;
  text-align: left;
  cursor: pointer;
  color: inherit;
  font: inherit;
  border-radius: inherit;
}

.oem-card__head { display: flex; align-items: flex-start; gap: var(--s-3); padding-right: 34px; }
.oem-card__logo {
  position: relative;
  width: 52px;
  height: 52px;
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.oem-card__logo img { width: 100%; height: 100%; object-fit: cover; }
.oem-card__initials { font-weight: 700; font-size: var(--t-md); color: var(--text-muted); }
.oem-card__heading { display: flex; flex-direction: column; gap: 6px; min-width: 0; padding-top: 2px; }
.oem-card__name {
  margin: 0;
  font-size: var(--t-md);
  font-weight: 700;
  letter-spacing: -0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.oem-card__badge {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: var(--t-xs);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.oem-card__badge--success { color: var(--semantic-positive, #22c55e); background: color-mix(in srgb, var(--semantic-positive, #22c55e) 16%, transparent); }
.oem-card__badge--rejected { color: var(--semantic-negative, #ef4444); background: color-mix(in srgb, var(--semantic-negative, #ef4444) 16%, transparent); }
.oem-card__badge--pending { color: var(--semantic-caution, #f59e0b); background: color-mix(in srgb, var(--semantic-caution, #f59e0b) 16%, transparent); }

.oem-card__meta { margin: 0; display: flex; flex-direction: column; gap: 8px; padding: var(--s-3) 0; border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.oem-card__meta-row { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); }
.oem-card__meta-icon { flex-shrink: 0; color: var(--text-muted); }
.oem-card__meta-label { margin: 0; color: var(--text-muted); }
.oem-card__meta-value { margin: 0 0 0 auto; font-weight: 600; color: var(--text); flex-shrink: 0; }

.oem-card__station-select {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: var(--r-sm);
  padding: 2px 6px;
  font-size: var(--t-xs);
  cursor: pointer;
  outline: none;
  max-width: 120px;
}
.oem-card__station-select option {
  background: var(--canvas, #1a1a1a);
  color: var(--text, #fff);
}
.oem-card__station-select:hover {
  border-color: var(--border-strong);
}

.oem-card__foot { display: flex; }
.oem-card__cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--brand);
}
.oem-card__surface:hover .oem-card__cta,
.oem-card__surface:focus-visible .oem-card__cta { gap: 9px; }
.oem-card__cta svg { transition: transform 0.15s ease; }
.oem-card__surface:hover .oem-card__cta svg,
.oem-card__surface:focus-visible .oem-card__cta svg { transform: translateX(2px); }

.oem-card__warm {
  position: absolute;
  bottom: -1px;
  right: -1px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  border: 2px solid var(--canvas, var(--surface));
  background: var(--text-muted);
}
.oem-card__warm--loading { background: var(--semantic-caution, orange); animation: oem-pulse 1.2s ease-in-out infinite; }
.oem-card__warm--ready { background: var(--semantic-positive, #22c55e); }
.oem-card__warm--error { background: var(--semantic-negative, #ef4444); }
@keyframes oem-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }

.oem-card__menu { position: absolute; top: var(--s-4); right: var(--s-4); z-index: 5; }
.oem-card__menu-trigger {
  width: 30px;
  height: 30px;
  padding: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--r-md);
  color: var(--text-muted);
  cursor: pointer;
}
.oem-card__menu-trigger:hover { background: var(--surface-2); color: var(--text); }
.oem-card__menu--open .oem-card__menu-trigger { background: var(--surface-2); color: var(--text); }
.oem-card__menu-panel {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  z-index: 100;
  min-width: 180px;
  margin: 0;
  padding: var(--s-2);
  list-style: none;
  display: grid;
  gap: 2px;
  background: var(--surface-3, var(--canvas));
  border: 1px solid var(--border-strong, var(--border));
  border-radius: var(--r-md);
  box-shadow: var(--shadow-3, 0 8px 24px rgba(0, 0, 0, 0.35));
}
.oem-card__menu-panel button {
  width: 100%;
  text-align: left;
  padding: var(--s-2) var(--s-3);
  border: none;
  background: transparent;
  border-radius: var(--r-sm);
  color: var(--text);
  font-size: var(--t-sm);
  cursor: pointer;
}
.oem-card__menu-panel button:hover { background: var(--surface-2); }
.oem-card__menu-danger { color: var(--danger-on-surface, #ef4444); }

/* ── Responsive ─────────────────────────────────────────────────────── */
@media (max-width: 480px) {
  .oem-card__surface { padding: var(--s-4); gap: var(--s-3); }
  .oem-card__logo { width: 44px; height: 44px; }
  .oem-card__name { font-size: var(--t-base, var(--t-sm)); }
  .oem-card__meta-row { justify-content: space-between; }
  .oem-card__meta-label { flex: none; }
}
</style>
