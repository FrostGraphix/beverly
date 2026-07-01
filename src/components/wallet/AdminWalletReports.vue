<template>
  <section class="page-stack report-grid">
    <article v-for="report in reports" :key="report.title" class="panel report-card">
      <h2>{{ report.title }}</h2>
      <p>{{ report.copy }}</p>
      <BaseButton class="mini-button" size="sm" @click="generateReport(report)">Generate</BaseButton>
    </article>
  </section>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";

export default {
  name: "AdminWalletReports",
  components: { BaseButton },
  props: {
    reports: { type: Array, required: true }
  },
  emits: ["audit"],
  methods: {
    generateReport(report) {
      this.$emit("audit", { time: "13 May 10:40:00", actor: "admin", role: "super-admin", event: "report_generated", target: report.title, ip: "local" });
    }
  }
};
</script>
