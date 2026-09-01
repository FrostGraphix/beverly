<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import MessageSuccessHover from '../components/MessageSuccessHover.vue';
import { api, shortDate } from '../lib/api';
import WalletExportMenu from '@beverly/tokens/WalletExportMenu.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';

type AudienceKey = 'customers' | 'vendors';

interface Recipient {
    key: string;
    type: 'customer' | 'vendor';
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    status: string | null;
}

interface Announcement {
    id: string;
    title: string;
    body: string;
    audience: string;
    target_mode: string;
    recipient_count: number;
    created_at: string;
}

interface RecipientSummary {
    customers: number;
    vendors: number;
    total: number;
}

const audiences = ref<Record<AudienceKey, boolean>>({ customers: true, vendors: false });
const summary = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const audienceTotals = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const systemWide = ref(false);
const sendToAll = ref(true);
const search = ref('');
const title = ref('');
const message = ref('');
const recipients = ref<Recipient[]>([]);
const selectedKeys = ref<string[]>([]);
const history = ref<Announcement[]>([]);
const announcementExportColumns: WalletExportColumn<Announcement>[] = [
    { key: 'created_at', header: 'Sent', value: (item) => shortDate(item.created_at) },
    { key: 'title', header: 'Title', value: (item) => item.title },
    { key: 'body', header: 'Message', value: (item) => item.body },
    { key: 'audience', header: 'Audience', value: (item) => item.audience },
    { key: 'target_mode', header: 'Target Mode', value: (item) => item.target_mode },
    { key: 'recipient_count', header: 'Recipients', value: (item) => item.recipient_count },
];
const loadingRecipients = ref(false);
const loadingHistory = ref(false);
const sending = ref(false);
const banner = ref<{ tone: 'success' | 'danger'; text: string } | null>(null);
const feedback = ref<{ id: number; open: boolean; tone: 'success' | 'error'; title: string; message: string }>({
    id: 0,
    open: false,
    tone: 'success',
    title: '',
    message: '',
});

let searchTimer: ReturnType<typeof setTimeout> | null = null;
let feedbackTimer: ReturnType<typeof setTimeout> | null = null;

const selectedAudiences = computed<AudienceKey[]>(() => {
    if (systemWide.value) return ['customers', 'vendors'];
    return (Object.keys(audiences.value) as AudienceKey[]).filter((key) => audiences.value[key]);
});

const audienceParam = computed(() => {
    if (selectedAudiences.value.length === 2) return 'system';
    return selectedAudiences.value[0] ?? 'customers';
});

const selectedCount = computed(() => sendToAll.value ? summary.value.total : selectedKeys.value.length);
const customerCount = computed(() => audienceTotals.value.customers);
const vendorCount = computed(() => audienceTotals.value.vendors);
const lastSent = computed(() => history.value[0] ? shortDate(history.value[0].created_at) : 'None');

function closeFeedback() {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.value.open = false;
}

function showFeedback(tone: 'success' | 'error', feedbackTitle: string, feedbackMessage: string) {
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedback.value = {
        id: feedback.value.id + 1,
        open: true,
        tone,
        title: feedbackTitle,
        message: feedbackMessage,
    };
    feedbackTimer = setTimeout(() => {
        feedback.value.open = false;
    }, 8000);
}

function labelType(type: string) {
    return type === 'vendor' ? 'Vendor' : 'Customer';
}

function toggleAudience(key: AudienceKey) {
    systemWide.value = false;
    audiences.value[key] = !audiences.value[key];
    if (!selectedAudiences.value.length) audiences.value[key] = true;
}

function setSystemWide(checked: boolean) {
    systemWide.value = checked;
    if (checked) audiences.value = { customers: true, vendors: true };
}

function toggleRecipient(key: string) {
    if (selectedKeys.value.includes(key)) {
        selectedKeys.value = selectedKeys.value.filter((value) => value !== key);
    } else {
        selectedKeys.value = [...selectedKeys.value, key];
    }
}

