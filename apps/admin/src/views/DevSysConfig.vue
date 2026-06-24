<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { api } from '../lib/api';
import AppShell from '../components/AppShell.vue';

/* ── System Config ── */
interface ConfigEntry {
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  category: string;
  updated_at: string;
  updated_by: string | null;
}

/* ── Notification Templates ── */
interface NotifTemplate {
  id: string;
  name: string;
  channel: 'sms' | 'email';
  event: string;
  subject: string | null;
  body: string;
  variables: string[];
  updated_at: string;
}

const tab = ref<'config' | 'templates'>('config');

// --- Config ---
const configs    = ref<ConfigEntry[]>([]);
const cfgLoading = ref(false);
const cfgError   = ref('');
const editing    = ref<ConfigEntry | null>(null);
const editVal    = ref('');
const saving     = ref(false);
const saveErr    = ref('');
const cfgSearch  = ref('');
const cfgCat     = ref('');

const categories = computed(() => [...new Set(configs.value.map(c => c.category))].sort());
const filtered   = computed(() => configs.value.filter(c => {
  if (cfgCat.value && c.category !== cfgCat.value) return false;
  if (cfgSearch.value && !c.key.toLowerCase().includes(cfgSearch.value.toLowerCase()) &&
      !c.description.toLowerCase().includes(cfgSearch.value.toLowerCase())) return false;
  return true;
}));

async function loadConfigs() {
  cfgLoading.value = true; cfgError.value = '';
  try {
    const r = await api.get<{ configs: ConfigEntry[] }>('/api/v1/admin/dev/sys-config');
    configs.value = r.configs ?? [];
  } catch (e: any) { cfgError.value = e.message ?? 'Failed to load'; }
  finally { cfgLoading.value = false; }
}

function openEdit(c: ConfigEntry) {
  editing.value = c;
  editVal.value = c.value;
  saveErr.value = '';
}

async function saveConfig() {
  if (!editing.value) return;
  saveErr.value = '';
  saving.value = true;
  try {
    await api.put(`/api/v1/admin/dev/sys-config/${encodeURIComponent(editing.value.key)}`, {
      value: editVal.value,
    });
    editing.value = null;
    await loadConfigs();
  } catch (e: any) { saveErr.value = e.message ?? 'Failed to save'; }
  finally { saving.value = false; }
}

// --- Templates ---
const templates   = ref<NotifTemplate[]>([]);
const tplLoading  = ref(false);
const tplError    = ref('');
const editTpl     = ref<NotifTemplate | null>(null);
const tplForm     = ref({ subject: '', body: '' });
const tplSaving   = ref(false);
const tplSaveErr  = ref('');
const previewVars = ref<Record<string, string>>({});
const testSending = ref(false);
const testTarget  = ref('');
const testResult  = ref<string | null>(null);

const previewBody = computed(() => {
  if (!editTpl.value) return '';
  let body = tplForm.value.body;
  for (const [k, v] of Object.entries(previewVars.value)) {
    body = body.replaceAll(`{{${k}}}`, v || `[${k}]`);
  }
  return body;
});

async function loadTemplates() {
  tplLoading.value = true; tplError.value = '';
  try {
    const r = await api.get<{ templates: NotifTemplate[] }>('/api/v1/admin/dev/notif-templates');
    templates.value = r.templates ?? [];
  } catch (e: any) { tplError.value = e.message ?? 'Failed to load'; }
  finally { tplLoading.value = false; }
}

function openTpl(t: NotifTemplate) {
  editTpl.value = t;
  tplForm.value = { subject: t.subject ?? '', body: t.body };
  tplSaveErr.value = '';
  testResult.value = null;
  testTarget.value = '';
  const vars: Record<string, string> = {};
  t.variables.forEach(v => { vars[v] = ''; });
  previewVars.value = vars;
}

async function saveTpl() {
  if (!editTpl.value) return;
  tplSaveErr.value = '';
  tplSaving.value = true;
  try {
    await api.put(`/api/v1/admin/dev/notif-templates/${editTpl.value.id}`, {
      subject: tplForm.value.subject || null,
      body: tplForm.value.body,
    });
    await loadTemplates();
    const updated = templates.value.find(t => t.id === editTpl.value!.id);
    if (updated) editTpl.value = updated;
  } catch (e: any) { tplSaveErr.value = e.message ?? 'Failed to save'; }
  finally { tplSaving.value = false; }
}

