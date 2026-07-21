<script setup lang="ts">
import { ref, computed, nextTick, onBeforeUnmount, watch } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';

interface ChatMessage {
    id: string;
    sender_actor_type: string;
    sender_name?: string;
    body: string;
    kind: string;
    created_at: string;
    _pending?: boolean;
}

const router = useRouter();

const open          = ref(false);
const view          = ref<'chat' | 'escalate'>('chat');
const sessionId     = ref('');
const messages      = ref<ChatMessage[]>([]);
const draft         = ref('');
const starting      = ref(false);
const sending       = ref(false);
const unread        = ref(0);
const lastTs        = ref('');
const scroller      = ref<HTMLElement | null>(null);
const sessionStarted = ref(false);
const staffTyping   = ref(false);
let poll: ReturnType<typeof setInterval> | null = null;
let typingTimer: ReturnType<typeof setTimeout> | null = null;

// Escalation form
const escSubject  = ref('');
const escDesc     = ref('');
const escLoading  = ref(false);
const escError    = ref('');

const QUICK_REPLIES = [
    'How do I buy a token?',
    'My token did not work',
    'How do I fund my wallet?',
    'I need a refund',
];

// Group messages so consecutive same-sender messages are visually merged
const groupedMessages = computed(() => {
    return messages.value.map((m, i) => {
        const prev = messages.value[i - 1];
        const showSender = !prev || prev.sender_actor_type !== m.sender_actor_type || prev.kind === 'system' || m.kind === 'system';
        const isLast = !messages.value[i + 1] || messages.value[i + 1].sender_actor_type !== m.sender_actor_type || messages.value[i + 1].kind === 'system';
        return { ...m, showSender, isLast };
    });
});

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
        if (initial) {
            messages.value = incoming;
        } else if (incoming.length) {
            messages.value = messages.value.filter((m) => !m._pending);
            messages.value.push(...incoming);
            const newStaff = incoming.filter((m) => m.sender_actor_type !== 'vendor');
            if (!open.value) unread.value += newStaff.length;
            if (newStaff.length) {
                staffTyping.value = false;
                if (typingTimer) clearTimeout(typingTimer);
            }
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
        view.value = 'chat';
        await ensureSession();
        await nextTick();
        scrollToBottom();
    }
}

async function send(text?: string) {
    const body = (text ?? draft.value).trim();
    if (!body || sending.value) return;
    sending.value = true;
    draft.value = '';
    sessionStarted.value = true;
    await ensureSession();

    const tmpId = `tmp-${Date.now()}`;
    messages.value.push({
        id: tmpId,
        sender_actor_type: 'vendor',
        body,
        kind: 'text',
        created_at: new Date().toISOString(),
        _pending: true,
    });
    scrollToBottom();

    if (typingTimer) clearTimeout(typingTimer);
    typingTimer = setTimeout(() => {
        staffTyping.value = true;
        typingTimer = setTimeout(() => { staffTyping.value = false; }, 12000);
    }, 1500);

    try {
        await api.post(`/api/v1/vendor/support/chat/${sessionId.value}/messages`, { body });
        await fetchMessages();
    } catch {
        const msg = messages.value.find((m) => m.id === tmpId);
        if (msg) { msg._pending = false; }
    } finally {
        sending.value = false;
    }
}

async function submitEscalate() {
    escError.value = '';
    if (escSubject.value.trim().length < 3) {
        escError.value = 'Add a subject (at least 3 characters).';
        return;
    }
    escLoading.value = true;
    await ensureSession();
    try {
        const payload: any = { subject: escSubject.value.trim() };
        if (escDesc.value.trim()) payload.body = escDesc.value.trim();
        const res = await api.post<{ reference: string }>(
            `/api/v1/vendor/support/chat/${sessionId.value}/escalate`,
            payload,
        );
        messages.value.push({
            id: `sys-${Date.now()}`,
            sender_actor_type: 'system',
            body: `Ticket ${res.reference} created. Our team will follow up by email.`,
            kind: 'system',
            created_at: new Date().toISOString(),
        });
        escSubject.value = '';
        escDesc.value = '';
        view.value = 'chat';
        scrollToBottom();
    } catch (e: any) {
        escError.value = e?.message ?? 'Could not create ticket. Try again.';
    } finally {
        escLoading.value = false;
    }
}

function openEscalate() {
    escError.value = '';
    view.value = 'escalate';
}

function goToTickets() {
    open.value = false;
    router.push('/help');
}

function scrollToBottom() {
    nextTick(() => { if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight; });
}

