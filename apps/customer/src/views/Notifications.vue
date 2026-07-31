<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';
import { publishNotificationCount } from '@beverly/tokens';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Notification {
    id: string;
    type: string;
    title: string;
    body: string;
    metadata: Record<string, unknown>;
    read: boolean;
    created_at: string;
}

interface Preferences {
    sms:    Record<string, boolean>;
    email:  Record<string, boolean>;
    in_app: Record<string, boolean>;
}

// ── State ─────────────────────────────────────────────────────────────────────

const tab = ref<'inbox' | 'settings'>('inbox');
const router = useRouter();

// Inbox
const items       = ref<Notification[]>([]);
const unreadCount = ref(0);
const nextCursor  = ref<string | null>(null);
const loading     = ref(false);
const loadingMore = ref(false);
const markingAll  = ref(false);
const inboxError  = ref('');
const filter = ref<'all' | 'unread' | 'read'>('all');
const filters = ['all', 'unread', 'read'] as const;
const filteredItems = computed(() => items.value.filter((item) =>
    filter.value === 'all' || (filter.value === 'read' ? item.read : !item.read)
));

// Preferences
const prefs       = ref<Preferences>({
    sms:    { token_purchased: false, wallet_funded: true, admin_announcement: false },
    email:  { token_purchased: false, wallet_funded: false, admin_announcement: false },
    in_app: { token_purchased: true, wallet_funded: true, kyc_update: true, dispute_update: true, low_balance: true, payment_failed: true, meter_order_update: true, admin_announcement: true },
});
const savingPrefs = ref(false);
const prefsError  = ref('');
const prefsSaved  = ref(false);

// ── Helpers ───────────────────────────────────────────────────────────────────

const NOTIF_ICON: Record<string, string> = {
    token_purchased:   'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    wallet_funded:     'M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
    kyc_update:        'M9 12l2 2 4-4M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
    dispute_update:    'M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z',
    admin_announcement:'M3 11v2a4 4 0 004 4h1l4 4v-4h5a4 4 0 004-4v-2M7 7h10M7 11h7',
    low_balance:       'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
    payment_failed:    'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2M12 3C6.48 3 2 7.48 2 12s4.48 9 10 9 10-4.48 10-10S17.52 3 12 3z',
    meter_order_update:'M12 21a9 9 0 100-18 9 9 0 000 18M12 7v5l3 2',
    wallet_activity:    'M2 6h20v14H2zM2 10h20M16 14h2',
};

const NOTIF_COLOR: Record<string, string> = {
    token_purchased:   'var(--brand)',
    wallet_funded:     'var(--brand)',
    kyc_update:        'oklch(70% 0.19 145)',
    dispute_update:    'oklch(70% 0.15 280)',
    admin_announcement:'var(--brand)',
    low_balance:       'oklch(78% 0.16 75)',
    payment_failed:    'oklch(60% 0.22 25)',
    meter_order_update:'oklch(70% 0.15 220)',
    wallet_activity:    'var(--brand)',
};

function fmtDate(iso: string) {
    const d = new Date(iso);
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff < 60_000)  return 'just now';
    if (diff < 3600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86400_000) return `${Math.floor(diff / 3600_000)}h ago`;
    return d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

const PREF_GROUPS = [
    {
        label: 'Token purchases',
        key: 'token_purchased',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
    {
        label: 'Wallet funded',
        key: 'wallet_funded',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'sms'    as const, label: 'SMS'    },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
    {
        label: 'KYC verification',
        key: 'kyc_update',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
    {
        label: 'Dispute updates',
        key: 'dispute_update',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
    {
        label: 'Low balance',
        key: 'low_balance',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'sms'    as const, label: 'SMS'    },
        ],
    },
    {
        label: 'Payment failed',
        key: 'payment_failed',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
    {
        label: 'Meter order updates',
        key: 'meter_order_update',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'sms'    as const, label: 'SMS'    },
        ],
    },
    {
        label: 'Beverly announcements',
        key: 'admin_announcement',
        channels: [
            { channel: 'in_app' as const, label: 'In-app' },
            { channel: 'sms'    as const, label: 'SMS'    },
            { channel: 'email'  as const, label: 'Email'  },
        ],
    },
];

// ── Inbox actions ─────────────────────────────────────────────────────────────

