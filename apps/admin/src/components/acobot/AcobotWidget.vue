<template>
  <div class="beverly-ai-widget-wrapper">
    <!-- Responsive Floating Trigger Button with Extensive Outline Bot Head & Signal Ring SVG -->
    <button
      type="button"
      class="beverly-ai-trigger-btn"
      :class="{ active: isOpen }"
      @click="toggleWidget"
      title="Beverly AI Operations Assistant"
      aria-label="Toggle Beverly AI Assistant"
    >
      <div class="beverly-ai-glow-pulse"></div>
      <span class="beverly-ai-trigger-icon">
        <!-- Iconic Outline Bot Head with Orbital Antenna Ring -->
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="3" r="1.5"></circle>
          <path d="M12 4.5v2.5"></path>
          <rect x="4" y="7" width="16" height="13" rx="4" ry="4"></rect>
          <circle cx="9" cy="12" r="1.5"></circle>
          <circle cx="15" cy="12" r="1.5"></circle>
          <path d="M9.5 16.5h5"></path>
          <path d="M1.5 13.5h2.5"></path>
          <path d="M20 13.5h2.5"></path>
        </svg>
      </span>
      <span class="beverly-ai-trigger-label">Beverly AI</span>
    </button>

    <!-- Pure Beverly Token & Apple Liquid Glass Modal -->
    <div v-if="isOpen" class="beverly-ai-modal" :class="{ minimized: isMinimized }" role="dialog" aria-label="Beverly AI Command Console">
      <div class="beverly-liquid-specular"></div>

      <!-- Glass Header with Comprehensive Outline Icons -->
      <header class="beverly-ai-header">
        <div class="beverly-ai-brand">
          <div class="beverly-ai-avatar-wrap">
            <div class="beverly-ai-avatar" role="img" aria-label="Beverly Brand Emblem"></div>
            <span class="beverly-ai-status-dot"></span>
          </div>
          <div>
            <h3 class="beverly-ai-title">Beverly AI</h3>
            <span class="beverly-ai-subtitle">{{ portalLabel }}</span>
          </div>
        </div>

        <div class="beverly-ai-header-actions">
          <!-- Unique Outline Theme Toggle Icons (Dark, Light, Executive) -->
          <button
            type="button"
            class="beverly-ai-icon-btn"
            @click="cycleTheme"
            :title="`Theme: ${currentTheme.toUpperCase()}`"
          >
            <!-- Dark Moon Outline -->
            <svg v-if="currentTheme === 'dark'" class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
            <!-- Light Sun Outline -->
            <svg v-else-if="currentTheme === 'light'" class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"></path>
            </svg>
            <!-- Executive Briefcase Outline -->
            <svg v-else class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
              <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
            </svg>
          </button>

          <!-- Unique Voice Speaker Controls -->
          <button
            type="button"
            class="beverly-ai-icon-btn"
            :class="{ active: speakResponses }"
            @click="toggleSpeech"
            :title="!synthesisSupported ? 'Spoken responses are unavailable in this browser' : speakResponses ? 'Mute Voice' : 'Enable Voice'"
            :aria-label="!synthesisSupported ? 'Spoken responses unavailable' : speakResponses ? 'Mute spoken responses' : 'Enable spoken responses'"
            :aria-pressed="speakResponses"
          >
            <svg v-if="speakResponses" class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            <svg v-else class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
          </button>

          <!-- Unique Minimize / Expand Icon -->
          <button
            type="button"
            class="beverly-ai-icon-btn"
            @click="isMinimized = !isMinimized"
            :title="isMinimized ? 'Expand' : 'Minimize'"
          >
            <svg v-if="isMinimized" class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="15 3 21 3 21 9"></polyline>
              <polyline points="9 21 3 21 3 15"></polyline>
              <line x1="21" y1="3" x2="14" y2="10"></line>
              <line x1="3" y1="21" x2="10" y2="14"></line>
            </svg>
            <svg v-else class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>

          <!-- Unique Close Cross Icon -->
          <button type="button" class="beverly-ai-icon-btn" @click="closeWidget" title="Close Console">
            <svg class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <template v-if="!isMinimized">
        <div ref="messageContainer" class="beverly-ai-messages">
          <div v-if="messages.length === 0" class="beverly-ai-welcome">
            <!-- Pop-up Greeting Card (Matches reference screenshot) -->
            <div class="beverly-ai-popup-greeting">
              <div class="beverly-ai-popup-avatar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="5" y="8" width="14" height="12" rx="3"></rect>
                  <path d="M12 2v6"></path>
                  <circle cx="9" cy="13" r="1"></circle>
                  <circle cx="15" cy="13" r="1"></circle>
                </svg>
              </div>
              <div class="beverly-ai-popup-body">
                <p>👋 Hi <strong>{{ userFirstName }}</strong>, I'm <strong>Beverly AI</strong>. I can help you monitor system liquidity, review meter approvals, manage disputes, and run daily reconciliations.</p>
              </div>
            </div>

            <!-- "Try asking" Section -->
            <div class="beverly-ai-try-asking-section">
              <span class="beverly-ai-try-asking-title">Try asking</span>
              <div class="beverly-ai-chip-grid-2x2">
                <button
                  v-for="chip in quickChips"
                  :key="chip.label"
                  type="button"
                  class="beverly-ai-chip-card"
                  @click="sendPrompt(chip.label)"
                >
                  <div class="beverly-chip-icon-box">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                      <path :d="chip.iconPath"></path>
                    </svg>
                  </div>
                  <span>{{ chip.label }}</span>
                </button>
              </div>
            </div>
          </div>

          <div
            v-for="(msg, index) in messages"
            :key="index"
            :class="['beverly-ai-msg-row', msg.sender === 'user' ? 'user-row' : 'bot-row']"
          >
            <div class="beverly-ai-msg-bubble">
              <div class="beverly-ai-msg-sender">
                <div class="beverly-ai-sender-tag">
                  <!-- User Avatar Outline vs Bot Avatar Outline -->
                  <svg v-if="msg.sender === 'user'" class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <svg v-else class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="5" y="8" width="14" height="12" rx="3"></rect>
                    <path d="M12 2v6"></path>
                    <circle cx="9" cy="13" r="1"></circle>
                    <circle cx="15" cy="13" r="1"></circle>
                  </svg>
                  <span>{{ msg.sender === 'user' ? 'You' : 'Beverly AI' }}</span>
                </div>

                <button v-if="msg.sender === 'bot'" type="button" class="beverly-copy-btn" @click="copyText(msg.text)" title="Copy text">
                  <!-- Unique Outline Double Layer Clipboard Icon -->
                  <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                </button>
              </div>
              <div class="beverly-ai-msg-content" v-html="formatMessage(msg.text)"></div>

              <!-- Outline Access Policy Badge -->
              <div v-if="msg.permissionStatus === 'denied'" class="beverly-ai-denied-badge">
                <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
                </svg>
                <span>Restricted by Access Policy</span>
              </div>

              <!-- Interactive Retry Request Button -->
              <div v-if="msg.isError && msg.lastPrompt" class="beverly-ai-retry-wrapper">
                <button
                  type="button"
                  class="beverly-ai-retry-btn"
                  @click="retryPrompt(msg.lastPrompt, index)"
                  title="Retry sending this request"
                >
                  <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  <span>Retry Request</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Thinking State with Outline Sparkle SVG -->
          <div v-if="isThinking" class="beverly-ai-thinking">
            <svg class="beverly-svg-sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"></path>
            </svg>
            <span>Analyzing requests…</span>
          </div>
        </div>

        <footer class="beverly-ai-footer">
          <div v-if="voiceStatus" id="beverly-admin-voice-status" class="beverly-ai-voice-status" role="status" aria-live="polite">
            {{ voiceStatus }}
          </div>
          <!-- Comprehensive Microphone Outline Icon -->
          <button
            type="button"
            class="beverly-ai-mic-btn"
            :class="{ listening: isListening }"
            @click="toggleListening"
            :title="!recognitionSupported ? 'Voice input is unavailable in this browser' : isListening ? 'Listening…' : 'Speak command'"
            :aria-label="!recognitionSupported ? 'Voice input unavailable' : isListening ? 'Stop listening' : 'Speak a command'"
            :aria-pressed="isListening"
            :disabled="isThinking"
          >
            <svg class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
          </button>

          <input
            v-model="inputPrompt"
            type="text"
            class="beverly-ai-input"
            placeholder="Ask Beverly AI or speak..."
            aria-label="Ask Beverly AI"
            @keyup.enter="handleSend"
          />

          <!-- Futuristic Flight Arrow Send Outline Icon -->
          <button
            type="button"
            class="beverly-ai-send-btn"
            :disabled="!inputPrompt.trim() || isThinking"
            @click="handleSend"
            title="Send Message"
          >
            <svg class="beverly-svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </footer>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, computed, onMounted } from 'vue';
