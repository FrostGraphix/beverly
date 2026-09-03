<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import AppShell from '../components/AppShell.vue';
import MessageSuccessHover from '../components/MessageSuccessHover.vue';
import { ApiError, api, shortDate } from '../lib/api';
import WalletExportWizard from '@beverly/tokens/WalletExportWizard.vue';
import type { WalletExportColumn } from '@beverly/tokens/wallet-export';
import type { WalletExportSelection } from '@beverly/tokens/wallet-export-wizard';

type AudienceKey = 'customers' | 'vendors';
type DeliveryMode = 'notification' | 'email' | 'both';

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
    channel?: string;
    recipient_count: number;
    email_recipient_count?: number;
    email_sent_count?: number;
    email_failed_count?: number;
    delivery_status?: string;
    created_at: string;
}

interface RecipientSummary {
    customers: number;
    vendors: number;
    total: number;
}

const audiences = ref<Record<AudienceKey, boolean>>({ customers: true, vendors: false });
const deliveryMode = ref<DeliveryMode>('both');
const summary = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const audienceTotals = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const emailSummary = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const notificationSummary = ref<RecipientSummary>({ customers: 0, vendors: 0, total: 0 });
const systemWide = ref(false);
const sendToAll = ref(true);
const search = ref('');
const title = ref('');
const message = ref('');
const recipients = ref<Recipient[]>([]);
const selectedKeys = ref<string[]>([]);
const history = ref<Announcement[]>([]);
const activeTab = ref<'compose' | 'history'>('compose');
const selectedHistory = ref<Announcement | null>(null);
const historyDetailClose = ref<HTMLButtonElement | null>(null);
const brandLogoLightUrl = `${import.meta.env.BASE_URL}brand/beverly-lockup.png`;
const composeStep = ref(1);
const stepLabels = ['Audience', 'Message', 'Review'];
const announcementStatusOptions = [
    { label: 'Untracked legacy sends', value: 'unknown' },
    { label: 'Sent', value: 'sent' },
    { label: 'Partially sent', value: 'partial' },
    { label: 'Failed', value: 'failed' },
];
const announcementAudienceOptions = [
    { label: 'Customers', value: 'customers' },
    { label: 'Vendors', value: 'vendors' },
    { label: 'Everyone', value: 'system' },
];
const announcementExportColumns: WalletExportColumn<Announcement>[] = [
    { key: 'created_at', header: 'Sent', value: (item) => shortDate(item.created_at) },
    { key: 'title', header: 'Title', value: (item) => item.title },
    { key: 'body', header: 'Message', value: (item) => item.body },
    { key: 'audience', header: 'Audience', value: (item) => item.audience },
    { key: 'target_mode', header: 'Target Mode', value: (item) => item.target_mode },
    { key: 'channel', header: 'Medium', value: (item) => formatChannel(item.channel) },
    { key: 'recipient_count', header: 'Recipients', value: (item) => item.recipient_count },
    { key: 'email_recipient_count', header: 'Email Recipients', value: (item) => item.email_recipient_count ?? 'Untracked' },
    { key: 'email_sent_count', header: 'Emails Sent', value: (item) => item.email_sent_count ?? 'Untracked' },
    { key: 'email_failed_count', header: 'Email Failures', value: (item) => item.email_failed_count ?? 'Untracked' },
    { key: 'delivery_status', header: 'Delivery', value: (item) => item.delivery_status ?? 'unknown' },
];
const loadingRecipients = ref(false);
const loadingHistory = ref(false);
const sending = ref(false);
const broadcastRequestKey = ref(crypto.randomUUID());
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
let historyTrigger: HTMLElement | null = null;
let previousBodyOverflow = '';

const selectedAudiences = computed<AudienceKey[]>(() => {
    if (systemWide.value) return ['customers', 'vendors'];
    return (Object.keys(audiences.value) as AudienceKey[]).filter((key) => audiences.value[key]);
});

const audienceParam = computed(() => {
    if (selectedAudiences.value.length === 2) return 'system';
    return selectedAudiences.value[0] ?? 'customers';
});