watch(open, (v) => { if (v) scrollToBottom(); });
onBeforeUnmount(() => {
    if (poll) clearInterval(poll);
    if (typingTimer) clearTimeout(typingTimer);
});

function who(m: ChatMessage) {
    if (m.sender_actor_type === 'vendor') return 'You';
    if (m.sender_actor_type === 'staff') return m.sender_name || 'Support';
    return 'Beverly';
}
function time(s: string) { return new Date(s).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
</script>

<template>
  <div class="cw">
    <!-- Chat panel -->
    <transition name="cw-pop">
      <section v-if="open" class="cw-panel" role="dialog" aria-label="Support chat" aria-modal="true">

        <!-- Header -->
        <header class="cw-head">
          <div class="cw-head-id">
            <div class="cw-avatar" aria-hidden="true"></div>
            <div>
              <strong>Beverly Support</strong>
              <span class="cw-status">
                <i class="cw-dot" aria-hidden="true" />
                Typically replies in minutes
              </span>
            </div>
          </div>
          <div class="cw-head-actions">
            <button v-if="view === 'escalate'" class="cw-icon" aria-label="Back to chat" @click="view = 'chat'">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <button class="cw-icon" aria-label="Close chat" @click="toggle">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
            </button>
          </div>
        </header>

        <!-- ── CHAT VIEW ── -->
        <template v-if="view === 'chat'">
          <div ref="scroller" class="cw-body">

            <!-- Connecting animation -->
            <div v-if="starting && !messages.length" class="cw-connecting">
              <span class="cw-connecting-dot" /><span class="cw-connecting-dot" /><span class="cw-connecting-dot" />
            </div>

            <!-- Messages -->
            <div
              v-for="m in groupedMessages" :key="m.id"
              :class="['cw-msg',
                m.sender_actor_type === 'vendor' ? 'cw-msg--mine' : m.kind === 'system' ? 'cw-msg--sys' : 'cw-msg--them',
                m._pending && 'cw-msg--pending',
              ]"
            >
              <template v-if="m.kind === 'system'">
                <span class="cw-sys-pill">{{ m.body }}</span>
                <button v-if="m.body.includes('Ticket')" class="cw-sys-link" @click="goToTickets">View my tickets →</button>
              </template>
              <template v-else>
                <span v-if="m.showSender" class="cw-msg-who">{{ who(m) }}</span>
                <div class="cw-msg-row">
                  <p class="cw-msg-body" :class="{ 'cw-msg-body--last': m.isLast }">{{ m.body }}</p>
                </div>
                <span v-if="m.isLast" class="cw-msg-time">
                  {{ time(m.created_at) }}
                  <span v-if="m._pending" class="cw-sending">· Sending…</span>
                </span>
              </template>
            </div>

            <!-- Quick replies (only before first send) -->
            <div v-if="!sessionStarted && !starting" class="cw-quick">
              <span class="cw-quick-label">Suggested questions</span>
              <button v-for="q in QUICK_REPLIES" :key="q" class="cw-quick-btn" @click="send(q)">{{ q }}</button>
            </div>

            <!-- Typing indicator -->
            <div v-if="staffTyping" class="cw-typing">
              <span class="cw-typing-dot" /><span class="cw-typing-dot" /><span class="cw-typing-dot" />
            </div>
          </div>

          <footer class="cw-foot">
            <button class="cw-escalate-link" @click="openEscalate">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Open ticket
            </button>
            <div class="cw-input-row">
              <input
                v-model="draft"
                class="cw-input"
                placeholder="Type a message…"
                :disabled="starting"
                maxlength="2000"
                autocomplete="off"
                @keyup.enter="send()"
              />
              <button class="cw-send" :disabled="!draft.trim() || sending || starting" aria-label="Send message" @click="send()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
              </button>
            </div>
          </footer>
        </template>

        <!-- ── ESCALATE VIEW ── -->
        <template v-else>
          <div class="cw-esc-body">
            <div class="cw-esc-intro">
              <div class="cw-esc-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
              </div>
              <div>
                <strong class="cw-esc-title">Open a support ticket</strong>
                <p class="cw-esc-sub">Our team will email you a reply and update the ticket in the app.</p>
              </div>
            </div>

            <label class="cw-esc-label">Subject <span class="cw-esc-req">*</span></label>
            <input
              v-model="escSubject"
              class="cw-esc-input"
              placeholder="e.g. Float not credited"
              maxlength="120"
              @keyup.enter="submitEscalate"
            />

            <label class="cw-esc-label">Description <span class="cw-esc-opt">(optional)</span></label>
            <textarea
              v-model="escDesc"
              class="cw-esc-textarea"
              placeholder="Describe what happened in more detail…"
              rows="3"
              maxlength="2000"
            />

            <div v-if="escError" class="cw-esc-error">{{ escError }}</div>

            <button class="cw-esc-submit" :disabled="escLoading || !escSubject.trim()" @click="submitEscalate">
              <span v-if="escLoading" class="cw-esc-spinner" />
              {{ escLoading ? 'Creating ticket…' : 'Submit ticket' }}
            </button>

            <p class="cw-esc-note">Your chat history will be attached to the ticket automatically.</p>
          </div>
        </template>

      </section>
    </transition>

    <!-- Bubble -->
    <button class="cw-bubble" :aria-label="open ? 'Close chat' : 'Open support chat'" @click="toggle">
      <transition name="cw-icon-swap" mode="out-in">
        <svg v-if="!open" key="chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        <svg v-else key="close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </transition>
      <span v-if="unread && !open" class="cw-badge">{{ unread > 9 ? '9+' : unread }}</span>
    </button>
  </div>