import { api } from '../../lib/api';
import { useStaffAuthStore } from '../../stores/auth';
import { formatAiMessage } from '@beverly/tokens/ai-message';
import { useAssistantVoice } from '@beverly/tokens/use-assistant-voice';

const auth = useStaffAuthStore();
const userFirstName = computed(() => {
  const name = auth.user?.full_name?.trim();
  if (!name) return 'there';
  return name.split(' ')[0];
});

const props = withDefaults(
  defineProps<{
    portal?: 'admin' | 'crm' | 'customer' | 'vendor';
  }>(),
  {
    portal: 'admin',
  }
);

const isOpen = ref(false);
const isMinimized = ref(false);
const inputPrompt = ref('');
const isThinking = ref(false);
const currentTheme = ref<'dark' | 'light' | 'executive'>('dark');
const messageContainer = ref<HTMLElement | null>(null);
const {
  isListening,
  speakResponses,
  voiceStatus,
  recognitionSupported,
  synthesisSupported,
  toggleListening,
  toggleSpeech,
  speakText,
} = useAssistantVoice({
  language: 'en-NG',
  onTranscript(transcript) {
    inputPrompt.value = transcript;
    return handleSend();
  },
});

interface ChatMessage {
  sender: 'user' | 'bot';
  text: string;
  permissionStatus?: 'granted' | 'denied' | 'partial';
  isError?: boolean;
  lastPrompt?: string;
}

