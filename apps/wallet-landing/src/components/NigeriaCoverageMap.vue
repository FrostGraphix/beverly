<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';

type Position = [number, number];
type Geometry = { type: 'Polygon' | 'MultiPolygon'; coordinates: Position[][] | Position[][][] };
type MapFeature = { properties: { NAME?: string }; geometry: Geometry };

const props = defineProps<{ highlightedStates: string[]; label: string }>();
const features = ref<MapFeature[]>([]);
const failed = ref(false);
const WIDTH = 640;
const HEIGHT = 560;
const PADDING = 18;

function normalizeState(value: string): string {
  return value.trim().toLowerCase().replace('nassarawa', 'nasarawa');
}

function rings(feature: MapFeature): Position[][] {
  return feature.geometry.type === 'Polygon'
    ? feature.geometry.coordinates as Position[][]
    : (feature.geometry.coordinates as Position[][][]).flat();
}

const bounds = computed(() => {
  const points = features.value.flatMap((feature) => rings(feature).flat());
  return points.reduce((box, [lon, lat]) => ({
    minLon: Math.min(box.minLon, lon), maxLon: Math.max(box.maxLon, lon),
    minLat: Math.min(box.minLat, lat), maxLat: Math.max(box.maxLat, lat),
  }), { minLon: Infinity, maxLon: -Infinity, minLat: Infinity, maxLat: -Infinity });
});

function point([lon, lat]: Position): string {
  const box = bounds.value;
  const x = PADDING + ((lon - box.minLon) / (box.maxLon - box.minLon)) * (WIDTH - PADDING * 2);
  const y = PADDING + ((box.maxLat - lat) / (box.maxLat - box.minLat)) * (HEIGHT - PADDING * 2);
  return `${x.toFixed(2)},${y.toFixed(2)}`;
}

function pathFor(feature: MapFeature): string {
  return rings(feature).filter((ring) => ring.length > 2)
    .map((ring) => `M${ring.map(point).join('L')}Z`).join('');
}

function isHighlighted(feature: MapFeature): boolean {
  const state = normalizeState(feature.properties.NAME ?? '');
  return props.highlightedStates.some((name) => normalizeState(name) === state);
}

onMounted(async () => {
  try {
    const response = await fetch(`${import.meta.env.BASE_URL}nigeria-states.geojson`);
    if (!response.ok) throw new Error('Map unavailable');
    const data = await response.json() as { features?: MapFeature[] };
    features.value = data.features ?? [];
    failed.value = features.value.length === 0;
  } catch {
    failed.value = true;
  }
});
</script>

<template>
  <div class="ng-map" role="img" :aria-label="label">
    <svg v-if="features.length" viewBox="0 0 640 560" aria-hidden="true">
      <path v-for="feature in features" :key="feature.properties.NAME" :d="pathFor(feature)"
        :class="{ active: isHighlighted(feature) }" fill-rule="evenodd" />
    </svg>
    <div v-else class="ng-map-placeholder" :class="{ failed }" aria-hidden="true" />
  </div>
</template>

<style scoped>
.ng-map { min-height: 340px; display: grid; place-items: center; }
.ng-map svg { width: min(100%, 470px); height: auto; overflow: visible; filter: drop-shadow(0 24px 42px rgb(0 0 0 / 0.22)); }
.ng-map path { fill: color-mix(in srgb, var(--surface-2) 86%, transparent); stroke: color-mix(in srgb, var(--text-muted) 36%, transparent); stroke-width: 1.4; vector-effect: non-scaling-stroke; transition: fill 220ms ease, stroke 220ms ease, filter 220ms ease; }
.ng-map path.active { fill: var(--brand); stroke: var(--brand-300); filter: drop-shadow(0 0 7px color-mix(in srgb, var(--brand) 58%, transparent)); }
.ng-map-placeholder { width: min(78%, 280px); aspect-ratio: 1; border-radius: 50%; background: linear-gradient(110deg, var(--surface-2) 30%, var(--surface-3) 50%, var(--surface-2) 70%); background-size: 220% 100%; animation: map-loading 1.3s linear infinite; }
.ng-map-placeholder.failed { animation: none; opacity: 0.45; }
@keyframes map-loading { to { background-position-x: -220%; } }
@media (prefers-reduced-motion: reduce) { .ng-map-placeholder { animation: none; } }
</style>
