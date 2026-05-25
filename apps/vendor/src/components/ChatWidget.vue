<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount, watch } from 'vue';
import { api } from '../lib/api';

interface ChatMessage { id: string; sender_actor_type: string; sender_name?: string; body: string; kind: string; created_at: string }

const open = ref(false);
const sessionId = ref('');
const messages = ref<ChatMessage[]>([]);
const draft = ref('');
const starting = ref(false);
const sending = ref(false);
const unread = ref(0);
const lastTs = ref('');
const scroller = ref<HTMLElement | null>(null);
let poll: ReturnType<typeof setInterval> | null = null;

const QUICK_REPLIES = [
    'How do I buy a token?',
    'My token did not work',
    'How do I fund my wallet?',
    'I need a refund',
];

async function ensureSession() {
    if (sessionId.value) return;
    starting.value = true;
    try {
        const res = await api.post<{ id: string }>('/api/v1/vendor/support/chat/session', {});
        sessionId.value = res.id;
        await fetchMessages(true);
        startPolling();
    } catch { /* ignore */ } finally {
        starting.value = false;
    }
}

async function fetchMessages(initial = false) {
    if (!sessionId.value) return;
    try {
        const q = lastTs.value && !initial ? `?since=${encodeURIComponent(lastTs.value)}` : '';
        const res = await api.get<{ messages: ChatMessage[] }>(`/api/v1/vendor/support/chat/${sessionId.value}/messages${q}`);
        const incoming = res.messages ?? [];
        if (initial) messages.value = incoming;
        else if (incoming.length) {
            messages.value.push(...incoming);
            if (!open.value) unread.value += incoming.filter((m) => m.sender_actor_type !== 'vendor').length;
        }
        if (messages.value.length) lastTs.value = messages.value[messages.value.length - 1].created_at;
        if (open.value) scrollToBottom();
    } catch { /* ignore */ }
}

function startPolling() {
    if (poll) return;
    poll = setInterval(fetchMessages, 4000);
}

async function toggle() {
    open.value = !open.value;
    if (open.value) {
        unread.value = 0;
        await ensureSession();
        scrollToBottom();
    }
}

async function send(text?: string) {
    const body = (text ?? draft.value).trim();
    if (!body || sending.value) return;
    sending.value = true;
    await ensureSession();
    // optimistic
    messages.value.push({ id: `tmp-${Date.now()}`, sender_actor_type: 'vendor', body, kind: 'text', created_at: new Date().toISOString() });
    draft.value = '';
    scrollToBottom();
    try {
        await api.post(`/api/v1/vendor/support/chat/${sessionId.value}/messages`, { body });
        await fetchMessages();
    } catch { /* ignore */ } finally {
        sending.value = false;
    }
}

async function escalate() {
    const subject = window.prompt('Briefly, what is this about? We will open a ticket so the team can follow up.');
    if (!subject || subject.trim().length < 3) return;
    try {
        const res = await api.post<{ reference: string }>(`/api/v1/vendor/support/chat/${sessionId.value}/escalate`, { subject: subject.trim() });
        messages.value.push({ id: `sys-${Date.now()}`, sender_actor_type: 'system', body: `Created ticket ${res.reference}. We'll follow up there.`, kind: 'system', created_at: new Date().toISOString() });
        scrollToBottom();
    } catch { /* ignore */ }
}

function scrollToBottom() {
    nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}

watch(open, (v) => { if (v) scrollToBottom(); });
onBeforeUnmount(() => { if (poll) clearInterval(poll); });

