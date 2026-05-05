<template>
  <nav class="site-sidebar" role="navigation" aria-label="Station filter">
    <button
      v-for="s in stations"
      :key="s.id"
      :class="['site-pill', activeStation === s.id ? 'site-pill--active' : '']"
      type="button"
      :title="s.label"
      @click="$emit('change', s.id === activeStation ? null : s.id)"
    >
      <span class="site-pill-dot" :style="{ background: s.color }"></span>
      <span class="site-pill-label">{{ s.label }}</span>
      <span v-if="s.count != null" class="site-pill-count">{{ s.count }}</span>
    </button>
  </nav>
</template>

<script>
export default {
  name: "SiteSidebar",
  props: {
    activeStation: { type: String, default: null },
    accountCounts: { type: Object, default: () => ({}) }
  },
  computed: {
    stations() {
      const all = [
        { id: null,      label: "All Sites", color: "var(--primary)",  count: null },
        { id: "TUNGA",   label: "Tunga",     color: "#40c9c6",         count: this.accountCounts["TUNGA"]   ?? null },
        { id: "UMAISHA", label: "Umaisha",   color: "#36a3f7",         count: this.accountCounts["UMAISHA"] ?? null },
        { id: "OGUFA",   label: "Ogufa",     color: "#f4516c",         count: this.accountCounts["OGUFA"]   ?? null },
        { id: "KYAKALE", label: "Kyakale",   color: "#34bfa3",         count: this.accountCounts["KYAKALE"] ?? null },
        { id: "MUSHA",   label: "Musha",     color: "#ffb822",         count: this.accountCounts["MUSHA"]   ?? null },
      ];
      return all;
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
</style>
