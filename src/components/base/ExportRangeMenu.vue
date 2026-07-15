<template>
  <div ref="menu" class="export-range-menu" :class="{ 'export-range-menu--open': open }">
    <BaseButton
      variant="primary"
      :disabled="disabled || loading"
      :aria-expanded="open ? 'true' : 'false'"
      aria-haspopup="dialog"
      @click.stop="toggle"
    >Export</BaseButton>

    <aside v-if="open" class="export-range-panel" role="dialog" :aria-label="title" @click.stop>
      <header class="export-range-head">
        <div>
          <strong>{{ title }}</strong>
          <span>{{ description }}</span>
        </div>
        <BaseIconButton aria-label="Close export options" @click="close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </BaseIconButton>
      </header>

      <div class="export-range-options" role="radiogroup" aria-label="Export period">
        <BaseButton
          v-for="option in ranges"
          :key="option.value"
          type="button"
          class="export-range-option"
          :class="{ active: modelValue === option.value }"
          role="radio"
          :aria-checked="modelValue === option.value"
          @click="$emit('update:modelValue', option.value)"
        >{{ option.label }}</BaseButton>
      </div>

      <div class="export-range-summary">
        <span>Format</span><strong>{{ format }}</strong>
        <span>Delivery</span><strong>{{ delivery }}</strong>
        <span>Current search</span><strong>{{ searchTerm.trim() || "None" }}</strong>
        <span>Sort order</span><strong>{{ sortLabel }}</strong>
      </div>

      <p v-if="error" class="export-range-error" role="alert">{{ error }}</p>
      <BaseButton variant="primary" :disabled="loading" @click="$emit('download')">
        {{ loading ? "Preparing..." : `Download ${rangeLabel}` }}
      </BaseButton>
    </aside>
  </div>
</template>

<script>
import BaseButton from "./BaseButton.vue";
import BaseIconButton from "./BaseIconButton.vue";

const ranges = [
  { value: "1d", label: "1D" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "1y", label: "1 year" },
  { value: "all", label: "All data" }
];

export default {
  name: "ExportRangeMenu",
  components: { BaseButton, BaseIconButton },
  props: {
    modelValue: { type: String, default: "all" },
    title: { type: String, default: "Export records" },
    description: { type: String, default: "CSV includes every matching row." },
    format: { type: String, default: "CSV" },
    delivery: { type: String, default: "Prepared download" },
    searchTerm: { type: String, default: "" },
    sortLabel: { type: String, default: "Newest first" },
    error: { type: String, default: "" },
    disabled: { type: Boolean, default: false },
    loading: { type: Boolean, default: false }
  },
  emits: ["update:modelValue", "download"],
  data() {
    return { open: false, ranges };
  },
  computed: {
    rangeLabel() {
      return this.ranges.find((option) => option.value === this.modelValue)?.label || "CSV";
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
    toggle() {
      this.open = !this.open;
    },
    close() {
      this.open = false;
    },
    onOutsideClick(event) {
      if (this.open && !this.$refs.menu?.contains(event.target)) this.close();
    },
    onKeydown(event) {
      if (event.key === "Escape") this.close();
    }
  }
};
</script>

<style scoped>
.export-range-menu { position: relative; min-width: 0; }
.export-range-menu--open { z-index: var(--z-popover, 1200); }
.export-range-panel {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 100;
  width: min(360px, calc(100vw - 32px));
  max-height: calc(100dvh - 24px);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: grid;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  box-shadow: var(--shadow-xl);
  color: var(--text-main);
}
.export-range-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.export-range-head div { display: grid; gap: 3px; }
.export-range-head strong { color: var(--text-strong); font-size: 14px; }
.export-range-head span { color: var(--text-muted); font-size: 11px; }
.export-range-head svg { width: 16px; height: 16px; }
.export-range-options { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; }
.export-range-option {
  min-width: 0;
  padding: 9px 5px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  background: var(--bg-page);
  color: var(--text-main);
  font-size: 11px;
  font-weight: 800;
  white-space: nowrap;
}
.export-range-option:hover { border-color: var(--primary); }
.export-range-option.active { border-color: var(--primary); background: var(--primary-light); color: var(--primary); box-shadow: inset 0 0 0 1px var(--primary); }
.export-range-summary { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 7px 12px; padding: 12px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--bg-page); font-size: 11px; }
.export-range-summary span { color: var(--text-muted); }
.export-range-summary strong { overflow: hidden; color: var(--text-strong); text-align: right; text-overflow: ellipsis; white-space: nowrap; }
.export-range-error { margin: 0; color: var(--danger); font-size: 11px; }

@media (max-width: 520px) {
  .export-range-panel { right: 0; width: min(360px, calc(100vw - 24px)); padding: 14px; }
  .export-range-options { grid-template-columns: repeat(3, minmax(0, 1fr)); }
  .export-range-option { min-height: 44px; white-space: normal; }
}
</style>
