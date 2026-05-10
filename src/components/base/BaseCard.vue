<template>
  <section v-bind="$attrs" :class="cardClasses">
    <slot />
  </section>
</template>

<script>
const allowedTones = ["default", "subtle", "glass"];

export default {
  name: "BaseCard",
  inheritAttrs: false,
  props: {
    tone: {
      type: String,
      default: "default",
      validator(value) {
        return allowedTones.includes(value);
      }
    }
  },
  computed: {
    cardClasses() {
      return [
        "base-card",
        this.tone !== "default" ? `base-card--${this.tone}` : ""
      ];
    }
  }
};
</script>
