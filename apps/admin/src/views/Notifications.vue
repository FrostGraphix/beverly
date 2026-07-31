<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { publishNotificationCount } from '@beverly/tokens';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata?: { path?: string };
    read: boolean;
    created_at: string;
}

const router = useRouter();
const items = ref<Notification[]>([]);
const unreadCount = ref(0);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const markingAll = ref(false);
const error = ref('');
const filter = ref<'all' | 'unread' | 'read'>('all');
const filters = ['all', 'unread', 'read'] as const;
const filteredItems = computed(() => items.value.filter((item) =>
    filter.value === 'all' || (filter.value === 'read' ? item.read : !item.read)
));

function formatDate(value: string) {
    const date = new Date(value);
    const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (minutes < 1440) return `${Math.floor(minutes / 60)}h ago`;
    return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

async function load(reset = true) {
    loading.value = true;
    error.value = '';
    try {
        const cursor = !reset && nextCursor.value ? `&cursor=${encodeURIComponent(nextCursor.value)}` : '';
        const response = await api.get<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }>(
            `/api/v1/admin/notifications?limit=20${cursor}`,
        );
        items.value = reset ? response.notifications : [...items.value, ...response.notifications];
        nextCursor.value = response.nextCursor;
        unreadCount.value = response.unreadCount;
        publishNotificationCount(unreadCount.value);
    } catch (caught: any) {
        error.value = caught?.message ?? 'Notifications failed to load.';
    } finally {
        loading.value = false;
    }
}

async function openNotification(item: Notification) {
    if (!item.read) {
        error.value = '';
        try {
            await api.patch(`/api/v1/admin/notifications/${item.id}/read`);
            item.read = true;
            unreadCount.value = Math.max(0, unreadCount.value - 1);
            publishNotificationCount(unreadCount.value);
        } catch (caught: any) {
            error.value = caught?.message ?? 'Notification could not be marked read.';
            return;
        }
    }
    if (item.metadata?.path) await router.push(item.metadata.path);
}

async function markAllRead() {
    markingAll.value = true;
    error.value = '';
    try {
        await api.post('/api/v1/admin/notifications/read-all');
        items.value.forEach((item) => { item.read = true; });
        unreadCount.value = 0;
        publishNotificationCount(0);
    } catch (caught: any) {
        error.value = caught?.message ?? 'Notifications could not be marked read.';
    } finally {
        markingAll.value = false;
    }
}

onMounted(() => void load());
</script>

<template>
  <AppShell title="Notifications">
    <div class="an-head">
      <div>
        <p class="bw-label">Operations inbox</p>
        <h1>Notifications</h1>
        <p>{{ unreadCount ? `${unreadCount} unread` : 'All caught up' }}</p>
      </div>
      <button v-if="unreadCount" type="button" class="bw-btn sm notification-mark-all" :disabled="markingAll" @click="markAllRead">
        {{ markingAll ? 'Marking...' : 'Mark all read' }}
      </button>
    </div>

    <div v-if="error" class="bw-alert danger" role="alert">{{ error }}</div>

    <div class="notification-filters" aria-label="Filter notifications">
      <button v-for="option in filters" :key="option" type="button" :class="['notification-filter', { active: filter === option }]" :aria-pressed="filter === option" @click="filter = option">
        {{ option }}
      </button>
    </div>

    <section class="bw-card flush">
      <div v-if="loading && !items.length" class="an-empty">Loading...</div>
      <div v-else-if="!items.length" class="an-empty">
        <strong>No operational alerts.</strong>
        <span>Funding, disputes, and support updates appear here.</span>
      </div>
      <div v-else-if="!filteredItems.length" class="an-empty">
        <strong>No {{ filter }} notifications.</strong>
        <span>Choose another filter.</span>
      </div>
      <button
        v-for="item in filteredItems"
        v-else
        :key="item.id"
        type="button"
        :class="['an-row', { unread: !item.read }]"
        @click="openNotification(item)"
      >
        <span class="an-dot" />
        <span class="an-copy">
          <em>{{ item.type.replace(/_/g, ' ') }}</em>
          <strong>{{ item.title }}</strong>
          <small>{{ item.body }}</small>
        </span>
        <time>{{ formatDate(item.created_at) }}</time>
      </button>
    </section>

    <div v-if="nextCursor" class="an-more">
      <button class="bw-btn" :disabled="loading" @click="load(false)">
        {{ loading ? 'Loading...' : 'Load more' }}
      </button>
    </div>
  </AppShell>
</template>

<style scoped>
.an-head { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-3); margin-bottom: var(--s-4); }
.an-head h1 { margin: var(--s-1) 0; font-size: clamp(1.6rem, 4vw, 2.4rem); }
.an-head p { margin: 0; color: var(--text-muted); }
.notification-filters { display: flex; gap: var(--s-1); margin-bottom: var(--s-4); }
.notification-filter { min-height: 44px; padding: 0 var(--s-3); border: 1px solid var(--border); border-radius: 999px; background: transparent; color: var(--text-muted); font: inherit; font-size: var(--t-sm); font-weight: 700; text-transform: capitalize; cursor: pointer; }
.notification-mark-all { min-height: 44px; }
.notification-filter.active { border-color: color-mix(in srgb, var(--brand) 55%, var(--border)); background: color-mix(in srgb, var(--brand) 14%, var(--surface)); color: var(--brand); }
.notification-filter:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.an-row { width: 100%; display: grid; grid-template-columns: 9px minmax(0, 1fr) auto; gap: var(--s-3); align-items: center; border: 0; border-bottom: 1px solid var(--border); background: transparent; color: var(--text); padding: var(--s-4); text-align: left; cursor: pointer; }
.an-row.unread { background: color-mix(in oklab, var(--brand), transparent 90%); }
.an-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--brand); opacity: .3; }
.an-row.unread .an-dot { opacity: 1; }
.an-copy { min-width: 0; display: grid; gap: 3px; }
.an-copy em { color: var(--brand); font-size: var(--t-2xs); font-style: normal; font-weight: 800; letter-spacing: .08em; text-transform: uppercase; }
.an-copy small, .an-row time { color: var(--text-muted); }
.an-row time { font-size: var(--t-xs); white-space: nowrap; }
.an-empty { min-height: 220px; display: grid; place-items: center; gap: var(--s-2); color: var(--text-muted); text-align: center; }
.an-more { display: flex; justify-content: center; margin-top: var(--s-4); }
@media (max-width: 640px) {
  .an-head { display: grid; }
  .an-row { grid-template-columns: 9px minmax(0, 1fr); }
  .an-row time { grid-column: 2; }
}
</style>