</template>

<style scoped>
/* ── Positioning ── */
.cw {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: var(--z-toast, 9000);
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
}

/* ── Bubble ── */
.cw-bubble {
  width: 46px; height: 46px;
  border-radius: 50%; border: 0;
  background: linear-gradient(180deg, var(--brand-300), var(--brand-600));
  color: #04140b;
  display: grid; place-items: center;
  cursor: pointer;
  box-shadow: 0 8px 20px var(--brand-glow), inset 0 1px 0 oklch(100% 0 0 / 0.25);
  position: relative;
  animation: cw-float 3.8s ease-in-out infinite;
  transition: transform var(--dur-fast), box-shadow var(--dur-fast);
}
.cw-bubble:hover { animation-play-state: paused; transform: translateY(-3px); box-shadow: 0 12px 26px var(--brand-glow), inset 0 1px 0 oklch(100% 0 0 / 0.25); }
.cw-bubble:focus-visible { outline: 0; box-shadow: 0 0 0 3px var(--brand-glow), 0 0 0 5px var(--brand); }
.cw-bubble svg { width: 19px; height: 19px; }

.cw-badge {
  position: absolute; top: -2px; right: -2px;
  min-width: 20px; height: 20px; padding: 0 5px;
  border-radius: 999px; background: var(--danger); color: #fff;
  font-size: 11px; font-weight: 700;
  display: grid; place-items: center;
  border: 2px solid var(--canvas);
}

@keyframes cw-float {
  0%, 100% { transform: translate3d(0, 0, 0); }
  50% { transform: translate3d(0, -6px, 0); }
}

/* Bubble icon swap */
.cw-icon-swap-enter-active, .cw-icon-swap-leave-active { transition: opacity 0.15s, transform 0.15s; }
.cw-icon-swap-enter-from { opacity: 0; transform: rotate(-30deg) scale(0.8); }
.cw-icon-swap-leave-to  { opacity: 0; transform: rotate(30deg) scale(0.8); }

/* ── Panel ── */
.cw-panel {
  width: min(380px, calc(100vw - 32px));
  height: min(560px, calc(100dvh - 100px));
  background: var(--glass-bg-strong);
  border: 1px solid var(--glass-border-strong);
  border-radius: var(--r-xl);
  backdrop-filter: blur(32px) saturate(200%);
  -webkit-backdrop-filter: blur(32px) saturate(200%);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
  display: flex; flex-direction: column;
  overflow: hidden;
}

/* ── Header ── */
.cw-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: var(--s-3) var(--s-4);
  border-bottom: 1px solid var(--border);
  background: radial-gradient(120% 120% at 0% 0%, var(--brand-glow), transparent 60%), var(--surface);
  flex-shrink: 0;
}
.cw-head-id { display: flex; align-items: center; gap: var(--s-2); }
.cw-head-actions { display: flex; align-items: center; gap: 4px; }
.cw-avatar {
  width: 36px; height: 36px; border-radius: 50%;
  background: var(--brand-mark-url, url("/brand/beverly-mark-light.png")) center / contain no-repeat, linear-gradient(135deg, var(--brand-300), var(--brand-600));
  display: block;
}
.cw-head-id strong { display: block; font-size: var(--t-md); color: var(--text); }
.cw-status { font-size: var(--t-2xs); color: var(--text-muted); display: inline-flex; align-items: center; gap: 5px; }
.cw-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--brand); display: inline-block; }
.cw-icon { width: 32px; height: 32px; border-radius: var(--r-md); border: 0; background: transparent; color: var(--text-muted); cursor: pointer; display: grid; place-items: center; transition: background var(--dur-fast), color var(--dur-fast); }
.cw-icon svg { width: 18px; height: 18px; }
.cw-icon:hover { background: var(--surface-2); color: var(--text); }

