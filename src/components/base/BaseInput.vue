<template>
  <input
    v-bind="$attrs"
    class="base-input bev-field"
    :value="currentValue"
    @input="handleInput"
  >
</template>

<script>
export default {
  name: "BaseInput",
  inheritAttrs: false,
  emits: ["input", "update:modelValue"],
  props: {
    modelValue: {
      type: [String, Number],
      default: undefined
    },
    value: {
      type: [String, Number],
      default: ""
    },
    modelModifiers: {
      type: Object,
      default: () => ({})
    }
  },
  computed: {
    currentValue() {
      return this.modelValue !== undefined ? this.modelValue : this.value;
    }
  },
  methods: {
    handleInput(event) {
      let nextValue = event.target.value;
      if (this.modelModifiers.trim) nextValue = nextValue.trim();
      if (this.modelModifiers.number) nextValue = nextValue === "" ? "" : Number(nextValue);
      this.$emit("update:modelValue", nextValue);
      this.$emit("input", nextValue);
    }
  }
};
</script>