const selectedCount = computed(() => sendToAll.value ? summary.value.total : selectedKeys.value.length);
const selectedEmailCount = computed(() => {
    if (deliveryMode.value === 'notification') return 0;
    if (sendToAll.value) return emailSummary.value.total;
    return new Set(recipients.value
        .filter((recipient) => selectedKeys.value.includes(recipient.key))
        .map((recipient) => recipient.email?.trim().toLowerCase())
        .filter(Boolean)).size;
});
const selectedNotificationCount = computed(() => deliveryMode.value === 'email'
    ? 0
    : sendToAll.value ? notificationSummary.value.total : selectedCount.value);
const composeCanContinue = computed(() => composeStep.value === 1
    ? !loadingRecipients.value && selectedAudiences.value.length > 0 && selectedCount.value > 0
    : title.value.trim().length >= 3 && message.value.trim().length >= 5);
const audienceLabel = computed(() => systemWide.value
    ? 'Everyone'
    : selectedAudiences.value.map((item) => item === 'customers' ? 'Customers' : 'Vendors').join(' and '));
const deliveryLabel = computed(() => deliveryMode.value === 'notification' ? 'In-app notification' : deliveryMode.value === 'email' ? 'Email' : 'Notification and email');
const recipientGuidance = computed(() => deliveryMode.value === 'email'
    ? 'Only reachable email addresses.'
    : deliveryMode.value === 'notification'
        ? 'Registered Beverly wallet accounts.'
        : 'Notifications reach accounts. Emails require addresses.');
const matchingLabel = computed(() => deliveryMode.value === 'email' ? 'email' : deliveryMode.value === 'notification' ? 'account' : 'recipient');
const channelPayload = computed(() => deliveryMode.value === 'notification' ? ['in_app'] : deliveryMode.value === 'email' ? ['email'] : ['in_app', 'email']);
const customerCount = computed(() => audienceTotals.value.customers);
const vendorCount = computed(() => audienceTotals.value.vendors);
const lastSent = computed(() => history.value[0] ? shortDate(history.value[0].created_at) : 'None');
const previewMessage = computed(() => {
    let value = message.value.replace(/\r\n?/g, '\n').trim();
    value = value.replace(/(?:\n\s*){0,2}(?:warm\s+regards|kind\s+regards|regards|best\s+regards),?[\s,]+(?:—\s*)?the\s+beverly\s+team\s*$/i, '');
    value = value.replace(/(?:\n\s*){1,2}(?:—\s*)?the\s+beverly\s+team\s*$/i, '');
    const numberedItems = value.match(/(?:^|\s)\d+\.\s+[^\n]+?(?=(?:\s+\d+\.\s+)|$)/g);
    return (numberedItems?.length ?? 0) >= 2
        ? value.replace(/\s+(?=\d+\.\s+)/g, '\n')
        : value;
});

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

function openHistoryDetail(item: Announcement, event: MouseEvent) {
    historyTrigger = event.currentTarget as HTMLElement;
    previousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    selectedHistory.value = item;
    void nextTick(() => historyDetailClose.value?.focus());
}

function closeHistoryDetail() {
    selectedHistory.value = null;
    document.body.style.overflow = previousBodyOverflow;
    void nextTick(() => historyTrigger?.focus());
}

function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && selectedHistory.value) closeHistoryDetail();
}

function formatChannel(channel?: string) {
    if (!channel) return 'Legacy';
    const values = channel.split(',');
    if (values.includes('in_app') && values.includes('email')) return 'Notification + email';
    return values.includes('in_app') ? 'Notification' : 'Email';
}

function setAudiencePreset(value: 'customers' | 'vendors' | 'system') {
    systemWide.value = value === 'system';
    audiences.value = value === 'customers'
        ? { customers: true, vendors: false }
        : value === 'vendors'
            ? { customers: false, vendors: true }
            : { customers: true, vendors: true };
    selectedKeys.value = [];
}