const messages = ref<ChatMessage[]>([]);

onMounted(() => {
  const saved = localStorage.getItem('beverly-theme') as 'dark' | 'light' | 'executive';
  if (saved) {
    currentTheme.value = saved;
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    const activeDOM = document.documentElement.getAttribute('data-theme') as 'dark' | 'light' | 'executive';
    if (activeDOM) currentTheme.value = activeDOM;
  }
});

function cycleTheme() {
  if (currentTheme.value === 'dark') {
    setTheme('light');
  } else if (currentTheme.value === 'light') {
    setTheme('executive');
  } else {
    setTheme('dark');
  }
}

function setTheme(theme: 'dark' | 'light' | 'executive') {
  currentTheme.value = theme;
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('beverly-theme', theme);
}

const portalLabel = computed(() => {
  if (props.portal === 'admin') return 'Wallet Admin Console';
  if (props.portal === 'crm') return 'Beverly CRM Console';
  if (props.portal === 'customer') return 'Customer Wallet';
  return 'Merchant Console';
});

// Comprehensive Quick Chips with Unique Outline SVG Paths
const quickChips = computed(() => {
  if (props.portal === 'admin') {
    return [
      {
        label: 'Meter Approvals Queue',
        iconPath: 'M19 11H5m14 0a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6a2 2 0 0 1 2-2m14 0V9a2 2 0 0 0-2-2M5 11V9a2 2 0 0 1 2-2m0 0V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v2M7 7h10',
      },
      {
        label: 'Operations Exceptions',
        iconPath: 'M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z',
      },
      {
        label: 'Daily Settlement Rollup',
        iconPath: 'M3 10h18M7 15h1m4 0h1m-7 4h12a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z',
      },
      {
        label: 'Float Liquidity Report',
        iconPath: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
      },
    ];
  }
  if (props.portal === 'crm') {
    return [
      {
        label: 'Register New Customer',
        iconPath: 'M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2m8-10a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm11 1h-6m3-3v6',
      },
      {
        label: 'Customer KYC Status',
        iconPath: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z',
      },
      {
        label: 'Open Dispute Claims',
        iconPath: 'M3 6l9-4 9 4v6c0 5.55-3.84 10.74-9 12-5.16-1.26-9-6.45-9-12V6zm9 4v4m0 4h.01',
      },
      {
        label: 'Support Desk Queue',
        iconPath: 'M18 10a6 6 0 0 0-12 0v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8zm-2 10a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2',
      },
    ];
  }
  if (props.portal === 'customer') {
    return [
      {
        label: 'My Meter Balance',
        iconPath: 'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
      },
      {
        label: 'Buy N5,000 Electricity',
        iconPath: 'M3 3h18v18H3V3zm4 8h10M7 15h6',
      },
      {
        label: 'Recent Meter Orders',
        iconPath: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2',
      },
      {
        label: 'Fix Meter Error 02',
        iconPath: 'M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z',
      },
    ];
  }
  return [
    {
      label: 'Merchant Float Balance',
      iconPath: 'M21 12c0 1.66-4 3-9 3s-9-1.34-9-3m18 0c0-1.66-4-3-9-3s-9 1.34-9 3m18 0v6c0 1.66-4 3-9 3s-9-1.34-9-3v-6M3 6c0 1.66 4 3 9 3s9-1.34 9-3-4-3-9-3-9 1.34-9 3z',
    },
    {
      label: 'Settlement History',
      iconPath: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
    },
    {
      label: 'Station Credentials',
      iconPath: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z',
    },
    {
      label: 'Tax Invoices',
      iconPath: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z',
    },
  ];
});

