<template>
  <nav class="site-sidebar" role="navigation" aria-label="Station filter">
    <BaseButton
      v-for="s in stations"
      :key="s.id"
      :class="['site-pill', activeStation === s.id ? 'site-pill--active' : '']"
      :title="s.label"
      @click="$emit('change', s.id === activeStation ? null : s.id)"
    >
      <span class="site-pill-dot" :style="{ background: s.color }"></span>
      <span class="site-pill-label">{{ s.label }}</span>
      <span v-if="s.count != null" class="site-pill-count">{{ s.count }}</span>
    </BaseButton>
  </nav>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import { stationOptionsSync } from "../../services/station-registry.mjs";

const COLORS = ["#40c9c6", "#10b981", "#f4516c", "#34bfa3", "#ffb822"];

export default {
  name: "SiteSidebar",
  components: { BaseButton },
  props: {
    activeStation: { type: String, default: null },
    accountCounts: { type: Object, default: () => ({}) }
  },
  computed: {
    stations() {
      return [
        { id: null,      label: "All Sites", color: "var(--primary)",  count: null },
        ...stationOptionsSync().map((station, index) => ({
          id: station.stationId,
          label: station.label,
          color: COLORS[index % COLORS.length],
          count: this.accountCounts[station.stationId] ?? null
        }))
      ];
    }
  }
};
</script>

<style scoped>
.site-sidebar {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 0;
}

.site-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  cursor: pointer;
  transition: all var(--transition-fast);
  text-align: left;
  width: 100%;
  font-size: 12px;
  font-family: var(--font-family);
  color: var(--text-main);
}

.site-pill:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: var(--primary-light);
  box-shadow: var(--shadow-sm);
}

.site-pill--active {
  border-color: var(--primary);
  background: var(--primary-light);
  color: var(--primary);
  font-weight: 600;
  box-shadow: var(--shadow-glow);
}

.site-pill-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.site-pill-label {
  flex: 1;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.site-pill-count {
  font-size: 10px;
  background: rgba(0,0,0,0.06);
  border-radius: 10px;
  padding: 1px 6px;
  color: var(--text-muted);
  font-weight: 600;
}

.site-pill--active .site-pill-count {
  background: var(--primary);
  color: #fff;
}

@media (max-width: 700px) {
  .site-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
    padding: 0;
  }

  .site-pill {
    min-height: 46px;
    padding: 10px 12px;
    border-radius: var(--radius-lg);
  }

  .site-pill-label {
    font-size: 13px;
  }
}

@media (max-width: 360px) {
  .site-sidebar {
    grid-template-columns: 1fr;
  }
}
</style>
