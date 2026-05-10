<template>
  <header v-bind="$attrs" class="base-page-header">
    <div class="base-page-header__copy">
      <slot name="eyebrow" />
      <h1 v-if="title" class="base-page-header__title">{{ title }}</h1>
      <p v-if="description" class="base-page-header__description">{{ description }}</p>
      <slot />
    </div>
    <div v-if="$slots.actions" class="base-page-header__actions">
      <slot name="actions" />
    </div>
  </header>
</template>

<script>
export default {
  name: "BasePageHeader",
  inheritAttrs: false,
  props: {
    title: {
      type: String,
      default: ""
    },
    description: {
      type: String,
      default: ""
    }
  }
};
</script>