async function testSend() {
  if (!editTpl.value || !testTarget.value.trim()) return;
  testSending.value = true; testResult.value = null;
  try {
    await api.post(`/api/v1/admin/dev/notif-templates/${editTpl.value.id}/test-send`, {
      target: testTarget.value.trim(),
      variables: previewVars.value,
    });
    testResult.value = `✓ Test ${editTpl.value.channel} sent to ${testTarget.value}`;
  } catch (e: any) { testResult.value = `✗ ${e.message ?? 'Send failed'}`; }
  finally { testSending.value = false; }
}

function switchTab(t: typeof tab.value) {
  tab.value = t;
  if (t === 'templates' && !templates.value.length) loadTemplates();
}

function fmt(s: string) {
  return new Date(s).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
}

function displayVal(c: ConfigEntry) {
  if (c.type === 'boolean') return c.value === 'true' ? 'true' : 'false';
  if (c.value.length > 60) return c.value.slice(0, 60) + '…';
  return c.value;
}

function variableToken(name: string) {
  return `{{${name}}}`;
}

onMounted(loadConfigs);
</script>

<template>
  <AppShell title="System Configuration">
    <!-- Tabs -->
    <div class="bw-segmented" style="max-width:340px; margin-bottom:var(--s-4)">
      <button :class="['bw-seg', { active: tab === 'config' }]" @click="switchTab('config')">System Config</button>
      <button :class="['bw-seg', { active: tab === 'templates' }]" @click="switchTab('templates')">Notif Templates</button>
    </div>

    <!-- ── SYSTEM CONFIG ── -->
    <div v-if="tab === 'config'">
      <div v-if="cfgError" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ cfgError }}</div>

      <div class="cfg-filter-row">
        <input v-model="cfgSearch" class="bw-input" placeholder="Search keys or descriptions…" style="max-width:280px" />
        <select v-model="cfgCat" class="bw-select" style="max-width:180px">
          <option value="">All categories</option>
          <option v-for="c in categories" :key="c" :value="c">{{ c }}</option>
        </select>
      </div>

      <div v-if="cfgLoading" class="bw-loading">Loading…</div>
      <div v-else class="cfg-groups">
        <template v-for="cat in (cfgCat ? [cfgCat] : categories)" :key="cat">
          <div v-if="filtered.filter(c => c.category === cat).length" class="cfg-group">
            <div class="cfg-group-hd">{{ cat }}</div>
            <div class="cfg-table">
              <div class="cfg-head">
                <span>Key</span><span>Value</span><span>Type</span><span>Updated</span><span></span>
              </div>
              <div v-for="c in filtered.filter(x => x.category === cat)" :key="c.key" class="cfg-row">
                <div class="cfg-key-col">
                  <code class="cfg-key">{{ c.key }}</code>
                  <span class="cfg-desc">{{ c.description }}</span>
                </div>
                <code class="cfg-val">{{ displayVal(c) }}</code>
                <span class="cfg-type-badge">{{ c.type }}</span>
                <span class="bw-text-sm bw-text-muted">{{ fmt(c.updated_at) }}</span>
                <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="openEdit(c)">Edit</button>
              </div>
            </div>
          </div>
        </template>
        <div v-if="!filtered.length && !cfgLoading" class="bw-empty">No config entries match.</div>
      </div>
    </div>

    <!-- ── NOTIFICATION TEMPLATES ── -->
    <div v-if="tab === 'templates'" class="tpl-layout">
      <div v-if="tplError" class="bw-error-banner" style="margin-bottom:var(--s-3)">{{ tplError }}</div>
      <div v-if="tplLoading" class="bw-loading">Loading…</div>

      <div v-else class="tpl-split" :class="{ 'tpl-editing': !!editTpl }">
        <!-- Template list -->
        <div class="tpl-list">
          <div
            v-for="t in templates"
            :key="t.id"
            :class="['tpl-item', { 'tpl-item-active': editTpl?.id === t.id }]"
            @click="openTpl(t)"
          >
            <div class="tpl-item-top">
              <span class="tpl-name">{{ t.name }}</span>
              <span :class="['bw-badge', t.channel === 'sms' ? 'bw-badge-neutral' : 'bw-badge-success']">{{ t.channel }}</span>
            </div>
            <div class="tpl-event bw-mono">{{ t.event }}</div>
            <div class="tpl-updated bw-text-muted">Updated {{ fmt(t.updated_at) }}</div>
          </div>
          <div v-if="!templates.length" class="bw-empty">No templates found.</div>
        </div>

        <!-- Template editor -->
        <div v-if="editTpl" class="tpl-editor">
          <div class="tpl-editor-hd">
            <div>
              <div style="display:flex;align-items:center;gap:var(--s-2);margin-bottom:3px">
                <span :class="['bw-badge', editTpl.channel === 'sms' ? 'bw-badge-neutral' : 'bw-badge-success']">{{ editTpl.channel }}</span>
                <span class="bw-mono bw-text-sm bw-text-muted">{{ editTpl.event }}</span>
              </div>
              <h3 style="margin:0;font-size:var(--t-md)">{{ editTpl.name }}</h3>
            </div>
            <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editTpl = null">✕</button>
          </div>

          <div class="tpl-editor-body">
            <!-- Left: editor -->
            <div class="tpl-edit-col">
              <div v-if="editTpl.channel === 'email'" class="bw-form-group">
                <label class="bw-label">Subject</label>
                <input v-model="tplForm.subject" class="bw-input" />
              </div>
              <div class="bw-form-group" style="flex:1">
                <label class="bw-label">Body</label>
                <textarea v-model="tplForm.body" class="bw-textarea tpl-textarea" />
              </div>
              <div v-if="editTpl.variables.length" class="bw-form-group">
                <label class="bw-label">Variables <span class="bw-text-muted">(for preview)</span></label>
                <div class="var-grid">
                  <div v-for="v in editTpl.variables" :key="v" class="var-row">
                    <code class="var-name">{{ variableToken(v) }}</code>
                    <input v-model="previewVars[v]" class="bw-input" :placeholder="v" />
                  </div>
                </div>
              </div>
              <div v-if="tplSaveErr" class="bw-error-banner">{{ tplSaveErr }}</div>
              <button class="bw-btn bw-btn-primary" :disabled="tplSaving" @click="saveTpl">
                {{ tplSaving ? 'Saving…' : 'Save Template' }}
              </button>
            </div>

            <!-- Right: preview + test send -->
            <div class="tpl-preview-col">
              <div class="preview-box">
                <div class="preview-label">Live Preview</div>
                <div v-if="editTpl.channel === 'email' && tplForm.subject" class="preview-subject">
                  {{ tplForm.subject }}
                </div>
                <div class="preview-body">{{ previewBody }}</div>
              </div>

              <div class="test-send-box">
                <div class="preview-label">Test Send</div>
                <div class="test-row">
                  <input
                    v-model="testTarget"
                    class="bw-input"
                    :placeholder="editTpl.channel === 'sms' ? '0800 000 0000' : 'you@example.com'"
                  />
                  <button class="bw-btn bw-btn-ghost" :disabled="testSending || !testTarget" @click="testSend">
                    {{ testSending ? '…' : 'Send' }}
                  </button>
                </div>
                <div v-if="testResult" :class="['test-result', testResult.startsWith('✓') ? 'test-ok' : 'test-fail']">
                  {{ testResult }}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="tpl-empty-state">
          Select a template to edit
        </div>
      </div>
    </div>

    <!-- Edit config modal -->
    <div v-if="editing" class="bw-modal-backdrop" @click.self="editing = null">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <div>
            <code class="bw-mono" style="font-size:var(--t-md)">{{ editing.key }}</code>
            <div class="bw-text-sm bw-text-muted" style="margin-top:3px">{{ editing.description }}</div>
          </div>
          <button class="bw-btn bw-btn-ghost bw-btn-sm" @click="editing = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Value <span class="bw-text-muted">(type: {{ editing.type }})</span></label>
            <textarea v-if="editing.type === 'json'" v-model="editVal" class="bw-textarea bw-mono" rows="6" />
            <select v-else-if="editing.type === 'boolean'" v-model="editVal" class="bw-select">
              <option value="true">true</option>
              <option value="false">false</option>
            </select>
            <input v-else v-model="editVal" class="bw-input" :type="editing.type === 'number' ? 'number' : 'text'" />
          </div>
          <div v-if="saveErr" class="bw-error-banner">{{ saveErr }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn bw-btn-ghost" @click="editing = null">Cancel</button>
          <button class="bw-btn bw-btn-primary" :disabled="saving" @click="saveConfig">
            {{ saving ? 'Saving…' : 'Save' }}
          </button>
        </div>
      </div>
    </div>
  </AppShell>
</template>

<style scoped>
.cfg-filter-row { display: flex; gap: var(--s-2); margin-bottom: var(--s-4); flex-wrap: wrap; }

.cfg-groups { display: flex; flex-direction: column; gap: var(--s-5); }
.cfg-group { }
.cfg-group-hd {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted); margin-bottom: var(--s-2);
}
.cfg-table {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); overflow: hidden;
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
}
.cfg-head, .cfg-row {
  display: grid; grid-template-columns: 1fr 1fr 80px 140px 60px;
  padding: 10px var(--s-4); align-items: center; gap: var(--s-3);
}
.cfg-head {
  font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--text-muted); border-bottom: 1px solid var(--glass-border);
}
.cfg-row { border-bottom: 1px solid var(--glass-border); }
.cfg-row:last-child { border-bottom: none; }
.cfg-row:hover { background: var(--glass-bg-strong); }
.cfg-key-col { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cfg-key { font-size: var(--t-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-desc { font-size: 11px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.cfg-val { font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--brand); }
.cfg-type-badge {
  font-size: 10px; padding: 2px 7px; border-radius: var(--r-sm);
  background: var(--glass-bg-strong); border: 1px solid var(--glass-border);
  color: var(--text-muted); width: fit-content;
}

/* Templates */
.tpl-split {
  display: grid; grid-template-columns: 260px 1fr; gap: var(--s-4);
  min-height: 500px;
}
@media (max-width: 860px) { .tpl-split { grid-template-columns: 1fr; } }

.tpl-list {
  display: flex; flex-direction: column; gap: var(--s-2);
}
.tpl-item {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-lg); padding: var(--s-3) var(--s-4);
  cursor: pointer; transition: border-color var(--dur-fast), background var(--dur-fast);
  backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);
}
.tpl-item:hover, .tpl-item-active { border-color: var(--brand); background: var(--glass-bg-strong); }
.tpl-item-top { display: flex; align-items: center; justify-content: space-between; gap: var(--s-2); margin-bottom: 3px; }
.tpl-name { font-size: var(--t-sm); font-weight: 600; }
.tpl-event { font-size: 10px; color: var(--brand); margin-bottom: 2px; }
.tpl-updated { font-size: 10px; }

.tpl-editor {
  background: var(--glass-bg); border: 1px solid var(--glass-border);
  border-radius: var(--r-xl); padding: var(--s-4);
  backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  display: flex; flex-direction: column; gap: var(--s-4);
}
.tpl-editor-hd { display: flex; align-items: flex-start; justify-content: space-between; }
.tpl-editor-body { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-4); }
@media (max-width: 760px) { .tpl-editor-body { grid-template-columns: 1fr; } }
.tpl-edit-col { display: flex; flex-direction: column; gap: var(--s-3); }
.tpl-textarea { min-height: 180px; font-family: var(--font-mono); font-size: 12px; resize: vertical; }
.var-grid { display: flex; flex-direction: column; gap: var(--s-2); }
.var-row { display: grid; grid-template-columns: 140px 1fr; gap: var(--s-2); align-items: center; }
.var-name { font-size: 11px; color: var(--brand); }

