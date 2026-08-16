<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppShell from '../components/AppShell.vue';
import { api } from '../lib/api';

interface FaqCategory { id: string; slug: string; title: string; description?: string }
interface Faq { id: string; category_id: string | null; question: string; answer: string; tags: string[] }
interface Ticket { id: string; reference: string; subject: string; status: string; category: string; priority: string; last_message_at: string; created_at: string }

const tab = ref<'faq' | 'tickets'>('faq');

// FAQ
const categories = ref<FaqCategory[]>([]);
const faqs = ref<Faq[]>([]);
const search = ref('');
const activeCategory = ref('');
const openFaq = ref('');
const voted = ref<Record<string, boolean>>({});
const faqLoading = ref(false);

const filteredFaqs = computed(() =>
    activeCategory.value ? faqs.value.filter((f) => f.category_id === activeCategory.value) : faqs.value);

async function loadFaqs() {
    faqLoading.value = true;
    try {
        const [cats, list] = await Promise.all([
            api.get<{ categories: FaqCategory[] }>('/api/v1/public/faqs/categories?audience=vendor'),
            api.get<{ faqs: Faq[] }>(`/api/v1/public/faqs?audience=vendor${search.value ? `&search=${encodeURIComponent(search.value)}` : ''}`),
        ]);
        categories.value = cats.categories ?? [];
        faqs.value = list.faqs ?? [];
    } catch { /* ignore */ } finally {
        faqLoading.value = false;
    }
}
let searchTimer: ReturnType<typeof setTimeout> | null = null;
function onSearch() { if (searchTimer) clearTimeout(searchTimer); searchTimer = setTimeout(loadFaqs, 250); }
function toggleFaq(f: Faq) {
    openFaq.value = openFaq.value === f.id ? '' : f.id;
    if (openFaq.value === f.id) api.post(`/api/v1/public/faqs/${f.id}/view`).catch(() => undefined);
}
async function vote(f: Faq, helpful: boolean) {
    if (voted.value[f.id]) return;
    voted.value[f.id] = true;
    try { await api.post(`/api/v1/public/faqs/${f.id}/vote`, { helpful }); } catch { /* ignore */ }
}

// Tickets
const tickets = ref<Ticket[]>([]);
const ticketsLoading = ref(false);
const showNew = ref(false);
const saving = ref(false);
const newError = ref('');
const form = ref({ subject: '', description: '', category: 'general', priority: 'normal' });
const selected = ref<Ticket | null>(null);
const detail = ref<any>(null);
const detailLoading = ref(false);
const replyText = ref('');
const ticketError = ref('');

async function loadTickets() {
    ticketsLoading.value = true;
    try {
        const res = await api.get<{ tickets: Ticket[] }>('/api/v1/vendor/support/tickets');
        tickets.value = res.tickets ?? [];
    } catch { /* ignore */ } finally {
        ticketsLoading.value = false;
    }
}
async function submitNew() {
    newError.value = '';
    if (form.value.subject.trim().length < 5 || form.value.description.trim().length < 10) {
        newError.value = 'Add a subject (5+ chars) and a description (10+ chars).';
        return;
    }
    saving.value = true;
    try {
        await api.post('/api/v1/vendor/support/tickets', { ...form.value });
        showNew.value = false;
        form.value = { subject: '', description: '', category: 'general', priority: 'normal' };
        await loadTickets();
        tab.value = 'tickets';
    } catch (e: any) { newError.value = e?.message ?? 'Could not create ticket.'; }
    finally { saving.value = false; }
}
async function openTicket(t: Ticket) {
    selected.value = t;
    detail.value = null;
    detailLoading.value = true;
    replyText.value = '';
    ticketError.value = '';
    try { detail.value = await api.get(`/api/v1/vendor/support/tickets/${t.id}`); }
    catch { /* ignore */ } finally { detailLoading.value = false; }
}
async function sendReply() {
    if (!selected.value || !replyText.value.trim()) return;
    ticketError.value = '';
    saving.value = true;
    try {
        await api.post(`/api/v1/vendor/support/tickets/${selected.value.id}/messages`, { body: replyText.value.trim() });
        replyText.value = '';
        detail.value = await api.get(`/api/v1/vendor/support/tickets/${selected.value.id}`);
        selected.value = {
            ...selected.value,
            status: detail.value?.status ?? selected.value.status,
            last_message_at: detail.value?.last_message_at ?? selected.value.last_message_at,
        };
        await loadTickets();
    } catch (e: any) {
        ticketError.value = e?.code === 'ticket_closed'
            ? 'This ticket is closed. Open a new ticket if you still need help.'
            : e?.message ?? 'Could not send reply.';
    } finally { saving.value = false; }
}

