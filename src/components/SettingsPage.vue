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
          <span class="profile-tab-icon"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5z"/></svg></span>
          Preferences
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

          <div class="profile-section-title" style="margin-top:32px">Active Sessions</div>
          <div class="profile-sessions">
            <div class="profile-session" v-for="session in sessions" :key="session.id">
              <div class="session-icon" v-html="session.icon"></div>
              <div class="session-info">
                <div class="session-device">{{ session.device }}</div>
                <div class="session-meta">{{ session.location }} - {{ session.time }}</div>
              </div>
              <div v-if="session.current" class="session-current">Current</div>
              <BaseButton v-else class="session-revoke" variant="danger" size="sm" @click="revokeSession(session.id)">Revoke</BaseButton>
            </div>
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
      </div>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseToggle from "./base/BaseToggle.vue";
import { changeUserPassword, loadPreferenceState, savePreferenceState } from "../services/profile-store.mjs";

export default {
  name: "SettingsPage",
  components: { BaseButton, BaseIconButton, BaseInput, BaseToggle },
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
      prefs: loadPreferenceState(),
      sessions: [
        { id: 1, device: "Chrome on Windows", location: "Lagos, NG", time: "Now", current: true, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/></svg>' },
        { id: 2, device: "Edge on Windows", location: "Abuja, NG", time: "2h ago", current: false, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/></svg>' },
        { id: 3, device: "Mobile browser", location: "Lagos, NG", time: "Yesterday", current: false, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01 7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>' }
      ],
      themes: [
        { id: "system", label: "System", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
        { id: "light", label: "Light", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2"/></svg>' },
        { id: "dark", label: "Dark", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' },
        { id: "executive", label: "Executive", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-8h6v8"/></svg>' },
        { id: "ocean", label: "Canopy", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 21C7 16 5 11 6 5c6-1 11 1 13 6-4 1-7 4-9 8"/><path d="M6 19c3-5 7-8 13-8"/></svg>' },
        { id: "contrast", label: "Contrast", icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2v20"/></svg>' }
      ],
      notifOptions: [
        { id: "emailAlerts", label: "Email Alerts", desc: "Receive alerts via email" },
        { id: "tokenAlerts", label: "Token Alerts", desc: "Notify on token generation" },
        { id: "systemAlerts", label: "System Alerts", desc: "System maintenance notices" }
      ]
    };
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
    }
  },
  watch: {
    initialTab(next) {
      this.activeTab = this.normalizeTab(next);
    }
  },
  methods: {
    normalizeTab(tab) {
      return ["security", "settings"].includes(tab) ? tab : "security";
    },
    async changePassword() {
      if (!this.canChangePw) return;
      this.passwordMessage = "";
      await changeUserPassword({ currentPassword: this.pw.current, newPassword: this.pw.next });
      this.pw = { current: "", next: "", confirm: "" };
      this.passwordMessage = "Password updated.";
    },
    revokeSession(id) {
      this.sessions = this.sessions.filter((session) => session.id !== id);
    },
    applyTheme(theme) {
      this.prefs = savePreferenceState({ ...this.prefs, theme });
      this.$emit("theme-change", theme);
    },
    savePrefs() {
      this.prefs = savePreferenceState(this.prefs);
      this.prefsMessage = "Preferences saved.";
      setTimeout(() => { this.prefsMessage = ""; }, 3000);
    }
  }
};
</script>
