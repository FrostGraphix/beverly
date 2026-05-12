<template>
  <span :class="badgeClasses">
    <slot />
  </span>
</template>

<script>
const allowedVariants = ["default", "neutral", "success", "warning", "danger", "info", "live", "cached", "demo"];

export default {
  name: "BaseBadge",
  props: {
    variant: {
      type: String,
      default: "default",
      validator(value) {
        return allowedVariants.includes(value);
      }
    }
  },
  computed: {
    badgeClasses() {
      return [
        "base-badge",
        this.variant !== "default" ? `base-badge--${this.variant}` : ""
      ];
    }
  }
};
</script>
