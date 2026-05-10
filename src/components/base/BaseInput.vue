<template>
  <input
    v-bind="$attrs"
    class="base-input bev-field"
    :value="value"
    v-on="listeners"
  >
</template>

<script>
export default {
  name: "BaseInput",
  inheritAttrs: false,
  props: {
    value: {
      type: [String, Number],
      default: ""
    }
  },
  computed: {
    listeners() {
      return {
        ...this.$listeners,
        input: (event) => {
          this.$emit("input", event.target.value);
        }
      };
    }
  }
};
</script>
