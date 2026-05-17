<template>
  <select
    ref="select"
    v-bind="$attrs"
    class="base-select bev-field"
    :value="currentValue"
    @change="handleChange"
  >
    <slot />
  </select>
</template>

<script>
export default {
  name: "BaseSelect",
  inheritAttrs: false,
  emits: ["change", "input", "update:modelValue"],
  props: {
    modelValue: {
      type: [String, Number, Array],
      default: undefined
    },
    value: {
      type: [String, Number, Array],
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
  mounted() {
    this.syncSelectedValue();
  },
  updated() {
    this.syncSelectedValue();
  },
  methods: {
    handleChange(event) {
      let nextValue = this.$attrs.multiple
        ? Array.from(event.target.selectedOptions).map((option) => option.value)
        : event.target.value;
      if (this.modelModifiers.number && !this.$attrs.multiple) {
        nextValue = nextValue === "" ? "" : Number(nextValue);
      }
      this.$emit("update:modelValue", nextValue);
      this.$emit("input", nextValue);
      this.$emit("change", event);
    },
    syncSelectedValue() {
      const element = this.$refs.select;
      if (!element) return;
      if (this.$attrs.multiple) {
        const values = new Set(Array.isArray(this.currentValue) ? this.currentValue.map((value) => String(value)) : []);
        Array.from(element.options).forEach((option) => {
          option.selected = values.has(String(option.value));
        });
        return;
      }
      const nextValue = this.currentValue == null ? "" : String(this.currentValue);
      if (element.value !== nextValue) {
        element.value = nextValue;
      }
    }
  }
};
</script>
