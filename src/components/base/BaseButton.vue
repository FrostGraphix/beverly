<template>
  <button
    v-bind="$attrs"
    :class="buttonClasses"
    :disabled="disabled || loading"
    :type="nativeType"
    v-on="listeners"
  >
    <span v-if="loading" class="base-button__spinner" aria-hidden="true"></span>
    <slot />
  </button>
</template>

<script>
const allowedVariants = ["secondary", "primary", "danger", "ghost", "quiet"];
const allowedSizes = ["sm", "md", "lg"];

export default {
  name: "BaseButton",
  inheritAttrs: false,
  props: {
    variant: {
      type: String,
      default: "secondary",
      validator(value) {
        return allowedVariants.includes(value);
      }
    },
    size: {
      type: String,
      default: "md",
      validator(value) {
        return allowedSizes.includes(value);
      }
    },
    disabled: {
      type: Boolean,
      default: false
    },
    loading: {
      type: Boolean,
      default: false
    },
    nativeType: {
      type: String,
      default: "button",
      validator(value) {
        return ["button", "submit", "reset"].includes(value);
      }
    }
  },
  computed: {
    listeners() {
      return {
        ...this.$listeners,
        click: (event) => {
          if (this.disabled || this.loading) return;
          this.$emit("click", event);
        }
      };
    },
    buttonClasses() {
      return [
        "base-button",
        this.variant !== "secondary" ? `base-button--${this.variant}` : "",
        this.size !== "md" ? `base-button--${this.size}` : ""
      ];
    }
  }
};
</script>
