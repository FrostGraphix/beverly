<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { publishNotificationCount } from '@beverly/tokens';
import {
    deviceNotificationState,
    disableDeviceNotifications,
    enableDeviceNotifications,
    type DeviceNotificationState,
} from '../lib/push-notifications';

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata?: { path?: string };
    read: boolean;
    created_at: string;
}

const items = ref<Notification[]>([]);
const router = useRouter();
const unreadCount = ref(0);
const nextCursor = ref<string | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const markingAll = ref(false);
const error = ref('');
const filter = ref<'all' | 'unread' | 'read'>('all');
const filters = ['all', 'unread', 'read'] as const;
const deviceState = ref<DeviceNotificationState>(deviceNotificationState());
const deviceBusy = ref(false);
const deviceError = ref('');
const filteredItems = computed(() => items.value.filter((item) =>
    filter.value === 'all' || (filter.value === 'read' ? item.read : !item.read)
));
const deviceStatus = computed(() => ({
    unsupported: 'Unsupported',
    unavailable: 'Unavailable',
    default: 'Off',
    enabled: 'On',
    blocked: 'Blocked',
}[deviceState.value]));
const deviceCopy = computed(() => ({
    unsupported: 'This browser cannot receive device notifications.',
    unavailable: 'Device delivery needs server configuration.',
    default: 'Get wallet updates outside Beverly.',
    enabled: 'Wallet updates can reach this device.',
    blocked: 'Enable notifications inside your device settings.',
}[deviceState.value]));

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
        if (reset) {
            unreadCount.value = response.unreadCount ?? 0;
            publishNotificationCount(unreadCount.value);
        }
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
    error.value = '';
    try {
        await api.patch(`/api/v1/vendor/notifications/${id}/read`);
        item.read = true;
        if (unreadCount.value > 0) unreadCount.value--;
        publishNotificationCount(unreadCount.value);
    } catch (caught: any) {
        error.value = caught?.message ?? 'Notification could not be marked read.';
    }
}

async function openNotification(item: Notification) {
    await markRead(item.id);
    if (item.metadata?.path) await router.push(item.metadata.path);
}

function typeLabel(type: string) {
    return ({
        admin_announcement: 'Announcement',
        funding_update: 'Funding',
        wallet_activity: 'Wallet',
        vending_update: 'Vending',
        dispute_update: 'Dispute',
        support_update: 'Support',
        security_update: 'Security',
    } as Record<string, string>)[type] ?? 'Update';
}

async function markAllRead() {
    markingAll.value = true;
    error.value = '';
    try {
        await api.post('/api/v1/vendor/notifications/read-all');
        items.value.forEach((n) => { n.read = true; });
        unreadCount.value = 0;
        publishNotificationCount(0);
        filter.value = 'all';
    } catch (err: any) {
        error.value = err?.message ?? 'Notifications could not be marked read.';
    } finally {
        markingAll.value = false;
    }
}

async function toggleDeviceNotifications() {
    if (deviceBusy.value || ['blocked', 'unsupported', 'unavailable'].includes(deviceState.value)) return;
    deviceBusy.value = true;
    deviceError.value = '';
    try {
        deviceState.value = deviceState.value === 'enabled'
            ? await disableDeviceNotifications()
            : await enableDeviceNotifications();
    } catch (err: any) {
        deviceError.value = err?.message ?? 'Device notifications could not update.';
    } finally {
        deviceBusy.value = false;
    }
}