function toggleWidget() {
  isOpen.value = !isOpen.value;
  if (isOpen.value) scrollToBottom();
}

function closeWidget() {
  isOpen.value = false;
}

function scrollToBottom() {
  nextTick(() => {
    if (messageContainer.value) {
      messageContainer.value.scrollTop = messageContainer.value.scrollHeight;
    }
  });
}

function formatMessage(text: string): string {
  return formatAiMessage(text);
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
}

async function handleSend() {
  const prompt = inputPrompt.value.trim();
  if (!prompt || isThinking.value) return;
  inputPrompt.value = '';
  await sendPrompt(prompt);
}

interface ChatResponse {
  response: string;
  permissionStatus?: 'granted' | 'denied' | 'partial';
}

async function sendPrompt(prompt: string) {
  messages.value.push({ sender: 'user', text: prompt });
  scrollToBottom();
  isThinking.value = true;

  try {
    const data = await api.post<ChatResponse>('/api/v1/acobot/chat', {
      prompt,
      portal: props.portal,
    });

    messages.value.push({
      sender: 'bot',
      text: data.response ?? 'Request completed.',
      permissionStatus: data.permissionStatus,
    });
    speakText(data.response ?? '');
  } catch (err: any) {
    const errorMsg = err?.status === 401
      ? 'Authentication required. Please log in to chat with Beverly AI.'
      : err?.message || 'Sorry, I encountered an error connecting to Beverly AI backend.';
    messages.value.push({
      sender: 'bot',
      text: errorMsg,
      isError: true,
      lastPrompt: prompt,
    });
  } finally {
    isThinking.value = false;
    scrollToBottom();
  }
}

async function retryPrompt(prompt: string, index: number) {
  if (index >= 0 && index < messages.value.length) {
    messages.value.splice(index, 1);
  }
  await sendPrompt(prompt);
}

onMounted(() => {
  window.addEventListener('beverly-ai-open-prompt', (e: any) => {
    const promptText = e.detail?.prompt;
    if (promptText) {
      isOpen.value = true;
      isMinimized.value = false;
      sendPrompt(promptText);
    }
  });
});
</script>

<style scoped>
/* ════════════════════════════════════════════════════════════
   Beverly Design System — Strict Pure Color Token Architecture
   ════════════════════════════════════════════════════════════ */