function continueCompose() {
    if (!composeCanContinue.value) {
        if (composeStep.value === 1) showFeedback('error', 'Recipients required', 'Choose a reachable audience before continuing.');
        else showFeedback('error', 'Message incomplete', 'Add a title and message before continuing.');
        return;
    }
    composeStep.value = Math.min(3, composeStep.value + 1);
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
        const qs = new URLSearchParams({ audience: audienceParam.value, delivery: deliveryMode.value, limit: '500' });
        const totalsQs = new URLSearchParams({ audience: 'system', delivery: deliveryMode.value, limit: '1' });
        if (search.value.trim()) qs.set('search', search.value.trim());
        if (search.value.trim()) totalsQs.set('search', search.value.trim());
        const [response, totalsResponse] = await Promise.all([
            api.get<{ recipients: Recipient[]; summary: RecipientSummary; email_summary: RecipientSummary; notification_summary: RecipientSummary }>(`/api/v1/admin/announcements/recipients?${qs}`),
            api.get<{ recipients: Recipient[]; summary: RecipientSummary; email_summary: RecipientSummary; notification_summary: RecipientSummary }>(`/api/v1/admin/announcements/recipients?${totalsQs}`),
        ]);
        recipients.value = response.recipients ?? [];
        summary.value = response.summary ?? { customers: 0, vendors: 0, total: recipients.value.length };
        audienceTotals.value = totalsResponse.summary ?? summary.value;
        emailSummary.value = response.email_summary ?? summary.value;
        notificationSummary.value = response.notification_summary ?? summary.value;
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

async function resolveAnnouncementExport(selection: WalletExportSelection): Promise<Announcement[]> {
    const rows: Announcement[] = [];
    let offset = 0;
    for (;;) {
        const params = new URLSearchParams({ limit: '1000', offset: String(offset) });
        if (selection.since) params.set('since', new Date(`${selection.since}T00:00:00`).toISOString());
        if (selection.until) params.set('until', new Date(`${selection.until}T23:59:59.999`).toISOString());
        if (selection.status) params.set('status', selection.status);
        if (selection.actor) params.set('audience', selection.actor);
        const response = await api.get<{ announcements: Announcement[]; next_offset: number | null }>(`/api/v1/admin/announcements?${params}`);
        rows.push(...(response.announcements ?? []));
        if (response.next_offset === null) break;
        offset = response.next_offset;
    }
    return rows;
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
        const response = await api.post<{ delivered: number; notification_delivered: number; email_delivered: number }>('/api/v1/admin/announcements', {
            title: title.value.trim(),
            body: message.value.trim(),
            audiences: selectedAudiences.value,
            send_to_all: sendToAll.value,
            recipient_keys: sendToAll.value ? [] : selectedKeys.value,
            channels: channelPayload.value,
        }, { headers: { 'Idempotency-Key': broadcastRequestKey.value } });
        const parts = [
            response.notification_delivered ? `${response.notification_delivered} notifications` : '',
            response.email_delivered ? `${response.email_delivered} emails` : '',
        ].filter(Boolean);
        const sentMessage = `${parts.join(' and ')} sent. Message history refreshed.`;
        banner.value = { tone: 'success', text: sentMessage };
        showFeedback('success', 'Message sent', sentMessage);
        title.value = '';
        message.value = '';
        selectedKeys.value = [];
        composeStep.value = 1;
        activeTab.value = 'history';
        broadcastRequestKey.value = crypto.randomUUID();
        await loadHistory();
        await loadRecipients();
    } catch (error: any) {
        const errorMessage = error?.message ?? 'Announcement failed.';
        if (error instanceof ApiError
            && error.code === 'announcement_email_failed'
            && Number((error.details as any)?.sent ?? 0) === 0
            && Number((error.details as any)?.notification_sent ?? 0) === 0) {
            broadcastRequestKey.value = crypto.randomUUID();
        }
        banner.value = { tone: 'danger', text: errorMessage };
        showFeedback('error', 'Message not sent', errorMessage);
    } finally {
        sending.value = false;
    }
}

watch([selectedAudiences, systemWide, deliveryMode], () => {
    void loadRecipients();
});

watch(search, () => {
    if (searchTimer) clearTimeout(searchTimer);
    searchTimer = setTimeout(() => void loadRecipients(), 250);
});

watch(sendToAll, (enabled) => {
    if (enabled) {
        search.value = '';
        selectedKeys.value = [];
    }
});

