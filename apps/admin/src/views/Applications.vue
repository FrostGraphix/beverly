<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api, shortDate } from '../lib/api';

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
const apps = ref<Application[]>([]);
const loading = ref(false);
const status = ref<'submitted' | 'contacted' | 'rejected' | 'converted'>('submitted');

async function load() {
    loading.value = true;
    try {
        const r = await api.get<{ applications: Application[] }>(`/api/v1/admin/vendor-applications?status=${status.value}`);
        apps.value = r.applications;
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

      <div class="bw-t-wrap">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Submitted</th>
              <th>Business</th>
              <th>Contact</th>
              <th>Type</th>
              <th>Stations</th>
              <th></th>
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
              <td>
                <div class="bw-row" style="gap: var(--s-2); justify-content: flex-end">
                  <button v-if="status === 'submitted'" class="bw-btn sm primary" @click="convertToVendor(a)">Approve</button>
                </div>
              </td>
            </tr>
            <tr v-if="!apps.length && !loading">
              <td colspan="6" class="bw-muted" style="text-align: center; padding: var(--s-6)">Queue clear.</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </AppShell>
</template>
