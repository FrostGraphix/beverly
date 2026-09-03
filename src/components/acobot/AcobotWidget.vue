<template>
  <div class="beverly-ai-widget-wrapper">
    <!-- Responsive Floating Trigger Button with Bot Head & Orbital Antenna -->
    <BaseButton
      class="beverly-ai-trigger-btn"
      variant="ghost"
      :class="{ active: isOpen }"
      @click="toggleWidget"
      title="Beverly AI Operations Assistant"
      aria-label="Toggle Beverly AI Assistant"
    >
      <div class="beverly-ai-glow-pulse"></div>
      <span class="beverly-ai-trigger-icon">
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
    </BaseButton>

    <!-- Floating Liquid Glass Modal -->
    <div v-if="isOpen" class="beverly-ai-modal" :class="{ minimized: isMinimized }" role="dialog" aria-label="Beverly AI Command Console">
      <div class="beverly-liquid-specular"></div>

      <!-- Header -->
      <header class="beverly-ai-header">
        <div class="beverly-ai-brand">
          <div class="beverly-ai-avatar-wrap">
            <div class="beverly-ai-avatar" role="img" aria-label="Beverly Brand Emblem"></div>
            <span class="beverly-ai-status-dot"></span>
          </div>
          <div>
            <h3 class="beverly-ai-title">Beverly AI</h3>
            <span class="beverly-ai-subtitle">CRM Operations Engine</span>
          </div>
        </div>

        <div class="beverly-ai-header-actions">
          <button type="button" class="beverly-ai-icon-btn" @click="isMinimized = !isMinimized" :title="isMinimized ? 'Expand' : 'Minimize'">
            <svg class="beverly-svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
          </button>
          <button type="button" class="beverly-ai-icon-btn" @click="closeWidget" title="Close widget">
            <svg class="beverly-svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </header>

      <template v-if="!isMinimized">
        <div ref="messageContainer" class="beverly-ai-messages">
          <div v-if="messages.length === 0" class="beverly-ai-welcome">
            <!-- Pop-up Greeting Card -->
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
                <p>👋 Hi <strong>{{ userFirstName }}</strong>, I'm <strong>Beverly AI</strong>. I can help you inspect OEM meter gateways, audit STS vending strategy, review customer KYC compliance, and resolve disputes.</p>
              </div>
            </div>

            <!-- "Try asking" 2x2 Grid -->
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
                  <svg v-if="msg.sender === 'user'" class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
                    <circle cx="12" cy="7" r="4"></circle>
                  </svg>
                  <svg v-else class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <rect x="5" y="8" width="14" height="12" rx="3"></rect>
                    <path d="M12 2v6"></path>
                    <circle cx="9" cy="13" r="1"></circle>
                    <circle cx="15" cy="13" r="1"></circle>
                  </svg>
                  <span>{{ msg.sender === 'user' ? 'You' : 'Beverly AI' }}</span>
                </div>

                <button v-if="msg.sender === 'bot'" type="button" class="beverly-copy-btn" @click="copyText(msg.text)" title="Copy text">
                  <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                    <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                  </svg>
                </button>
              </div>
              <div class="beverly-ai-msg-content" v-html="formatMessage(msg.text)"></div>

              <!-- Outline Access Policy Badge -->
              <div v-if="msg.permissionStatus === 'denied'" class="beverly-ai-denied-badge">
                <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
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
                  <svg class="beverly-svg-icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polyline points="23 4 23 10 17 10"></polyline>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                  </svg>
                  <span>Retry Request</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Thinking State -->
          <div v-if="isThinking" class="beverly-ai-thinking">
            <svg class="beverly-svg-sparkle" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
              <path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4L12 2z"></path>
            </svg>
            <span>Analyzing requests…</span>
          </div>
        </div>

        <!-- Input Bar -->
        <footer class="beverly-ai-footer">
          <div class="beverly-ai-input-wrap">
            <button
              type="button"
              class="beverly-ai-voice-btn"
              :class="{ listening: isListening }"
              @click="toggleListening"
              title="Voice Search"
            >
              <svg class="beverly-svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75">
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
                <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                <line x1="12" y1="19" x2="12" y2="22"></line>
              </svg>
            </button>

            <input
              v-model="inputPrompt"
              type="text"
              class="beverly-ai-input"
              placeholder="Ask Beverly AI or speak..."
              @keyup.enter="handleSend"
            />

            <button
              type="button"
              class="beverly-ai-send-btn"
              :disabled="!inputPrompt.trim() || isThinking"
              @click="handleSend"
              title="Send Prompt"
            >
              <svg class="beverly-svg-icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </div>
        </footer>
      </template>
    </div>
  </div>
</template>

<script>
import { apiClient } from "../../services/api";
import { currentUserInfo } from "../../services/api";
import BaseButton from "../base/BaseButton.vue";
import { formatAiMessage } from "@beverly/tokens/ai-message";