.tpl-preview-col { display: flex; flex-direction: column; gap: var(--s-4); }
.preview-box {
  background: oklch(0% 0 0 / 0.10); border: 1px solid var(--glass-border);
  border-radius: var(--r-lg); padding: var(--s-4); flex: 1;
}
.preview-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); margin-bottom: var(--s-2); }
.preview-subject { font-weight: 700; font-size: var(--t-sm); margin-bottom: var(--s-2); border-bottom: 1px solid var(--glass-border); padding-bottom: var(--s-2); }
.preview-body { font-size: var(--t-sm); line-height: 1.7; color: var(--text); white-space: pre-wrap; }

.test-send-box { display: flex; flex-direction: column; gap: var(--s-2); }
.test-row { display: flex; gap: var(--s-2); }
.test-result { font-size: var(--t-sm); padding: var(--s-2) var(--s-3); border-radius: var(--r-md); }
.test-ok   { color: var(--brand); background: oklch(from var(--brand) l c h / 0.08); }
.test-fail { color: var(--danger); background: oklch(from var(--danger) l c h / 0.08); }

.tpl-empty-state {
  display: grid; place-items: center; color: var(--text-muted); font-size: var(--t-sm);
  background: var(--glass-bg); border: 1px solid var(--glass-border); border-radius: var(--r-xl);
  border-style: dashed;
}
</style>
