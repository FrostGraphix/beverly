<template>
  <section v-bind="$attrs" class="base-table-shell">
    <div v-if="$slots.alert" class="base-table-shell__alert">
      <slot name="alert" />
    </div>
    <div v-if="$slots.toolbar" class="base-table-shell__toolbar">
      <slot name="toolbar" />
    </div>
    <div v-if="$slots.summary" class="base-table-shell__summary">
      <slot name="summary" />
    </div>
    <div v-if="$slots.meta" class="base-table-shell__meta">
      <slot name="meta" />
    </div>
    <div class="base-table-shell__body">
      <slot />
    </div>
    <div v-if="$slots.footer" class="base-table-shell__footer">
      <slot name="footer" />
    </div>
  </section>
</template>

<script>
export default {
  name: "BaseTableShell",
  inheritAttrs: false
};
</script>
