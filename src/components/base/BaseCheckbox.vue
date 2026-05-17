<template>
  <label class="base-checkbox" :class="{ 'base-checkbox--disabled': disabled }">
    <input
      v-bind="$attrs"
      type="checkbox"
      :checked="currentValue"
      :disabled="disabled"
      @change="handleChange"
    >
    <span class="base-checkbox__mark" aria-hidden="true"></span>
    <span v-if="$slots.default" class="base-checkbox__label"><slot /></span>
  </label>
</template>

<script>
export default {
  name: "BaseCheckbox",
  inheritAttrs: false,
  emits: ["input", "update:modelValue"],
  props: {
    modelValue: {
      type: Boolean,
      default: undefined
    },
    value: {
      type: Boolean,
      default: false
    },
    disabled: {
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
    handleChange(event) {
      this.$emit("update:modelValue", event.target.checked);
      this.$emit("input", event.target.checked);
    }
  }
};
</script>
