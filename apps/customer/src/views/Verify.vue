<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import CustomerAuthShell from '../components/CustomerAuthShell.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

const challengeId = route.query.challenge_id as string;
const phone = route.query.phone as string;
const isSignup = route.query.signup === '1';
const isRecovery = route.query.recovery === '1';

const digits = ref<string[]>(['', '', '', '', '', '']);
const inputs = ref<HTMLInputElement[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const resendCd = ref(0);
let timer: ReturnType<typeof setInterval>;

onMounted(() => {
    inputs.value[0]?.focus();
    startResendCooldown();
});

onBeforeUnmount(() => {
    if (timer) clearInterval(timer);
});

const verifyCopy = computed(() => {
    if (isRecovery) {
        return {
            title: 'Enter your code',
            subtitle: `We sent a 6-digit recovery code to ${phone}.`,
        };
    }
    if (isSignup) {
        return {
            title: 'Enter your code',
            subtitle: `We sent a 6-digit code to ${phone}.`,
        };
    }
    return {
        title: 'Enter your code',
        subtitle: `We sent a 6-digit sign-in code to ${phone}.`,
    };
});

function startResendCooldown() {
    resendCd.value = 30;
    timer = setInterval(() => {
        if (--resendCd.value <= 0) clearInterval(timer);
    }, 1000);
}

function onInput(i: number, e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1);
    digits.value[i] = v;
    if (v && i < 5) nextTick(() => inputs.value[i + 1]?.focus());
    if (digits.value.every((d) => d)) submit();
}

function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
        inputs.value[i - 1]?.focus();
    }
}

function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) ?? '';
    if (text.length === 6) {
        text.split('').forEach((c, i) => {
            digits.value[i] = c;
        });
        nextTick(() => {
            inputs.value[5]?.focus();
            submit();
        });
    }
}

async function submit() {
    if (loading.value) return;
    const otp = digits.value.join('');
    if (otp.length !== 6) return;
    loading.value = true;
    error.value = null;
    try {
        const r = await api.post<{ access_token: string; customer: any; is_new: boolean }>(
            '/api/v1/customer/auth/verify',
            { challenge_id: challengeId, otp },
        );
        auth.setSession(r.access_token, r.customer);
        await router.push(r.customer.kyc_tier === 0 ? '/kyc' : '/');
    } catch (e: any) {
        error.value = e?.message ?? 'Invalid code. Try again.';
        digits.value = ['', '', '', '', '', ''];
        nextTick(() => inputs.value[0]?.focus());
    } finally {
        loading.value = false;
    }
}

async function resend() {
    if (resendCd.value > 0) return;
    const endpoint = isSignup ? '/api/v1/customer/auth/signup' : '/api/v1/customer/auth/login';
    await api.post(endpoint, { phone });
    startResendCooldown();
}
</script>

<template>
  <CustomerAuthShell
    :title="verifyCopy.title"
    :subtitle="verifyCopy.subtitle"
  >
    <div class="bw-otp-row" @paste.prevent="onPaste">
      <input
        v-for="(_, i) in digits"
        :key="i"
        ref="inputs"
        class="bw-otp-digit"
        :value="digits[i]"
        type="text"
        inputmode="numeric"
        maxlength="1"
        autocomplete="one-time-code"
        :disabled="loading"
        @input="onInput(i, $event)"
        @keydown="onKeydown(i, $event)"
      />
    </div>

    <div v-if="error" class="bw-alert danger" style="font-size: var(--t-sm); margin-top: var(--s-4)">{{ error }}</div>

    <button class="bw-btn primary lg bw-auth-submit" :disabled="loading || digits.some((d) => !d)" @click="submit">
      {{ loading ? 'Verifying…' : 'Verify' }}
    </button>

    <p class="bw-muted bw-auth-footer">
      Didn’t get a code?
      <button v-if="resendCd > 0" class="bw-auth-inline-button" type="button">
        Resend in {{ resendCd }}s
      </button>
      <button v-else class="bw-auth-inline-button bw-auth-inline-button--active" type="button" @click="resend">
        Resend code
      </button>
    </p>
    <p class="bw-muted bw-auth-footer bw-auth-footer--tight">
      <router-link :to="isRecovery ? '/recover' : '/login'" class="bw-auth-inline-link">
        {{ isRecovery ? 'Use another number' : 'Return to sign in' }}
      </router-link>
    </p>
  </CustomerAuthShell>
</template>