function who(m: ChatMessage) {
    if (m.sender_actor_type === 'vendor') return 'You';
    if (m.sender_actor_type === 'staff') return 'Support';
    return 'Beverly';
}
function time(s: string) { return new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
</script>

<template>
  <div class="cw">
    <!-- Panel -->
    <transition name="cw-pop">
      <section v-if="open" class="cw-panel" role="dialog" aria-label="Support chat">
        <header class="cw-head">
          <div class="cw-head-id">
            <span class="cw-avatar">B</span>
            <div>
              <strong>Beverly Support</strong>
              <span class="cw-status"><i class="cw-dot" /> Typically replies in minutes</span>
            </div>
          </div>
          <button class="cw-icon" aria-label="Close" @click="toggle">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
          </button>
        </header>

        <div ref="scroller" class="cw-body">
          <div v-if="starting && !messages.length" class="cw-loading">Connecting…</div>
          <div v-for="m in messages" :key="m.id"
               :class="['cw-msg', m.sender_actor_type === 'vendor' ? 'cw-msg--mine' : m.kind === 'system' ? 'cw-msg--sys' : 'cw-msg--them']">
            <template v-if="m.kind === 'system'">
              <span class="cw-sys">{{ m.body }}</span>
            </template>
            <template v-else>
              <span class="cw-msg-who">{{ who(m) }}</span>
              <p class="cw-msg-body">{{ m.body }}</p>
              <span class="cw-msg-time">{{ time(m.created_at) }}</span>
            </template>
          </div>

          <div v-if="messages.length <= 1" class="cw-quick">
            <span class="cw-quick-label">Quick questions</span>
            <button v-for="q in QUICK_REPLIES" :key="q" class="cw-quick-btn" @click="send(q)">{{ q }}</button>
          </div>
        </div>

        <footer class="cw-foot">
          <button class="cw-escalate" title="Create a support ticket" @click="escalate">Open ticket</button>
          <div class="cw-input-row">
            <input v-model="draft" class="cw-input" placeholder="Type a message…" @keyup.enter="send()" />
            <button class="cw-send" :disabled="!draft.trim() || sending" aria-label="Send" @click="send()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
            </button>
          </div>
        </footer>
      </section>
    </transition>

    <!-- Bubble -->
    <button class="cw-bubble" :aria-label="open ? 'Close chat' : 'Open chat'" @click="toggle">
      <svg v-if="!open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      <span v-if="unread && !open" class="cw-badge">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
  </div>
</template>

<style scoped>
.cw { position: fixed; right: 20px; bottom: 20px; z-index: var(--z-toast, 9000); display: flex; flex-direction: column; align-items: flex-end; gap: 10px; }

.cw-bubble { width: 56px; height: 56px; border-radius: 50%; border: 0; background: linear-gradient(180deg, var(--brand-300), var(--brand-600)); color: #04140b; display: grid; place-items: center; cursor: pointer; box-shadow: 0 8px 24px var(--brand-glow), inset 0 1px 0 oklch(100% 0 0 / 0.25); position: relative; transition: transform var(--dur-fast); }
.cw-bubble:hover { transform: translateY(-2px); }
.cw-bubble svg { width: 24px; height: 24px; }
.cw-badge { position: absolute; top: -2px; right: -2px; min-width: 20px; height: 20px; padding: 0 5px; border-radius: 999px; background: var(--danger); color: #fff; font-size: 11px; font-weight: 700; display: grid; place-items: center; border: 2px solid var(--canvas); }

.cw-panel { width: min(380px, calc(100vw - 32px)); height: min(560px, calc(100dvh - 140px)); background: var(--surface); border: 1px solid var(--border-strong); border-radius: var(--r-xl); box-shadow: var(--shadow-4); display: flex; flex-direction: column; overflow: hidden; }

.cw-head { display: flex; align-items: center; justify-content: space-between; padding: var(--s-3) var(--s-4); border-bottom: 1px solid var(--border); background: radial-gradient(120% 120% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface); }
.cw-head-id { display: flex; align-items: center; gap: var(--s-2); }
.cw-avatar { width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, var(--brand-300), var(--brand-600)); color: #04140b; display: grid; place-items: center; font-weight: 800; }
.cw-head-id strong { display: block; font-size: var(--t-md); color: var(--text); }
.cw-status { font-size: var(--t-2xs); color: var(--text-muted); display: inline-flex; align-items: center; gap: 5px; }
.cw-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); display: inline-block; }
.cw-icon { width: 32px; height: 32px; border-radius: var(--r-md); border: 0; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; }
.cw-icon svg { width: 18px; height: 18px; }
.cw-icon:hover { background: var(--surface-2); color: var(--text); }

.cw-body { flex: 1; overflow-y: auto; padding: var(--s-4); display: flex; flex-direction: column; gap: var(--s-2); }
.cw-loading { text-align: center; color: var(--text-muted); font-size: var(--t-sm); padding: var(--s-4); }
.cw-msg { max-width: 85%; display: flex; flex-direction: column; }
.cw-msg--mine { align-self: flex-end; align-items: flex-end; }
.cw-msg--them { align-self: flex-start; }
.cw-msg--sys { align-self: center; max-width: 100%; }
.cw-msg-who { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); margin-bottom: 2px; }
.cw-msg-body { margin: 0; padding: var(--s-2) var(--s-3); border-radius: var(--r-md); font-size: var(--t-md); line-height: 1.45; white-space: pre-wrap; }
.cw-msg--mine .cw-msg-body { background: linear-gradient(180deg, var(--brand-300), var(--brand-600)); color: #04140b; border-bottom-right-radius: 4px; }
.cw-msg--them .cw-msg-body { background: var(--surface-2); color: var(--text); border-bottom-left-radius: 4px; }
.cw-msg-time { font-size: var(--t-2xs); color: var(--text-muted); margin-top: 2px; }
.cw-sys { font-size: var(--t-xs); color: var(--text-muted); background: var(--surface-2); padding: 5px 10px; border-radius: 999px; text-align: center; }

.cw-quick { display: flex; flex-direction: column; gap: 6px; margin-top: var(--s-2); }
.cw-quick-label { font-size: var(--t-2xs); font-weight: 700; text-transform: uppercase; color: var(--text-muted); }
.cw-quick-btn { text-align: left; border: 1px solid var(--border); background: var(--surface-2); color: var(--text); border-radius: var(--r-md); padding: 8px 12px; font-size: var(--t-sm); cursor: pointer; transition: border-color var(--dur-fast); }
.cw-quick-btn:hover { border-color: var(--brand); color: var(--brand); }

.cw-foot { border-top: 1px solid var(--border); padding: var(--s-2) var(--s-3) var(--s-3); }
.cw-escalate { background: none; border: 0; color: var(--brand); font-size: var(--t-xs); font-weight: 700; cursor: pointer; padding: 4px 0; }
.cw-input-row { display: flex; align-items: center; gap: var(--s-2); }
.cw-input { flex: 1; height: 40px; border: 1px solid var(--border); border-radius: 999px; background: var(--surface-2); color: var(--text); padding: 0 var(--s-4); font: inherit; outline: none; }
.cw-input:focus { border-color: var(--brand); }
.cw-send { width: 40px; height: 40px; border-radius: 50%; border: 0; background: linear-gradient(180deg, var(--brand-300), var(--brand-600)); color: #04140b; display: grid; place-items: center; cursor: pointer; flex-shrink: 0; }
.cw-send:disabled { opacity: 0.5; cursor: default; }
.cw-send svg { width: 18px; height: 18px; }

.cw-pop-enter-active, .cw-pop-leave-active { transition: opacity var(--dur-base), transform var(--dur-base) var(--ease-spring); }
.cw-pop-enter-from, .cw-pop-leave-to { opacity: 0; transform: translateY(12px) scale(0.96); }
</style>