export default {
  name: "AcobotWidget",
  components: { BaseButton },
  data() {
    return {
      isOpen: false,
      isMinimized: false,
      inputPrompt: "",
      isThinking: false,
      isListening: false,
      speakResponses: false,
      messages: [],
      quickChips: [
        {
          label: "Diagnose OEM Meters",
          iconPath: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
        },
        {
          label: "STS Tariffs & Vending",
          iconPath: "M13 2L3 14h9l-1 8 10-12h-9l1-8z",
        },
        {
          label: "Pending KYC Reviews",
          iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
        },
        {
          label: "Dispute Tickets",
          iconPath: "M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
        },
      ],
    };
  },
  computed: {
    userFirstName() {
      const user = currentUserInfo();
      const name = user?.name || user?.full_name || "";
      if (!name.trim()) return "Operator";
      return name.trim().split(" ")[0];
    },
  },
  mounted() {
    window.addEventListener("beverly-ai-open-prompt", this.onGlobalPromptEvent);
  },
  beforeUnmount() {
    window.removeEventListener("beverly-ai-open-prompt", this.onGlobalPromptEvent);
  },
  methods: {
    onGlobalPromptEvent(e) {
      const promptText = e.detail?.prompt;
      if (promptText) {
        this.isOpen = true;
        this.isMinimized = false;
        this.sendPrompt(promptText);
      }
    },
    toggleWidget() {
      this.isOpen = !this.isOpen;
      if (this.isOpen) this.scrollToBottom();
    },
    closeWidget() {
      this.isOpen = false;
    },
    scrollToBottom() {
      this.$nextTick(() => {
        if (this.$refs.messageContainer) {
          this.$refs.messageContainer.scrollTop = this.$refs.messageContainer.scrollHeight;
        }
      });
    },
    formatMessage(text) {
      return formatAiMessage(text);
    },
    copyText(text) {
      navigator.clipboard.writeText(text);
    },
    speakText(text) {
      if (!this.speakResponses || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/<[^>]*>?/gm, ""));
      utterance.rate = 1.0;
      window.speechSynthesis.speak(utterance);
    },
    toggleListening() {
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      if (!SpeechRecognition) {
        alert("Speech recognition is not supported in this browser.");
        return;
      }
      if (this.isListening) {
        this.isListening = false;
        return;
      }
      const recognition = new SpeechRecognition();
      recognition.lang = "en-US";
      recognition.interimResults = false;
      recognition.onstart = () => { this.isListening = true; };
      recognition.onresult = (event) => {
        this.inputPrompt = event.results[0][0].transcript;
        this.isListening = false;
        this.handleSend();
      };
      recognition.onerror = () => { this.isListening = false; };
      recognition.onend = () => { this.isListening = false; };
      recognition.start();
    },
    async handleSend() {
      const prompt = this.inputPrompt.trim();
      if (!prompt || this.isThinking) return;
      this.inputPrompt = "";
      await this.sendPrompt(prompt);
    },
    async retryPrompt(prompt, index) {
      if (index >= 0 && index < this.messages.length) {
        this.messages.splice(index, 1);
      }
      await this.sendPrompt(prompt, true);
    },
    async sendPrompt(prompt, isRetry = false) {
      if (!isRetry) {
        this.messages.push({ sender: "user", text: prompt });
      }
      this.scrollToBottom();
      this.isThinking = true;

      try {
        const res = await apiClient.post("/v1/acobot/chat", {
          prompt,
          portal: "crm",
        });
        const data = res.data || {};
        this.messages.push({
          sender: "bot",
          text: data.response || "Request completed.",
          permissionStatus: data.permissionStatus,
        });
        this.speakText(data.response || "");
      } catch (err) {
        const errorMsg = err?.response?.status === 401
          ? "Authentication required. Please log in to chat with Beverly AI."
          : (err?.message?.includes("timeout") || err?.message?.includes("long"))
            ? "The server took too long to respond. Please try again."
            : err?.response?.data?.message || err?.message || "Sorry, I encountered an error connecting to Beverly AI backend.";

        this.messages.push({
          sender: "bot",
          text: errorMsg,
          isError: true,
          lastPrompt: prompt,
        });
      } finally {
        this.isThinking = false;
        this.scrollToBottom();
      }
    },
  },
};
</script>

