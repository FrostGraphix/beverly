<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import ConfirmDialog from '../components/ConfirmDialog.vue';
import MobileActionMenu from '../components/MobileActionMenu.vue';
import { api, shortDate } from '../lib/api';
import { useStaffAuthStore } from '../stores/auth';

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

onMounted(load);
</script>

<template>
  <AppShell title="Vendor Applications">
    <div class="bw-card" style="padding: 0">
      <div class="bw-table-head-bar">
        <h2 class="bw-h2" style="margin: 0">Public interest submissions</h2>
        <span class="bw-spacer"></span>
        <div class="bw-row" style="gap: 2px">
          <button v-for="s in (['submitted','contacted','rejected','converted'] as const)" :key="s"
                  :class="['bw-btn sm', status === s ? 'primary' : '']"
                  @click="status = s; void load()">{{ s }}</button>
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
            <tr v-for="a in apps" :key="a.id">
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
                  <button v-if="status === 'submitted'" class="bw-btn sm primary" @click="convertToVendor(a)">Approve</button>
                  <button v-if="auth.hasPermission('wallet.vendors.manage')" class="bw-btn sm danger" :disabled="deletingId === a.id" @click="askDeleteApplication(a)">
                    {{ deletingId === a.id ? 'Deleting...' : 'Delete' }}
                  </button>
                </div>
                <MobileActionMenu label="Application actions">
                  <button v-if="status === 'submitted'" class="mobile-action-item primary" @click="convertToVendor(a)">Approve</button>
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
        <div v-for="a in apps" :key="`app-card-${a.id}`" class="bw-tc">
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
            <button v-if="status === 'submitted'" class="bw-btn sm primary" @click="convertToVendor(a)">Approve</button>
            <button v-if="auth.hasPermission('wallet.vendors.manage')" class="bw-btn sm danger" :disabled="deletingId === a.id" @click="askDeleteApplication(a)">
              {{ deletingId === a.id ? 'Deleting...' : 'Delete' }}
            </button>
          </div>
        </div>
        <div v-if="!apps.length && !loading" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</div>
      </div>
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

@media (max-width: 720px) {
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