onMounted(() => {
    document.addEventListener('keydown', handleKeydown);
    void Promise.all([loadRecipients(), loadHistory()]);
});
onBeforeUnmount(() => {
    document.removeEventListener('keydown', handleKeydown);
    document.body.style.overflow = previousBodyOverflow;
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

    <div class="an-page-tabs" role="tablist" aria-label="Announcement sections">
      <button id="announcement-compose-tab" type="button" role="tab" :aria-selected="activeTab === 'compose'" aria-controls="announcement-compose-panel" :class="{ active: activeTab === 'compose' }" @click="activeTab = 'compose'">
        New announcement
      </button>
      <button id="announcement-history-tab" type="button" role="tab" :aria-selected="activeTab === 'history'" aria-controls="announcement-history-panel" :class="{ active: activeTab === 'history' }" @click="activeTab = 'history'">
        Message history <span>{{ history.length }}</span>
      </button>
    </div>

    <section v-if="activeTab === 'compose'" id="announcement-compose-panel" class="bw-card an-compose" role="tabpanel" aria-labelledby="announcement-compose-tab announcement-builder-title">
      <div class="an-section-head">
        <div>
          <p class="kicker">Announcement broadcast</p>
          <h2 id="announcement-builder-title">New announcement</h2>
        </div>
        <span class="bw-badge bw-badge-brand">{{ selectedCount }} reachable</span>
      </div>

      <ol class="an-steps" aria-label="Announcement steps">
        <li v-for="(label, index) in stepLabels" :key="label" :class="{ active: composeStep === index + 1, done: composeStep > index + 1 }">
          <span>{{ index + 1 }}</span>{{ label }}
        </li>
      </ol>

      <div v-if="composeStep === 1" class="an-step-panel">
        <div class="an-step-copy">
          <h3>Choose delivery medium</h3>
          <p>Send a notification, email, or both.</p>
        </div>
        <div class="an-delivery-options" role="radiogroup" aria-label="Delivery medium">
          <button type="button" role="radio" :aria-checked="deliveryMode === 'notification'" :class="{ selected: deliveryMode === 'notification' }" @click="deliveryMode = 'notification'">
            <strong>Notification</strong><span>Inside Beverly</span>
          </button>
          <button type="button" role="radio" :aria-checked="deliveryMode === 'email'" :class="{ selected: deliveryMode === 'email' }" @click="deliveryMode = 'email'">
            <strong>Email</strong><span>Via Resend</span>
          </button>
          <button type="button" role="radio" :aria-checked="deliveryMode === 'both'" :class="{ selected: deliveryMode === 'both' }" @click="deliveryMode = 'both'">
            <strong>Both</strong><span>Maximum reach</span>
          </button>
        </div>
        <div class="an-step-copy">
          <h3>Choose recipients</h3>
          <p>{{ recipientGuidance }}</p>
        </div>
        <div class="an-audience-options" role="radiogroup" aria-label="Broadcast audience">
          <button type="button" role="radio" :aria-checked="!systemWide && audiences.customers && !audiences.vendors" :class="{ selected: !systemWide && audiences.customers && !audiences.vendors }" @click="setAudiencePreset('customers')">
            <strong>Customers</strong><span>{{ customerCount }} reachable</span>
          </button>
          <button type="button" role="radio" :aria-checked="!systemWide && audiences.vendors && !audiences.customers" :class="{ selected: !systemWide && audiences.vendors && !audiences.customers }" @click="setAudiencePreset('vendors')">
            <strong>Vendors</strong><span>{{ vendorCount }} reachable</span>
          </button>
          <button type="button" role="radio" :aria-checked="systemWide" :class="{ selected: systemWide }" @click="setAudiencePreset('system')">
            <strong>Everyone</strong><span>{{ audienceTotals.total }} reachable</span>
          </button>
        </div>
        <div class="an-scope">
          <label class="an-check">
            <input v-model="sendToAll" type="checkbox" />
            <span>Include every matching {{ matchingLabel }}</span>
          </label>
          <input v-model="search" class="bw-input bw-input-sm" placeholder="Search names or contact details" :disabled="sendToAll" aria-label="Search recipients" />
        </div>
        <div v-if="!sendToAll" class="an-recipient-list" aria-label="Recipient checklist">
          <button v-for="recipient in recipients" :key="recipient.key" type="button" :class="['an-recipient', { selected: selectedKeys.includes(recipient.key) }]" @click="toggleRecipient(recipient.key)">
            <input type="checkbox" :checked="selectedKeys.includes(recipient.key)" tabindex="-1" readonly />
            <span><strong>{{ recipient.name }}</strong><small>{{ labelType(recipient.type) }} · {{ recipient.email || recipient.phone || 'Beverly account' }}</small></span>
          </button>
          <p v-if="!loadingRecipients && !recipients.length" class="bw-muted">No matching recipients.</p>
        </div>
      </div>

      <div v-else-if="composeStep === 2" class="an-step-panel">
        <div class="an-step-copy"><h3>Write announcement</h3><p>Delivered by {{ deliveryLabel.toLowerCase() }}.</p></div>
        <label class="an-field"><span>{{ deliveryMode === 'email' ? 'Email subject' : 'Title' }}</span><input v-model="title" class="bw-input" maxlength="120" placeholder="Service update" /></label>
        <label class="an-field"><span>Message</span><textarea v-model="message" class="bw-input an-textarea" maxlength="2000" placeholder="Write the message recipients receive..." /></label>
        <div class="an-character-count">{{ message.length }} / 2000</div>
      </div>

      <div v-else class="an-step-panel an-review-grid">
        <div class="an-review-summary">
          <div class="an-step-copy"><h3>Review broadcast</h3><p>Confirm before sending.</p></div>
          <dl class="an-review-list">
            <div><dt>Audience</dt><dd>{{ audienceLabel }}</dd></div>
            <div><dt>Recipients</dt><dd>{{ selectedCount }}</dd></div>
            <div><dt>Delivery</dt><dd>{{ deliveryLabel }}</dd></div>
            <div v-if="selectedNotificationCount"><dt>Notifications</dt><dd>{{ selectedNotificationCount }}</dd></div>
            <div v-if="deliveryMode !== 'notification'"><dt>Emails</dt><dd>{{ selectedEmailCount }}</dd></div>
          </dl>
          <p class="an-send-warning">Sent announcements cannot be recalled.</p>
        </div>
        <div class="an-email-preview" :aria-label="deliveryMode === 'notification' ? 'Notification preview' : 'Email preview'">
          <span class="an-preview-logo" aria-label="Beverly">
            <img class="an-preview-logo-light" :src="brandLogoLightUrl" alt="Beverly" />
          </span>
          <span>Announcement</span>
          <strong>{{ title }}</strong>
          <p v-if="deliveryMode !== 'notification'">Hi recipient,</p>
          <p>{{ previewMessage }}</p>
          <small v-if="deliveryMode !== 'notification'">— The Beverly Team</small>
        </div>
      </div>

      <footer class="an-compose-actions">
        <button type="button" class="bw-btn" @click="composeStep === 1 ? (title = '', message = '') : composeStep--">{{ composeStep === 1 ? 'Clear' : 'Back' }}</button>
        <button v-if="composeStep < 3" type="button" class="bw-btn primary" @click="continueCompose">Continue</button>
        <button v-else type="button" class="bw-btn primary" :disabled="sending" @click="sendAnnouncement">{{ sending ? 'Sending...' : `Send to ${selectedCount}` }}</button>
      </footer>
    </section>

    <section v-else id="announcement-history-panel" class="bw-card flush an-history" role="tabpanel" aria-labelledby="announcement-history-tab">
      <div class="bw-table-head-bar">
        <div>
          <h2>Message history</h2>
          <p>{{ loadingHistory ? 'Loading...' : `${history.length} recent sends` }}</p>
        </div>
        <WalletExportWizard
          :rows="history"
          :columns="announcementExportColumns"
          filename="beverly-admin-announcements"
          title="Announcement History"
          subtitle="Recent wallet communications"
          :loading="loadingHistory"
          :status-options="announcementStatusOptions"
          :actor-options="announcementAudienceOptions"
          status-label="Delivery status"
          actor-label="Audience"
          all-status-label="All delivery statuses"
          all-actor-label="Every audience"
          hover-title="Choose announcement exports"
          hover-description="Filter dates, delivery, audience."
          :date-value="item => item.created_at"
          :status-value="item => item.delivery_status || 'unknown'"
          :actor-value="item => item.audience"
          :resolve-rows="resolveAnnouncementExport"
        />
      </div>
      <div v-if="history.length" class="an-history-grid" aria-label="Message history">
        <button v-for="item in history" :key="item.id" type="button" class="an-history-card" :aria-label="`View ${item.title}`" @click="openHistoryDetail(item, $event)">
          <div class="an-history-slide-top">
            <span class="bw-badge bw-badge-neutral">{{ item.audience }}</span>
            <time>{{ shortDate(item.created_at) }}</time>
          </div>
          <h3>{{ item.title }}</h3>
          <div class="an-history-slide-foot">
            <span>{{ item.delivery_status || 'unknown' }}</span>
            <span>{{ formatChannel(item.channel) }}</span>
            <strong>View</strong>
          </div>
        </button>
      </div>
      <div v-else class="bw-empty">No announcements sent.</div>
    </section>

    <Teleport to="body">
      <div v-if="selectedHistory" class="an-detail-scrim" role="presentation" @click.self="closeHistoryDetail">
        <section class="an-detail-dialog" role="dialog" aria-modal="true" aria-labelledby="announcement-detail-title">
          <header class="an-detail-head">
            <div>
              <span class="bw-badge bw-badge-neutral">{{ selectedHistory.audience }}</span>
              <h2 id="announcement-detail-title">{{ selectedHistory.title }}</h2>
            </div>
            <button ref="historyDetailClose" type="button" class="an-detail-close" aria-label="Close announcement details" @click="closeHistoryDetail">×</button>
          </header>
          <div class="an-detail-meta">
            <span>{{ shortDate(selectedHistory.created_at) }}</span>
            <span>{{ formatChannel(selectedHistory.channel) }}</span>
            <span>{{ selectedHistory.delivery_status || 'unknown' }}</span>
          </div>
          <div class="an-detail-message">{{ selectedHistory.body }}</div>
          <dl class="an-detail-counts">
            <div><dt>Recipients</dt><dd>{{ selectedHistory.recipient_count }}</dd></div>
            <div><dt>Emails sent</dt><dd>{{ selectedHistory.email_sent_count ?? 0 }} / {{ selectedHistory.email_recipient_count ?? 0 }}</dd></div>
            <div><dt>Email failures</dt><dd>{{ selectedHistory.email_failed_count ?? 0 }}</dd></div>
          </dl>
        </section>
      </div>
    </Teleport>
  </AppShell>
</template>

<style scoped>
.announcements-kpis {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    margin-bottom: var(--s-4);
}
.an-page-tabs {
    display: inline-grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: var(--s-1);
    margin-bottom: var(--s-4);
    padding: var(--s-1);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: var(--surface);
}
.an-page-tabs button {
    min-height: 42px;
    border: 0;
    border-radius: var(--r-md);
    background: transparent;
    color: var(--text-muted);
    padding: 0 var(--s-4);
    font: inherit;
    font-weight: 750;
    cursor: pointer;
}
.an-page-tabs button.active {
    background: color-mix(in oklab, var(--brand), transparent 84%);
    color: var(--text);
}
.an-page-tabs button:focus-visible {
    outline: 2px solid var(--brand);
    outline-offset: 2px;
}
.an-page-tabs span { margin-left: var(--s-1); color: var(--brand); }
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
.an-compose { padding: 0; overflow: hidden; }
.an-section-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-3);
    margin: 0;
    padding: var(--s-4);
}
.an-section-head h2,
.an-history h2 {
    margin: var(--s-1) 0 0;
}
.an-steps {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--s-2);
    list-style: none;
    margin: 0;
    padding: var(--s-3) var(--s-4);
    border-block: 1px solid var(--border);
}