async function loadRecipients() {
    loadingRecipients.value = true;
    try {
        const qs = new URLSearchParams({ audience: audienceParam.value, limit: '500' });
        const totalsQs = new URLSearchParams({ audience: 'system', limit: '1' });
        if (search.value.trim()) qs.set('search', search.value.trim());
        if (search.value.trim()) totalsQs.set('search', search.value.trim());
        const [response, totalsResponse] = await Promise.all([
            api.get<{ recipients: Recipient[]; summary: RecipientSummary }>(`/api/v1/admin/announcements/recipients?${qs}`),
            api.get<{ recipients: Recipient[]; summary: RecipientSummary }>(`/api/v1/admin/announcements/recipients?${totalsQs}`),
        ]);
        recipients.value = response.recipients ?? [];
        summary.value = response.summary ?? { customers: 0, vendors: 0, total: recipients.value.length };
        audienceTotals.value = totalsResponse.summary ?? summary.value;
        selectedKeys.value = selectedKeys.value.filter((key) => recipients.value.some((r) => r.key === key));
    } catch (error: any) {
        banner.value = { tone: 'danger', text: error?.message ?? 'Recipients failed to load.' };
    } finally {
        loadingRecipients.value = false;
    }
}

async function loadHistory() {
    loadingHistory.value = true;
    try {
        const response = await api.get<{ announcements: Announcement[] }>(`/api/v1/admin/announcements?limit=25&t=${Date.now()}`);
        history.value = response.announcements ?? [];
    } catch {
        history.value = [];
    } finally {
        loadingHistory.value = false;
    }
}

async function sendAnnouncement() {
    if (sending.value) return;
    if (title.value.trim().length < 3) {
        showFeedback('error', 'Title required', 'Enter an announcement title using at least 3 characters.');
        return;
    }
    if (message.value.trim().length < 5) {
        showFeedback('error', 'Message required', 'Enter an announcement message using at least 5 characters.');
        return;
    }
    if (!selectedAudiences.value.length) {
        showFeedback('error', 'Audience required', 'Select customers, vendors, or system wide.');
        return;
    }
    if (!selectedCount.value) {
        showFeedback('error', 'Recipients required', 'No reachable recipients match this announcement.');
        return;
    }
    sending.value = true;
    banner.value = null;
    try {
        const response = await api.post<{ delivered: number }>('/api/v1/admin/announcements', {
            title: title.value.trim(),
            body: message.value.trim(),
            audiences: selectedAudiences.value,
            send_to_all: sendToAll.value,
            recipient_keys: sendToAll.value ? [] : selectedKeys.value,
        });
        const sentMessage = `${response.delivered} notifications sent. Message history refreshed.`;
        banner.value = { tone: 'success', text: sentMessage };
        showFeedback('success', 'Message sent', sentMessage);
        title.value = '';
        message.value = '';
        selectedKeys.value = [];
        await loadHistory();
        await loadRecipients();
    } catch (error: any) {
        const errorMessage = error?.message ?? 'Announcement failed.';
        banner.value = { tone: 'danger', text: errorMessage };
        showFeedback('error', 'Message not sent', errorMessage);
    } finally {
        sending.value = false;
    }
}

watch([selectedAudiences, systemWide], () => {
    void loadRecipients();
});

watch(search, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadRecipients(), 250);
});

onMounted(() => {
    void Promise.all([loadRecipients(), loadHistory()]);
});
onBeforeUnmount(() => {
    if (searchTimer) clearTimeout(searchTimer);
    if (feedbackTimer) clearTimeout(feedbackTimer);
});
</script>

