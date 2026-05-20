<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { useVendorAuthStore } from '../stores/auth';
import { useWalletStore } from '../stores/wallet';

const auth = useVendorAuthStore();
const wallet = useWalletStore();
const vendCount = ref(0);
const loading = ref(true);
const dismissed = ref(false);

const DISMISS_KEY = 'beverly.vendor.onboarding.dismissed';

onMounted(async () => {
    try { dismissed.value = localStorage.getItem(DISMISS_KEY) === '1'; } catch { /* noop */ }
    try {
        if (!wallet.summary) await wallet.fetchSummary();
        if (!wallet.ledger.length) await wallet.fetchLedger(50);
        vendCount.value = wallet.ledger.filter((e) => e.direction === 'debit').length;
    } finally {
        loading.value = false;
    }
});

const steps = computed(() => {
    const pwdDone = auth.user?.password_reset_required === false;
    const mfaDone = auth.user?.mfa_enrolled === true;
    const funded = (wallet.summary?.balance_minor ?? 0) > 0;
    return [
        {
            key: 'password',
            label: 'Change your temporary password',
            description: 'Set a strong password you can remember',
            done: pwdDone,
            to: '/password-change',
            icon: '🔑',
        },
        {
            key: 'mfa',
            label: 'Enable two-factor auth (MFA)',
            description: 'Required before you can vend > ₦200,000',
            done: mfaDone,
            to: '/security',
            icon: '🛡️',
            locked: !pwdDone,
        },
        {
            key: 'fund',
            label: 'Fund your wallet',
            description: 'Add float to start selling tokens',
            done: funded,
            to: '/wallet/fund',
            icon: '💰',
            locked: !pwdDone,
        },
        {
            key: 'vend',
            label: 'Vend your first token',
            description: 'Walk through a customer purchase',
            done: vendCount.value > 0,
            to: '/vend',
            icon: '⚡',
            locked: !pwdDone || !funded,
        },
    ];
});

const completedCount = computed(() => steps.value.filter((s) => s.done).length);
const totalSteps = computed(() => steps.value.length);
const allDone = computed(() => completedCount.value === totalSteps.value);
const percent = computed(() => Math.round((completedCount.value / totalSteps.value) * 100));

function dismiss() {
    dismissed.value = true;
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* noop */ }
}
</script>

<template>
  <Transition name="slide">
    <div v-if="!loading && !allDone && !dismissed" class="onboarding-card">
      <div class="onboarding-head">
        <div>
          <p class="onboarding-eyebrow">Vendor setup · {{ percent }}%</p>
          <p class="onboarding-title">{{ completedCount }} of {{ totalSteps }} done</p>
        </div>
        <button class="dismiss-btn" type="button" aria-label="Dismiss" @click="dismiss">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          </svg>
        </button>
      </div>

      <div class="progress-bar">
        <div class="progress-bar-fill" :style="{ width: `${percent}%` }" />
      </div>

      <ul class="step-list">
        <li v-for="step in steps" :key="step.key" :class="['step', { 'step--done': step.done, 'step--locked': step.locked && !step.done }]">
          <component
            :is="step.locked || step.done ? 'div' : 'router-link'"
            :to="step.locked || step.done ? undefined : step.to"
            class="step-link"
          >
            <div class="step-icon">
              <svg v-if="step.done" width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <path d="M3 7l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <span v-else>{{ step.icon }}</span>
            </div>
            <div class="step-text">
              <div class="step-label">{{ step.label }}</div>
              <div class="step-desc">{{ step.description }}</div>
            </div>
            <div v-if="!step.locked && !step.done" class="step-arrow">→</div>
            <div v-else-if="step.locked" class="step-lock" aria-label="Locked">🔒</div>
          </component>
        </li>
      </ul>
    </div>
  </Transition>
</template>

<style scoped>
.onboarding-card {
  background: linear-gradient(135deg, oklch(70% 0.19 145 / 0.10), oklch(65% 0.18 270 / 0.04));
  border: 1px solid oklch(70% 0.19 145 / 0.20);
  border-radius: var(--r-xl);
  padding: var(--s-5);
  position: relative;
  overflow: hidden;
  margin-bottom: var(--s-4);
}
.onboarding-card::before {
  content: '';
  position: absolute;
  top: 0; left: 20%; right: 20%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--brand), transparent);
}
.onboarding-head {
  display: flex;
  justify-content: space-between;
  align-items: start;
  margin-bottom: var(--s-3);
}
.onboarding-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.10em;
  text-transform: uppercase;
  color: var(--brand);
  margin: 0 0 2px;
}
.onboarding-title {
  font-size: var(--t-lg);
  font-weight: 700;
  color: var(--text);
  margin: 0;
}
.dismiss-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px;
  border-radius: var(--r-sm);
}
.dismiss-btn:hover { color: var(--text); background: var(--surface-2); }

.progress-bar {
  height: 6px;
  background: oklch(0% 0 0 / 0.20);
  border-radius: var(--r-full);
  overflow: hidden;
  margin-bottom: var(--s-4);
}
.progress-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--brand-300), var(--brand));
  box-shadow: 0 0 12px var(--brand-glow);
  border-radius: var(--r-full);
  transition: width 0.5s var(--ease-out);
}

.step-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.step-link {
  display: flex;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3);
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  text-decoration: none;
  color: var(--text);
  transition: all var(--dur-fast);
}
.step--done .step-link { opacity: 0.6; }
.step--locked .step-link { opacity: 0.4; cursor: not-allowed; }
.step-link:hover:not(.step--done):not(.step--locked) {
  border-color: var(--brand);
  transform: translateX(2px);
}
.step-icon {
  width: 36px; height: 36px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
  display: grid;
  place-items: center;
  font-size: 16px;
  flex-shrink: 0;
}
.step--done .step-icon {
  background: oklch(70% 0.19 145 / 0.15);
  color: var(--brand);
  border-color: oklch(70% 0.19 145 / 0.40);
}
.step-text { flex: 1; min-width: 0; }
.step-label {
  font-size: var(--t-sm);
  font-weight: 600;
  color: var(--text);
  margin-bottom: 2px;
}
.step-desc {
  font-size: var(--t-xs);
  color: var(--text-muted);
  line-height: 1.4;
}
.step--done .step-label { text-decoration: line-through; }
.step-arrow {
  color: var(--brand);
  font-weight: 700;
  font-size: var(--t-md);
  flex-shrink: 0;
}
.step-lock { font-size: var(--t-sm); flex-shrink: 0; }

.slide-enter-active, .slide-leave-active { transition: all 0.3s var(--ease-out); }
.slide-enter-from, .slide-leave-to { opacity: 0; transform: translateY(-8px); }
</style>
