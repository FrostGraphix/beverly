<template>
  <AppShell title="Feature Flags">
    <template #topbar-end>
      <button class="bw-btn bw-btn-primary" @click="showNew = true">+ New Flag</button>
    </template>

    <div v-if="loading" class="bw-loading">Loading…</div>
    <div v-else-if="error" class="bw-error-banner">{{ error }}</div>

    <div v-else>
      <div class="bw-table-wrapper">
        <table class="bw-table">
          <thead>
            <tr>
              <th>Key</th>
              <th>Description</th>
              <th>Status</th>
              <th>Rollout</th>
              <th>Regions</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="f in flags" :key="f.key">
              <td class="bw-mono bw-text-sm">{{ f.key }}</td>
              <td class="bw-text-sm">{{ f.description }}</td>
              <td>
                <span :class="f.enabled ? 'bw-badge-success' : 'bw-badge-neutral'" class="bw-badge">
                  {{ f.enabled ? 'ON' : 'OFF' }}
                </span>
              </td>
              <td class="bw-text-sm">{{ f.rollout_percent }}%</td>
              <td class="bw-text-sm">{{ f.regions?.length ? f.regions.join(', ') : 'All' }}</td>
              <td class="bw-text-sm">{{ fmtDate(f.updated_at) }}</td>
              <td><button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEdit(f)">Edit</button></td>
            </tr>
            <tr v-if="!flags.length">
              <td colspan="7" class="bw-empty">No flags found.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Mobile cards (≤640px) -->
      <div class="bw-t-cards">
        <div v-if="!flags.length" class="bw-empty">No flags found.</div>
        <div v-for="f in flags" :key="f.key" class="bw-tc">
          <div class="bw-tc-head">
            <span class="bw-mono" style="font-size:var(--t-sm)">{{ f.key }}</span>
            <span :class="f.enabled ? 'bw-badge-success' : 'bw-badge-neutral'" class="bw-badge">{{ f.enabled ? 'ON' : 'OFF' }}</span>
          </div>
          <div class="bw-tc-mid">
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Rollout</span><span class="bw-tc-pair-val">{{ f.rollout_percent }}%</span></div>
            <div class="bw-tc-pair"><span class="bw-tc-pair-label">Regions</span><span class="bw-tc-pair-val">{{ f.regions?.length ? f.regions.join(', ') : 'All' }}</span></div>
          </div>
          <div class="bw-tc-foot">
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEdit(f)">Edit</button>
          </div>
        </div>
      </div>
    </div>

    <!-- Edit Modal -->
    <div v-if="editing" class="bw-modal-backdrop" @click.self="editing = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2 class="bw-mono">{{ editing.key }}</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editing = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <p class="bw-text-sm bw-text-muted">{{ editing.description }}</p>

          <div class="bw-flag-toggle">
            <label class="bw-label">Enabled</label>
            <button :class="['bw-toggle', editForm.enabled ? 'bw-toggle-on' : '']" @click="editForm.enabled = !editForm.enabled">
              {{ editForm.enabled ? 'ON' : 'OFF' }}
            </button>
          </div>

          <div class="bw-form-group">
            <label class="bw-label">Rollout %</label>
            <input v-model.number="editForm.rollout_percent" type="range" min="0" max="100" class="bw-range" />
            <span class="bw-text-sm bw-text-muted">{{ editForm.rollout_percent }}%</span>
          </div>

          <div class="bw-form-group">
            <label class="bw-label">Regions (comma-separated, leave blank for all)</label>
            <input v-model="editForm.regionsRaw" class="bw-input" placeholder="e.g. Lagos, Abuja" />
          </div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="editing = null">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="saveEdit">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>

    <!-- New Flag Modal -->
    <div v-if="showNew" class="bw-modal-backdrop" @click.self="showNew = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>New Feature Flag</h2>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="showNew = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Key * <span class="bw-text-muted">(lowercase, dots/dashes only)</span></label>
            <input v-model="newForm.key" class="bw-input bw-mono" placeholder="feature.name" />
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Description *</label>
            <input v-model="newForm.description" class="bw-input" placeholder="What does this flag control?" />
          </div>
          <div v-if="newError" class="bw-error-banner">{{ newError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="showNew = false">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="createFlag">
            {{ saving ? 'Creating…' : 'Create' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

const flags   = ref<any[]>([]);
const loading = ref(false);
const error   = ref('');
const saving  = ref(false);
const editing = ref<any>(null);
const showNew = ref(false);
const newError = ref('');

const editForm = ref({ enabled: false, rollout_percent: 0, regionsRaw: '' });
const newForm  = ref({ key: '', description: '' });

async function load() {
  loading.value = true;
  error.value   = '';
  try {
    const res = await api.get<{ flags?: any[] }>('/api/v1/admin/feature-flags');
    flags.value = (res.flags ?? []).sort((a: any, b: any) => a.key.localeCompare(b.key));
  } catch (e: any) {
    error.value = e.message ?? 'Failed to load flags';
  } finally {
    loading.value = false;
  }
}

function openEdit(f: any) {
  editing.value = f;
  editForm.value = {
    enabled:         f.enabled,
    rollout_percent: f.rollout_percent,
    regionsRaw:      (f.regions ?? []).join(', '),
  };
}

async function saveEdit() {
  if (!editing.value) return;
  saving.value = true;
  try {
    const regions = editForm.value.regionsRaw
      ? editForm.value.regionsRaw.split(',').map((s: string) => s.trim()).filter(Boolean)
      : [];
    await api.patch(`/api/v1/admin/feature-flags/${encodeURIComponent(editing.value.key)}`, {
      enabled:         editForm.value.enabled,
      rollout_percent: editForm.value.rollout_percent,
      regions,
    });
    await load();
    editing.value = null;
  } catch (e: any) {
    error.value = e.message ?? 'Failed to save flag';
  } finally {
    saving.value = false;
  }
}

async function createFlag() {
  newError.value = '';
  if (!newForm.value.key || !newForm.value.description) {
    newError.value = 'Key and description are required.';
    return;
  }
  saving.value = true;
  try {
    await api.post('/api/v1/admin/feature-flags', newForm.value);
    showNew.value = false;
    newForm.value = { key: '', description: '' };
    await load();
  } catch (e: any) {
    newError.value = e.message ?? 'Failed to create flag';
  } finally {
    saving.value = false;
  }
}

function fmtDate(s: string) { return s ? new Date(s).toLocaleString() : '—'; }

onMounted(load);
</script>

<style scoped>
.bw-flag-toggle { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
.bw-toggle {
  padding: .25rem .75rem;
  border-radius: var(--r-md);
  border: 1.5px solid var(--border);
  background: var(--surface);
  cursor: pointer;
  font-weight: 600;
  font-size: .8rem;
  transition: background 0.15s, border-color 0.15s;
}
.bw-toggle-on { background: var(--brand); border-color: var(--brand); color: white; }
.bw-range { width: 100%; accent-color: var(--brand); }
.bw-tc-foot { padding: var(--s-3) var(--s-4); border-top: 1px solid var(--border); }
</style>
