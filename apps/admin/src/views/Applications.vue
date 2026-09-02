<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';
import WalletExportWizard from '@beverly/tokens/WalletExportWizard.vue';
import WalletDataViewSwitch from '@beverly/tokens/WalletDataViewSwitch.vue';
import WalletTablePagination from '@beverly/tokens/WalletTablePagination.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';

interface Application {
    id: string;
    legal_name: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
    business_type: string | null;
    operating_stations: string[] | null;
    notes: string | null;
    status: string;
    created_at: string;
}

const router = useRouter();
const auth = useStaffAuthStore();
const apps = ref<Application[]>([]);
const loading = ref(false);
const deletingId = ref<string | null>(null);
const deleteOpen = ref(false);
const deleteTarget = ref<Application | null>(null);
const error = ref('');
const status = ref<'submitted' | 'contacted' | 'rejected' | 'converted'>('submitted');
const search = ref('');
const viewMode = ref<'table' | 'list'>('table');
const currentPage = ref(1);
const pageSize = ref(10);
const updatingId = ref<string | null>(null);
const filteredApps = computed(() => {
    const query = search.value.trim().toLowerCase();
    if (!query) return apps.value;
    return apps.value.filter((item) => [item.legal_name, item.contact_name, item.contact_email, item.contact_phone, item.business_type, ...(item.operating_stations ?? [])]
        .some((value) => String(value ?? '').toLowerCase().includes(query)));
});
const paginatedApps = computed(() => {
    const start = (currentPage.value - 1) * pageSize.value;
    return filteredApps.value.slice(start, start + pageSize.value);
});
const applicationExportColumns: WalletExportColumn<Application>[] = [
    { key: 'created_at', header: 'Submitted', value: (item) => shortDate(item.created_at) },
    { key: 'legal_name', header: 'Business', value: (item) => item.legal_name },
    { key: 'contact_name', header: 'Contact', value: (item) => item.contact_name },
    { key: 'contact_email', header: 'Email', value: (item) => item.contact_email },
    { key: 'contact_phone', header: 'Phone', value: (item) => item.contact_phone },
    { key: 'business_type', header: 'Type', value: (item) => item.business_type || '' },
    { key: 'operating_stations', header: 'Stations', value: (item) => item.operating_stations?.join('; ') || '' },
    { key: 'status', header: 'Status', value: (item) => item.status },
];

async function load() {
    loading.value = true;
    error.value = '';
    try {
        const r = await api.get<{ applications: Application[] }>(`/api/v1/admin/vendor-applications?status=${status.value}`);
        apps.value = r.applications;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not load applications.';
    } finally { loading.value = false; }
}

function convertToVendor(app: Application) {
    void router.push({
        name: 'vendor-new',
        query: {
            source: app.id,
            legalName: app.legal_name,
            email: app.contact_email,
            phone: app.contact_phone,
            primaryName: app.contact_name,
        },
    });
}

function askDeleteApplication(app: Application) {
    deleteTarget.value = app;
    deleteOpen.value = true;
}

async function deleteApplication() {
    if (!deleteTarget.value) return;
    const app = deleteTarget.value;
    deletingId.value = app.id;
    error.value = '';
    try {
        await api.del(`/api/v1/admin/vendor-applications/${encodeURIComponent(app.id)}`);
        apps.value = apps.value.filter((item) => item.id !== app.id);
        deleteOpen.value = false;
        deleteTarget.value = null;
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not delete application.';
    } finally {
        deletingId.value = null;
    }
}

async function updateApplicationStatus(app: Application, next: Application['status']) {
    updatingId.value = app.id;
    error.value = '';
    try {
        await api.patch(`/api/v1/admin/vendor-applications/${encodeURIComponent(app.id)}/status`, { status: next });
        await load();
    } catch (e) {
        error.value = e instanceof Error ? e.message : 'Could not update application.';
    } finally { updatingId.value = null; }
}

onMounted(load);
</script>