/* ── Chat body ── */
.cw-body {
  flex: 1; overflow-y: auto;
  padding: var(--s-3) var(--s-4);
  display: flex; flex-direction: column;
  gap: 2px;
  scroll-behavior: smooth;
}

/* Connecting animation */
.cw-connecting { display: flex; align-items: center; justify-content: center; gap: 6px; padding: var(--s-5); }
.cw-connecting-dot {
  width: 8px; height: 8px; border-radius: 50%;
  background: var(--text-muted); opacity: 0.4;
  animation: cw-pulse 1.2s ease-in-out infinite;
}
.cw-connecting-dot:nth-child(2) { animation-delay: 0.2s; }
.cw-connecting-dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes cw-pulse { 0%, 100% { opacity: 0.2; transform: scale(0.8); } 50% { opacity: 1; transform: scale(1); } }

/* ── Messages ── */
.cw-msg { display: flex; flex-direction: column; max-width: 82%; }
.cw-msg--mine { align-self: flex-end; align-items: flex-end; }
.cw-msg--them { align-self: flex-start; }
.cw-msg--sys  { align-self: center; max-width: 100%; align-items: center; margin: var(--s-2) 0; }
.cw-msg--pending { opacity: 0.65; }

.cw-msg-who {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--text-muted);
  margin-bottom: 3px; margin-top: var(--s-3);
}
.cw-msg--mine .cw-msg-who { margin-right: 2px; }

.cw-msg-row { display: flex; }
.cw-msg-body {
  margin: 0; padding: 9px 13px;
  border-radius: 16px;
  font-size: var(--t-md); line-height: 1.45;
  white-space: pre-wrap; word-break: break-word;
}
.cw-msg--mine .cw-msg-body {
  background: linear-gradient(180deg, var(--brand-300), var(--brand-600));
  color: #04140b;
  border-bottom-right-radius: 4px;
}
.cw-msg--them .cw-msg-body {
  background: var(--surface-2);
  color: var(--text);
  border-bottom-left-radius: 4px;
}
.cw-msg-time { font-size: 10px; color: var(--text-muted); margin-top: 3px; }
.cw-sending { font-style: italic; }

/* System pill */
.cw-sys-pill {
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 4px 12px;
  font-size: var(--t-xs);
  color: var(--text-muted);
  text-align: center;
}
.cw-sys-link {
  background: none; border: 0; padding: 0;
  color: var(--brand); font-size: var(--t-xs);
  font-weight: 700; cursor: pointer;
  margin-top: 4px; text-decoration: underline;
}

/* Typing indicator */
.cw-typing {
  display: flex; align-items: center; gap: 4px;
  padding: 10px 14px;
  background: var(--surface-2);
  border-radius: 16px; border-bottom-left-radius: 4px;
  align-self: flex-start;
  margin-top: var(--s-2);
}
.cw-typing-dot {
  width: 7px; height: 7px; border-radius: 50%;
  background: var(--text-muted);
  animation: cw-pulse 1.4s ease-in-out infinite;
}
.cw-typing-dot:nth-child(2) { animation-delay: 0.2s; }
.cw-typing-dot:nth-child(3) { animation-delay: 0.4s; }

/* Quick replies */
.cw-quick { display: flex; flex-direction: column; gap: 6px; margin-top: var(--s-3); }
.cw-quick-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: var(--text-muted); }
.cw-quick-btn {
  text-align: left; border: 1px solid var(--border);
  background: var(--surface-2); color: var(--text);
  border-radius: var(--r-md); padding: 9px 12px;
  font-size: var(--t-sm); cursor: pointer;
  transition: border-color var(--dur-fast), color var(--dur-fast), background var(--dur-fast);
}
.cw-quick-btn:hover { border-color: var(--brand); color: var(--brand); background: var(--brand-glow); }

