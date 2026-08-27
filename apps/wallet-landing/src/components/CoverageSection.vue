<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from '@beverly/tokens/i18n.js';
import IconSvg from './IconSvg.vue';
import NigeriaCoverageMap from './NigeriaCoverageMap.vue';
import { PORTALS } from '../content';

interface PublicStation {
  stationId: string;
  name: string;
  status: 'active';
  geography: { state: string; country: string } | null;
}

const { t } = useI18n();
const stations = ref<PublicStation[]>([]);
const loading = ref(true);
const error = ref('');

const stateGroups = computed(() => {
  const groups = new Map<string, PublicStation[]>();
  for (const station of stations.value) {
    const state = station.geography?.state ?? t('landing.coverage.locationPending');
    groups.set(state, [...(groups.get(state) ?? []), station]);
  }
  return [...groups.entries()].map(([state, entries]) => ({ state, stations: entries }));
});

const highlightedStates = computed(() => stateGroups.value
  .filter((group) => group.state !== t('landing.coverage.locationPending'))
  .map((group) => group.state));

async function loadStations() {
  loading.value = true;
  error.value = '';
  try {
    const response = await fetch('/api/v1/public/stations', { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('stations_unavailable');
    const payload = await response.json() as { stations?: PublicStation[] };
    stations.value = payload.stations ?? [];
    if (!stations.value.length) throw new Error('stations_empty');
  } catch {
    error.value = t('landing.coverage.error');
  } finally {
    loading.value = false;
  }
}

onMounted(loadStations);
</script>

<template>
  <section id="coverage" class="lp-section lp-coverage">
    <div class="lp-section-head" v-reveal>
      <span class="lp-eyebrow">{{ t('landing.coverage.eyebrow') }}</span>
      <h2 class="lp-section-title">{{ t('landing.coverage.title') }}</h2>
      <p class="lp-section-sub">{{ t('landing.coverage.subtitle') }}</p>
    </div>

    <div class="lp-coverage-shell" v-reveal="60">
      <div class="lp-map-panel">
        <NigeriaCoverageMap :highlighted-states="highlightedStates" :label="t('landing.coverage.mapLabel')" />
        <p class="lp-map-source">
          {{ t('landing.coverage.mapSource') }}
          <a href="https://services9.arcgis.com/wIeOHuxI1ZWIXdZQ/ArcGIS/rest/services/NGA_Boundaries_2021_d612f/FeatureServer/1" target="_blank" rel="noreferrer">NBS / UN</a>
        </p>
      </div>

      <div class="lp-station-panel" aria-live="polite">
        <div class="lp-station-summary">
          <span>{{ t('landing.coverage.liveDirectory') }}</span>
          <strong v-if="!loading && !error">{{ t('landing.coverage.siteCount', { count: stations.length }) }}</strong>
        </div>

        <div v-if="loading" class="lp-station-loading">
          <span v-for="n in 3" :key="n" />
        </div>
        <div v-else-if="error" class="lp-station-error" role="status">
          <IconSvg name="info" />
          <p>{{ error }}</p>
          <button class="lp-btn lp-btn--ghost" type="button" @click="loadStations">{{ t('landing.coverage.retry') }}</button>
        </div>
        <div v-else class="lp-state-groups">
          <section v-for="group in stateGroups" :key="group.state" class="lp-state-group">
            <header>
              <strong>{{ group.state }}</strong>
              <span>{{ t('landing.coverage.stateCount', { count: group.stations.length }) }}</span>
            </header>
            <div class="lp-station-chips">
              <span v-for="station in group.stations" :key="station.stationId">
                <i />{{ station.name || station.stationId }}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>

    <div class="lp-coverage-foot" v-reveal>
      <p>{{ t('landing.coverage.footnote') }}</p>
      <a class="lp-btn lp-btn--ghost" :href="PORTALS.customer.signup">
        {{ t('landing.coverage.cta') }} <IconSvg name="arrow" />
      </a>
    </div>
  </section>
</template>

<style scoped>
.lp-coverage { max-width: var(--lp-max); margin: 0 auto; padding: clamp(64px, 9vw, 120px) var(--lp-gutter); }
.lp-coverage-shell { display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(300px, .95fr); overflow: hidden; border: 1px solid var(--glass-border); border-radius: var(--r-2xl); background: var(--glass-bg); box-shadow: var(--glass-shadow-card); }
.lp-map-panel { min-width: 0; padding: clamp(20px, 4vw, 40px); background: radial-gradient(circle at 50% 48%, color-mix(in srgb, var(--brand) 12%, transparent), transparent 62%); border-right: 1px solid var(--glass-border); }
.lp-map-source { margin: 8px 0 0; text-align: center; color: var(--text-muted); font-size: var(--t-xs); }
.lp-map-source a { color: var(--brand-300); }
.lp-station-panel { padding: clamp(22px, 4vw, 42px); }
.lp-station-summary { display: flex; align-items: baseline; justify-content: space-between; gap: 16px; padding-bottom: 20px; border-bottom: 1px solid var(--glass-border); color: var(--text-muted); font-size: var(--t-sm); }
.lp-station-summary strong { color: var(--brand-300); font-family: var(--font-mono); }
.lp-state-groups { display: grid; gap: 24px; margin-top: 24px; }
.lp-state-group { display: grid; gap: 12px; }
.lp-state-group header { display: flex; justify-content: space-between; gap: 16px; color: var(--text); }
.lp-state-group header span { color: var(--text-muted); font-size: var(--t-xs); }
.lp-station-chips { display: flex; flex-wrap: wrap; gap: 8px; }
.lp-station-chips span { display: inline-flex; align-items: center; gap: 7px; padding: 8px 10px; border: 1px solid var(--glass-border); border-radius: var(--r-full); background: var(--surface-2); color: var(--text-dim); font-size: var(--t-sm); }
.lp-station-chips i { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 14%, transparent); }
.lp-station-loading { display: grid; gap: 12px; margin-top: 24px; }
.lp-station-loading span { height: 52px; border-radius: var(--r-lg); background: linear-gradient(105deg, var(--surface-2) 30%, var(--surface-3) 50%, var(--surface-2) 70%); background-size: 220% 100%; animation: station-loading 1.3s linear infinite; }
.lp-station-error { display: grid; justify-items: start; gap: 14px; margin-top: 24px; color: var(--text-dim); }
.lp-station-error p { margin: 0; }
.lp-coverage-foot { margin-top: 30px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
.lp-coverage-foot p { max-width: 620px; margin: 0; color: var(--text-dim); line-height: 1.6; }
@keyframes station-loading { to { background-position-x: -220%; } }
@media (max-width: 760px) { .lp-coverage-shell { grid-template-columns: 1fr; } .lp-map-panel { border-right: 0; border-bottom: 1px solid var(--glass-border); } .lp-coverage-foot { align-items: stretch; flex-direction: column; } }
@media (prefers-reduced-motion: reduce) { .lp-station-loading span { animation: none; } }
</style>