.beverly-ai-widget-wrapper {
  position: fixed;
  bottom: calc(var(--bw-tabbar-height, 0px) + env(safe-area-inset-bottom, 0px) + 16px);
  right: var(--s-5, 20px);
  z-index: var(--z-modal, 1000);
  font-family: var(--font-sans);
}

/* Universal Outline SVG Icon Rules */
.beverly-svg-icon {
  width: 16px;
  height: 16px;
  display: block;
}

.beverly-svg-icon-xs {
  width: 13px;
  height: 13px;
  display: block;
}

.beverly-portal-icon {
  width: 18px;
  height: 18px;
  stroke: var(--brand-400);
}

.beverly-chip-icon {
  width: 15px;
  height: 15px;
  stroke: var(--brand-400);
  flex-shrink: 0;
}

.beverly-svg-sparkle {
  width: 14px;
  height: 14px;
  stroke: var(--brand-400);
  animation: pulseSparkle 1.5s ease-in-out infinite;
}

/* Floating Trigger with Beverly Glass & Brand Tokens */
.beverly-ai-trigger-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: var(--s-2, 8px);
  padding: var(--s-2, 8px) var(--s-4, 16px);
  border-radius: var(--r-full);
  background: var(--glass-bg-strong);
  color: var(--text);
  border: 1px solid var(--glass-border-strong);
  box-shadow: var(--glass-shine), var(--glass-shadow-float);
  cursor: pointer;
  font-weight: var(--fw-semibold);
  font-size: var(--t-sm);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  transition: all var(--dur-base) var(--ease-out);
  overflow: hidden;
}

.beverly-ai-glow-pulse {
  position: absolute;
  inset: -100%;
  background: radial-gradient(circle, var(--brand-500) 0%, transparent 65%);
  opacity: 0.22;
  pointer-events: none;
  animation: rotateGlow 8s linear infinite;
}

.beverly-ai-trigger-btn:hover {
  transform: translateY(-2px);
  border-color: var(--brand-400);
  box-shadow: var(--glass-shine), 0 12px 36px var(--brand-glow);
}

.beverly-ai-trigger-icon svg {
  width: 20px;
  height: 20px;
  stroke: var(--brand-400);
}

/* Apple Liquid Glass Modal Container */
.beverly-ai-modal {
  position: fixed;
  bottom: 68px;
  right: var(--s-5, 20px);
  width: 360px;
  max-width: calc(100vw - 32px);
  height: 480px;
  max-height: calc(100vh - 90px);
  background: var(--glass-bg-strong);
  color: var(--text);
  border-radius: var(--r-2xl, 18px);
  box-shadow: var(--glass-shine), var(--glass-shadow-float), var(--shadow-4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--glass-border-strong);
  backdrop-filter: blur(28px) saturate(190%);
  -webkit-backdrop-filter: blur(28px) saturate(190%);
  transition: height 0.2s ease, width 0.2s ease, transform 0.2s ease;
  animation: modalSlideUp var(--dur-base) var(--ease-spring);
}

.beverly-liquid-specular {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent 0%, var(--glass-border-strong) 50%, transparent 100%);
  pointer-events: none;
}

.beverly-ai-modal.minimized {
  height: 48px !important;
}

/* Glass Header */
.beverly-ai-header {
  padding: var(--s-2, 8px) var(--s-3, 12px);
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 48px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.beverly-ai-brand {
  display: flex;
  align-items: center;
  gap: var(--s-2, 8px);
}

.beverly-ai-avatar-wrap {
  position: relative;
}

/* Theme-Aware Brand Emblem Container */
.beverly-ai-avatar {
  width: 30px;
  height: 30px;
  border-radius: var(--r-full);
  background-image: var(--brand-mark-url);
  background-size: contain;
  background-repeat: no-repeat;
  background-position: center;
  background-color: var(--surface-3);
  padding: 2px;
  border: 1px solid var(--brand-400);
}

.beverly-ai-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand-500);
  box-shadow: 0 0 8px var(--brand-glow);
  border: 2px solid var(--surface);
}

.beverly-ai-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--t-base, 13px);
  font-weight: var(--fw-bold);
  color: var(--text);
  line-height: 1.2;
}