async function loadInbox(reset = true) {
    if (reset) { items.value = []; nextCursor.value = null; }
    loading.value = true;
    inboxError.value = '';
    try {
        const qs = nextCursor.value ? `?limit=20&cursor=${encodeURIComponent(nextCursor.value)}` : '?limit=20';
        const r = await api.get<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }>(
            `/api/v1/customer/notifications${qs}`
        );
        items.value.push(...r.notifications);
        nextCursor.value  = r.nextCursor;
        if (reset) {
            unreadCount.value = r.unreadCount;
            publishNotificationCount(unreadCount.value);
        }
    } catch (e: any) {
        inboxError.value = e.message ?? 'Failed to load notifications.';
    } finally { loading.value = false; }
}

async function loadMore() {
    if (!nextCursor.value || loadingMore.value) return;
    loadingMore.value = true;
    try {
        const r = await api.get<{ notifications: Notification[]; nextCursor: string | null; unreadCount: number }>(
            `/api/v1/customer/notifications?limit=20&cursor=${encodeURIComponent(nextCursor.value)}`
        );
        items.value.push(...r.notifications);
        nextCursor.value = r.nextCursor;
    } catch { /* noop */ } finally { loadingMore.value = false; }
}

async function markRead(id: string) {
    const notif = items.value.find(n => n.id === id);
    if (!notif || notif.read) return;
    inboxError.value = '';
    try {
        await api.patch(`/api/v1/customer/notifications/${id}/read`);
        notif.read = true;
        if (unreadCount.value > 0) unreadCount.value--;
        publishNotificationCount(unreadCount.value);
    } catch (error: any) {
        inboxError.value = error?.message ?? 'Notification could not be marked read.';
    }
}

async function openNotification(notification: Notification) {
    await markRead(notification.id);
    const path = typeof notification.metadata?.path === 'string' ? notification.metadata.path : '';
    if (path) await router.push(path);
}

async function markAllRead() {
    markingAll.value = true;
    inboxError.value = '';
    try {
        await api.post('/api/v1/customer/notifications/read-all');
        items.value.forEach(n => { n.read = true; });
        unreadCount.value = 0;
        publishNotificationCount(0);
    } catch (error: any) {
        inboxError.value = error?.message ?? 'Notifications could not be marked read.';
    } finally { markingAll.value = false; }
}

// ── Preferences actions ───────────────────────────────────────────────────────

async function loadPrefs() {
    try {
        const r = await api.get<{ preferences: Preferences }>('/api/v1/customer/notifications/preferences');
        if (r.preferences) {
            prefs.value.sms    = { ...prefs.value.sms,    ...(r.preferences.sms    ?? {}) };
            prefs.value.email  = { ...prefs.value.email,  ...(r.preferences.email  ?? {}) };
            prefs.value.in_app = { ...prefs.value.in_app, ...(r.preferences.in_app ?? {}) };
        }
    } catch { /* use defaults */ }
}

