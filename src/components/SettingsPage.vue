<template>
  <div class="profile-overlay" @click.self="$emit('close')">
    <div class="profile-panel">
      <div class="profile-panel-header">
        <div class="profile-panel-title">
          <div class="profile-panel-icon">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54A.484.484 0 0 0 14 2h-4a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h4c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
          </div>
          <div>
            <div class="profile-panel-name">Settings</div>
            <div class="profile-panel-role">{{ userName }} - {{ roleName }}</div>
          </div>
        </div>
        <BaseIconButton class="profile-close-btn" @click="$emit('close')" aria-label="Close settings">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>

      <div class="profile-tabs">
        <BaseButton :class="['profile-tab', { active: activeTab === 'security' }]" @click="activeTab = 'security'">
          <span class="profile-tab-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 1 3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z"/></svg></span>
          Security
        </BaseButton>
        <BaseButton :class="['profile-tab', { active: activeTab === 'settings' }]" @click="activeTab = 'settings'">
          <span class="profile-tab-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3 5h18v2H3V5zm4 6h10v2H7v-2zm-2 6h14v2H5v-2z"/></svg></span>
          Preferences
        </BaseButton>
        <BaseButton v-if="isSuperAdmin" :class="['profile-tab', { active: activeTab === 'operations' }]" @click="openOperations">
          <span class="profile-tab-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 2h10v2H7zM5 6h14v16H5zM9 9h6v2H9zm0 4h6v2H9z"/></svg></span>
          Operations
        </BaseButton>
      </div>

      <div class="profile-body">
        <div v-if="activeTab === 'security'" class="profile-section">
          <div class="profile-section-title">Change Password</div>
          <div class="profile-form-grid">
            <div class="profile-field profile-field-full">
              <label class="profile-label">Current Password</label>
              <div class="profile-pw-wrap">
                <BaseInput class="profile-input" :type="showPw.current ? 'text' : 'password'" v-model="pw.current" placeholder="Enter current password" />
                <BaseIconButton class="profile-eye" aria-label="Toggle current password visibility" @click="showPw.current = !showPw.current">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </BaseIconButton>
              </div>
            </div>
            <div class="profile-field">
              <label class="profile-label">New Password</label>
              <div class="profile-pw-wrap">
                <BaseInput class="profile-input" :type="showPw.next ? 'text' : 'password'" v-model="pw.next" placeholder="Min 8 characters" />
                <BaseIconButton class="profile-eye" aria-label="Toggle new password visibility" @click="showPw.next = !showPw.next">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </BaseIconButton>
              </div>
              <div class="profile-pw-strength" v-if="pw.next">
                <div v-for="i in 4" :key="i" class="pw-bar" :class="{ filled: pwStrength >= i, strong: pwStrength === 4, medium: pwStrength === 3 }"></div>
                <span class="pw-label">{{ pwLabel }}</span>
              </div>
            </div>
            <div class="profile-field">
              <label class="profile-label">Confirm Password</label>
              <div class="profile-pw-wrap">
                <BaseInput class="profile-input" :type="showPw.confirm ? 'text' : 'password'" v-model="pw.confirm" placeholder="Repeat new password" />
                <BaseIconButton class="profile-eye" aria-label="Toggle confirm password visibility" @click="showPw.confirm = !showPw.confirm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </BaseIconButton>
              </div>
              <div class="profile-pw-match" v-if="pw.confirm" :class="{ ok: pw.next === pw.confirm }">
                {{ pw.next === pw.confirm ? 'Passwords match' : 'Passwords do not match' }}
              </div>
            </div>
          </div>
          <div class="profile-form-actions">
            <BaseButton class="profile-btn-primary" variant="primary" :disabled="!canChangePw" @click="changePassword">Update Password</BaseButton>
          </div>
          <div class="profile-save-notice" v-if="passwordMessage">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            {{ passwordMessage }}
          </div>

          <div class="profile-section-title" style="margin-top:32px">Two-Factor Authentication</div>
          <div class="mfa-section-body">
            <div v-if="mfaLoading" class="mfa-loading">Loading…</div>
            <div v-else-if="mfaStatus.enrolled" class="mfa-status">
              <div class="mfa-status-badge mfa-enabled">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                Enabled
              </div>
              <p class="mfa-hint">Your account is protected with two-factor authentication.</p>
              <div class="mfa-actions"><BaseButton size="sm" variant="danger" @click="disableMFA">Disable 2FA</BaseButton></div>
            </div>
            <div v-else class="mfa-status">
              <div class="mfa-status-badge mfa-disabled">Not Enabled</div>
              <p class="mfa-hint">Protect your account with a second verification step.</p>
              <BaseButton size="sm" variant="primary" @click="mfaSetupOpen = true">Enable 2FA</BaseButton>
            </div>
            <MfaSetupFlow v-if="mfaSetupOpen" @complete="onMfaSetupComplete" @cancelled="mfaSetupOpen = false" />
          </div>

        </div>

        <div v-if="activeTab === 'settings'" class="profile-section">
          <div class="profile-section-title">Appearance</div>
          <div class="profile-pref-group">
            <div class="profile-pref-row">
              <div class="profile-pref-label">
                <span class="profile-pref-name">Theme</span>
                <span class="profile-pref-desc">Choose your display theme</span>
              </div>
              <div class="profile-theme-picker">
                <BaseButton v-for="theme in themes" :key="theme.id" :class="['theme-pick-btn', { active: prefs.theme === theme.id }]" @click="applyTheme(theme.id)">
                  <span class="theme-pick-icon" v-html="theme.icon"></span>
                  {{ theme.label }}
                </BaseButton>
              </div>
            </div>
            <div class="profile-pref-row">
              <div class="profile-pref-label">
                <span class="profile-pref-name">Compact Mode</span>
                <span class="profile-pref-desc">Denser tables and layouts</span>
              </div>
              <BaseToggle v-model="prefs.compact" :class="['profile-toggle', { on: prefs.compact }]"></BaseToggle>
            </div>
          </div>

          <div class="profile-section-title" style="margin-top:28px">Notifications</div>
          <div class="profile-pref-group">
            <div class="profile-pref-row" v-for="option in notifOptions" :key="option.id">
              <div class="profile-pref-label">
                <span class="profile-pref-name">{{ option.label }}</span>
                <span class="profile-pref-desc">{{ option.desc }}</span>
              </div>
              <BaseToggle v-model="prefs[option.id]" :class="['profile-toggle', { on: prefs[option.id] }]"></BaseToggle>
            </div>
          </div>

          <div class="profile-form-actions">
            <BaseButton class="profile-btn-primary" variant="primary" @click="savePrefs">Save Preferences</BaseButton>
          </div>
          <div class="profile-save-notice" v-if="prefsMessage">
            <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            {{ prefsMessage }}
          </div>
        </div>

        <div v-if="activeTab === 'operations' && isSuperAdmin" class="profile-section">
          <div class="profile-section-title">Live Write Control</div>
          <div class="live-control-card">
            <div class="live-control-status">
              <div>
                <span class="profile-pref-name">{{ liveControl.enabled ? 'Live writes enabled' : 'Live writes disabled' }}</span>
                <span class="profile-pref-desc">Environment: {{ liveControl.environment || 'unknown' }}</span>
              </div>
              <span :class="['live-control-badge', { enabled: liveControl.enabled }]">
                {{ liveControl.enabled ? 'Enabled' : 'Disabled' }}
              </span>
            </div>

            <p class="live-control-warning">
              This changes real meter operations.
            </p>

            <label class="profile-label" for="live-write-reason">Change reason</label>
            <textarea
              id="live-write-reason"
              v-model="liveControl.reasonInput"
              class="profile-input live-control-reason"
              maxlength="240"
              placeholder="Explain this operational change"
            ></textarea>

            <label class="profile-label" for="live-write-confirmation">
              Type {{ expectedConfirmation }}
            </label>
            <BaseInput
              id="live-write-confirmation"
              v-model="liveControl.confirmation"
              class="profile-input"
              :placeholder="expectedConfirmation"
              autocomplete="off"
            />

            <div v-if="liveControl.error" class="live-control-error" role="alert">{{ liveControl.error }}</div>
            <div v-if="liveControl.message" class="profile-save-notice">{{ liveControl.message }}</div>

            <div class="profile-form-actions live-control-actions">
              <BaseButton variant="ghost" :disabled="liveControl.busy" @click="loadLiveControl">Refresh</BaseButton>
              <BaseButton
                :variant="liveControl.enabled ? 'danger' : 'primary'"
                :disabled="!canSubmitLiveControl"
                @click="updateLiveControl"
              >
                {{ liveControl.busy ? 'Saving...' : (liveControl.enabled ? 'Disable Live Writes' : 'Enable Live Writes') }}
              </BaseButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseToggle from "./base/BaseToggle.vue";
