<template>
  <button
    v-bind="$attrs"
    class="base-icon-button"
    :disabled="disabled"
    type="button"
    @click="handleClick"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: "BaseIconButton",
  inheritAttrs: false,
  emits: ["click"],
  props: {
    disabled: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    handleClick(event) {
      if (this.disabled) return;
      this.$emit("click", event);
    }
  }
};
</script>