.beverly-ai-subtitle {
  font-size: var(--t-2xs, 10px);
  color: var(--brand-400);
  display: block;
}

.beverly-ai-header-actions {
  display: flex;
  gap: var(--s-1, 4px);
}

.beverly-ai-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 6px;
  border-radius: var(--r-sm);
  transition: all var(--dur-fast) var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
}

.beverly-ai-icon-btn:hover {
  background: var(--surface-3);
  color: var(--text);
}

.beverly-ai-icon-btn.active {
  color: var(--brand-400);
}

.beverly-ai-messages {
  flex: 1;
  padding: var(--s-3, 12px);
  overflow-y: auto;
  background: var(--canvas);
  display: flex;
  flex-direction: column;
  gap: var(--s-2, 8px);
}

.beverly-ai-popup-greeting {
  display: flex;
  align-items: flex-start;
  gap: var(--s-3, 12px);
  padding: 14px 16px;
  border-radius: var(--r-xl, 14px);
  background: color-mix(in oklab, var(--surface-2) 90%, var(--brand-500) 10%);
  border: 1px solid var(--brand-glow, rgba(16, 185, 129, 0.3));
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
  margin-bottom: 16px;
  animation: modalSlideUp 0.25s ease-out;
}

.beverly-ai-popup-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--brand-500);
  border: 1px solid var(--brand-400);
}

.beverly-ai-popup-avatar svg {
  width: 18px;
  height: 18px;
}

.beverly-ai-popup-body p {
  margin: 0;
  font-size: var(--t-sm, 13px);
  line-height: 1.5;
  color: var(--text);
}

.beverly-ai-try-asking-section {
  margin-top: 4px;
}

.beverly-ai-try-asking-title {
  display: block;
  font-size: var(--t-xs, 12px);
  font-weight: 600;
  color: var(--text-dim);
  margin-bottom: 10px;
}

.beverly-ai-chip-grid-2x2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.beverly-ai-chip-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 14px;
  border-radius: var(--r-lg, 12px);
  background: var(--surface);
  border: 1px solid var(--border-strong);
  color: var(--text);
  font-size: var(--t-xs, 12px);
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.beverly-ai-chip-card:hover {
  background: var(--surface-2);
  border-color: var(--brand-500);
  transform: translateY(-2px);
  box-shadow: 0 4px 12px var(--brand-glow, rgba(16, 185, 129, 0.2));
  color: var(--brand-400);
}

.beverly-chip-icon-box {
  width: 28px;
  height: 28px;
  border-radius: 8px;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: var(--brand-500);
}

.beverly-chip-icon-box svg {
  width: 16px;
  height: 16px;
}

.beverly-ai-msg-row {
  display: flex;
  flex-direction: column;
}

.beverly-ai-msg-row.user-row {
  align-items: flex-end;
}

.beverly-ai-msg-row.bot-row {
  align-items: flex-start;
}

.beverly-ai-msg-bubble {
  max-width: 90%;
  padding: var(--s-2, 8px) var(--s-3, 12px);
  border-radius: var(--r-lg);
  font-size: var(--t-sm);
  line-height: 1.45;
  box-shadow: var(--shadow-2);
}

/* User Message: Beverly Brand Green Tokens */
.user-row .beverly-ai-msg-bubble {
  background: linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%);
  color: #ffffff;
  border-bottom-right-radius: 2px;
  box-shadow: 0 4px 16px var(--brand-glow);
}

/* Bot Message: Beverly Glass Surface */
.bot-row .beverly-ai-msg-bubble {
  background: var(--surface-2);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-bottom-left-radius: 2px;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
}

.beverly-ai-msg-sender {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: var(--t-2xs);
  font-weight: var(--fw-bold);
  margin-bottom: 4px;
  opacity: 0.85;
}

.beverly-ai-sender-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.beverly-copy-btn {
  background: transparent;
  border: none;
  color: var(--text-dim);
  cursor: pointer;
  padding: 2px;
  border-radius: var(--r-xs);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color var(--dur-fast);
}

.beverly-copy-btn:hover {
  color: var(--brand-400);
}

