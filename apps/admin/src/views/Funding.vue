<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api, naira, shortDate } from '../lib/api';

interface FundingRequest {
    id: string;
    vendor_organization_id: string;
    amount_minor: number;
    channel: 'bank_transfer' | 'paystack' | 'manual';
    status: string;
    proof_file_path: string | null;
    submitted_by: string;
    created_at: string;
}

const items = ref<FundingRequest[]>([]);
const loading = ref(false);
const rejectFor = ref<FundingRequest | null>(null);
const rejectReason = ref('');

async function load() {
    loading.value = true;
    try {
        const r = await api.get<{ funding: FundingRequest[] }>('/api/v1/admin/funding/pending');
        items.value = r.funding;
    } finally { loading.value = false; }
}

async function approve(f: FundingRequest) {
    if (!confirm(`Approve ${naira(f.amount_minor)} for #${f.vendor_organization_id.slice(0, 8)}?`)) return;
    try {
        await api.post(`/api/v1/admin/funding/${f.id}/approve`);
        await load();
    } catch (e: any) {
        alert(e?.message ?? 'Approve failed');
    }
}

async function submitReject() {
    if (!rejectFor.value || !rejectReason.value.trim()) return;
    try {
        await api.post(`/api/v1/admin/funding/${rejectFor.value.id}/reject`, { reason: rejectReason.value });
        rejectFor.value = null; rejectReason.value = '';
        await load();
    } catch (e: any) {
        alert(e?.message ?? 'Reject failed');
    }
}

onMounted(load);
</script>

<template>
  <AppShell title="Funding Approvals">
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <div>
          <h2 class="bw-h2" style="margin: 0">Pending funding</h2>
          <p class="bw-muted" style="font-size: var(--t-xs); margin: 2px 0 0">Maker-checker · approver must differ from submitter.</p>
        </div>
      </div>
      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Vendor</th>
              <th>Channel</th>
              <th>Proof</th>
              <th style="text-align:right">Amount</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in items" :key="f.id">
              <td class="bw-mono bw-muted">{{ shortDate(f.created_at) }}</td>
              <td class="bw-mono">#{{ f.vendor_organization_id.slice(0, 8) }}</td>
              <td><span class="bw-badge neutral">{{ f.channel }}</span></td>
              <td>
                <a v-if="f.proof_file_path" :href="f.proof_file_path" target="_blank" rel="noopener" class="bw-mono" style="color: var(--brand); font-size: var(--t-xs)">view</a>
                <span v-else class="bw-muted">—</span>
              </td>
              <td class="bw-money" style="text-align: right">{{ naira(f.amount_minor) }}</td>
              <td><span class="bw-badge warn">{{ f.status }}</span></td>
              <td>
                <div class="bw-row" style="gap: 4px; justify-content: flex-end">
                  <button class="bw-btn sm primary" @click="approve(f)">Approve</button>
                  <button class="bw-btn sm danger" @click="rejectFor = f">Reject</button>
                </div>
              </td>
            </tr>
            <tr v-if="!items.length && !loading">
              <td colspan="7" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Reject modal -->
    <div v-if="rejectFor" class="bw-modal-backdrop">
      <div class="bw-modal">
        <div class="bw-modal-head">
          <h2 class="bw-modal-title">Reject funding</h2>
        </div>
        <p class="bw-muted" style="font-size: var(--t-sm); margin: 0 0 var(--s-3)">
          {{ naira(rejectFor.amount_minor) }} · #{{ rejectFor.id.slice(0, 8) }}
        </p>
        <label class="bw-label">Reason (required)</label>
        <textarea class="bw-input" v-model="rejectReason" rows="3"></textarea>
        <div class="bw-row" style="margin-top: var(--s-4); gap: var(--s-2); justify-content: flex-end">
          <button class="bw-btn" @click="rejectFor = null">Cancel</button>
          <button class="bw-btn danger" :disabled="!rejectReason.trim()" @click="submitReject">Reject</button>
        </div>
      </div>
    </div>
  </AppShell>
</template>
