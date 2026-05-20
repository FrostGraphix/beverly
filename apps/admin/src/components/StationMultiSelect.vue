<script setup lang="ts">
/**
 * StationMultiSelect — live-search dropdown of station IDs from the energy backend.
 *
 * Fetches /api/v1/admin/stations once on mount (server caches for 5 min).
 * Filters as the user types. Selected stations render as removable chips.
 * Includes a graceful degrade banner if the upstream is unreachable.
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { api } from '../lib/api';

interface Station { stationId: string; name: string; remark?: string | null; }

const props = withDefaults(defineProps<{
    modelValue: string[];          // selected stationIds
    placeholder?: string;
    disabled?: boolean;
}>(), {
    placeholder: 'Search by station ID or name…',
    disabled: false,
});

const emit = defineEmits<{ (e: 'update:modelValue', v: string[]): void }>();

const all = ref<Station[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const query = ref('');
const open = ref(false);
const focusIndex = ref(-1);
const rootEl = ref<HTMLElement | null>(null);

const byId = computed(() => {
    const m = new Map<string, Station>();
    for (const s of all.value) m.set(s.stationId.toUpperCase(), s);
    return m;
});

const selected = computed<Station[]>(() =>
    props.modelValue.map((id) => byId.value.get(id.toUpperCase()) ?? { stationId: id, name: id }),
);

const filtered = computed<Station[]>(() => {
    const q = query.value.trim().toLowerCase();
    const sel = new Set(props.modelValue.map((id) => id.toUpperCase()));
    return all.value
        .filter((s) => !sel.has(s.stationId.toUpperCase()))
        .filter((s) =>
            !q ||
            s.stationId.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q),
        )
        .slice(0, 50);
});

async function load(force = false) {
    loading.value = true;
    error.value = null;
    try {
        const url = force ? '/api/v1/admin/stations?refresh=1' : '/api/v1/admin/stations';
        const res = await api.get<{ stations: Station[]; count: number }>(url);
        all.value = res.stations ?? [];
    } catch (e: any) {
        error.value = e?.message ?? 'Could not load stations.';
    } finally {
        loading.value = false;
    }
}

onMounted(() => {
    void load();
    document.addEventListener('click', onDocClick);
});

onUnmounted(() => {
    document.removeEventListener('click', onDocClick);
});

function onDocClick(e: MouseEvent) {
    if (!rootEl.value) return;
    if (!rootEl.value.contains(e.target as Node)) {
        open.value = false;
        focusIndex.value = -1;
    }
}

function add(s: Station) {
    if (props.disabled) return;
    const next = [...props.modelValue, s.stationId];
    emit('update:modelValue', next);
    query.value = '';
    focusIndex.value = -1;
}

function remove(id: string) {
    if (props.disabled) return;
    emit('update:modelValue', props.modelValue.filter((x) => x !== id));
}

function onFocus() { open.value = true; }

function onKey(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') {
        e.preventDefault();
        open.value = true;
        focusIndex.value = Math.min(filtered.value.length - 1, focusIndex.value + 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        focusIndex.value = Math.max(-1, focusIndex.value - 1);
    } else if (e.key === 'Enter') {
        if (focusIndex.value >= 0 && filtered.value[focusIndex.value]) {
            e.preventDefault();
            add(filtered.value[focusIndex.value]);
        }
    } else if (e.key === 'Backspace' && !query.value && props.modelValue.length > 0) {
        remove(props.modelValue[props.modelValue.length - 1]);
    } else if (e.key === 'Escape') {
        open.value = false;
        focusIndex.value = -1;
    }
}

watch(query, () => { focusIndex.value = -1; open.value = true; });
</script>

<template>
  <div ref="rootEl" class="msel" :class="{ 'msel--disabled': disabled }">
    <div class="msel-control" @click="open = true">
      <span v-for="s in selected" :key="s.stationId" class="chip">
        <span class="chip-id">{{ s.stationId }}</span>
        <span v-if="s.name && s.name !== s.stationId" class="chip-name">· {{ s.name }}</span>
        <button type="button" class="chip-x" aria-label="Remove" @click.stop="remove(s.stationId)">×</button>
      </span>
      <input
        class="msel-input"
        v-model="query"
        :placeholder="modelValue.length ? '' : placeholder"
        :disabled="disabled"
        @focus="onFocus"
        @keydown="onKey"
      />
      <button v-if="!loading" type="button" class="msel-refresh" title="Refresh station list" @click.stop="load(true)" :disabled="disabled">↻</button>
      <span v-else class="msel-loading" aria-label="Loading">…</span>
    </div>

    <Transition name="fade">
      <div v-if="open && !disabled" class="msel-pop">
        <div v-if="error" class="msel-banner msel-banner--err">
          {{ error }}
          <button type="button" class="msel-retry" @click.stop="load(true)">Retry</button>
        </div>
        <div v-else-if="loading && all.length === 0" class="msel-empty">Loading stations…</div>
        <ul v-else-if="filtered.length === 0" class="msel-empty">
          <li class="msel-row msel-row--empty">
            <span v-if="query">No station matches "{{ query }}".</span>
            <span v-else>All stations already selected.</span>
          </li>
        </ul>
        <ul v-else class="msel-list" role="listbox">
          <li
            v-for="(s, i) in filtered"
            :key="s.stationId"
            class="msel-row"
            :class="{ 'msel-row--active': i === focusIndex }"
            role="option"
            @mousedown.prevent="add(s)"
            @mouseenter="focusIndex = i"
          >
            <span class="msel-id">{{ s.stationId }}</span>
            <span v-if="s.name && s.name !== s.stationId" class="msel-name">{{ s.name }}</span>
          </li>
        </ul>
        <div class="msel-foot">
          {{ selected.length }} selected · {{ all.length }} stations available
          <span v-if="!loading && !error" class="msel-foot-meta">live</span>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.msel { position: relative; }
.msel--disabled { opacity: 0.6; pointer-events: none; }

.msel-control {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 8px 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--r-md);
  min-height: 44px;
  cursor: text;
  align-items: center;
}
.msel-control:focus-within {
  border-color: var(--brand);
  box-shadow: 0 0 0 3px var(--brand-glow);
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 4px 3px 8px;
  background: oklch(70% 0.19 145 / 0.12);
  border: 1px solid oklch(70% 0.19 145 / 0.35);
  border-radius: var(--r-sm);
  font-size: var(--t-sm);
  color: var(--text);
  font-family: var(--font-mono);
  line-height: 1.4;
}
.chip-id { font-weight: 700; }
.chip-name { color: var(--text-muted); font-family: var(--font-sans); font-weight: 400; font-size: var(--t-xs); }
.chip-x {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  line-height: 1;
  padding: 0 2px;
  border-radius: 50%;
}
.chip-x:hover { color: var(--danger); background: oklch(from var(--danger) l c h / 0.10); }

.msel-input {
  flex: 1;
  min-width: 140px;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--t-sm);
  outline: none;
  padding: 4px;
}
.msel-input::placeholder { color: var(--text-faint); }

.msel-refresh, .msel-loading {
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 6px;
  border-radius: var(--r-sm);
  font-size: 14px;
}
.msel-refresh:hover { color: var(--brand); background: oklch(70% 0.19 145 / 0.08); }

.msel-pop {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--surface);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  box-shadow: 0 8px 32px oklch(0% 0 0 / 0.35);
  z-index: 100;
  max-height: 320px;
  display: flex;
  flex-direction: column;
}

.msel-banner {
  padding: var(--s-3);
  font-size: var(--t-xs);
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--s-2);
}
.msel-banner--err {
  background: oklch(from var(--danger) l c h / 0.07);
  color: var(--danger);
  border-bottom: 1px solid oklch(from var(--danger) l c h / 0.25);
}
.msel-retry {
  background: transparent;
  border: 1px solid currentColor;
  color: inherit;
  font-size: var(--t-xs);
  padding: 2px 8px;
  border-radius: var(--r-sm);
  cursor: pointer;
}

.msel-empty {
  padding: var(--s-4);
  color: var(--text-muted);
  font-size: var(--t-sm);
  text-align: center;
  list-style: none;
  margin: 0;
}

.msel-list {
  list-style: none;
  margin: 0;
  padding: 4px;
  overflow-y: auto;
  flex: 1;
}
.msel-row {
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 8px 10px;
  border-radius: var(--r-sm);
  cursor: pointer;
  font-size: var(--t-sm);
}
.msel-row--active { background: var(--surface-2); }
.msel-row:hover { background: var(--surface-2); }
.msel-row--empty { cursor: default; }
.msel-row--empty:hover { background: transparent; }

.msel-id {
  font-family: var(--font-mono);
  font-weight: 600;
  color: var(--text);
  min-width: 80px;
}
.msel-name {
  color: var(--text-muted);
  flex: 1;
}

.msel-foot {
  padding: 6px 10px;
  border-top: 1px solid var(--border);
  font-size: 10px;
  color: var(--text-muted);
  display: flex;
  justify-content: space-between;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.msel-foot-meta {
  color: var(--brand);
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.msel-foot-meta::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 6px var(--brand-glow);
}

.fade-enter-active, .fade-leave-active { transition: opacity 0.14s var(--ease-out); }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
