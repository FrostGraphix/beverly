<template>
  <button
    v-bind="$attrs"
    :class="['base-toggle', { 'base-toggle--on': currentValue }]"
    type="button"
    role="switch"
    :aria-checked="String(Boolean(currentValue))"
    @click="toggle"
  >
    <span class="base-toggle__knob"></span>
    <slot />
  </button>
</template>

<script>
export default {
  name: "BaseToggle",
  inheritAttrs: false,
  emits: ["click", "input", "update:modelValue"],
  props: {
    modelValue: {
      type: Boolean,
      default: undefined
    },
    value: {
      type: Boolean,
      default: false
    }
  },
  computed: {
    currentValue() {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    }
  },
  methods: {
    toggle(event) {
      this.$emit("update:modelValue", !this.currentValue);
      this.$emit("input", !this.currentValue);
      this.$emit("click", event);
    }
  }
};
</script>
