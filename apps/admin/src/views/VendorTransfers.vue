<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import { api, ApiError, naira, shortDate } from '../lib/api';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';

interface VendorOption {
  vendorId: string;
  walletId: string;
  name: string;
  currency: string;
  availableMinor: number;
}

interface TransferPreview {
  amountMinor: number;
  currency: string;
  sourceBalanceAfterMinor: number;
  destinationBalanceAfterMinor: number;
}

interface Transfer {
  id: string;
  status: 'completed';
  source_vendor_id: string;
  destination_vendor_id: string;
  source_vendor_name: string;
  destination_vendor_name: string;
  amount_minor: number;
  currency: string;
  reason: string;
  idempotency_key: string;
  source_balance_after_minor: number;
  destination_balance_after_minor: number;
  created_at: string;
}

const vendors = ref<VendorOption[]>([]);
const history = ref<Transfer[]>([]);
const sourceVendorId = ref('');
const destinationVendorId = ref('');
const amountNaira = ref<number | null>(null);
const reason = ref('');
const vendorSearch = ref('');
const preview = ref<TransferPreview | null>(null);
const receipt = ref<Transfer | null>(null);
const loadingVendors = ref(false);
const loadingHistory = ref(false);
const previewing = ref(false);
const transferring = ref(false);
const confirmOpen = ref(false);
const feedback = ref<{ tone: 'success' | 'error'; title: string; what: string; next: string } | null>(null);
const requestKey = ref(crypto.randomUUID());
const transferExportColumns: WalletExportColumn<Transfer>[] = [
  { key: 'created_at', header: 'Created', value: (transfer) => shortDate(transfer.created_at) },
  { key: 'source_vendor_name', header: 'Source Vendor', value: (transfer) => transfer.source_vendor_name },
  { key: 'destination_vendor_name', header: 'Destination Vendor', value: (transfer) => transfer.destination_vendor_name },
  { key: 'amount_minor', header: 'Amount', value: (transfer) => naira(transfer.amount_minor) },
  { key: 'reason', header: 'Reason', value: (transfer) => transfer.reason },
  { key: 'status', header: 'Status', value: (transfer) => transfer.status },
  { key: 'idempotency_key', header: 'Request Key', value: (transfer) => transfer.idempotency_key },
];
let previewTimer: number | undefined;
let searchTimer: number | undefined;

const source = computed(() => vendors.value.find((vendor) => vendor.vendorId === sourceVendorId.value) ?? null);
const destination = computed(() => vendors.value.find((vendor) => vendor.vendorId === destinationVendorId.value) ?? null);
const amountMinor = computed(() => Math.round(Number(amountNaira.value ?? 0) * 100));
const formValid = computed(() => Boolean(
  source.value && destination.value && source.value.vendorId !== destination.value.vendorId
  && amountMinor.value > 0 && reason.value.trim().length >= 8,
));

function errorExperience(error: unknown) {
  const apiError = error instanceof ApiError ? error : null;
  const known: Record<string, { title: string; what: string; next: string }> = {
    insufficient_balance: { title: 'Transfer not completed', what: 'The source vendor no longer has enough available balance.', next: 'Lower the amount or choose another source wallet, then review again.' },
    source_wallet_inactive: { title: 'Source wallet unavailable', what: 'The source wallet is frozen, closed, or otherwise inactive.', next: 'Reactivate the wallet through an approved admin process or choose another source.' },
    destination_wallet_inactive: { title: 'Destination wallet unavailable', what: 'The destination wallet cannot receive this transfer.', next: 'Choose another active vendor wallet or resolve its status first.' },
    idempotency_conflict: { title: 'Request key already used', what: 'This transfer key belongs to different transfer details.', next: 'Start a new transfer to generate a fresh request key.' },
    money_writes_disabled: { title: 'Transfers are paused', what: 'Money writes are disabled in this environment.', next: 'No balance changed. Ask a Super Admin to verify the deployment controls.' },
    request_timeout: { title: 'Transfer status is uncertain', what: 'The server did not respond before the request timed out.', next: 'Do not submit a new transfer. Retry with the same request key or check transfer history.' },
  };
  feedback.value = { tone: 'error', ...(known[apiError?.code ?? ''] ?? {
    title: 'Transfer could not be completed',
    what: apiError?.message ?? 'The transfer service is unavailable.',
    next: 'No confirmed balance change is shown. Review the details and try again, or use the correlation information in the audit log.',
  }) };
}

