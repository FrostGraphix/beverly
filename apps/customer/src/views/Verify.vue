<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

const route  = useRoute();
const router = useRouter();
const auth   = useAuthStore();

const challengeId = route.query.challenge_id as string;
const phone       = route.query.phone as string;
const isSignup    = route.query.signup === '1';

const digits  = ref<string[]>(['', '', '', '', '', '']);
const inputs  = ref<HTMLInputElement[]>([]);
const loading = ref(false);
const error   = ref<string | null>(null);
const resendCd = ref(0);
let timer: ReturnType<typeof setInterval>;

onMounted(() => {
    inputs.value[0]?.focus();
    startResendCooldown();
});

function startResendCooldown() {
    resendCd.value = 30;
    timer = setInterval(() => { if (--resendCd.value <= 0) clearInterval(timer); }, 1000);
}

function onInput(i: number, e: Event) {
    const v = (e.target as HTMLInputElement).value.replace(/\D/g, '').slice(-1);
    digits.value[i] = v;
    if (v && i < 5) nextTick(() => inputs.value[i + 1]?.focus());
    if (digits.value.every(d => d)) submit();
}

function onKeydown(i: number, e: KeyboardEvent) {
    if (e.key === 'Backspace' && !digits.value[i] && i > 0) {
        inputs.value[i - 1]?.focus();
    }
}

function onPaste(e: ClipboardEvent) {
    const text = e.clipboardData?.getData('text')?.replace(/\D/g, '').slice(0, 6) ?? '';
    if (text.length === 6) {
        text.split('').forEach((c, i) => { digits.value[i] = c; });
        nextTick(() => { inputs.value[5]?.focus(); submit(); });
    }
}

async function submit() {
    if (loading.value) return;
    const otp = digits.value.join('');
    if (otp.length !== 6) return;
    loading.value = true; error.value = null;
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
    } finally { loading.value = false; }
}

async function resend() {
    if (resendCd.value > 0) return;
    const endpoint = isSignup ? '/api/v1/customer/auth/signup' : '/api/v1/customer/auth/login';
    await api.post(endpoint, { phone });
    startResendCooldown();
}
</script>

<template>
  <div class="bw-auth-page">
    <div class="bw-card bw-auth-card">
      <div style="text-align:center; margin-bottom: var(--s-6)">
        <div class="bw-mark" style="width:52px; height:52px; font-size:22px; margin: 0 auto var(--s-4)">B</div>
        <div class="bw-h1" style="font-size: var(--t-2xl); margin-bottom:6px">Enter your code</div>
        <p class="bw-muted" style="margin:0; font-size: var(--t-sm)">
          We sent a 6-digit code to <strong>{{ phone }}</strong>
        </p>
      </div>

      <div class="bw-otp-row" @paste.prevent="onPaste">
        <input
          v-for="(_, i) in digits" :key="i"
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

      <button class="bw-btn primary lg" style="width:100%; justify-content:center; margin-top: var(--s-5)"
              :disabled="loading || digits.some(d => !d)" @click="submit">
        {{ loading ? 'Verifying…' : 'Verify' }}
      </button>

      <p class="bw-muted" style="text-align:center; margin-top: var(--s-4); font-size: var(--t-sm)">
        Didn't get a code?
        <button v-if="resendCd > 0" style="color: var(--text-2); background:none; border:none; cursor:default; font-size:inherit">
          Resend in {{ resendCd }}s
        </button>
        <button v-else style="color: var(--brand); font-weight:600; background:none; border:none; cursor:pointer; font-size:inherit"
                @click="resend">Resend code</button>
      </p>
    </div>
  </div>
</template>