async function savePrefs() {
    savingPrefs.value = true;
    prefsError.value  = '';
    prefsSaved.value  = false;
    try {
        await api.put('/api/v1/customer/notifications/preferences', {
            sms:    prefs.value.sms,
            email:  prefs.value.email,
            in_app: prefs.value.in_app,
        });
        prefsSaved.value = true;
        setTimeout(() => { prefsSaved.value = false; }, 2500);
    } catch (e: any) {
        prefsError.value = e.message ?? 'Failed to save.';
    } finally { savingPrefs.value = false; }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

onMounted(async () => {
    await Promise.all([loadInbox(), loadPrefs()]);
});
</script>

<template>
  <AppShell>
    <!-- Header -->
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom: var(--s-4)">
      <div>
        <p class="bw-page-title" style="margin:0">Notifications</p>
        <p class="bw-page-sub" style="margin:0">
          <span v-if="unreadCount > 0" style="color: var(--danger)">{{ unreadCount }} unread</span>
          <span v-else>All caught up</span>
        </p>
      </div>
    </div>

    <!-- Tabs -->
    <div class="notif-tabs">
      <button type="button" :class="['notif-tab', { active: tab === 'inbox' }]" :aria-pressed="tab === 'inbox'" @click="tab = 'inbox'">
        Inbox
        <span v-if="unreadCount > 0" class="notif-tab-badge">{{ unreadCount > 9 ? '9+' : unreadCount }}</span>
      </button>
      <button type="button" :class="['notif-tab', { active: tab === 'settings' }]" :aria-pressed="tab === 'settings'" @click="tab = 'settings'">
        Preferences
      </button>
    </div>

    <!-- ── INBOX TAB ────────────────────────────────────────────────────── -->
    <div v-if="tab === 'inbox'">
      <div class="notification-filters" aria-label="Filter notifications">
        <button v-for="option in filters" :key="option" type="button" :class="['notification-filter', { active: filter === option }]" :aria-pressed="filter === option" @click="filter = option">
          {{ option }}
        </button>
      </div>

      <!-- Mark all read -->
      <div v-if="unreadCount > 0" style="display:flex; justify-content:flex-end; margin-bottom: var(--s-3)">
        <button type="button" class="bw-btn sm notif-mark-all" :disabled="markingAll" @click="markAllRead">
          {{ markingAll ? 'Marking…' : 'Mark all read' }}
        </button>
      </div>

      <div v-if="inboxError" class="bw-alert danger" style="margin-bottom: var(--s-3)">{{ inboxError }}</div>

      <div v-if="loading && !items.length" style="display:grid; place-items:center; padding: var(--s-10)">
        <div class="bw-spinner" />
      </div>

      <div v-else-if="!items.length" class="bw-empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>
        <p>No notifications yet</p>
        <p style="font-size: var(--t-sm); color: var(--text-dim)">Events like token purchases and wallet top-ups will appear here.</p>
      </div>

      <div v-else-if="!filteredItems.length" class="bw-empty-state">
        <p>No {{ filter }} notifications</p>
        <p style="font-size: var(--t-sm); color: var(--text-dim)">Choose another filter.</p>
      </div>

      <div v-else class="bw-stack" style="gap: var(--s-2)">
        <div
          v-for="n in filteredItems"
          :key="n.id"
          :class="['notif-item', { unread: !n.read }]"
          @click="openNotification(n)"
        >
          <!-- Icon -->
          <div class="notif-icon" :style="`background: ${NOTIF_COLOR[n.type] ?? 'var(--brand)'}/14;`">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" :stroke="NOTIF_COLOR[n.type] ?? 'var(--brand)'" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path :d="NOTIF_ICON[n.type] ?? 'M12 2v20M5 12h14'" />
            </svg>
          </div>

          <!-- Content -->
          <div style="flex:1; min-width:0">
            <div style="display:flex; align-items:flex-start; justify-content:space-between; gap: var(--s-2)">
              <p class="notif-title">{{ n.title }}</p>
              <span class="notif-time">{{ fmtDate(n.created_at) }}</span>
            </div>
            <p class="notif-body">{{ n.body }}</p>
          </div>

          <!-- Unread dot -->
          <div v-if="!n.read" class="notif-unread-dot" />
        </div>
      </div>

      <!-- Load more -->
      <div v-if="nextCursor" style="display:flex; justify-content:center; margin-top: var(--s-4)">
        <button class="bw-btn" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? 'Loading…' : 'Load more' }}
        </button>
      </div>
    </div>

    <!-- ── PREFERENCES TAB ───────────────────────────────────────────────── -->
    <div v-if="tab === 'settings'">
      <p class="bw-page-sub" style="margin-bottom: var(--s-4)">
        Choose how you want to be notified for each event. OTP and security messages cannot be turned off.
      </p>

      <div v-if="prefsError" class="bw-alert danger" style="margin-bottom: var(--s-3)">{{ prefsError }}</div>

      <div class="bw-stack" style="gap: var(--s-3)">
        <div v-for="group in PREF_GROUPS" :key="group.key" class="bw-card">
          <p style="font-weight:600; margin:0 0 var(--s-3)">{{ group.label }}</p>
          <div class="pref-channels">
            <label
              v-for="ch in group.channels"
              :key="ch.channel"
              class="pref-toggle"
            >
              <span class="pref-toggle-label">{{ ch.label }}</span>
              <input
                type="checkbox"
                :checked="prefs[ch.channel][group.key] ?? false"
                @change="prefs[ch.channel][group.key] = ($event.target as HTMLInputElement).checked"
              />
            </label>
          </div>
        </div>
      </div>

      <p class="bw-muted" style="font-size: var(--t-xs); margin: var(--s-4) 0">
        OTP, login alerts, and security messages are always sent regardless of preferences.
      </p>

      <div v-if="prefsSaved" class="bw-alert success" style="margin-bottom: var(--s-3)">
        ✓ Preferences saved
      </div>

      <button class="bw-btn primary lg full" :disabled="savingPrefs" @click="savePrefs">
        {{ savingPrefs ? 'Saving…' : 'Save preferences' }}
      </button>
    </div>

  </AppShell>
