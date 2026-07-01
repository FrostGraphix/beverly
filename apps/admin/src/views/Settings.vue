<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import { RouterLink } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { toggleTheme } from '@beverly/tokens';

type Density = 'comfortable' | 'compact';

const SETTINGS_KEY = 'beverly.admin.qualitySettings';
const density = ref<Density>('comfortable');
const reduceMotion = ref(false);
const stickyTables = ref(true);
const autoRefresh = ref(true);

function loadSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        density.value = saved.density === 'compact' ? 'compact' : 'comfortable';
        reduceMotion.value = Boolean(saved.reduceMotion);
        stickyTables.value = saved.stickyTables !== false;
        autoRefresh.value = saved.autoRefresh !== false;
    } catch {
        // Keep defaults.
    }
}

function applySettings() {
    document.documentElement.dataset.adminDensity = density.value;
    document.documentElement.dataset.adminReduceMotion = reduceMotion.value ? 'true' : 'false';
    document.documentElement.dataset.adminStickyTables = stickyTables.value ? 'true' : 'false';
    document.documentElement.dataset.adminAutoRefresh = autoRefresh.value ? 'true' : 'false';
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        density: density.value,
        reduceMotion: reduceMotion.value,
        stickyTables: stickyTables.value,
        autoRefresh: autoRefresh.value,
    }));
}

function resetSettings() {
    density.value = 'comfortable';
    reduceMotion.value = false;
    stickyTables.value = true;
    autoRefresh.value = true;
}

onMounted(() => {
    loadSettings();
    applySettings();
});

watch([density, reduceMotion, stickyTables, autoRefresh], applySettings);
</script>

<template>
  <AppShell title="Settings">
    <div class="settings-stack">
      <section class="bw-card settings-card">
        <p class="bw-label" style="color: var(--brand)">Preferences</p>
        <h1 class="bw-h1">Workspace settings</h1>
        <p class="bw-muted">Control local display behavior.</p>

        <div class="settings-grid">
          <label class="setting-row">
            <span>
              <strong>Theme</strong>
              <small>Switch light or dark mode.</small>
            </span>
            <button type="button" class="bw-btn sm primary" @click="toggleTheme">Toggle</button>
          </label>

          <label class="setting-row">
            <span>
              <strong>Density</strong>
              <small>Reduce spacing on data pages.</small>
            </span>
            <select v-model="density" class="bw-select setting-control">
              <option value="comfortable">Comfortable</option>
              <option value="compact">Compact</option>
            </select>
          </label>

          <label class="setting-row">
            <span>
              <strong>Sticky table headers</strong>
              <small>Keep table context visible.</small>
            </span>
            <input v-model="stickyTables" class="setting-toggle" type="checkbox" />
          </label>

          <label class="setting-row">
            <span>
              <strong>Reduce motion</strong>
              <small>Minimize animation effects.</small>
            </span>
            <input v-model="reduceMotion" class="setting-toggle" type="checkbox" />
          </label>

          <label class="setting-row">
            <span>
              <strong>Live refresh</strong>
              <small>Allow automatic dashboard polling.</small>
            </span>
            <input v-model="autoRefresh" class="setting-toggle" type="checkbox" />
          </label>
        </div>

        <button type="button" class="bw-btn" @click="resetSettings">Reset defaults</button>
      </section>

      <section class="bw-card settings-card">
        <p class="bw-label" style="color: var(--warn)">Security</p>
        <h2 class="bw-h2">Two-factor authentication</h2>
        <p class="bw-muted">
          Add an authenticator app to require a one-time code at sign-in. Recommended for every
          staff member with access to money movement or launch controls.
        </p>
        <div class="bw-row" style="margin-top: var(--s-5)">
          <RouterLink to="/security" class="bw-btn primary">Manage 2FA &amp; security</RouterLink>
        </div>
      </section>
    </div>
  </AppShell>
</template>

<style scoped>
.settings-stack {
  display: grid;
  gap: var(--s-4);
  max-width: 760px;
}

.settings-card {
  display: grid;
  gap: var(--s-4);
}

.settings-grid {
  display: grid;
  gap: var(--s-2);
}

.setting-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--s-3);
  padding: var(--s-3);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  background: var(--surface-2);
}

.setting-row strong,
.setting-row small {
  display: block;
}

.setting-row small {
  margin-top: 2px;
  color: var(--text-muted);
  font-size: var(--t-xs);
}

.setting-control {
  width: 150px;
}

.setting-toggle {
  width: 22px;
  height: 22px;
  accent-color: var(--brand);
}

@media (max-width: 560px) {
  .setting-row {
    grid-template-columns: minmax(0, 1fr);
  }

  .setting-control {
    width: 100%;
  }
}
</style>