onMounted(() => {
    void loadInbox();
    deviceState.value = deviceNotificationState();
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
    </div>

    <div class="notification-toolbar">
      <div class="notification-filters" aria-label="Filter notifications">
        <button v-for="option in filters" :key="option" type="button" :class="['notification-filter', { active: filter === option }]" :aria-pressed="filter === option" @click="filter = option">
          {{ option }}
        </button>
      </div>
      <button
        v-if="unreadCount"
        type="button"
        class="vn-mark-all"
        :disabled="markingAll"
        aria-label="Mark every notification as read"
        @click="markAllRead"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m5 12 4 4L19 6"/></svg>
        {{ markingAll ? 'Marking...' : 'Mark all read' }}
      </button>
    </div>

    <section class="device-alerts bw-card" aria-labelledby="device-alerts-title">
      <div class="device-alerts-copy">
        <div class="device-alerts-heading">
          <h2 id="device-alerts-title">Device notifications</h2>
          <span :class="['device-alerts-status', `is-${deviceState}`]">{{ deviceStatus }}</span>
        </div>
        <p>{{ deviceCopy }}</p>
        <small v-if="deviceError" role="alert">{{ deviceError }}</small>
      </div>
      <button
        v-if="!['unsupported', 'unavailable', 'blocked'].includes(deviceState)"
        type="button"
        class="bw-btn device-alerts-action"
        :class="{ primary: deviceState === 'default' }"
        :disabled="deviceBusy"
        @click="toggleDeviceNotifications"
      >
        {{ deviceBusy ? 'Updating...' : deviceState === 'enabled' ? 'Turn off' : 'Turn on' }}
      </button>
    </section>

    <div v-if="error" class="bw-alert danger" style="margin-bottom: var(--s-3)">{{ error }}</div>

    <section class="bw-card flush">
      <div v-if="loading && !items.length" class="vn-empty">Loading...</div>
      <div v-else-if="!items.length" class="vn-empty">
        <strong>No notifications yet.</strong>
        <span>Wallet, vending, support, and security updates appear here.</span>
      </div>
      <div v-else-if="!filteredItems.length" class="vn-empty">
        <strong>No {{ filter }} notifications.</strong>
        <span>Choose another filter.</span>
      </div>
      <button
        v-for="item in filteredItems"
        v-else
        :key="item.id"
        type="button"
        :class="['vn-row', { unread: !item.read }]"
        @click="openNotification(item)"
      >
        <span class="vn-dot" />
        <span>
          <em>{{ typeLabel(item.type) }}</em>
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
.notification-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
    flex-wrap: wrap;
}
.notification-filters {
    display: flex;
    gap: var(--s-1);
}
.notification-filter {
    min-height: 44px;
    padding: 0 var(--s-3);
    border: 1px solid var(--border);
    border-radius: 999px;
    background: transparent;
    color: var(--text-muted);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 700;
    text-transform: capitalize;
    cursor: pointer;
}
.notification-filter.active {
    border-color: color-mix(in srgb, var(--brand) 55%, var(--border));
    background: color-mix(in srgb, var(--brand) 14%, var(--surface));
    color: var(--brand);
}
.notification-filter:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.device-alerts {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-4);
    margin-bottom: var(--s-4);
    padding: var(--s-4);
}
.device-alerts-copy { min-width: 0; }
.device-alerts-heading { display: flex; align-items: center; gap: var(--s-2); }
.device-alerts h2 { margin: 0; font-size: var(--t-md); }
.device-alerts p { margin: 6px 0 0; color: var(--text-muted); overflow-wrap: anywhere; }
.device-alerts small { display: block; margin-top: 6px; color: var(--danger); }
.device-alerts-status {
    padding: 3px 8px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-muted);
    font-size: var(--t-2xs);
    font-weight: 800;
    text-transform: uppercase;
}
.device-alerts-status.is-enabled {
    border-color: color-mix(in srgb, var(--brand) 45%, var(--border));
    color: var(--brand);
}
.device-alerts-status.is-blocked {
    border-color: color-mix(in srgb, var(--danger) 45%, var(--border));
    color: var(--danger);
}
.device-alerts-action { flex: 0 0 auto; justify-content: center; }
.vn-mark-all {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 var(--s-3);
    border: 1px solid color-mix(in srgb, var(--brand) 35%, var(--border));
    border-radius: 999px;
    background: color-mix(in srgb, var(--brand) 8%, transparent);
    color: var(--brand);
    font: inherit;
    font-size: var(--t-sm);
    font-weight: 700;
    cursor: pointer;
}
.vn-mark-all svg { width: 15px; height: 15px; }
.vn-mark-all:hover { background: color-mix(in srgb, var(--brand) 14%, var(--surface)); }
.vn-mark-all:disabled { cursor: wait; opacity: .6; }
.vn-mark-all:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
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
.vn-row em {
    display: block;
    color: var(--brand);
    font-size: var(--t-2xs);
    font-style: normal;
    font-weight: 800;
    letter-spacing: .08em;
    margin-bottom: 3px;
    text-transform: uppercase;
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
    .notification-toolbar { align-items: stretch; }
    .notification-filters { flex: 1 1 auto; }
    .notification-filter { flex: 1 1 0; }
    .vn-mark-all { justify-content: center; }
    .device-alerts { align-items: stretch; flex-direction: column; }
    .device-alerts-action { width: 100%; }
}
</style>
