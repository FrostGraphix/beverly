<script setup lang="ts">
import { ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api } from '../lib/api';
import { naira, kwh } from '../lib/format';

const meterId = ref('');
const amountNaira = ref(2000);
const loading = ref(false);
const error = ref<string | null>(null);
const ok = ref<{ taskId: string; units: number } | null>(null);
const authOpen = ref(false);
const authorization = ref('');

async function dispatch() {
    if (!meterId.value.trim()) return;
    authOpen.value = true;
}

async function submitAuthorization() {
    loading.value = true; error.value = null;
    try {
        const r = await api.post<{ remoteTaskId: string | null; units: number }>('/api/v1/vendor/vend', {
            meterId: meterId.value.trim(),
            amountMinor: amountNaira.value * 100,
            mode: 'remote_send',
            authorization: authorization.value,
        });
        if (!r.remoteTaskId) throw new Error('No task ID returned');
        ok.value = { taskId: r.remoteTaskId, units: r.units };
        authorization.value = '';
        authOpen.value = false;
    } catch (e: any) {
        error.value = e?.message ?? 'Remote send failed';
    } finally { loading.value = false; }
}

function reset() {
    ok.value = null;
    meterId.value = '';
    amountNaira.value = 2000;
    authorization.value = '';
    error.value = null;
}
</script>

<template>
  <AppShell title="Remote Send">
    <div style="max-width: 560px; margin: 0 auto">
      <div v-if="!ok" class="bw-card">
        <h1 class="bw-h1">Remote send</h1>
        <p class="bw-muted" style="margin: 0 0 var(--s-5)">Token is delivered directly to the meter. No display, no copy.</p>

        <label class="bw-label">Meter number</label>
        <input class="bw-input bw-mono" inputmode="numeric" v-model="meterId" placeholder="44120…" />

        <label class="bw-label" style="margin-top: var(--s-4)">Amount (₦)</label>
        <input class="bw-input bw-mono" type="number" min="100" step="100" v-model.number="amountNaira" />
        <div class="bw-row" style="margin-top: var(--s-3); gap: var(--s-2); flex-wrap: wrap">
          <button v-for="n in [1000, 2000, 5000, 10000, 25000]" :key="n"
                  class="bw-btn sm" @click="amountNaira = n">₦{{ n.toLocaleString() }}</button>
        </div>

        <p v-if="error" class="bw-alert danger" style="margin-top: var(--s-3)">{{ error }}</p>

        <button class="bw-btn primary" style="margin-top: var(--s-5); width: 100%; justify-content: center; height: 44px"
                @click="dispatch" :disabled="loading || !meterId.trim() || amountNaira < 100">
          {{ loading ? 'Dispatching…' : 'Dispatch to meter' }}
        </button>
      </div>

      <div v-else class="bw-token-box">
        <p class="bw-label" style="color: var(--brand)">Dispatched</p>
        <h1 class="bw-h1" style="margin: var(--s-2) 0">Token sent to meter</h1>
        <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">Task #{{ ok.taskId.slice(0, 12) }}</p>
        <p class="bw-muted bw-mono" style="font-size: var(--t-sm)">{{ kwh(ok.units) }} · {{ naira(amountNaira * 100) }}</p>
        <p class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-3)">Status updates in Transactions when meter confirms.</p>
        <button class="bw-btn primary" style="margin-top: var(--s-4)" @click="reset">New send</button>
      </div>
    </div>

    <ConfirmDialog
      v-model:open="authOpen"
      title="Authorize remote send"
      description="Enter your vendor PIN or password before dispatching a token to the meter."
      confirm-label="Dispatch token"
      tone="warn"
      :loading="loading"
      :disable-confirm="!authorization"
      @confirm="submitAuthorization"
    >
      <label class="bw-label">Vendor authorization</label>
      <input
        class="bw-input bw-mono cd-input-target"
        v-model="authorization"
        type="password"
        autocomplete="off"
        placeholder="PIN or password"
      />
      <p class="bw-muted" style="font-size: var(--t-xs); margin-top: var(--s-2)">
        This protects remote token dispatch.
      </p>
    </ConfirmDialog>
  </AppShell>
</template>
