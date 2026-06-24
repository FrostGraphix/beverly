<template>
  <article
    :class="['kpi-card', tone, { 'kpi-card--interactive': interactive, 'kpi-card--active': active }]"
    :role="interactive ? 'button' : undefined"
    :tabindex="interactive ? 0 : undefined"
    :aria-pressed="interactive ? String(active) : undefined"
    @click="interactive && $emit('select')"
    @keydown="onKeydown"
  >
    <span>{{ label }}</span>
    <i class="kpi-icon" aria-hidden="true"></i>
    <strong>{{ value }}</strong>
    <small v-if="note">{{ note }}</small>
    <em v-if="interactive" class="kpi-card-action">{{ action || 'Inspect' }}</em>
    <small v-if="interactive" class="kpi-card-metric">{{ metric || 'Live window' }}</small>
  </article>
</template>

<script>
export default {
  name: "WalletKpiCard",
  props: {
    label: String,
    value: String,
    note: String,
    tone: String,
    active: Boolean,
    metric: String,
    action: String
  },
  emits: ["select"],
  computed: {
    interactive() { return Boolean(this.metric || this.action); }
  },
  methods: {
    onKeydown(event) {
      if (this.interactive && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        this.$emit("select");
      }
    }
  }
};
</script>