async function loadVendors(search = vendorSearch.value) {
  loadingVendors.value = true;
  try {
    const params = new URLSearchParams();
    if (search.trim()) params.set('q', search.trim());
    const response = await api.get<{ vendors: VendorOption[] }>(`/api/v1/admin/vendor-transfers/vendors?${params}`);
    const merged = new Map(vendors.value.map((vendor) => [vendor.vendorId, vendor]));
    response.vendors.forEach((vendor) => merged.set(vendor.vendorId, vendor));
    vendors.value = [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) { errorExperience(error); }
  finally { loadingVendors.value = false; }
}

async function loadHistory() {
  loadingHistory.value = true;
  try {
    const response = await api.get<{ transfers: Transfer[] }>('/api/v1/admin/vendor-transfers?limit=25');
    history.value = response.transfers;
  } catch (error) { errorExperience(error); }
  finally { loadingHistory.value = false; }
}

async function loadPreview() {
  preview.value = null;
  if (!formValid.value) return;
  previewing.value = true;
  try {
    const response = await api.post<{ preview: TransferPreview }>('/api/v1/admin/vendor-transfers/preview', {
      source_vendor_id: sourceVendorId.value,
      destination_vendor_id: destinationVendorId.value,
      amount_minor: amountMinor.value,
    });
    preview.value = response.preview;
  } catch (error) { errorExperience(error); }
  finally { previewing.value = false; }
}

watch([sourceVendorId, destinationVendorId, amountNaira, reason], () => {
  preview.value = null;
  window.clearTimeout(previewTimer);
  previewTimer = window.setTimeout(() => void loadPreview(), 300);
});

watch(vendorSearch, () => {
  window.clearTimeout(searchTimer);
  searchTimer = window.setTimeout(() => void loadVendors(), 300);
});

function reviewTransfer() {
  if (!preview.value) return;
  feedback.value = null;
  confirmOpen.value = true;
}

async function executeTransfer() {
  if (!preview.value || transferring.value) return;
  transferring.value = true;
  try {
    const response = await api.post<{ transfer: Transfer }>('/api/v1/admin/vendor-transfers', {
      source_vendor_id: sourceVendorId.value,
      destination_vendor_id: destinationVendorId.value,
      amount_minor: amountMinor.value,
      reason: reason.value.trim(),
      confirmed: true,
    }, { headers: { 'Idempotency-Key': requestKey.value } });
    receipt.value = response.transfer;
    confirmOpen.value = false;
    feedback.value = {
      tone: 'success', title: 'Transfer completed',
      what: `${naira(response.transfer.amount_minor)} moved from ${source.value?.name} to ${destination.value?.name}.`,
      next: 'Both ledger entries and vendor notifications are recorded. Save the receipt or start another transfer.',
    };
    await Promise.all([loadVendors(), loadHistory()]);
  } catch (error) { confirmOpen.value = false; errorExperience(error); }
  finally { transferring.value = false; }
}

function resetForm() {
  sourceVendorId.value = '';
  destinationVendorId.value = '';
  amountNaira.value = null;
  reason.value = '';
  preview.value = null;
  receipt.value = null;
  feedback.value = null;
  requestKey.value = crypto.randomUUID();
}

onMounted(() => void Promise.all([loadVendors(), loadHistory()]));
</script>

<template>
  <AppShell title="Vendor Transfers">
    <header class="transfer-head">
      <div>
        <p class="eyebrow">Wallet Admin · controlled money movement</p>
        <h1>Transfer vendor balance</h1>
        <p>Move available value between two active vendor wallets. The debit and credit are recorded together.</p>
      </div>
      <div class="bw-row" style="gap: var(--s-2)">
        <WalletExportMenu
          :rows="history"
          :columns="transferExportColumns"
          filename="beverly-admin-vendor-transfers"
          title="Vendor Transfer History"
          subtitle="Controlled wallet movements"
          :loading="loadingHistory"
        />
        <button class="bw-btn" type="button" @click="resetForm">Start another transfer</button>
      </div>
    </header>

    <section v-if="feedback" :class="['experience-message', feedback.tone]" :role="feedback.tone === 'error' ? 'alert' : 'status'" aria-live="polite">
      <div><strong>{{ feedback.title }}</strong></div>
      <dl><dt>What happened</dt><dd>{{ feedback.what }}</dd><dt>What to do next</dt><dd>{{ feedback.next }}</dd></dl>
    </section>

    <div class="transfer-layout">
      <section class="transfer-card" aria-labelledby="transfer-form-title">
        <div class="section-title"><span>1</span><div><h2 id="transfer-form-title">Set transfer details</h2><p>Select two different approved vendors.</p></div></div>
        <div class="field-grid">
          <label class="reason-field">Search approved vendors<input v-model="vendorSearch" class="bw-input" type="search" placeholder="Search by legal or trading name" /></label>
          <label>Source vendor
            <select v-model="sourceVendorId" class="bw-input" :disabled="loadingVendors">
              <option value="">Choose source vendor</option>
              <option v-for="vendor in vendors" :key="vendor.vendorId" :value="vendor.vendorId" :disabled="vendor.vendorId === destinationVendorId">{{ vendor.name }} · {{ naira(vendor.availableMinor) }}</option>
            </select>
          </label>
          <label>Destination vendor
            <select v-model="destinationVendorId" class="bw-input" :disabled="loadingVendors">
              <option value="">Choose destination vendor</option>
              <option v-for="vendor in vendors" :key="vendor.vendorId" :value="vendor.vendorId" :disabled="vendor.vendorId === sourceVendorId">{{ vendor.name }}</option>
            </select>
          </label>
          <label>Amount (₦)<input v-model.number="amountNaira" class="bw-input" type="number" min="0.01" step="0.01" placeholder="0.00" /></label>
          <label class="reason-field">Reason<textarea v-model="reason" class="bw-input" rows="3" maxlength="500" placeholder="Explain why this balance is being transferred." /></label>
        </div>

        <div class="balance-rail" aria-live="polite">
          <article><span>Source · debit</span><strong>{{ source ? naira(source.availableMinor) : 'Choose vendor' }}</strong><small>Available balance</small></article>
          <div class="rail-amount"><span>−</span><strong>{{ amountMinor > 0 ? naira(amountMinor) : '₦0.00' }}</strong><span>+</span></div>
          <article><span>Destination · credit</span><strong>{{ destination ? destination.name : 'Choose vendor' }}</strong><small>Receives the same value</small></article>
        </div>

        <div v-if="previewing" class="preview-state" role="status">Checking balances and wallet status…</div>
        <div v-else-if="preview" class="preview-state ready">
          <span>After transfer: {{ source?.name }} {{ naira(preview.sourceBalanceAfterMinor) }}</span>
          <span>{{ destination?.name }} {{ naira(preview.destinationBalanceAfterMinor) }}</span>
        </div>
        <button class="bw-btn primary review-btn" type="button" :disabled="!preview || previewing" @click="reviewTransfer">Review transfer</button>
      </section>

      <aside class="transfer-card history-card">
        <div class="section-title"><span>2</span><div><h2>Recent transfers</h2><p>Completed, immutable vendor balance movements.</p></div></div>
        <div v-if="loadingHistory" class="history-empty">Loading transfer history…</div>
        <div v-else-if="!history.length" class="history-empty">No vendor transfers yet.</div>
        <button v-for="item in history" :key="item.id" class="history-row" type="button" @click="receipt = item">
          <span><strong>{{ item.source_vendor_name }} → {{ item.destination_vendor_name }}</strong><small>{{ shortDate(item.created_at) }} · {{ item.id.slice(0, 8) }}</small></span>
          <strong>{{ naira(item.amount_minor) }}</strong>
        </button>
      </aside>
    </div>

    <section v-if="receipt" class="transfer-card receipt" aria-live="polite">
      <div><p class="eyebrow">Transfer receipt</p><h2>{{ naira(receipt.amount_minor) }} transferred</h2><p>{{ receipt.source_vendor_name }} → {{ receipt.destination_vendor_name }}</p></div>
      <dl><dt>Status</dt><dd>{{ receipt.status }}</dd><dt>Reference</dt><dd>{{ receipt.id }}</dd><dt>Reason</dt><dd>{{ receipt.reason }}</dd><dt>Completed</dt><dd>{{ shortDate(receipt.created_at) }}</dd></dl>
    </section>

    <ConfirmDialog v-model:open="confirmOpen" title="Approve and confirm vendor transfer" confirm-label="Confirm and transfer" tone="warn" :loading="transferring" :disable-confirm="!preview" @confirm="executeTransfer">
      <div class="confirm-summary">
        <p><span>From</span><strong>{{ source?.name }}</strong></p><p><span>To</span><strong>{{ destination?.name }}</strong></p><p><span>Amount</span><strong>{{ naira(amountMinor) }}</strong></p><p><span>Reason</span><strong>{{ reason }}</strong></p>
        <small>Approval executes immediately. Idempotency-Key: {{ requestKey }}</small>
      </div>
    </ConfirmDialog>
  </AppShell>
</template>

<style scoped>
.transfer-head,.section-title,.balance-rail,.preview-state,.history-row,.receipt{display:flex;align-items:center;justify-content:space-between;gap:var(--s-4)}
.transfer-head{margin-bottom:var(--s-4)}
.transfer-head h1,.section-title h2,.receipt h2{margin:0;color:var(--text)}
.transfer-head p,.section-title p,.receipt p{margin:var(--s-1) 0 0;color:var(--text-muted)}
.eyebrow{font-size:var(--t-xs);font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--brand)!important}
.transfer-layout{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(280px,.8fr);gap:var(--s-4);align-items:start}
.transfer-card{background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:var(--r-lg);padding:var(--s-5);box-shadow:var(--glass-shadow-card)}
.section-title{justify-content:flex-start;margin-bottom:var(--s-4)}
.section-title>span{display:grid;place-items:center;width:32px;height:32px;border-radius:var(--r-md);background:var(--brand);color:var(--surface-1);font-weight:800}
.section-title h2{font-size:var(--t-lg)}
.field-grid{display:grid;grid-template-columns:1fr 1fr;gap:var(--s-4)}
.field-grid label{display:grid;gap:var(--s-2);font-size:var(--t-sm);font-weight:650;color:var(--text)}
.reason-field{grid-column:1/-1}
.balance-rail{margin:var(--s-5) 0;padding:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)}
.balance-rail article{display:grid;gap:var(--s-1);flex:1}.balance-rail article:last-child{text-align:right}.balance-rail article span,.balance-rail small{font-size:var(--t-xs);color:var(--text-muted)}
.balance-rail article strong{font-size:var(--t-lg)}
.rail-amount{display:flex;align-items:center;gap:var(--s-2);padding:var(--s-2) var(--s-3);border-radius:999px;background:var(--surface-1);border:1px solid var(--brand);color:var(--brand)}
.preview-state{font-size:var(--t-sm);padding:var(--s-3);border-radius:var(--r-md);background:var(--surface-2);color:var(--text-muted)}
.preview-state.ready{border:1px solid var(--brand);color:var(--text)}
.review-btn{width:100%;justify-content:center;margin-top:var(--s-3)}
.experience-message{padding:var(--s-4);margin-bottom:var(--s-4);border:1px solid var(--border);border-radius:var(--r-lg);background:var(--surface-2)}
.experience-message.error{border-color:var(--danger)}.experience-message.success{border-color:var(--brand)}
.experience-message dl{display:grid;grid-template-columns:140px 1fr;gap:var(--s-1) var(--s-3);margin:var(--s-2) 0 0}.experience-message dt{font-weight:700}.experience-message dd{margin:0;color:var(--text-muted)}
.history-card{padding:var(--s-4)}.history-row{width:100%;text-align:left;padding:var(--s-3) 0;border:0;border-top:1px solid var(--border);background:transparent;color:var(--text);cursor:pointer}.history-row span{display:grid;gap:var(--s-1)}.history-row small,.history-empty{color:var(--text-muted)}.history-empty{padding:var(--s-5);text-align:center}
.receipt{margin-top:var(--s-4);align-items:flex-start}.receipt dl{display:grid;grid-template-columns:auto 1fr;gap:var(--s-1) var(--s-3);margin:0;max-width:540px}.receipt dt{color:var(--text-muted)}.receipt dd{margin:0;word-break:break-word}
.confirm-summary{display:grid;gap:var(--s-2)}.confirm-summary p{display:flex;justify-content:space-between;gap:var(--s-3);margin:0;padding-bottom:var(--s-2);border-bottom:1px solid var(--border)}.confirm-summary span,.confirm-summary small{color:var(--text-muted)}
@media (max-width: 720px){.transfer-head,.receipt{align-items:flex-start;flex-direction:column}.transfer-layout,.field-grid{grid-template-columns:1fr}.balance-rail{align-items:stretch;flex-direction:column}.balance-rail article:last-child{text-align:left}.rail-amount{justify-content:space-between}.experience-message dl,.receipt dl{grid-template-columns:1fr}.history-card{order:2}}
</style>