.beverly-ai-denied-badge {
  margin-top: 6px;
  padding: 4px 8px;
  background: var(--semantic-negative-soft);
  color: var(--semantic-negative);
  border: 1px solid var(--semantic-negative);
  border-radius: var(--r-xs);
  font-size: var(--t-2xs);
  font-weight: var(--fw-semibold);
  display: flex;
  align-items: center;
  gap: 4px;
}

.beverly-ai-thinking {
  display: flex;
  align-items: center;
  gap: var(--s-2, 8px);
  font-size: var(--t-xs);
  color: var(--brand-400);
}

.beverly-ai-footer {
  padding: var(--s-2, 8px) var(--s-3, 12px);
  background: var(--surface-2);
  border-top: 1px solid var(--border);
  display: flex;
  gap: var(--s-2, 8px);
  align-items: center;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  flex-wrap: wrap;
}

.beverly-ai-voice-status {
  flex-basis: 100%;
  color: var(--text-2);
  font-size: var(--t-xs);
  line-height: 1.35;
}

.beverly-ai-mic-btn {
  background: var(--surface-3);
  border: 1px solid var(--border-strong);
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  padding: 0;
  border-radius: var(--r-md);
  color: var(--text);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.beverly-ai-mic-btn.listening {
  background: var(--semantic-negative-soft);
  border-color: var(--semantic-negative);
  color: var(--semantic-negative);
  animation: pulse 1s infinite;
}

.beverly-ai-mic-btn:disabled,
.beverly-ai-icon-btn:disabled {
  opacity: .45;
  cursor: not-allowed;
}

.beverly-ai-input {
  flex: 1;
  padding: 6px 10px;
  background: var(--canvas);
  color: var(--text);
  border: 1px solid var(--border-strong);
  border-radius: var(--r-md);
  font-size: var(--t-sm);
  outline: none;
}

.beverly-ai-input:focus {
  border-color: var(--brand-400);
  box-shadow: 0 0 10px var(--brand-glow);
}

/* Send Button: Beverly Brand Green Tokens */
.beverly-ai-send-btn {
  min-width: 44px;
  min-height: 44px;
  padding: 6px 10px;
  background: linear-gradient(135deg, var(--brand-600) 0%, var(--brand-500) 100%);
  color: #ffffff;
  border: none;
  border-radius: var(--r-md);
  cursor: pointer;
  box-shadow: 0 4px 12px var(--brand-glow);
  transition: all var(--dur-base) var(--ease-out);
  display: flex;
  align-items: center;
  justify-content: center;
}

.beverly-ai-send-btn:hover:not(:disabled) {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px var(--brand-glow);
}

.beverly-ai-send-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ════════════════════════════════════════════════════════════
   Responsive Mobile & Tablet Breakpoints
   ════════════════════════════════════════════════════════════ */

@media (max-width: 480px) {
  .beverly-ai-widget-wrapper {
    bottom: var(--s-4, 16px);
    right: var(--s-4, 16px);
  }

  .beverly-ai-trigger-btn {
    padding: 10px 14px;
    border-radius: 50%;
    width: 44px;
    height: 44px;
    justify-content: center;
  }

  .beverly-ai-trigger-label {
    display: none;
  }

  .beverly-ai-modal {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    width: 100vw;
    max-width: 100vw;
    height: 75vh;
    border-radius: 20px 20px 0 0;
    border-bottom: none;
  }

  .beverly-ai-modal.minimized {
    height: 52px !important;
  }
}

@media (min-width: 481px) and (max-width: 768px) {
  .beverly-ai-modal {
    width: 340px;
    height: 460px;
    right: var(--s-4, 16px);
    bottom: 64px;
  }
}

@keyframes rotateGlow {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

@keyframes modalSlideUp {
  from { opacity: 0; transform: translateY(16px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.06); }
  100% { transform: scale(1); }
}

@keyframes pulseSparkle {
  0%, 100% { transform: scale(1) rotate(0deg); opacity: 0.8; }
  50% { transform: scale(1.15) rotate(90deg); opacity: 1; }
}
</style>
