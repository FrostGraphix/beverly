<template>
  <AppShell title="Beverly AI Command Console">
    <div class="bw-card p-6">
      <div class="beverly-ai-console-header mb-6">
        <h2 class="text-xl font-bold mb-1">Beverly AI Command Console</h2>
        <p class="text-sm text-slate-500">
          Executive operational assistant for Wallet Admin & CRM operations. Voice and action enabled.
        </p>
      </div>
      <AcobotWidget portal="admin" />
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import AppShell from '../components/AppShell.vue';
import AcobotWidget from '../components/acobot/AcobotWidget.vue';
</script>

<style scoped>
.beverly-ai-console-header {
  border-bottom: 1px solid #e2e8f0;
  padding-bottom: 16px;
}
</style>
