<template>
  <component
    :is="tag"
    v-bind="$attrs"
    class="base-modal-shell"
    :role="role"
  >
    <header v-if="$slots.header" class="base-modal-shell__header">
      <slot name="header" />
    </header>
    <div class="base-modal-shell__body" :class="bodyClass">
      <slot />
    </div>
    <footer v-if="$slots.footer" class="base-modal-shell__footer">
      <slot name="footer" />
    </footer>
  </component>
</template>

<script>
export default {
  name: "BaseModalShell",
  inheritAttrs: false,
  props: {
    tag: {
      type: String,
      default: "section"
    },
    bodyClass: {
      type: [String, Array, Object],
      default: ""
    },
    role: {
      type: String,
      default: "document"
    }
  }
};
</script>

<style scoped>
.base-modal-shell {
  display: flex;
  flex-direction: column;
  width: min(640px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow: hidden;
  background: var(--bg-glass);
  border: 1px solid var(--border-mid);
  border-radius: var(--modal-radius);
  box-shadow: var(--shadow-xl), var(--shadow-glow-sm);
  backdrop-filter: blur(22px);
}

.base-modal-shell__header,
.base-modal-shell__footer {
  flex: 0 0 auto;
  background: var(--bg-card);
}

.base-modal-shell__header {
  padding: 18px 22px;
  border-bottom: 1px solid var(--border-color);
}

.base-modal-shell__body {
  min-height: 0;
  overflow: auto;
  padding: 22px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-page));
}

.base-modal-shell__footer {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  padding: 16px 22px;
  border-top: 1px solid var(--border-color);
}
</style>
