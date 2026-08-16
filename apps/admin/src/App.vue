<script setup lang="ts">
import { onMounted, computed, ref } from 'vue';
import { useRouter } from 'vue-router';
import BeverlyLoader from '@beverly/tokens/BeverlyLoader.vue';
import { useStaffAuthStore } from './stores/auth';
import { useIdleTimeout } from './composables/useIdleTimeout';
import SessionTimeoutWarning from './components/SessionTimeoutWarning.vue';
import PwaUpdateToast from '@beverly/tokens/PwaUpdateToast.vue';

const auth = useStaffAuthStore();
const router = useRouter();

// The initial route (including auth-hydration + permission guards in
// router/index.ts) resolves asynchronously — router-view renders nothing
// until then. Gate on router.isReady() so that gap shows the loader
// instead of a blank screen.
const routeReady = ref(false);
router.isReady().then(() => { routeReady.value = true; });

onMounted(() => { void auth.hydrate(); });

// SOP: Staff 8 h idle, 16 h absolute. Warn at T-2min.
const isAuthed = computed(() => auth.isAuthenticated);
const { warningVisible, secondsLeft, stayActive } = useIdleTimeout({
    idleMs:     8 * 60 * 60 * 1000,
    warningMs:  2  * 60 * 1000,
    absoluteMs: 16 * 60 * 60 * 1000,
    onTimeout: async () => {
        if (!auth.isAuthenticated) return;
        await auth.logout();
        await router.push({ name: 'login', query: { reason: 'session_timeout' } });
    },
});
</script>

<template>
  <BeverlyLoader v-if="!routeReady" label="Verifying session" />
  <router-view v-else />
  <SessionTimeoutWarning
    v-if="isAuthed"
    :visible="warningVisible"
    :seconds-left="secondsLeft"
    @stay="stayActive"
    @logout="auth.logout(); $router.push({ name: 'login', query: { reason: 'session_timeout' } })"
  />
  <PwaUpdateToast app-name="Wallet Admin" />
</template>
