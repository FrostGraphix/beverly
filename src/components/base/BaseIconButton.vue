<template>
  <button
    v-bind="$attrs"
    class="base-icon-button"
    :disabled="disabled"
    type="button"
    v-on="$listeners"
  >
    <slot />
  </button>
</template>

<script>
export default {
  name: "BaseIconButton",
  inheritAttrs: false,
  props: {
    disabled: {
      type: Boolean,
      default: false
    }
  }
};
</script>
