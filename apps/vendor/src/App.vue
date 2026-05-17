<script setup lang="ts">
import { onMounted } from 'vue';
import { useVendorAuthStore } from './stores/auth';
const auth = useVendorAuthStore();
onMounted(() => { void auth.hydrate(); });
</script>
<template>
  <router-view />
</template>
