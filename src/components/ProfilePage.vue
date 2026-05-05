<template>
  <div class="profile-overlay" @click.self="$emit('close')">
    <div class="profile-panel">

      <!-- Panel Header -->
      <div class="profile-panel-header">
        <div class="profile-panel-title">
          <div class="profile-panel-icon">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>
          </div>
          <div>
            <div class="profile-panel-name">{{ userName }}</div>
            <div class="profile-panel-role">{{ roleName }}</div>
          </div>
        </div>
        <button class="profile-close-btn" @click="$emit('close')" aria-label="Close profile">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>

      <!-- Avatar Hero -->
      <div class="profile-hero">
        <div class="profile-avatar-wrap">
          <div class="profile-avatar">{{ initials }}</div>
          <div class="profile-avatar-ring"></div>
        </div>
        <div class="profile-hero-info">
          <div class="profile-hero-name">{{ userName }}</div>
          <div class="profile-hero-meta">
            <span class="profile-badge">
              <svg viewBox="0 0 24 24" fill="currentColor" style="width:10px;height:10px"><circle cx="12" cy="12" r="10"/></svg>
              Active
            </span>
            <span class="profile-hero-sep">·</span>
            <span>{{ roleName }}</span>
            <span class="profile-hero-sep">·</span>
            <span>Beverly CRM</span>
          </div>
        </div>
        <div class="profile-hero-stats">
          <div class="profile-stat">
            <span class="profile-stat-val">{{ sessionDays }}</span>
            <span class="profile-stat-label">Days Active</span>
          </div>
          <div class="profile-stat-div"></div>
          <div class="profile-stat">
            <span class="profile-stat-val">{{ permissions }}</span>
            <span class="profile-stat-label">Permissions</span>
          </div>
          <div class="profile-stat-div"></div>
          <div class="profile-stat">
            <span class="profile-stat-val">3</span>
            <span class="profile-stat-label">Modules</span>
          </div>
        </div>
      </div>

      <!-- Tab Nav -->
      <div class="profile-tabs">
        <button v-for="t in tabs" :key="t.id" :class="['profile-tab', { active: activeTab === t.id }]" @click="activeTab = t.id">
          <span v-html="t.icon" class="profile-tab-icon"></span>
          {{ t.label }}
        </button>
      </div>

      <!-- Tab Content -->
      <div class="profile-body">

        <!-- PROFILE TAB -->
        <div v-if="activeTab === 'profile'" class="profile-section">
          <div class="profile-section-title">Personal Information</div>
          <div class="profile-form-grid">
            <div class="profile-field">
              <label class="profile-label">Full Name</label>
              <input class="profile-input" v-model="form.name" placeholder="Enter your name" />
            </div>
            <div class="profile-field">
              <label class="profile-label">Username / ID</label>
              <input class="profile-input profile-input-readonly" :value="userName" readonly />
            </div>
            <div class="profile-field">
              <label class="profile-label">Email Address</label>
              <input class="profile-input" v-model="form.email" type="email" placeholder="Enter email" />
            </div>
            <div class="profile-field">
              <label class="profile-label">Phone Number</label>
              <input class="profile-input" v-model="form.phone" placeholder="+234 000 000 0000" />
            </div>
            <div class="profile-field profile-field-full">
              <label class="profile-label">Organisation</label>
              <input class="profile-input profile-input-readonly" value="Beverly Energy Systems" readonly />
            </div>
            <div class="profile-field profile-field-full">
              <label class="profile-label">Role</label>
              <input class="profile-input profile-input-readonly" :value="roleName" readonly />
            </div>
          </div>
          <div class="profile-form-actions">
            <button class="profile-btn-outline" @click="resetForm">Discard</button>
            <button class="profile-btn-primary" @click="saveProfile" :disabled="saving">
              <span v-if="saving" class="profile-spinner"></span>
              {{ saving ? 'Saving…' : 'Save Changes' }}
            </button>
          </div>
          <div class="profile-save-notice" v-if="saveSuccess">
            <svg viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
            Profile updated successfully
          </div>
        </div>

        <!-- SECURITY TAB -->
        <div v-if="activeTab === 'security'" class="profile-section">
          <div class="profile-section-title">Change Password</div>
          <div class="profile-form-grid">
            <div class="profile-field profile-field-full">
              <label class="profile-label">Current Password</label>
              <div class="profile-pw-wrap">
                <input class="profile-input" :type="showPw.current ? 'text' : 'password'" v-model="pw.current" placeholder="Enter current password" />
                <button class="profile-eye" @click="showPw.current = !showPw.current" type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <div class="profile-field">
              <label class="profile-label">New Password</label>
              <div class="profile-pw-wrap">
                <input class="profile-input" :type="showPw.next ? 'text' : 'password'" v-model="pw.next" placeholder="Min 8 characters" />
                <button class="profile-eye" @click="showPw.next = !showPw.next" type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="profile-pw-strength" v-if="pw.next">
                <div class="pw-bar" v-for="i in 4" :key="i" :class="{ filled: pwStrength >= i, strong: pwStrength === 4, medium: pwStrength === 3 }"></div>
                <span class="pw-label">{{ pwLabel }}</span>
              </div>
            </div>
            <div class="profile-field">
              <label class="profile-label">Confirm Password</label>
              <div class="profile-pw-wrap">
                <input class="profile-input" :type="showPw.confirm ? 'text' : 'password'" v-model="pw.confirm" placeholder="Repeat new password" />
                <button class="profile-eye" @click="showPw.confirm = !showPw.confirm" type="button">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
              <div class="profile-pw-match" v-if="pw.confirm" :class="{ ok: pw.next === pw.confirm }">
                {{ pw.next === pw.confirm ? '✓ Passwords match' : '✗ Passwords do not match' }}
              </div>
            </div>
          </div>
          <div class="profile-form-actions">
            <button class="profile-btn-primary" @click="changePassword" :disabled="!canChangePw">Update Password</button>
          </div>

          <div class="profile-section-title" style="margin-top:32px">Active Sessions</div>
          <div class="profile-sessions">
            <div class="profile-session" v-for="s in sessions" :key="s.id">
              <div class="session-icon" v-html="s.icon"></div>
              <div class="session-info">
                <div class="session-device">{{ s.device }}</div>
                <div class="session-meta">{{ s.location }} · {{ s.time }}</div>
              </div>
              <div class="session-current" v-if="s.current">Current</div>
              <button class="session-revoke" v-else @click="revokeSession(s.id)">Revoke</button>
            </div>
          </div>
        </div>

        <!-- PREFERENCES TAB -->
        <div v-if="activeTab === 'preferences'" class="profile-section">
          <div class="profile-section-title">Appearance</div>
          <div class="profile-pref-group">
            <div class="profile-pref-row">
              <div class="profile-pref-label">
                <span class="profile-pref-name">Theme</span>
                <span class="profile-pref-desc">Choose your display theme</span>
              </div>
              <div class="profile-theme-picker">
                <button v-for="t in themes" :key="t.id" :class="['theme-pick-btn', { active: prefs.theme === t.id }]" @click="prefs.theme = t.id; applyTheme(t.id)">
                  <span class="theme-pick-icon" v-html="t.icon"></span>
                  {{ t.label }}
                </button>
              </div>
            </div>
            <div class="profile-pref-row">
              <div class="profile-pref-label">
                <span class="profile-pref-name">Compact Mode</span>
                <span class="profile-pref-desc">Denser tables and layouts</span>
              </div>
              <button :class="['profile-toggle', { on: prefs.compact }]" @click="prefs.compact = !prefs.compact">
                <span class="profile-toggle-knob"></span>
              </button>
            </div>
          </div>

          <div class="profile-section-title" style="margin-top:28px">Notifications</div>
          <div class="profile-pref-group">
            <div class="profile-pref-row" v-for="n in notifOptions" :key="n.id">
              <div class="profile-pref-label">
                <span class="profile-pref-name">{{ n.label }}</span>
                <span class="profile-pref-desc">{{ n.desc }}</span>
              </div>
              <button :class="['profile-toggle', { on: prefs[n.id] }]" @click="prefs[n.id] = !prefs[n.id]">
                <span class="profile-toggle-knob"></span>
              </button>
            </div>
          </div>

          <div class="profile-form-actions">
            <button class="profile-btn-primary" @click="savePrefs">Save Preferences</button>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'ProfilePage',
  props: {
    userName: { type: String, default: 'ACB(admin)' },
    roleId:   { type: String, default: 'super-admin' }
  },
  data() {
    const saved = JSON.parse(localStorage.getItem('beverly-profile') || '{}');
    return {
      activeTab: 'profile',
      saving: false,
      saveSuccess: false,
      form: { name: saved.name || this.userName, email: saved.email || '', phone: saved.phone || '' },
      pw: { current: '', next: '', confirm: '' },
      showPw: { current: false, next: false, confirm: false },
      prefs: {
        theme:   localStorage.getItem('acob-theme') || 'system',
        compact: false,
        emailAlerts: true,
        tokenAlerts: true,
        systemAlerts: false,
      },
      sessions: [
        { id: 1, device: 'Chrome on Windows', location: 'Lagos, NG', time: 'Now', current: true,  icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/></svg>' },
        { id: 2, device: 'Firefox on macOS', location: 'Abuja, NG',  time: '2h ago',  current: false, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h16v12z"/></svg>' },
        { id: 3, device: 'Mobile Safari',     location: 'Lagos, NG',  time: 'Yesterday', current: false, icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17 1.01L7 1c-1.1 0-2 .9-2 2v18c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V3c0-1.1-.9-1.99-2-1.99zM17 19H7V5h10v14z"/></svg>' },
      ],
      tabs: [
        { id: 'profile',     label: 'Profile',     icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.7 0 4.8-2.1 4.8-4.8S14.7 2.4 12 2.4 7.2 4.5 7.2 7.2 9.3 12 12 12zm0 2.4c-3.2 0-9.6 1.6-9.6 4.8v2.4h19.2v-2.4c0-3.2-6.4-4.8-9.6-4.8z"/></svg>' },
        { id: 'security',    label: 'Security',    icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/></svg>' },
        { id: 'preferences', label: 'Preferences', icon: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94s-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96a7.02 7.02 0 0 0-1.62-.94l-.36-2.54A.484.484 0 0 0 14 2h-4a.484.484 0 0 0-.48.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.48.48 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.27.41.48.41h4c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.49.49 0 0 0-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>' },
      ],
      themes: [
        { id: 'light',  label: 'Light',  icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/></svg>' },
        { id: 'dark',   label: 'Dark',   icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' },
        { id: 'system', label: 'System', icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>' },
      ],
      notifOptions: [
        { id: 'emailAlerts',  label: 'Email Alerts',   desc: 'Receive alerts via email' },
        { id: 'tokenAlerts',  label: 'Token Alerts',   desc: 'Notify on token generation' },
        { id: 'systemAlerts', label: 'System Alerts',  desc: 'System maintenance notices' },
      ],
    };
  },
  computed: {
    initials() {
      return (this.userName || 'U').split(/[\s()_-]+/).filter(Boolean).map(w => w[0].toUpperCase()).slice(0, 2).join('');
    },
    roleName() {
      const map = { 'super-admin': 'Super Admin', 'operations-manager': 'Operations Manager', account: 'Account Officer' };
      return map[this.roleId] || this.roleId;
    },
    sessionDays() { return 42; },
    permissions() {
      const map = { 'super-admin': 'Full', 'operations-manager': 'Ops', account: 'Read' };
      return map[this.roleId] || '—';
    },
    pwStrength() {
      const p = this.pw.next;
      if (!p) return 0;
      let s = 0;
      if (p.length >= 8) s++;
      if (/[A-Z]/.test(p)) s++;
      if (/[0-9]/.test(p)) s++;
      if (/[^A-Za-z0-9]/.test(p)) s++;
      return s;
    },
    pwLabel() {
      return ['', 'Weak', 'Fair', 'Good', 'Strong'][this.pwStrength];
    },
    canChangePw() {
      return this.pw.current && this.pw.next.length >= 8 && this.pw.next === this.pw.confirm;
    },
  },
  methods: {
    resetForm() {
      const saved = JSON.parse(localStorage.getItem('beverly-profile') || '{}');
      this.form = { name: saved.name || this.userName, email: saved.email || '', phone: saved.phone || '' };
    },
    async saveProfile() {
      this.saving = true;
      await new Promise(r => setTimeout(r, 800));
      localStorage.setItem('beverly-profile', JSON.stringify(this.form));
      this.saving = false;
      this.saveSuccess = true;
      setTimeout(() => { this.saveSuccess = false; }, 3000);
    },
    changePassword() {
      if (!this.canChangePw) return;
      this.pw = { current: '', next: '', confirm: '' };
      alert('Password updated. (Connect to /api/user/changePassword in production.)');
    },
    revokeSession(id) {
      this.sessions = this.sessions.filter(s => s.id !== id);
    },
    applyTheme(theme) {
      localStorage.setItem('acob-theme', theme);
      this.$emit('theme-change', theme);
    },
    savePrefs() {
      localStorage.setItem('beverly-prefs', JSON.stringify(this.prefs));
    },
  },
};
</script>
