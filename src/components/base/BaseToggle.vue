<template>
  <button
    v-bind="$attrs"
    :class="['base-toggle', { 'base-toggle--on': value }]"
    type="button"
    role="switch"
    :aria-checked="String(Boolean(value))"
    v-on="$listeners"
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
  props: {
    value: {
      type: Boolean,
      default: false
    }
  },
  methods: {
    toggle(event) {
      this.$emit("input", !this.value);
      this.$emit("click", event);
    }
  }
};
</script>
