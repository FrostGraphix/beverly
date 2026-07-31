<template>
  <Teleport to="body">
    <div v-if="open" class="confirm-backdrop" @click.self="cancel">
      <BaseModalShell
        ref="dialog"
        class="confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        :aria-labelledby="titleId"
        tabindex="-1"
        @keydown.esc.prevent="cancel"
      >
        <div class="confirm-icon" aria-hidden="true">!</div>
        <h2 :id="titleId">{{ title }}</h2>
        <p v-if="description">{{ description }}</p>
        <slot />
        <div class="confirm-actions">
          <BaseButton variant="danger" :disabled="loading" @click="cancel">Cancel</BaseButton>
          <BaseButton variant="danger" :disabled="loading || disabled" @click="$emit('confirm')">
            {{ loading ? "Working..." : confirmLabel }}
          </BaseButton>
        </div>
      </BaseModalShell>
    </div>
  </Teleport>
</template>

<script>
import BaseButton from "./BaseButton.vue";
import BaseModalShell from "./BaseModalShell.vue";

export default {
  name: "BaseConfirmDialog",
  components: { BaseButton, BaseModalShell },
  props: {
    open: Boolean,
    title: { type: String, required: true },
    description: { type: String, default: "" },
    confirmLabel: { type: String, default: "Confirm" },
    loading: Boolean,
    disabled: Boolean
  },
  emits: ["cancel", "confirm"],
  computed: {
    titleId() { return `confirm-${this._uid}`; }
  },
  watch: {
    open(value) {
      if (value) this.$nextTick(() => this.$refs.dialog?.$el?.focus());
    }
  },
  methods: {
    cancel() {
      if (!this.loading) this.$emit("cancel");
    }
  }
};
</script>

<style scoped>
.confirm-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgb(0 0 0 / 48%);
  backdrop-filter: blur(12px);
}

.confirm-dialog {
  width: min(380px, calc(100vw - 32px));
  text-align: center;
}

.confirm-icon {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 14px;
  border-radius: 50%;
  background: color-mix(in srgb, var(--danger) 14%, transparent);
  color: var(--danger);
  font-size: 22px;
  font-weight: 800;
}

h2 { margin: 0; color: var(--text-strong); font-size: 18px; }
p { margin: 8px 0 18px; color: var(--text-muted); line-height: 1.5; }
.confirm-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 20px; }

@media (max-width: 480px) {
  .confirm-actions { grid-template-columns: 1fr; }
}
</style>