import MfaSetupFlow from "./MfaSetupFlow.vue";
import { changeUserPassword, loadPreferenceState, savePreferenceState } from "../services/profile-store.mjs";
import { getMFAStatus, unenrollMFA } from "../services/mfa-service.mjs";
import { getApi, putApi, setRuntimeLiveWritesAllowed } from "../services/api.js";

const supportedThemeChoices = ["system", "light", "executive", "contrast"];

function normalizeThemeChoice(theme) {
  if (theme === "dark") return "executive";
  if (theme === "ocean") return "light";
  return supportedThemeChoices.includes(theme) ? theme : "system";
}

export default {
  name: "SettingsPage",
  components: { BaseButton, BaseIconButton, BaseInput, BaseToggle, MfaSetupFlow },
  props: {
    userName: { type: String, default: "ACB(admin)" },
    roleId: { type: String, default: "super-admin" },
    initialTab: { type: String, default: "security" }
  },
  data() {
    return {
      activeTab: this.normalizeTab(this.initialTab),
      pw: { current: "", next: "", confirm: "" },
      showPw: { current: false, next: false, confirm: false },
      passwordMessage: "",
      prefsMessage: "",
      prefs: savePreferenceState({ ...loadPreferenceState(), theme: normalizeThemeChoice(loadPreferenceState().theme) }),
      themes: [
        { id: "system", label: "System", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
        { id: "light", label: "Light", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></svg>' },
        { id: "executive", label: "Executive", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-8h6v8"/></svg>' },
        { id: "contrast", label: "Contrast", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/></svg>' }
      ],
      notifOptions: [
        { id: "emailAlerts", label: "Email Alerts", desc: "Receive alerts via email" },
        { id: "tokenAlerts", label: "Token Alerts", desc: "Notify on token generation" },
        { id: "systemAlerts", label: "System Alerts", desc: "System maintenance notices" }
      ],
      mfaStatus: { enrolled: false, factorId: null },
      mfaLoading: true,
      mfaSetupOpen: false,
      liveControl: {
        enabled: false,
        environment: "",
        busy: false,
        error: "",
        message: "",
        reasonInput: "",
        confirmation: ""
      }
    };
  },
  async mounted() {
    await this.loadMfaStatus();
  },
  computed: {
    roleName() {
      const map = { "super-admin": "Super Admin", "operations-manager": "Operations Manager", account: "Account Officer", vendor: "Vendor" };
      return map[this.roleId] || this.roleId;
    },
    pwStrength() {
      const value = this.pw.next;
      if (!value) return 0;
      let score = 0;
      if (value.length >= 8) score++;
      if (/[A-Z]/.test(value)) score++;
      if (/[0-9]/.test(value)) score++;
      if (/[^A-Za-z0-9]/.test(value)) score++;
      return score;
    },
    pwLabel() {
      return ["", "Weak", "Fair", "Good", "Strong"][this.pwStrength];
    },
    canChangePw() {
      return this.pw.current && this.pw.next.length >= 8 && this.pw.next === this.pw.confirm;
    },
    isSuperAdmin() {
      return String(this.roleId || "").toLowerCase().replace(/_/g, "-") === "super-admin";
    },
    expectedConfirmation() {
      return this.liveControl.enabled ? "DISABLE LIVE WRITES" : "ENABLE LIVE WRITES";
    },
    canSubmitLiveControl() {
      return !this.liveControl.busy
        && this.liveControl.reasonInput.trim().length >= 8
        && this.liveControl.confirmation.trim() === this.expectedConfirmation;
    }
  },
  watch: {
    initialTab(next) {
      this.activeTab = this.normalizeTab(next);
    }
  },
  methods: {
    normalizeTab(tab) {
      return ["security", "settings", "operations"].includes(tab) ? tab : "security";
    },
    async openOperations() {
      this.activeTab = "operations";
      await this.loadLiveControl();
    },
    async loadLiveControl() {
      if (!this.isSuperAdmin) return;
      this.liveControl.busy = true;
      this.liveControl.error = "";
      try {
        const response = await getApi("/api/system/live-write-control");
        const state = response?.data || response?.result || {};
        this.liveControl.enabled = state.enabled === true;
        this.liveControl.environment = state.environment || "";
        setRuntimeLiveWritesAllowed(this.liveControl.enabled);
      } catch (error) {
        this.liveControl.error = error?.message || "Live-write status failed";
      } finally {
        this.liveControl.busy = false;
      }
    },
    async updateLiveControl() {
      if (!this.canSubmitLiveControl) return;
      this.liveControl.busy = true;
      this.liveControl.error = "";
      this.liveControl.message = "";
      try {
        const response = await putApi("/api/system/live-write-control", {
          enabled: !this.liveControl.enabled,
          reason: this.liveControl.reasonInput.trim(),
          confirmation: this.liveControl.confirmation.trim()
        });
        const state = response?.data || response?.result || {};
        this.liveControl.enabled = state.enabled === true;
        this.liveControl.environment = state.environment || this.liveControl.environment;
        this.liveControl.reasonInput = "";
        this.liveControl.confirmation = "";
        this.liveControl.message = "Live-write status updated.";
        setRuntimeLiveWritesAllowed(this.liveControl.enabled);
      } catch (error) {
        this.liveControl.error = error?.message || "Live-write update failed";
      } finally {
        this.liveControl.busy = false;
      }
    },
    async changePassword() {
      if (!this.canChangePw) return;
      this.passwordMessage = "";
      await changeUserPassword({ currentPassword: this.pw.current, newPassword: this.pw.next });
      this.pw = { current: "", next: "", confirm: "" };
      this.passwordMessage = "Password updated.";
    },
    applyTheme(theme) {
      const nextTheme = normalizeThemeChoice(theme);
      this.prefs = savePreferenceState({ ...this.prefs, theme: nextTheme });
      this.$emit("theme-change", nextTheme);
    },
    savePrefs() {
      this.prefs = savePreferenceState(this.prefs);
      this.prefsMessage = "Preferences saved.";
      setTimeout(() => { this.prefsMessage = ""; }, 3000);
    },
    async loadMfaStatus() {
      this.mfaLoading = true;
      try {
        this.mfaStatus = await getMFAStatus();
      } catch { this.mfaStatus = { enrolled: false, factorId: null }; }
      this.mfaLoading = false;
    },
    async disableMFA() {
      await unenrollMFA(this.mfaStatus.factorId);
      await this.loadMfaStatus();
    },
    async onMfaSetupComplete() {
      this.mfaSetupOpen = false;
      await this.loadMfaStatus();
    }
  }
};
</script>

<style scoped>
.live-control-card {
  display: grid;
  gap: 14px;
  max-width: 680px;
  padding: 20px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-card);
}

.live-control-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.live-control-status > div {
  display: grid;
  gap: 4px;
}

.live-control-badge {
  padding: 6px 10px;
  border: 1px solid var(--danger);
  border-radius: 999px;
  color: var(--danger);
  font-weight: 700;
}

.live-control-badge.enabled {
  border-color: var(--success);
  color: var(--success);
}

.live-control-warning,
.live-control-error {
  margin: 0;
  padding: 12px;
  border-radius: 6px;
}

.live-control-warning {
  background: color-mix(in srgb, var(--warning) 12%, transparent);
  color: var(--text-main);
}

.live-control-error {
  background: color-mix(in srgb, var(--danger) 12%, transparent);
  color: var(--danger);
}

.live-control-reason {
  min-height: 92px;
  resize: vertical;
}

.live-control-actions {
  justify-content: flex-end;
}

@media (max-width: 640px) {
  .live-control-card {
    padding: 14px;
  }

  .live-control-status {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