function statusBadge(s: string) {
    return ({ open: 'success', pending: 'neutral', awaiting_customer: 'warn', resolved: 'success', closed: 'neutral' } as Record<string, string>)[s] ?? 'neutral';
}
function fmtDate(s: string) { return s ? new Date(s).toLocaleString('en-NG', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; }
function prettyStatus(s: string) { return s.replace(/_/g, ' '); }

onMounted(() => { loadFaqs(); loadTickets(); });
</script>

<template>
  <AppShell title="Help &amp; Support">

    <div class="bw-segmented help-tabs">
      <button :class="['bw-seg', tab === 'faq' ? 'active' : '']" @click="tab = 'faq'">Help center</button>
      <button :class="['bw-seg', tab === 'tickets' ? 'active' : '']" @click="tab = 'tickets'">
        My tickets <span v-if="tickets.length" class="help-count">{{ tickets.length }}</span>
      </button>
    </div>

    <!-- FAQ -->
    <template v-if="tab === 'faq'">
      <div class="help-search">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        <input v-model="search" class="help-search-input" placeholder="Search help articles…" @input="onSearch" />
      </div>
      <div class="help-chips">
        <button :class="['help-chip', !activeCategory && 'help-chip--on']" @click="activeCategory = ''">All</button>
        <button v-for="c in categories" :key="c.id" :class="['help-chip', activeCategory === c.id && 'help-chip--on']"
                @click="activeCategory = activeCategory === c.id ? '' : c.id">{{ c.title }}</button>
      </div>

      <div v-if="faqLoading && !faqs.length" class="help-loading">
        <span class="help-spinner" />Loading articles…
      </div>
      <div v-else class="help-faqs">
        <div v-for="f in filteredFaqs" :key="f.id" :class="['help-faq', openFaq === f.id && 'help-faq--open']">
          <button class="help-faq-q" @click="toggleFaq(f)">
            <span>{{ f.question }}</span>
            <svg class="help-faq-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>
          </button>
          <div v-if="openFaq === f.id" class="help-faq-a">
            <p>{{ f.answer }}</p>
            <div class="help-faq-vote">
              <span>Was this helpful?</span>
              <button :disabled="voted[f.id]" @click="vote(f, true)">👍 Yes</button>
              <button :disabled="voted[f.id]" @click="vote(f, false)">👎 No</button>
              <span v-if="voted[f.id]" class="help-faq-thanks">Thanks!</span>
            </div>
          </div>
        </div>
        <div v-if="!filteredFaqs.length && !faqLoading" class="help-empty">
          <p>No articles found{{ search ? ` for "${search}"` : '' }}.</p>
          <button class="bw-btn primary" @click="tab = 'tickets'; showNew = true">Ask our team instead</button>
        </div>
      </div>

      <!-- CTA card -->
      <div class="help-cta-card">
        <div>
          <strong>Still need help?</strong>
          <p>Open a ticket and our support team will get back to you.</p>
        </div>
        <button class="bw-btn primary" @click="tab = 'tickets'; showNew = true">New ticket</button>
      </div>
    </template>

    <!-- Tickets -->
    <template v-else>
      <div class="help-tickets-head">
        <span class="bw-muted bw-text-sm">{{ tickets.length }} ticket{{ tickets.length === 1 ? '' : 's' }}</span>
        <button class="bw-btn primary" @click="showNew = true">+ New ticket</button>
      </div>

      <div v-if="ticketsLoading && !tickets.length" class="help-loading">
        <span class="help-spinner" />Loading tickets…
      </div>
      <div v-else class="help-ticket-list">
        <button v-for="t in tickets" :key="t.id" class="help-ticket" @click="openTicket(t)">
          <div class="help-ticket-main">
            <div class="help-ticket-subject">{{ t.subject }}</div>
            <div class="help-ticket-meta">{{ t.reference }} · {{ fmtDate(t.last_message_at) }}</div>
          </div>
          <span :class="['bw-badge', statusBadge(t.status)]">{{ prettyStatus(t.status) }}</span>
        </button>
        <div v-if="!tickets.length" class="help-empty">
          <p>No tickets yet.</p>
          <button class="bw-btn primary" @click="showNew = true">Open your first ticket</button>
        </div>
      </div>
    </template>

    <!-- New ticket modal -->
    <div v-if="showNew" class="bw-modal-backdrop" @click.self="showNew = false">
      <div class="bw-modal">
        <div class="bw-modal-header">
          <h2>New support ticket</h2>
          <button class="bw-btn ghost sm" @click="showNew = false">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="bw-form-group">
            <label class="bw-label">Subject</label>
            <input v-model="form.subject" class="bw-input" placeholder="e.g. Float not credited" />
          </div>
          <div class="help-form-row">
            <div class="bw-form-group">
              <label class="bw-label">Category</label>
              <select v-model="form.category" class="bw-select">
                <option value="general">General</option>
                <option value="funding">Funding &amp; float</option>
                <option value="vending">Vending</option>
                <option value="account">Account</option>
              </select>
            </div>
            <div class="bw-form-group">
              <label class="bw-label">Priority</label>
              <select v-model="form.priority" class="bw-select">
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div class="bw-form-group">
            <label class="bw-label">Describe the issue</label>
            <textarea v-model="form.description" class="bw-textarea" rows="4" placeholder="Tell us what happened…"></textarea>
          </div>
          <div v-if="newError" class="bw-error-banner">{{ newError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn ghost" @click="showNew = false">Cancel</button>
          <button class="bw-btn primary" :disabled="saving" @click="submitNew">{{ saving ? 'Submitting…' : 'Submit ticket' }}</button>
        </div>
      </div>
    </div>

    <!-- Ticket thread modal -->
    <div v-if="selected" class="bw-modal-backdrop" @click.self="selected = null">
      <div class="bw-modal bw-modal-lg">
        <div class="bw-modal-header">
          <div>
            <h2>{{ selected.reference }}</h2>
            <span class="bw-muted" style="font-size: var(--t-xs)">{{ selected.subject }}</span>
          </div>
          <span :class="['bw-badge', statusBadge(selected.status)]">{{ prettyStatus(selected.status) }}</span>
          <button class="bw-btn ghost sm" style="margin-left:auto" @click="selected = null">✕</button>
        </div>
        <div class="bw-modal-body">
          <div class="help-thread">
            <!-- Loading skeleton -->
            <div v-if="detailLoading" class="help-thread-loading">
              <span class="help-spinner" />Loading conversation…
            </div>
            <template v-else>
              <div v-for="m in detail?.support_ticket_messages" :key="m.id"
                   :class="['help-msg', m.sender_actor_type === 'staff' ? 'help-msg--staff' : 'help-msg--mine']">
                <span class="help-msg-who">{{ m.sender_actor_type === 'staff' ? 'Support' : 'You' }}</span>
                <p class="help-msg-body">{{ m.body }}</p>
                <span class="help-msg-time">{{ fmtDate(m.created_at) }}</span>
              </div>
              <p v-if="detail && !detail.support_ticket_messages?.length" class="bw-muted" style="text-align:center; font-size: var(--t-sm)">No messages yet.</p>
            </template>
          </div>
          <textarea v-if="selected.status !== 'closed'" v-model="replyText" class="bw-textarea" rows="3" placeholder="Write a reply…" style="margin-top: var(--s-3)"></textarea>
          <p v-else class="bw-muted" style="font-size: var(--t-sm); margin-top: var(--s-3)">This ticket is closed. Open a new ticket if you still need help.</p>
          <div v-if="ticketError" class="bw-error-banner" style="margin-top: var(--s-3)">{{ ticketError }}</div>
        </div>
        <div class="bw-modal-footer">
          <button class="bw-btn ghost" @click="selected = null">Close</button>
          <button v-if="selected.status !== 'closed'" class="bw-btn primary" :disabled="!replyText.trim() || saving" @click="sendReply">{{ saving ? 'Sending…' : 'Send reply' }}</button>
        </div>
      </div>
    </div>

  </AppShell>
</template>

<style scoped>
.help-tabs { margin-bottom: var(--s-4); }
.help-count { background: var(--brand); color: #04140b; border-radius: 999px; padding: 0 6px; font-size: 10px; margin-left: 4px; }

.help-search { display: flex; align-items: center; gap: var(--s-2); background: var(--glass-bg-strong); border: 1px solid var(--glass-border); border-radius: var(--r-lg); padding: 0 var(--s-3); height: 44px; max-width: 480px; margin-bottom: var(--s-3); }
.help-search svg { width: 18px; height: 18px; color: var(--text-muted); flex-shrink: 0; }
.help-search-input { flex: 1; border: 0; background: transparent; color: var(--text); font: inherit; outline: none; }

.help-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: var(--s-4); }
.help-chip { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--glass-border); background: var(--glass-bg); color: var(--text-2); font-size: var(--t-sm); font-weight: 600; cursor: pointer; transition: all var(--dur-fast); }
.help-chip--on { background: var(--brand); border-color: var(--brand); color: #04140b; }

.help-loading { display: flex; align-items: center; gap: var(--s-2); color: var(--text-muted); font-size: var(--t-sm); padding: var(--s-5); }
.help-spinner { width: 16px; height: 16px; border: 2px solid var(--border); border-top-color: var(--brand); border-radius: 50%; animation: help-spin 0.7s linear infinite; flex-shrink: 0; }
@keyframes help-spin { to { transform: rotate(360deg); } }

.help-faqs { display: flex; flex-direction: column; gap: var(--s-2); max-width: 760px; margin-bottom: var(--s-4); }
.help-faq { border: 1px solid var(--glass-border); border-radius: var(--r-lg); background: var(--glass-bg); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); overflow: hidden; transition: border-color var(--dur-base); }
.help-faq--open { border-color: oklch(70% 0.19 145 / 0.4); }
.help-faq-q { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: var(--s-3); padding: var(--s-4); background: none; border: 0; cursor: pointer; font: inherit; font-weight: 600; color: var(--text); text-align: left; }
.help-faq-caret { width: 18px; height: 18px; flex-shrink: 0; color: var(--text-muted); transition: transform var(--dur-base); }
.help-faq--open .help-faq-caret { transform: rotate(180deg); color: var(--brand); }
.help-faq-a { padding: 0 var(--s-4) var(--s-4); }
.help-faq-a p { margin: 0 0 var(--s-3); color: var(--text-2); line-height: 1.6; }
.help-faq-vote { display: flex; align-items: center; gap: var(--s-2); font-size: var(--t-sm); color: var(--text-muted); flex-wrap: wrap; }
.help-faq-vote button { border: 1px solid var(--border); background: var(--surface-2); border-radius: 999px; padding: 4px 10px; font-size: var(--t-sm); cursor: pointer; color: var(--text); }
.help-faq-vote button:disabled { opacity: 0.5; cursor: default; }
.help-faq-thanks { color: var(--brand); font-weight: 600; }

.help-cta-card { display: flex; align-items: center; justify-content: space-between; gap: var(--s-4); padding: var(--s-4); border: 1px solid oklch(70% 0.19 145 / 0.28); border-radius: var(--r-lg); background: radial-gradient(120% 100% at 0% 0%, var(--brand-glow), transparent 60%), var(--glass-bg); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); }
.help-cta-card strong { display: block; color: var(--text); }
.help-cta-card p { margin: 2px 0 0; font-size: var(--t-sm); color: var(--text-2); }

.help-tickets-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: var(--s-3); }

