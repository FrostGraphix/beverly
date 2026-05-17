<script setup lang="ts">
import { onMounted } from 'vue';
import { useStaffAuthStore } from './stores/auth';
const auth = useStaffAuthStore();
onMounted(() => { void auth.hydrate(); });
</script>
<template>
  <router-view />
</template>
