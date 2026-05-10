<template>
  <select
    ref="select"
    v-bind="$attrs"
    class="base-select bev-field"
    :value="value"
    v-on="listeners"
  >
    <slot />
  </select>
</template>

<script>
export default {
  name: "BaseSelect",
  inheritAttrs: false,
  props: {
    value: {
      type: [String, Number, Array],
      default: ""
    }
  },
  computed: {
    listeners() {
      const { input, change, ...rest } = this.$listeners;
      return {
        ...rest,
        change: (event) => {
          const nextValue = this.$attrs.multiple
            ? Array.from(event.target.selectedOptions).map((option) => option.value)
            : event.target.value;
          this.$emit("input", nextValue);
          this.$emit("change", event);
        }
      };
    }
  },
  mounted() {
    this.syncSelectedValue();
  },
  updated() {
    this.syncSelectedValue();
  },
  methods: {
    syncSelectedValue() {
      const element = this.$refs.select;
      if (!element) return;
      if (this.$attrs.multiple) {
        const values = new Set(Array.isArray(this.value) ? this.value.map((value) => String(value)) : []);
        Array.from(element.options).forEach((option) => {
          option.selected = values.has(String(option.value));
        });
        return;
      }
      const nextValue = this.value == null ? "" : String(this.value);
      if (element.value !== nextValue) {
        element.value = nextValue;
      }
    }
  }
};
</script>