<template>
  <AppShell title="Announcements">
    <MessageSuccessHover
      :key="feedback.id"
      :open="feedback.open"
      :tone="feedback.tone"
      :title="feedback.title"
      :message="feedback.message"
      @close="closeFeedback"
    />

    <div v-if="banner" :class="['bw-alert', banner.tone]" style="margin-bottom: var(--s-4)">
      {{ banner.text }}
    </div>

    <section class="bw-kpi-grid bw-mobile-kpi-grid announcements-kpis" aria-label="Announcement summary">
      <article class="bw-kpi featured">
        <span class="bw-kpi-label">Customers</span>
        <strong class="bw-kpi-value">{{ customerCount }}</strong>
        <span class="bw-kpi-note">reachable recipients</span>
      </article>
      <article class="bw-kpi info-tone">
        <span class="bw-kpi-label">Vendors</span>
        <strong class="bw-kpi-value">{{ vendorCount }}</strong>
        <span class="bw-kpi-note">reachable recipients</span>
      </article>
      <article class="bw-kpi warn-tone">
        <span class="bw-kpi-label">Last sent</span>
        <strong class="bw-kpi-value announcement-last">{{ lastSent }}</strong>
        <span class="bw-kpi-note">{{ history.length }} recent records</span>
      </article>
    </section>

    <div class="an-grid">
      <section class="bw-card an-compose">
        <div class="an-section-head">
          <div>
            <p class="kicker">Broadcast</p>
            <h2>New announcement</h2>
          </div>
          <span class="bw-badge bw-badge-brand">{{ selectedCount }} targets</span>
        </div>

        <div class="an-checks">
          <label class="an-check">
            <input type="checkbox" :checked="audiences.customers" :disabled="systemWide" @change="toggleAudience('customers')" />
            <span>Customers</span>
          </label>
          <label class="an-check">
            <input type="checkbox" :checked="audiences.vendors" :disabled="systemWide" @change="toggleAudience('vendors')" />
            <span>Vendors</span>
          </label>
          <label class="an-check an-check-wide">
            <input type="checkbox" :checked="systemWide" @change="setSystemWide(($event.target as HTMLInputElement).checked)" />
            <span>System wide</span>
          </label>
        </div>

        <label class="an-field">
          <span>Title</span>
          <input v-model="title" class="bw-input" maxlength="120" placeholder="Service update" />
        </label>

        <label class="an-field">
          <span>Message</span>
          <textarea v-model="message" class="bw-input an-textarea" maxlength="2000" placeholder="Write the message users will see..." />
        </label>

        <div class="an-scope">
          <label class="an-check">
            <input v-model="sendToAll" type="checkbox" />
            <span>Send to all selected audiences</span>
          </label>
          <input v-model="search" class="bw-input bw-input-sm" placeholder="Search recipients..." :disabled="sendToAll" />
        </div>

        <div v-if="!sendToAll" class="an-recipient-list" aria-label="Recipient checklist">
          <button
            v-for="recipient in recipients"
            :key="recipient.key"
            type="button"
            :class="['an-recipient', { selected: selectedKeys.includes(recipient.key) }]"
            @click="toggleRecipient(recipient.key)"
          >
            <input type="checkbox" :checked="selectedKeys.includes(recipient.key)" tabindex="-1" readonly />
            <span>
              <strong>{{ recipient.name }}</strong>
              <small>{{ labelType(recipient.type) }} · {{ recipient.email || recipient.phone || recipient.status || 'No contact' }}</small>
            </span>
          </button>
          <p v-if="!loadingRecipients && !recipients.length" class="bw-muted">No matching recipients.</p>
        </div>

        <button class="bw-btn primary an-send" :disabled="sending" @click="sendAnnouncement">
          {{ sending ? 'Sending...' : 'Send announcement' }}
        </button>
      </section>

      <aside class="bw-card an-preview">
        <p class="kicker">Preview</p>
        <div class="an-phone">
          <div class="an-phone-head">Beverly</div>
          <div class="an-bubble">
            <strong>{{ title || 'Announcement title' }}</strong>
            <p>{{ message || 'Your message preview appears here.' }}</p>
          </div>
        </div>
      </aside>
    </div>

    <section class="bw-card flush an-history">
      <div class="bw-table-head-bar">
        <div>
          <h2>Message history</h2>
          <p>{{ loadingHistory ? 'Loading...' : `${history.length} recent sends` }}</p>
        </div>
        <WalletExportMenu
          :rows="history"
          :columns="announcementExportColumns"
          filename="beverly-admin-announcements"
          title="Announcement History"
          subtitle="Recent wallet communications"
          :loading="loadingHistory"
        />
      </div>
      <div v-if="history.length" class="an-history-slider" aria-label="Message history slider">
        <article v-for="item in history" :key="item.id" class="an-history-slide">
          <div class="an-history-slide-top">
            <span class="bw-badge bw-badge-neutral">{{ item.audience }}</span>
            <time>{{ shortDate(item.created_at) }}</time>
          </div>
          <h3>{{ item.title }}</h3>
          <p>{{ item.body }}</p>
          <div class="an-history-slide-foot">
            <span>Recipients</span>
            <strong class="bw-mono">{{ item.recipient_count }}</strong>
          </div>
        </article>
      </div>
      <div v-else class="bw-empty">No announcements sent.</div>
    </section>
  </AppShell>
</template>

