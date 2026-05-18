<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import { useVendorAuthStore } from './stores/auth';
import { useIdleTimeout } from './composables/useIdleTimeout';
import SessionTimeoutWarning from './components/SessionTimeoutWarning.vue';

const auth = useVendorAuthStore();
const router = useRouter();

onMounted(() => { void auth.hydrate(); });

// SOP: Vendor 30 min idle, 12 h absolute. Warn at T-2min.
const isAuthed = computed(() => auth.isAuthenticated);
const { warningVisible, secondsLeft, stayActive } = useIdleTimeout({
    idleMs:     30 * 60 * 1000,
    warningMs:  2  * 60 * 1000,
    absoluteMs: 12 * 60 * 60 * 1000,
    onTimeout: async () => {
        if (!auth.isAuthenticated) return;
        await auth.logout();
        await router.push({ name: 'login', query: { reason: 'session_timeout' } });
    },
});
</script>

<template>
  <router-view />
  <SessionTimeoutWarning
    v-if="isAuthed"
    :visible="warningVisible"
    :seconds-left="secondsLeft"
    @stay="stayActive"
    @logout="auth.logout(); $router.push({ name: 'login' })"
  />
</template>