.an-steps li {
    display: flex;
    align-items: center;
    gap: var(--s-2);
    color: var(--text-muted);
    font-size: var(--t-sm);
    font-weight: 750;
}
.an-steps li span {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    border: 1px solid var(--border);
    border-radius: 50%;
}
.an-steps li.active { color: var(--text); }
.an-steps li.active span,
.an-steps li.done span { border-color: var(--brand); background: var(--brand); color: #04150b; }
.an-step-panel { padding: var(--s-4); }
.an-step-copy { margin-bottom: var(--s-3); }
.an-step-copy h3 { margin: 0; }
.an-step-copy p { color: var(--text-muted); margin: var(--s-1) 0 0; }
.an-audience-options,
.an-delivery-options {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
    margin-bottom: var(--s-3);
}
.an-audience-options button,
.an-delivery-options button {
    display: grid;
    gap: var(--s-1);
    min-height: 76px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface);
    color: var(--text);
    padding: var(--s-3);
    text-align: left;
    cursor: pointer;
}
.an-audience-options button:hover,
.an-audience-options button:focus-visible,
.an-delivery-options button:hover,
.an-delivery-options button:focus-visible { border-color: color-mix(in oklab, var(--brand), white 12%); }
.an-audience-options button.selected,
.an-delivery-options button.selected { border-color: var(--brand); background: color-mix(in oklab, var(--brand), transparent 87%); }
.an-audience-options span,
.an-delivery-options span { color: var(--text-muted); font-size: var(--t-sm); }
.an-audience-options button.selected span,
.an-delivery-options button.selected span { color: color-mix(in oklab, var(--brand), white 16%); }
.an-compose-actions {
    display: flex;
    justify-content: flex-end;
    gap: var(--s-2);
    padding: var(--s-3) var(--s-4);
    border-top: 1px solid var(--border);
}
.an-check {
    min-height: 44px;
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
    min-height: 112px;
    resize: vertical;
}
.an-scope {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(220px, .6fr);
    gap: var(--s-3);
    align-items: center;
    margin-bottom: 0;
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
.an-character-count {
    color: var(--text-muted);
    font-size: var(--t-xs);
    margin-top: calc(var(--s-3) * -1);
    text-align: right;
}
.an-review-grid {
    display: grid;
    grid-template-columns: minmax(220px, .65fr) minmax(0, 1.35fr);
    gap: var(--s-4);
}
.an-review-list { margin: 0; }
.an-review-list div { display: flex; justify-content: space-between; gap: var(--s-3); padding: var(--s-2) 0; border-bottom: 1px solid var(--border); }
.an-review-list dt { color: var(--text-muted); }
.an-review-list dd { margin: 0; font-weight: 750; text-align: right; }
.an-send-warning { color: var(--warning, #f59e0b); font-size: var(--t-sm); margin: var(--s-3) 0 0; }
.an-email-preview {
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    padding: var(--s-4);
    background: color-mix(in oklab, var(--surface), white 3%);
}
.an-preview-logo {
    display: inline-block;
    padding: var(--s-2) var(--s-3);
    border-radius: var(--r-md);
    background: #fff;
    margin-bottom: var(--s-4);
}
.an-preview-logo img {
    width: 112px;
    height: auto;
}
.an-preview-logo-light { display: block; }
.an-email-preview > span { display: block; color: var(--brand); font-size: var(--t-xs); font-weight: 800; letter-spacing: .1em; text-transform: uppercase; }
.an-email-preview > strong { display: block; font-size: var(--t-xl); margin: var(--s-1) 0 var(--s-3); }
.an-email-preview p {
    color: var(--text-muted);
    white-space: pre-wrap;
}
.an-email-preview small { display: block; color: var(--text-muted); margin-top: var(--s-4); }
.an-history {
    overflow: hidden;
}
.an-history-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
    gap: var(--s-3);
    margin-top: var(--s-4);
    padding: 0 var(--s-4) var(--s-4);
}
.an-history-card {
    min-height: 150px;
    display: grid;
    align-content: space-between;
    gap: var(--s-3);
    border: 1px solid color-mix(in oklab, var(--brand), transparent 58%);
    border-radius: var(--r-lg);
    background:
        linear-gradient(145deg, color-mix(in oklab, var(--brand), transparent 82%), transparent 58%),
        var(--surface);
    color: var(--text);
    padding: var(--s-3);
    text-align: left;
    cursor: pointer;
    transition: border-color var(--dur-fast), transform var(--dur-fast), background var(--dur-fast);
}
.an-history-card:hover { border-color: var(--brand); transform: translateY(-1px); }
.an-history-card:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.an-history-slide-top,
.an-history-slide-foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--s-3);
}
.an-history-card time,
.an-history-slide-foot span {
    color: var(--text-muted);
    font-size: var(--t-sm);
    font-weight: 700;
}
.an-history-card h3 {
    display: -webkit-box;
    overflow: hidden;
    margin: 0;
    color: var(--text);
    font-size: var(--t-lg);
    line-height: 1.2;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
}
.an-history-view { color: var(--brand) !important; }
.an-detail-scrim {
    position: fixed;
    inset: 0;
    z-index: 2147482000;
    display: grid;
    place-items: center;
    padding: var(--s-4);
    background: rgb(0 0 0 / 64%);
    backdrop-filter: blur(6px);
}
.an-detail-dialog {
    width: min(560px, 100%);
    max-height: min(720px, calc(100dvh - 2 * var(--s-4)));
    overflow: auto;
    border: 1px solid var(--border);
    border-radius: var(--r-xl);
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-xl);
    padding: var(--s-4);
}
.an-detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--s-3);
}
.an-detail-head h2 { margin: var(--s-2) 0 0; }
.an-detail-close {
    flex: 0 0 42px;
    width: 42px;
    height: 42px;
    border: 1px solid var(--border);
    border-radius: var(--r-md);
    background: var(--surface-raised);
    color: var(--text);
    font: inherit;
    font-size: var(--t-xl);
    cursor: pointer;
}
.an-detail-close:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
.an-detail-meta {
    display: flex;
    flex-wrap: wrap;
    gap: var(--s-2);
    color: var(--text-muted);
    font-size: var(--t-sm);
    margin-top: var(--s-3);
}
.an-detail-message {
    margin: var(--s-4) 0;
    padding: var(--s-4);
    border: 1px solid var(--border);
    border-radius: var(--r-lg);
    background: color-mix(in oklab, var(--surface), var(--brand) 4%);
    line-height: 1.65;
    white-space: pre-wrap;
}
.an-detail-counts {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: var(--s-2);
    margin: 0;
}
.an-detail-counts div {
    padding: var(--s-3);
    border-radius: var(--r-md);
    background: var(--surface-raised);
}
.an-detail-counts dt { color: var(--text-muted); font-size: var(--t-xs); }
.an-detail-counts dd { margin: var(--s-1) 0 0; font-weight: 800; }
@media (max-width: 760px) {
    .an-scope {
        grid-template-columns: 1fr;
    }
    .announcements-kpis {
        grid-template-columns: repeat(3, minmax(0, 1fr));
    }
    .announcements-kpis .bw-kpi { min-height: 118px; padding: var(--s-3); }
    .announcements-kpis .bw-kpi-value { font-size: var(--t-xl); }
    .announcements-kpis .announcement-last { font-size: var(--t-base); }
    .an-review-grid { grid-template-columns: 1fr; }
    .an-section-head { align-items: center; }
    .an-steps { padding-inline: var(--s-3); }
    .an-steps li { font-size: var(--t-xs); gap: var(--s-1); }
    .an-steps li span { width: 24px; height: 24px; }
    .an-step-panel { padding: var(--s-3); }
    .an-compose-actions { position: sticky; bottom: 0; background: var(--surface); padding: var(--s-3); }
    .an-compose-actions .bw-btn { flex: 1; }
    .an-page-tabs { display: grid; width: 100%; }
    .an-history-grid { grid-template-columns: 1fr; }
    .an-detail-counts { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
    .announcements-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .announcements-kpis article:last-child { grid-column: 1 / -1; }
    .an-audience-options,
    .an-delivery-options { grid-template-columns: 1fr; }
}
</style>