/* ── Chat footer ── */
.cw-foot { border-top: 1px solid var(--border); padding: var(--s-2) var(--s-3) var(--s-3); flex-shrink: 0; }
.cw-escalate-link {
  display: inline-flex; align-items: center; gap: 5px;
  background: none; border: 0;
  color: var(--text-muted); font-size: var(--t-xs); font-weight: 600;
  cursor: pointer; padding: 2px 0; margin-bottom: var(--s-2);
  transition: color var(--dur-fast);
}
.cw-escalate-link:hover { color: var(--brand); }
.cw-input-row { display: flex; align-items: center; gap: var(--s-2); }
.cw-input {
  flex: 1; height: 42px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-2); color: var(--text);
  padding: 0 var(--s-4); font: inherit; outline: none;
  transition: border-color var(--dur-fast);
}
.cw-input:focus { border-color: var(--brand); }
.cw-input:disabled { opacity: 0.5; }
.cw-send {
  width: 42px; height: 42px; border-radius: 50%; border: 0;
  background: linear-gradient(180deg, var(--brand-300), var(--brand-600));
  color: #04140b; display: grid; place-items: center;
  cursor: pointer; flex-shrink: 0;
  transition: opacity var(--dur-fast), transform var(--dur-fast);
}
.cw-send:hover:not(:disabled) { transform: scale(1.06); }
.cw-send:disabled { opacity: 0.4; cursor: default; }
.cw-send svg { width: 18px; height: 18px; }

/* ── Escalate / ticket view ── */
.cw-esc-body {
  flex: 1; overflow-y: auto;
  padding: var(--s-4);
  display: flex; flex-direction: column; gap: var(--s-3);
}

.cw-esc-intro { display: flex; align-items: flex-start; gap: var(--s-3); margin-bottom: var(--s-1); }
.cw-esc-icon {
  width: 40px; height: 40px; border-radius: var(--r-lg); flex-shrink: 0;
  background: color-mix(in srgb, var(--brand) 12%, transparent);
  border: 1px solid color-mix(in srgb, var(--brand) 25%, transparent);
  color: var(--brand);
  display: grid; place-items: center;
}
.cw-esc-icon svg { width: 20px; height: 20px; }
.cw-esc-title { display: block; font-weight: 700; font-size: var(--t-md); color: var(--text); margin-bottom: 3px; }
.cw-esc-sub { margin: 0; font-size: var(--t-sm); color: var(--text-muted); line-height: 1.4; }

.cw-esc-label { font-size: var(--t-xs); font-weight: 700; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; }
.cw-esc-req { color: var(--danger); }
.cw-esc-opt { color: var(--text-muted); font-weight: 400; text-transform: none; letter-spacing: 0; font-size: var(--t-2xs); }

.cw-esc-input {
  width: 100%; height: 40px; padding: 0 12px;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--surface-2); color: var(--text);
  font: inherit; font-size: var(--t-sm); outline: none;
  transition: border-color var(--dur-fast);
}
.cw-esc-input:focus { border-color: var(--brand); }

.cw-esc-textarea {
  width: 100%; padding: 10px 12px;
  border: 1px solid var(--border); border-radius: var(--r-md);
  background: var(--surface-2); color: var(--text);
  font: inherit; font-size: var(--t-sm); outline: none; resize: vertical;
  transition: border-color var(--dur-fast);
}
.cw-esc-textarea:focus { border-color: var(--brand); }

.cw-esc-error {
  padding: var(--s-2) var(--s-3);
  border-radius: var(--r-md); font-size: var(--t-sm); font-weight: 600;
  color: var(--danger);
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  border: 1px solid color-mix(in srgb, var(--danger) 20%, transparent);
}

.cw-esc-submit {
  height: 42px; border-radius: var(--r-md); border: 0;
  background: linear-gradient(180deg, var(--brand-300), var(--brand-600));
  color: #04140b; font: inherit; font-size: var(--t-sm); font-weight: 700;
  cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
  transition: opacity var(--dur-fast);
}
.cw-esc-submit:disabled { opacity: 0.5; cursor: default; }

.cw-esc-spinner {
  width: 14px; height: 14px;
  border: 2px solid rgba(0,0,0,0.25);
  border-top-color: #04140b;
  border-radius: 50%;
  animation: cw-spin 0.7s linear infinite;
}
@keyframes cw-spin { to { transform: rotate(360deg); } }

.cw-esc-note { margin: 0; font-size: var(--t-2xs); color: var(--text-muted); text-align: center; }

/* ── Panel transition ── */
.cw-pop-enter-active, .cw-pop-leave-active { transition: opacity var(--dur-base), transform var(--dur-base) var(--ease-spring); }
.cw-pop-enter-from, .cw-pop-leave-to { opacity: 0; transform: translateY(12px) scale(0.96); }
@media (prefers-reduced-motion: reduce) {
  .cw-pop-enter-active, .cw-pop-leave-active { transition: opacity var(--dur-fast); }
  .cw-pop-enter-from, .cw-pop-leave-to { transform: none; }
}
</style>
