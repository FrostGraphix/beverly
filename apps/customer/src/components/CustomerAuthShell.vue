<script setup lang="ts">
defineProps<{
  title: string;
  subtitle: string;
}>();
</script>

<template>
  <main class="bw-auth-page">
    <div class="bw-card bw-auth-card">
      <div class="bw-auth-header">
        <div class="bw-mark bw-auth-mark">B</div>
        <div class="bw-h1 bw-auth-title">{{ title }}</div>
        <p class="bw-muted bw-auth-subtitle">{{ subtitle }}</p>
      </div>

      <slot />
    </div>
  </main>
</template>