<style scoped>
.beverly-ai-widget-wrapper {
  position: fixed;
  bottom: 24px;
  right: 24px;
  z-index: 9999;
  font-family: var(--font-sans, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
}

.beverly-ai-trigger-btn {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 18px;
  border-radius: 9999px;
  background: var(--surface, #1e293b);
  border: 1px solid var(--brand-glow, rgba(16, 185, 129, 0.4));
  color: var(--text, #f8fafc);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
  position: relative;
}

.beverly-ai-trigger-btn:hover {
  transform: translateY(-2px);
  border-color: var(--brand-400, #34d399);
  box-shadow: 0 12px 32px var(--brand-glow, rgba(16, 185, 129, 0.4));
}

.beverly-ai-trigger-icon svg {
  width: 20px;
  height: 20px;
  color: var(--brand-400, #34d399);
}

.beverly-ai-modal {
  position: fixed;
  bottom: 84px;
  right: 24px;
  width: 380px;
  height: 560px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 100px);
  border-radius: 16px;
  background: var(--surface, #0f172a);
  border: 1px solid var(--border-strong, #334155);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  z-index: 10000;
  animation: modalSlideUp 0.25s ease-out;
}

@keyframes modalSlideUp {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: translateY(0); }
}

.beverly-ai-header {
  padding: 14px 16px;
  background: var(--surface-2, #1e293b);
  border-bottom: 1px solid var(--border-strong, #334155);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.beverly-ai-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.beverly-ai-avatar-wrap {
  position: relative;
  width: 32px;
  height: 32px;
}

.beverly-ai-avatar {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  background: linear-gradient(135deg, #10b981 0%, #059669 100%);
}

.beverly-ai-status-dot {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #10b981;
  border: 2px solid #0f172a;
}

.beverly-ai-title {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
  color: var(--text, #f8fafc);
}

.beverly-ai-subtitle {
  font-size: 11px;
  color: var(--text-dim, #94a3b8);
}

.beverly-ai-header-actions {
  display: flex;
  gap: 6px;
}

.beverly-ai-icon-btn {
  background: transparent;
  border: none;
  color: var(--text-dim, #94a3b8);
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
}

.beverly-ai-icon-btn:hover {
  color: var(--text, #f8fafc);
  background: rgba(255, 255, 255, 0.1);
}

.beverly-svg-icon-sm {
  width: 16px;
  height: 16px;
}

.beverly-ai-messages {
  flex: 1;
  padding: 16px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.beverly-ai-popup-greeting {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
  border-radius: 14px;
  background: rgba(16, 185, 129, 0.1);
  border: 1px solid rgba(16, 185, 129, 0.3);
  margin-bottom: 16px;
}

.beverly-ai-popup-avatar {
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: #1e293b;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #34d399;
  border: 1px solid #10b981;
}

.beverly-ai-popup-avatar svg {
  width: 18px;
  height: 18px;
}

.beverly-ai-popup-body p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
  color: var(--text, #f8fafc);
}

.beverly-ai-try-asking-title {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-dim, #94a3b8);
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
  padding: 12px;
  border-radius: 10px;
  background: var(--surface-2, #1e293b);
  border: 1px solid var(--border-strong, #334155);
  color: var(--text, #f8fafc);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  text-align: left;
  transition: all 0.2s ease;
}

.beverly-ai-chip-card:hover {
  background: #334155;
  border-color: #10b981;
  color: #34d399;
  transform: translateY(-2px);
}

.beverly-chip-icon-box {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: #0f172a;
  display: grid;
  place-items: center;
  flex-shrink: 0;
  color: #10b981;
}

.beverly-chip-icon-box svg {
  width: 15px;
  height: 15px;
}

.beverly-ai-msg-row {
  display: flex;
  flex-direction: column;
}

.user-row { align-items: flex-end; }
.bot-row { align-items: flex-start; }

.beverly-ai-msg-bubble {
  max-width: 85%;
  padding: 12px 14px;
  border-radius: 12px;
  font-size: 13px;
  line-height: 1.5;
}

.user-row .beverly-ai-msg-bubble {
  background: #10b981;
  color: #ffffff;
}

.bot-row .beverly-ai-msg-bubble {
  background: var(--surface-2, #1e293b);
  color: var(--text, #f8fafc);
  border: 1px solid var(--border-strong, #334155);
}

.beverly-ai-msg-sender {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 4px;
  opacity: 0.8;
}

.beverly-ai-sender-tag {
  display: flex;
  align-items: center;
  gap: 4px;
}

.beverly-svg-icon-xs {
  width: 14px;
  height: 14px;
}

.beverly-copy-btn {
  background: transparent;
  border: none;
  color: inherit;
  cursor: pointer;
  opacity: 0.7;
}

.beverly-copy-btn:hover { opacity: 1; }

.beverly-ai-retry-wrapper {
  margin-top: 8px;
  display: flex;
}

.beverly-ai-retry-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border-radius: 8px;
  background: #334155;
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.beverly-ai-retry-btn:hover {
  background: #10b981;
  color: #ffffff;
}

.beverly-ai-thinking {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  color: var(--text-dim, #94a3b8);
}

.beverly-svg-sparkle {
  width: 16px;
  height: 16px;
  color: #10b981;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.beverly-ai-footer {
  padding: 12px 16px;
  background: var(--surface-2, #1e293b);
  border-top: 1px solid var(--border-strong, #334155);
}

.beverly-ai-input-wrap {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--surface, #0f172a);
  border: 1px solid var(--border-strong, #334155);
  border-radius: 10px;
  padding: 4px 8px;
}

.beverly-ai-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text, #f8fafc);
  font-size: 13px;
  padding: 6px 4px;
}

.beverly-ai-voice-btn, .beverly-ai-send-btn {
  background: transparent;
  border: none;
  color: var(--text-dim, #94a3b8);
  cursor: pointer;
  padding: 4px;
}

.beverly-ai-send-btn {
  color: #10b981;
}

.beverly-ai-send-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}
</style>