<template>
  <AppShell title="Vendor Applications">
    <div class="bw-card applications-card" :data-view="viewMode" style="padding: 0">
      <div class="bw-table-head-bar">
        <div><h2 class="bw-h2" style="margin: 0">Public interest submissions</h2><p class="bw-muted app-subtitle">Review, contact, convert, export.</p></div>
        <div class="applications-toolbar">
        <WalletExportWizard
          :rows="filteredApps"
          :columns="applicationExportColumns"
          filename="beverly-admin-vendor-applications"
          title="Vendor Applications"
          :subtitle="`${status} applications`"
          :loading="loading"
          :status-options="[{ value: 'submitted', label: 'Submitted' }, { value: 'contacted', label: 'Contacted' }, { value: 'rejected', label: 'Rejected' }, { value: 'converted', label: 'Converted' }]"
          :initial-status="status"
          :date-value="(row: Application) => row.created_at"
          :status-value="(row: Application) => row.status"
        />
        <WalletDataViewSwitch v-model="viewMode" label="Application display view" />
        </div>
      </div>
      <div class="applications-filters">
        <input v-model="search" class="bw-input" placeholder="Search business or contact" aria-label="Search applications" @input="currentPage = 1" />
        <div class="bw-row" style="gap: 2px">
          <button
            v-for="s in (['submitted','contacted','rejected','converted'] as const)"
            :key="s"
            :class="['bw-btn sm', status === s ? 'primary' : '']"
            @click="status = s; void load()"
          >
            {{ s }}
          </button>
        </div>
      </div>

      <div v-if="error" class="bw-banner error" role="alert" style="margin: var(--s-4)">
        {{ error }}
      </div>

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Business</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Stations</th>
              <th class="actions-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="a in paginatedApps" :key="a.id">
              <td class="bw-mono bw-muted">{{ shortDate(a.created_at) }}</td>
              <td><strong>{{ a.legal_name }}</strong></td>
              <td>
                <div>{{ a.contact_name }}</div>
                <div class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ a.contact_email }}</div>
              </td>
              <td>{{ a.business_type || '—' }}</td>
              <td>{{ a.operating_stations?.join(', ') || '—' }}</td>
              <td class="actions-col">
                <div class="app-actions">
                  <button v-if="status === 'submitted'" class="bw-btn sm" :disabled="updatingId === a.id" @click="updateApplicationStatus(a, 'contacted')">Contacted</button>
                  <button v-if="status === 'submitted' || status === 'contacted'" class="bw-btn sm primary" @click="convertToVendor(a)">Convert</button>
                  <button v-if="status !== 'rejected' && status !== 'converted'" class="bw-btn sm danger" :disabled="updatingId === a.id" @click="updateApplicationStatus(a, 'rejected')">Reject</button>
                  <button v-if="auth.hasPermission('wallet.vendors.manage')" class="bw-btn sm danger" :disabled="deletingId === a.id" @click="askDeleteApplication(a)">
                    {{ deletingId === a.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
                <MobileActionMenu label="Application actions">
                  <button v-if="status === 'submitted'" class="mobile-action-item" @click="updateApplicationStatus(a, 'contacted')">Mark contacted</button>
                  <button v-if="status === 'submitted' || status === 'contacted'" class="mobile-action-item primary" @click="convertToVendor(a)">Convert</button>
                  <button v-if="status !== 'rejected' && status !== 'converted'" class="mobile-action-item danger" @click="updateApplicationStatus(a, 'rejected')">Reject</button>
                  <button v-if="auth.hasPermission('wallet.vendors.manage')" class="mobile-action-item danger" :disabled="deletingId === a.id" @click="askDeleteApplication(a)">
                    {{ deletingId === a.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </MobileActionMenu>
              </td>
            </tr>
            <tr v-if="!apps.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="bw-t-cards">
        <div v-for="a in paginatedApps" :key="`app-card-${a.id}`" class="bw-tc">
          <div class="bw-tc-top">
            <div>
              <div class="bw-tc-vendor">{{ a.legal_name }}</div>
              <div class="bw-tc-id">{{ shortDate(a.created_at) }}</div>
            </div>
            <span class="bw-badge info">{{ a.business_type || 'Retail' }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair">
              <span class="bw-tc-pair-label">Contact</span>
              <span class="bw-tc-pair-val">{{ a.contact_name }}</span>
              <span class="bw-muted bw-mono" style="font-size: var(--t-xs)">{{ a.contact_email }}</span>
            </div>
            <div class="bw-tc-pair" v-if="a.operating_stations?.length">
              <span class="bw-tc-pair-label">Stations</span>
              <span class="bw-tc-pair-val">{{ a.operating_stations.join(', ') }}</span>
            </div>
          </div>
          <div class="bw-row" style="gap: 6px; margin-top: 4px;">
            <button v-if="status === 'submitted'" class="bw-btn sm" @click="updateApplicationStatus(a, 'contacted')">Contacted</button>
            <button v-if="status === 'submitted' || status === 'contacted'" class="bw-btn sm primary" @click="convertToVendor(a)">Convert</button>
            <button v-if="status !== 'rejected' && status !== 'converted'" class="bw-btn sm danger" @click="updateApplicationStatus(a, 'rejected')">Reject</button>
            <button v-if="auth.hasPermission('wallet.vendors.manage')" class="bw-btn sm danger" :disabled="deletingId === a.id" @click="askDeleteApplication(a)">
              {{ deletingId === a.id ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
        <div v-if="!apps.length && !loading" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</div>
      </div>
      <WalletTablePagination v-model:page="currentPage" v-model:pageSize="pageSize" :total-items="filteredApps.length" item-label="applications" :loading="loading" />
    </div>

    <ConfirmDialog
      v-model:open="deleteOpen"
      title="Delete application"
      :description="deleteTarget
        ? `Delete ${deleteTarget.legal_name || deleteTarget.contact_email || 'this application'} from the review queue?`
        : ''"
      confirm-label="Delete application"
      tone="danger"
      :loading="Boolean(deletingId)"
      @confirm="deleteApplication"
    />
  </AppShell>
</template>

<style scoped>
.actions-col {
  min-width: 170px;
}

.app-actions {
  display: flex;
  gap: var(--s-2);
  justify-content: flex-end;
}
.app-subtitle { margin:4px 0 0; font-size:var(--t-xs); }
.applications-toolbar, .applications-filters { display:flex; align-items:center; gap:var(--s-2); flex-wrap:wrap; }
.applications-filters { justify-content:space-between; padding:var(--s-3) var(--s-4); border-bottom:1px solid var(--border); background:var(--surface-2); }
.applications-filters .bw-input { width:min(320px, 100%); }

@media (max-width: 720px) {
  .applications-toolbar { width:100%; justify-content:space-between; }
  .applications-filters { align-items:stretch; }
  .applications-filters .bw-input, .applications-filters .bw-row { width:100%; }
  .applications-filters .bw-row { overflow-x:auto; flex-wrap:nowrap; padding-bottom:3px; }
  .actions-col {
    min-width: 72px;
    position: sticky;
    right: 0;
    background: var(--glass-bg-strong);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    z-index: 3;
  }

  .app-actions {
    display: none;
  }
}
</style>