.help-ticket-list { display: flex; flex-direction: column; gap: var(--s-2); }
.help-ticket { display: flex; align-items: center; gap: var(--s-3); padding: var(--s-4); border: 1px solid var(--glass-border); border-radius: var(--r-lg); background: var(--glass-bg); backdrop-filter: blur(16px) saturate(150%); -webkit-backdrop-filter: blur(16px) saturate(150%); box-shadow: var(--glass-shine), var(--glass-shadow-card); cursor: pointer; text-align: left; transition: border-color var(--dur-fast), box-shadow var(--dur-fast); width: 100%; }
.help-ticket:hover { border-color: var(--brand); }
.help-ticket-main { flex: 1; min-width: 0; }
.help-ticket-subject { font-weight: 600; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.help-ticket-meta { font-size: var(--t-xs); color: var(--text-muted); margin-top: 2px; }

.help-empty { text-align: center; padding: var(--s-6) var(--s-4); color: var(--text-muted); display: flex; flex-direction: column; gap: var(--s-3); align-items: center; }

.help-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }

.help-thread { display: flex; flex-direction: column; gap: var(--s-2); max-height: 320px; overflow-y: auto; border: 1px solid var(--glass-border); border-radius: var(--r-md); padding: var(--s-3); background: var(--glass-bg); }
.help-thread-loading { display: flex; align-items: center; gap: var(--s-2); color: var(--text-muted); font-size: var(--t-sm); padding: var(--s-4); justify-content: center; }
.help-msg { border-radius: var(--r-md); padding: var(--s-2) var(--s-3); max-width: 85%; }
.help-msg--mine { background: var(--brand-glow); align-self: flex-end; border: 1px solid oklch(70% 0.19 145 / 0.2); }
.help-msg--staff { background: var(--surface-2); align-self: flex-start; }
.help-msg-who { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
.help-msg-body { margin: 2px 0; font-size: var(--t-md); color: var(--text); white-space: pre-wrap; }
.help-msg-time { font-size: var(--t-2xs); color: var(--text-muted); }

.bw-modal-lg { max-width: 560px; }
</style>