</template>

<style scoped>
/* Tabs */
.notif-tabs {
  display: flex;
  gap: var(--s-1);
  background: var(--surface-2, oklch(from var(--surface) calc(l - 0.03) c h));
  border-radius: var(--r-xl);
  padding: 4px;
  margin-bottom: var(--s-4);
}
.notif-tab {
  flex: 1;
  padding: var(--s-2) var(--s-3);
  border: none;
  background: transparent;
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
  font-weight: 500;
  color: var(--text-dim);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--s-1);
  transition: background 0.15s, color 0.15s;
  min-height: 44px;
}
.notif-mark-all { min-height: 44px; }
.notif-tab.active {
  background: var(--glass-bg-strong);
  color: var(--text);
  font-weight: 600;
  box-shadow: var(--glass-shadow-card);
}
.notif-tab-badge {
  background: var(--danger, oklch(60% 0.22 25));
  color: #fff;
  font-size: 9px;
  font-weight: 700;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 99px;
  line-height: 16px;
  text-align: center;
}
.notification-filters {
  display: flex;
  gap: var(--s-1);
  margin-bottom: var(--s-3);
}
.notification-filter {
  min-height: 36px;
  padding: 0 var(--s-3);
  border: 1px solid var(--border);
  border-radius: 999px;
  background: transparent;
  color: var(--text-dim);
  font: inherit;
  font-size: var(--t-sm);
  font-weight: 700;
  text-transform: capitalize;
  cursor: pointer;
}
.notification-filter.active {
  border-color: oklch(from var(--brand) l c h / 0.55);
  background: oklch(from var(--brand) l c h / 0.14);
  color: var(--brand);
}
.notification-filter:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }

/* Inbox items */
.notif-item {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3);
  padding: var(--s-3) var(--s-4);
  background: var(--glass-bg);
  border: 1px solid var(--glass-border);
  backdrop-filter: blur(16px) saturate(150%);
  -webkit-backdrop-filter: blur(16px) saturate(150%);
  box-shadow: var(--glass-shine), var(--glass-shadow-card);
  border-radius: var(--r-xl);
  cursor: pointer;
  transition: background 0.12s;
  position: relative;
}
.notif-item.unread {
  background: oklch(from var(--brand) l c h / 0.05);
  border-color: oklch(from var(--brand) l c h / 0.20);
}
.notif-item:hover { background: oklch(from var(--surface) calc(l - 0.02) c h); }

.notif-icon {
  width: 36px;
  height: 36px;
  border-radius: var(--r-lg);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  background: oklch(from var(--brand) l c h / 0.12);
}

.notif-title {
  margin: 0;
  font-size: var(--t-sm);
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.notif-body {
  margin: 2px 0 0;
  font-size: var(--t-xs);
  color: var(--text-dim);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.notif-time {
  font-size: 10px;
  color: var(--text-dim);
  white-space: nowrap;
  flex-shrink: 0;
}
.notif-unread-dot {
  position: absolute;
  top: 12px;
  right: 12px;
  width: 7px;
  height: 7px;
  background: var(--brand);
  border-radius: 50%;
}

/* Empty state */
.bw-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s-3);
  text-align: center;
  padding: var(--s-10) 0;
  color: var(--text-dim);
}
.bw-empty-state p { margin: 0; }

/* Preferences */
.pref-channels {
  display: flex;
  flex-direction: column;
  gap: var(--s-2);
}
.pref-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: var(--t-sm);
  cursor: pointer;
  padding: var(--s-1) 0;
}
.pref-toggle-label { color: var(--text); }
.pref-toggle input[type="checkbox"] {
  width: 18px;
  height: 18px;
  accent-color: var(--brand);
  cursor: pointer;
}

/* Spinner */
.bw-spinner {
  width: 26px;
  height: 26px;
  border: 2.5px solid var(--border);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
</style>