<style scoped>
.announcements-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: var(--s-4);
}
.announcement-last {
    font-size: clamp(var(--t-xl), 2.6vw, var(--t-3xl));
    overflow-wrap: anywhere;
}
.kicker {
    color: var(--text-muted);
    font-size: var(--t-xs);
    font-weight: 800;
    letter-spacing: .12em;
    margin: 0;
    text-transform: uppercase;
}
.an-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.35fr) minmax(280px, .65fr);
    gap: var(--s-4);
    align-items: start;
}
.an-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-3);
    margin-bottom: var(--s-4);
}
.an-section-head h2,
.an-history h2 {
    margin: var(--s-1) 0 0;
}
.an-checks {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
    margin-bottom: var(--s-4);
}
.an-check {
    min-height: 48px;
    display: flex;
    align-items: center;
    gap: var(--s-2);
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    padding: 0 var(--s-3);
    background: color-mix(in oklab, var(--surface), transparent 8%);
    cursor: pointer;
}
.an-check input {
    accent-color: var(--brand);
}
.an-field {
    display: grid;
    gap: var(--s-2);
    margin-bottom: var(--s-4);
}
.an-field span {
    color: var(--text-muted);
    font-size: var(--t-xs);
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
}
.an-textarea {
    min-height: 150px;
    resize: vertical;
}
.an-scope {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, .6fr);
    gap: var(--s-3);
    align-items: center;
    margin-bottom: var(--s-4);
}
.an-recipient-list {
    max-height: 300px;
    overflow: auto;
    display: grid;
    gap: var(--s-2);
    margin-bottom: var(--s-4);
    padding-right: var(--s-1);
}
.an-recipient {
    display: flex;
    align-items: center;
    gap: var(--s-3);
    width: 100%;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text);
    padding: var(--s-3);
    text-align: left;
    cursor: pointer;
}
.an-recipient.selected {
    border-color: color-mix(in oklab, var(--brand), white 16%);
    background: color-mix(in oklab, var(--brand), transparent 84%);
}
.an-recipient span {
    min-width: 0;
}
.an-recipient small {
    display: block;
    color: var(--text-muted);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.an-send {
    width: 100%;
    min-height: 48px;
}
.an-preview {
    position: sticky;
    top: var(--s-4);
}
.an-phone {
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: var(--s-4);
    margin-top: var(--s-3);
    background: var(--bg);
}
.an-phone-head {
    color: var(--brand);
    font-weight: 800;
    margin-bottom: var(--s-4);
}
.an-bubble {
    border-radius: var(--r-md);
    background: color-mix(in oklab, var(--brand), transparent 86%);
    padding: var(--s-4);
}
.an-bubble p {
    color: var(--text-muted);
    margin-bottom: 0;
    white-space: pre-wrap;
}
.an-history {
    margin-top: var(--s-4);
    overflow: hidden;
}
.an-history-slider {
    display: grid;
    grid-auto-columns: minmax(280px, 72%);
    grid-auto-flow: column;
    gap: var(--s-3);
    margin-top: var(--s-4);
    overflow-x: auto;
    overscroll-behavior-inline: contain;
    padding: 0 var(--s-4) var(--s-4);
    scroll-padding-inline: var(--s-4);
    scroll-snap-type: inline mandatory;
    scrollbar-color: color-mix(in oklab, var(--brand), transparent 30%) transparent;
}
.an-history-slider::-webkit-scrollbar {
    height: 8px;
}
.an-history-slider::-webkit-scrollbar-thumb {
    background: color-mix(in oklab, var(--brand), transparent 30%);
    border-radius: 999px;
}
.an-history-slide {
    min-height: 210px;
    display: grid;
    align-content: space-between;
    gap: var(--s-3);
    border: 1px solid color-mix(in oklab, var(--brand), transparent 58%);
    border-radius: var(--r-lg);
    background:
        linear-gradient(145deg, color-mix(in oklab, var(--brand), transparent 82%), transparent 58%),
        var(--surface);
    padding: var(--s-4);
    scroll-snap-align: start;
}
.an-history-slide-top,
.an-history-slide-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
}
.an-history-slide time,
.an-history-slide-foot span {
    color: var(--text-muted);
    font-size: var(--t-sm);
    font-weight: 700;
}
.an-history-slide h3 {
    margin: 0;
    color: var(--text);
    font-size: var(--t-xl);
    line-height: 1.1;
}
.an-history-slide p {
    display: -webkit-box;
    overflow: hidden;
    color: var(--text-muted);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 3;
    margin: 0;
}
@media (max-width: 760px) {
    .an-grid,
    .an-checks,
    .an-scope {
        grid-template-columns: 1fr;
    }
    .announcements-kpis {
        grid-template-columns: 1fr;
    }
    .an-preview {
        position: static;
    }
    .an-history-slider {
        grid-auto-columns: minmax(250px, 88%);
    }
}
</style>
