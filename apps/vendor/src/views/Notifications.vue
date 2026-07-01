<script setup lang="ts">
import { onMounted, ref } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    read: boolean;
    created_at: string;
}

const items = ref<Notification[]>([]);
const unreadCount = ref(0);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const markingAll = ref(false);
const error = ref('');

function fmtDate(iso: string) {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    if (diff < 60_000) return 'just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

async function loadInbox(reset = true) {
    if (reset) {
        items.value = [];
        nextCursor.value = null;
    }
    loading.value = true;
    error.value = '';
    try {
        const qs = nextCursor.value ? `?limit=20&cursor=${encodeURIComponent(nextCursor.value)}` : '?limit=20';
        const response = await api.get<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }>(
            `/api/v1/vendor/notifications${qs}`
        );
        items.value.push(...(response.notifications ?? []));
        nextCursor.value = response.nextCursor;
        if (reset) unreadCount.value = response.unreadCount ?? 0;
    } catch (err: any) {
        error.value = err?.message ?? 'Notifications failed to load.';
    } finally {
        loading.value = false;
    }
}

async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const response = await api.get<{ notifications: Notification[]; nextCursor: string | null }>(
            `/api/v1/vendor/notifications?limit=20&cursor=${encodeURIComponent(nextCursor.value)}`
        );
        items.value.push(...(response.notifications ?? []));
        nextCursor.value = response.nextCursor;
    } finally {
        loadingMore.value = false;
    }
}

async function markRead(id: string) {
    const item = items.value.find((n) => n.id === id);
    if (!item || item.read) return;
    item.read = true;
    if (unreadCount.value > 0) unreadCount.value--;
    await api.patch(`/api/v1/vendor/notifications/${id}/read`).catch(() => undefined);
}

async function markAllRead() {
    markingAll.value = true;
    try {
        await api.post('/api/v1/vendor/notifications/read-all');
        items.value.forEach((n) => { n.read = true; });
        unreadCount.value = 0;
    } finally {
        markingAll.value = false;
    }
}

onMounted(() => {
    void loadInbox();
});
</script>

<template>
  <AppShell title="Notifications">
    <div class="vn-head">
      <div>
        <p class="vn-kicker">Inbox</p>
        <h1>Notifications</h1>
        <p>{{ unreadCount ? `${unreadCount} unread` : 'All caught up' }}</p>
      </div>
      <button v-if="unreadCount" class="bw-btn sm" :disabled="markingAll" @click="markAllRead">
        {{ markingAll ? 'Marking...' : 'Mark all read' }}
      </button>
    </div>

    <div v-if="error" class="bw-alert danger" style="margin-bottom: var(--s-3)">{{ error }}</div>

    <section class="bw-card flush">
      <div v-if="loading && !items.length" class="vn-empty">Loading...</div>
      <div v-else-if="!items.length" class="vn-empty">
        <strong>No notifications yet.</strong>
        <span>Admin updates and wallet alerts appear here.</span>
      </div>
      <button
        v-for="item in items"
        v-else
        :key="item.id"
        type="button"
        :class="['vn-row', { unread: !item.read }]"
        @click="markRead(item.id)"
      >
        <span class="vn-dot" />
        <span>
          <strong>{{ item.title }}</strong>
          <small>{{ item.body }}</small>
        </span>
        <time>{{ fmtDate(item.created_at) }}</time>
      </button>
    </section>

    <div v-if="nextCursor" class="vn-more">
      <button class="bw-btn" :disabled="loadingMore" @click="loadMore">
        {{ loadingMore ? 'Loading...' : 'Load more' }}
      </button>
    </div>
  </AppShell>
</template>

<style scoped>
.vn-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
}
.vn-head h1 {
    margin: var(--s-1) 0;
    font-size: clamp(1.6rem, 4vw, 2.4rem);
}
.vn-head p {
    margin: 0;
    color: var(--text-muted);
}
.vn-kicker {
    color: var(--brand);
    font-size: var(--t-xs);
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.vn-row {
    width: 100%;
    display: grid;
    grid-template-columns: 10px minmax(0, 1fr) auto;
    gap: var(--s-3);
    align-items: center;
    border: 0;
    border-bottom: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    padding: var(--s-4);
    text-align: left;
    cursor: pointer;
}
.vn-row.unread {
    background: color-mix(in oklab, var(--brand), transparent 90%);
}
.vn-row small {
    display: block;
    color: var(--text-muted);
    margin-top: 4px;
}
.vn-row time {
    color: var(--text-muted);
    font-size: var(--t-xs);
}
.vn-dot {
    width: 8px;
    height: 8px;
    border-radius: 999px;
    background: var(--brand);
    opacity: .35;
}
.vn-row.unread .vn-dot {
    opacity: 1;
}
.vn-empty {
    min-height: 220px;
    display: grid;
    place-items: center;
    gap: var(--s-2);
    color: var(--text-muted);
    text-align: center;
}
.vn-more {
    display: flex;
    justify-content: center;
    margin-top: var(--s-4);
}
@media (max-width: 640px) {
    .vn-head {
        display: grid;
    }
    .vn-row {
        grid-template-columns: 10px minmax(0, 1fr);
    }
    .vn-row time {
        grid-column: 2;
    }
}
</style>
