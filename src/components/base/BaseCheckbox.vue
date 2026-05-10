<template>
  <label class="base-checkbox" :class="{ 'base-checkbox--disabled': disabled }">
    <input
      v-bind="$attrs"
      type="checkbox"
      :checked="value"
      :disabled="disabled"
      @change="$emit('input', $event.target.checked)"
    >
    <span class="base-checkbox__mark" aria-hidden="true"></span>
    <span v-if="$slots.default" class="base-checkbox__label"><slot /></span>
  </label>
</template>

<script>
export default {
  name: "BaseCheckbox",
  inheritAttrs: false,
  props: {
    value: {
      type: Boolean,
      default: false
    },
    disabled: {
      type: Boolean,
      default: false
    }
  }
};
</script>
