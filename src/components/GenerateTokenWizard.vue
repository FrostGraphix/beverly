<template>
  <!-- ──────────────────────────────────────────────────────────────
       GENERATE TOKEN WIZARD — same visual system as RechargeWizard,
       adapted for the non-credit token routes (clear tamper, clear
       credit, set maximum power limit). No pricing / VAT / payment —
       these are meter instructions, not purchases.
       Steps: Meter → [Limit] → Confirm → Token
  ─────────────────────────────────────────────────────────────────── -->
  <div class="rw-backdrop" @mousedown.self="$emit('close')">
    <div class="rw-card" role="dialog" aria-modal="true" aria-labelledby="generate-token-wizard-title">

      <!-- ── HEADER ─────────────────────────────────────────── -->
      <header class="rw-header">
        <div class="rw-header-top">
          <h2 id="generate-token-wizard-title" class="rw-title">{{ wizardTitle }}</h2>
          <div class="rw-header-actions">
            <span class="rw-step-counter">Step {{ currentStep }} of {{ totalSteps }}</span>
            <BaseButton
              class="rw-close"
              aria-label="Close generate token wizard"
              @click="$emit('close')"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </BaseButton>
          </div>
        </div>

        <!-- Progress bars -->
        <div
          class="rw-progress-bars"
          role="progressbar"
          aria-label="Generate token progress"
          aria-valuemin="1"
          :aria-valuemax="totalSteps"
          :aria-valuenow="currentStep"
          :style="{ '--rw-steps': totalSteps }"
        >
          <div
            v-for="n in totalSteps"
            :key="n"
            class="rw-progress-bar"
            :class="{ done: n < currentStep, active: n === currentStep }"
          />
        </div>

        <!-- Step labels -->
        <div class="rw-step-labels" :style="{ '--rw-steps': totalSteps }">
          <span
            v-for="(label, i) in stepLabels"
            :key="label"
            class="rw-step-label"
            :class="{ active: i + 1 === currentStep, done: i + 1 < currentStep }"
          >{{ label }}</span>
        </div>
      </header>

      <!-- ── ANIMATED STEP BODY ─────────────────────────────────── -->
      <div class="rw-body">
        <transition :name="slideDir" mode="out-in">

          <!-- STEP — Meter info -->
          <div v-if="currentStep === meterStepIndex" key="step-meter" class="rw-step">

            <!-- Meter ID hero -->
            <div class="rw-meter-hero">
              <div class="rw-meter-hero-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8">
                  <rect x="3" y="3" width="18" height="18" rx="3"/>
                  <path d="M8 12h8M12 8v8"/>
                </svg>
              </div>
              <div class="rw-meter-hero-copy">
                <span class="rw-meter-hero-label">Meter ID</span>
                <strong class="rw-meter-hero-id">{{ form.meterId || '—' }}</strong>
              </div>
            </div>

            <!-- Details grid -->
            <div class="rw-meter-detail-grid">
              <div class="rw-meter-detail-cell">
                <span>Customer name</span>
                <strong>{{ form.customerName || '—' }}</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Customer ID</span>
                <strong class="rw-mono">{{ form.customerId || '—' }}</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Station</span>
                <strong>{{ form.stationId || '—' }}</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Tariff</span>
                <strong>{{ form.tariffId || '—' }}</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Meter type</span>
                <strong>{{ form.meterType || '—' }}</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Communication</span>
                <strong>{{ form.communicationWay || '—' }}</strong>
              </div>
            </div>

            <!-- Confirmation note -->
            <div class="rw-meter-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ meterNoteText }}</span>
            </div>

            <p v-if="step1Error" class="rw-field-error" role="alert">{{ step1Error }}</p>
          </div>

          <!-- STEP — Power limit (only for Set Maximum Power Limit) -->
          <div v-else-if="currentStep === limitStepIndex" key="step-limit" class="rw-step">
            <!-- Meter pill -->
            <div class="rw-meter-pill" role="group" aria-label="Selected meter details">
              <svg class="rw-pill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="3"/>
                <path d="M7 15h10M8 8h8M8 11h5"/>
              </svg>
              <span class="rw-pill-item">
                <span>Meter ID</span>
                <strong>{{ form.meterId }}</strong>
              </span>
              <span class="rw-pill-item rw-pill-item--tariff">
                <span>Customer</span>
                <strong>{{ form.customerName || form.customerId || '—' }}</strong>
              </span>
            </div>

            <!-- Maximum power input -->
            <div class="rw-amount-input-wrap" :class="{ focused: amountFocused }">
              <BaseInput
                v-model="form.maximumPower"
                class="rw-amount-input"
                type="number"
                min="0"
                step="1"
                inputmode="decimal"
                placeholder="0"
                autofocus
                @focus="amountFocused = true"
                @blur="amountFocused = false"
              />
              <span class="rw-amount-unit-badge">W</span>
            </div>

            <!-- Quick-pick chips -->
            <div class="rw-quick-chips" aria-label="Quick power limits">
              <BaseButton
                v-for="watt in quickPowerLimits"
                :key="watt"
                class="rw-chip"
                :class="{ active: form.maximumPower === String(watt) }"
                @click="form.maximumPower = String(watt)"
              >{{ watt.toLocaleString() }}W</BaseButton>
            </div>

            <div class="rw-calc-card" aria-label="Power limit summary">
              <div class="rw-calc-row">
                <span>Limit to apply</span>
                <strong>{{ form.maximumPower ? `${Number(form.maximumPower).toLocaleString()} W` : '—' }}</strong>
              </div>
            </div>

            <p v-if="step2Error" class="rw-field-error" role="alert">{{ step2Error }}</p>
          </div>

          <!-- STEP — Confirm -->
          <div v-else-if="currentStep === confirmStepIndex" key="step-confirm" class="rw-step">
            <!-- Action hero banner -->
            <div class="rw-confirm-hero">
              <span class="rw-confirm-label">{{ confirmHeroLabel }}</span>
              <strong class="rw-confirm-amount rw-confirm-amount--compact">{{ form.meterId || '—' }}</strong>
            </div>

            <!-- Summary rows -->
            <div class="rw-review-table" aria-label="Request summary">
              <div class="rw-review-row">
                <span>Customer</span>
                <strong>{{ form.customerName || form.customerId || '—' }}</strong>
              </div>
              <div class="rw-review-row">
                <span>Meter</span>
                <strong class="rw-mono">{{ form.meterId }}</strong>
              </div>
              <div class="rw-review-row">
                <span>Station</span>
                <strong>{{ form.stationId || '—' }}</strong>
              </div>
              <div class="rw-review-row">
                <span>Tariff</span>
                <strong>{{ form.tariffId || '—' }}</strong>
              </div>
              <div v-if="isMaximumPowerToken" class="rw-review-row">
                <span>Maximum power</span>
                <strong>{{ form.maximumPower ? `${Number(form.maximumPower).toLocaleString()} W` : '—' }}</strong>
              </div>
            </div>

            <div class="rw-meter-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>{{ confirmNoteText }}</span>
            </div>

            <p v-if="step3Error" class="rw-field-error" role="alert">{{ step3Error }}</p>
          </div>

          <!-- STEP — Token -->
          <div v-else-if="currentStep === tokenStepIndex" key="step-token" class="rw-step">
            <p class="rw-token-generated-label">{{ tokenFinalFailed ? 'Token request failed' : 'Token generated' }}</p>

            <!-- Token vault -->
            <div v-if="!tokenFinalFailed" class="rw-token-vault" aria-label="Generated token">
              <span class="rw-token-caption">Token</span>
              <strong class="rw-token-value">{{ formattedToken }}</strong>
            </div>
            <p v-else class="rw-field-error" role="alert">{{ tokenFinalMessage }}</p>

            <!-- Copy + Send to meter -->
            <div v-if="!tokenFinalFailed" class="rw-token-actions">
              <BaseButton
                class="rw-action-btn"
                :class="{ 'rw-action-btn--success': tokenCopied }"
                @click="copyToken"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                </svg>
                {{ tokenCopied ? 'Copied!' : 'Copy' }}
              </BaseButton>
              <BaseButton
                class="rw-action-btn"
                :disabled="tokenSendLoading || tokenSentStatus === 'success'"
                :class="{
                  'rw-action-btn--loading': tokenSendLoading,
                  'rw-action-btn--success': tokenSentStatus === 'success',
                  'rw-action-btn--danger':  tokenSentStatus === 'error',
                }"
                @click="sendTokenToMeter"
              >
                <svg v-if="tokenSentStatus === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
                <svg v-else-if="tokenSendLoading" class="rw-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/>
                </svg>
                <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
                {{ sendBtnLabel }}
              </BaseButton>
            </div>

            <!-- Download receipt -->
            <BaseButton v-if="!tokenFinalFailed" class="rw-download-btn" @click="downloadReceipt">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Download Receipt
            </BaseButton>
          </div>

        </transition>
      </div>

      <!-- ── FOOTER ──────────────────────────────────────────── -->
      <footer class="rw-footer">
        <!-- Back: hidden on the first step and on the token step -->
        <BaseButton
          v-if="showBackButton"
          class="rw-btn rw-btn--ghost"
          @click="goBack"
        >Back</BaseButton>
        <span v-else/>

        <!-- Continue -->
        <BaseButton
          v-if="currentStep < confirmStepIndex"
          class="rw-btn rw-btn--primary"
          :disabled="isNextDisabled"
          @click="goNext"
        >Continue</BaseButton>

        <!-- Confirm & generate -->
        <BaseButton
          v-else-if="currentStep === confirmStepIndex"
          class="rw-btn rw-btn--primary"
          :disabled="tokenLoading"
          @click="confirmAndGenerate"
        >
          <svg v-if="tokenLoading" class="rw-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/>
          </svg>
          {{ tokenLoading ? 'Generating…' : 'Confirm and generate' }}
        </BaseButton>

        <!-- Done -->
        <BaseButton
          v-else-if="currentStep === tokenStepIndex"
          class="rw-btn rw-btn--primary"
          @click="$emit('done')"
        >Done</BaseButton>
      </footer>
    </div>

    <!-- ── SEND-TO-METER RESULT POPUP ─────────────────────────── -->
    <transition name="rw-popup">
      <div
        v-if="popup.visible"
        class="rw-popup"
        :class="{
          'rw-popup--success': popup.type === 'success',
          'rw-popup--error':   popup.type === 'error',
        }"
        role="status"
        aria-live="assertive"
      >
        <div class="rw-popup-icon">
          <svg v-if="popup.type === 'success'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
          <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <div class="rw-popup-body">
          <strong>{{ popup.title }}</strong>
          <span>{{ popup.message }}</span>
        </div>
        <BaseButton class="rw-popup-close" aria-label="Dismiss" @click="popup.visible = false">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </BaseButton>
      </div>
    </transition>
  </div>
</template>

<script>
import BaseButton from './base/BaseButton.vue';
import BaseInput from './base/BaseInput.vue';
import { postApi, liveWritesAllowed, getCookie } from '../services/api.js';
import { buildCanonicalReceiptRow, buildReceiptThemeFromDocument, downloadReceiptPdf } from '../services/receipt-tools.mjs';
import { printModelForRoute } from '../services/table-service';
import {
  buildLocalTokenPreview, tokenValidationError,
  buildTokenPayload, tokenEndpoint, guardedPreviewError, usesLocalTokenPreview,
} from '../services/token-flow.mjs';

const QUICK_POWER_LIMITS = [3000, 4500, 6000, 9000, 12000];

export default {
  name: 'GenerateTokenWizard',
  components: { BaseButton, BaseInput },

  props: {
    route: { type: Object, required: true },
    row:   { type: Object, default: () => ({}) },
    rows:  { type: Array,  default: () => [] },
  },

  emits: ['close', 'done'],

  data() {
    return {
      quickPowerLimits: QUICK_POWER_LIMITS,

      currentStep: 1,
      slideDir: 'slide-forward',
      amountFocused: false,

      form: {
        meterId:          this.row?.meterId          || '',
        customerId:       this.row?.customerId        || '',
        customerName:     this.row?.customerName      || '',
        stationId:        this.row?.stationId         || '',
        tariffId:         this.row?.tariffId          || '',
        meterType:        this.row?.meterType         || '',
        communicationWay: this.row?.communicationWay  || '',
        protocolVersion:  this.row?.protocolVersion   || '2.2',
        isThreePhase:     this.row?.isThreePhase,
        sgc:              this.row?.sgc               || '',
        maximumPower:     this.row?.maximumPower      || '',
        remark:           this.row?.remark            || '',
        authorizationPassword: '',
      },

      tokenFinal: null,
      tokenLoading: false,
      tokenCopied: false,
      tokenSendLoading: false,
      tokenSentStatus: '',
      tokenSendErrorMessage: '',

      popup: { visible: false, type: 'success', title: '', message: '' },
      receiptTheme: {},

      step1Error: '',
      step2Error: '',
      step3Error: '',
    };
  },

  computed: {
    isMaximumPowerToken() { return String(this.route?.hash || '').includes('set-maximum-power-limit'); },

    wizardTitle() { return this.route?.title || 'Generate Token'; },

    stepLabels() {
      const labels = ['Meter'];
      if (this.isMaximumPowerToken) labels.push('Limit');
      labels.push('Confirm', 'Token');
      return labels;
    },
    totalSteps()      { return this.stepLabels.length; },
    meterStepIndex()   { return 1; },
    limitStepIndex()   { return this.isMaximumPowerToken ? 2 : null; },
    confirmStepIndex() { return this.isMaximumPowerToken ? 3 : 2; },
    tokenStepIndex()   { return this.isMaximumPowerToken ? 4 : 3; },

    showBackButton() {
      return this.currentStep > 1 && this.currentStep < this.tokenStepIndex;
    },

    meterNoteText() {
      const hash = String(this.route?.hash || '');
      if (hash.includes('clear-tamper')) return 'Verify this is the correct meter before continuing. This token clears the tamper alert on the meter and cannot be redirected.';
      if (hash.includes('clear-credit')) return 'Verify this is the correct meter before continuing. This token clears outstanding credit on the meter and cannot be redirected.';
      if (hash.includes('set-maximum-power-limit')) return 'Verify this is the correct meter before continuing. The power limit token is locked to this meter and cannot be redirected.';
      return 'Verify this is the correct meter before continuing. Tokens are locked to one meter and cannot be redirected.';
    },
    confirmHeroLabel() {
      const hash = String(this.route?.hash || '');
      if (hash.includes('clear-tamper')) return 'Clearing tamper on';
      if (hash.includes('clear-credit')) return 'Clearing credit on';
      if (hash.includes('set-maximum-power-limit')) return 'Setting power limit on';
      return 'Generating token for';
    },
    confirmNoteText() {
      const hash = String(this.route?.hash || '');
      if (hash.includes('clear-tamper')) return 'This generates a live token the meter will apply on next contact to clear its tamper status. This cannot be undone from here.';
      if (hash.includes('clear-credit')) return 'This generates a live token the meter will apply on next contact to clear its outstanding credit. This cannot be undone from here.';
      if (hash.includes('set-maximum-power-limit')) return 'This generates a live token the meter will apply on next contact to enforce the new power limit. This cannot be undone from here.';
      return 'This generates a live token the meter will apply on next contact. This cannot be undone from here.';
    },

    // ── Token display ──────────────────────────────────────────────
    finalSource()   { return this.tokenFinal?.result || this.tokenFinal?.data || this.tokenFinal || {}; },
    finalTokenRaw() { return this.finalSource?.token || this.finalSource?.tokenFirst || ''; },
    formattedToken() {
      const t = String(this.finalTokenRaw).replace(/\s+/g, '');
      if (!t) return '— — — —';
      return t.match(/.{1,4}/g)?.join(' ') ?? t;
    },
    tokenFinalFailed() {
      const source = this.finalSource;
      const code = Number(source.code);
      return source.status === false || (Number.isFinite(code) && code !== 0 && code !== 200);
    },
    tokenFinalMessage() {
      const source = this.finalSource;
      return source.reason || source.msg || source.message || 'Token request failed.';
    },

    // ── Validation ─────────────────────────────────────────────────
    isNextDisabled() {
      if (this.currentStep === this.limitStepIndex) return !(Number(this.form.maximumPower) > 0);
      return false;
    },

    // ── Send button label ──────────────────────────────────────────
    sendBtnLabel() {
      if (this.tokenSentStatus === 'success') return 'Sent to meter';
      if (this.tokenSentStatus === 'error')   return 'Retry send';
      if (this.tokenSendLoading)              return 'Sending…';
      return 'Send to meter';
    },
  },

  created() {
    this.receiptTheme = buildReceiptThemeFromDocument();
  },

  mounted() {
    document.body.classList.add('recharge-open');
    document.addEventListener('keydown', this.handleKeydown);
  },

  beforeUnmount() {
    document.body.classList.remove('recharge-open');
    document.removeEventListener('keydown', this.handleKeydown);
  },

  methods: {
    handleKeydown(event) {
      if (event.key === 'Escape' && !this.tokenLoading) this.$emit('close');
    },

    // ── Navigation ─────────────────────────────────────────────────
    goNext() {
      this.clearErrors();
      if (this.currentStep === this.limitStepIndex && !(Number(this.form.maximumPower) > 0)) {
        this.step2Error = 'Enter a maximum power value to continue.';
        return;
      }
      this.slideDir = 'slide-forward';
      this.currentStep = Math.min(this.currentStep + 1, this.tokenStepIndex);
    },
    goBack() {
      this.clearErrors();
      this.slideDir = 'slide-back';
      this.currentStep = Math.max(this.currentStep - 1, 1);
    },
    clearErrors() { this.step1Error = ''; this.step2Error = ''; this.step3Error = ''; },

    // ── Token generation ───────────────────────────────────────────
    async confirmAndGenerate() {
      this.step3Error = '';
      const validationError = tokenValidationError(this.route, this.form, null, { requireAuthorization: false });
      if (validationError) { this.step3Error = validationError; return; }
      this.tokenLoading = true;
      try {
        let response;
        if (usesLocalTokenPreview(this.route) || !liveWritesAllowed()) {
          response = buildLocalTokenPreview(this.route, this.form);
        } else {
          const payload  = buildTokenPayload(this.route, this.form, { isPreview: false });
          const endpoint = tokenEndpoint(this.route, 'Generate Token');
          response = await postApi(endpoint, payload, {
            headers: { 'X-Route-Hash': this.route?.hash || '', 'X-Route-Action': 'Generate Token' },
          });
        }
        this.tokenFinal = response;
        this.slideDir    = 'slide-forward';
        this.currentStep = this.tokenStepIndex;
      } catch (err) {
        if (guardedPreviewError(err)) {
          this.tokenFinal  = buildLocalTokenPreview(this.route, this.form);
          this.slideDir    = 'slide-forward';
          this.currentStep = this.tokenStepIndex;
          return;
        }
        this.step3Error = err?.message || 'Token generation failed.';
      } finally {
        this.tokenLoading = false;
      }
    },

    // ── Copy token ─────────────────────────────────────────────────
    async copyToken() {
      if (!this.finalTokenRaw) return;
      try {
        await navigator.clipboard.writeText(this.finalTokenRaw);
        this.tokenCopied = true;
        setTimeout(() => { this.tokenCopied = false; }, 1800);
      } catch { this.showPopup('error', 'Copy failed', 'Select the token manually.'); }
    },

    // ── Send to meter ──────────────────────────────────────────────
    async sendTokenToMeter() {
      if (!this.finalTokenRaw || this.tokenSendLoading) return;
      this.tokenSendLoading = true;
      this.tokenSentStatus  = '';
      try {
        const payload = [{
          customerId:   this.form.customerId    || '',
          customerName: this.form.customerName  || '',
          meterId:      this.form.meterId,
          version:      this.form.protocolVersion || '2.2',
          flag: 'A120', name: 'Send Token', dataItem: 'Send Token',
          dataDefault: '', dataPrefix: '',
          data:         String(this.finalTokenRaw).replace(/\s+/g, ''),
          stationId:    this.form.stationId || '',
          remark:       'Beverly generate-token wizard send',
        }];
        await postApi('/API/RemoteMeterTask/CreateTokenTask', payload, {
          headers: { 'X-Route-Hash': '#/remote-operation/remote-meter-token', 'X-Route-Action': 'Add Task' },
        });
        this.tokenSentStatus = 'success';
        this.showPopup('success', 'Token delivered', 'Token was successfully sent to the meter.');
      } catch (err) {
        this.tokenSendErrorMessage = err?.message || 'Failed to send token.';
        this.tokenSentStatus = 'error';
        this.showPopup('error', 'Send failed', this.tokenSendErrorMessage);
      } finally {
        this.tokenSendLoading = false;
      }
    },

    // ── Download receipt ───────────────────────────────────────────
    async downloadReceipt() {
      try {
        const receiptRow = buildCanonicalReceiptRow({
          row:  this.row,
          form: {
            ...this.form,
            amount: 0,
            tax: 0,
            energyAmount: 0,
            paymentMethod: 'N/A',
          },
          response: this.tokenFinal,
          tariff: null,
          actor:  { name: getCookie('userName'), email: getCookie('userEmail') || getCookie('userId') },
        });
        const model  = printModelForRoute(this.route, receiptRow);
        const result = await downloadReceiptPdf(model);
        this.showPopup('success', 'Receipt downloaded', result?.filename || 'PDF saved.');
      } catch (err) {
        this.showPopup('error', 'Download failed', err?.message || 'Could not generate receipt.');
      }
    },

    // ── Popup helper ───────────────────────────────────────────────
    showPopup(type, title, message) {
      this.popup = { visible: true, type, title, message };
      if (type === 'success') setTimeout(() => { this.popup.visible = false; }, 4500);
    },
  },
};
</script>

<style scoped>
/* ═══════════════════════════════════════════════════════════════════
   GENERATE TOKEN WIZARD — mirrors RechargeWizard's design system
   1:1 so the two flows feel like one product. 100% Beverly design
   token driven — zero hardcoded colours.
═══════════════════════════════════════════════════════════════════ */

.rw-backdrop {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal, 2000);
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  padding: 16px;
}

.rw-card {
  position: relative;
  display: flex;
  flex-direction: column;
  width: min(440px, 100%);
  max-height: min(760px, calc(100dvh - 32px));
  border-radius: var(--radius-lg, 20px);
  overflow: hidden;
  background: var(--bg-card);
  border: 1px solid var(--border-mid);
  box-shadow: var(--shadow-xl), var(--shadow-glow-sm);
  color: var(--text-main);
  font-family: var(--font-family);
}

.rw-header {
  flex: 0 0 auto;
  padding: 18px 20px 12px;
  background: var(--bg-page);
  border-bottom: 1px solid var(--border-color);
}

.rw-header-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 14px;
}

.rw-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 auto;
}

.rw-title {
  margin: 0;
  font-size: 17px;
  font-weight: 800;
  color: var(--text-strong);
  letter-spacing: -0.01em;
}

.rw-step-counter {
  font-size: 11.5px;
  color: var(--text-faint);
  font-weight: 500;
  flex: 0 0 auto;
}

.rw-close {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
}

.rw-close:hover,
.rw-close:focus-visible {
  border-color: var(--primary);
  color: var(--primary);
  outline: none;
  box-shadow: 0 0 0 3px var(--primary-light);
}

.rw-close svg {
  width: 18px;
  height: 18px;
}

.rw-progress-bars {
  display: grid;
  grid-template-columns: repeat(var(--rw-steps, 3), 1fr);
  gap: 5px;
  margin-bottom: 8px;
}

.rw-progress-bar {
  height: 3px;
  border-radius: 99px;
  background: var(--border-color);
  transition: background var(--transition-normal);
}

.rw-progress-bar.done   { background: var(--primary); }
.rw-progress-bar.active { background: var(--primary); opacity: 0.55; }

.rw-step-labels {
  display: grid;
  grid-template-columns: repeat(var(--rw-steps, 3), 1fr);
  gap: 5px;
}

.rw-step-label {
  font-size: 10px;
  font-weight: 800;
  text-align: center;
  color: var(--text-faint);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  transition: color var(--transition-fast);
}

.rw-step-label.active { color: var(--primary); }
.rw-step-label.done   { color: var(--primary); opacity: 0.65; }

.rw-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 18px 20px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-page));
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

.rw-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.slide-forward-enter-active,
.slide-forward-leave-active,
.slide-back-enter-active,
.slide-back-leave-active {
  transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
              transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}

.slide-forward-enter-from { opacity: 0; transform: translateX(36px); }
.slide-forward-leave-to   { opacity: 0; transform: translateX(-36px); }
.slide-back-enter-from    { opacity: 0; transform: translateX(-36px); }
.slide-back-leave-to      { opacity: 0; transform: translateX(36px); }

/* ══ Meter info card ═══════════════════════════════════════════ */
.rw-meter-hero {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 18px;
  background: linear-gradient(135deg, var(--primary-light), var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: var(--radius-md);
}

.rw-meter-hero-icon {
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: var(--radius-md);
  background: var(--primary);
  box-shadow: var(--shadow-glow-sm);
}

.rw-meter-hero-icon svg {
  width: 26px;
  height: 26px;
  color: var(--text-inverse);
  stroke: var(--text-inverse);
}

.rw-meter-hero-copy { display: flex; flex-direction: column; gap: 3px; min-width: 0; }

.rw-meter-hero-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
}

.rw-meter-hero-id {
  font-family: var(--font-mono);
  font-size: 20px;
  font-weight: 800;
  color: var(--text-strong);
  letter-spacing: 0.04em;
  overflow-wrap: anywhere;
}

.rw-meter-detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
  background: var(--bg-card);
}

.rw-meter-detail-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  border-right: 1px solid var(--border-color);
}

.rw-meter-detail-cell:nth-child(even) { border-right: none; }
.rw-meter-detail-cell:nth-last-child(-n+2) { border-bottom: none; }

.rw-meter-detail-cell span  { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
.rw-meter-detail-cell strong { font-size: 13.5px; font-weight: 700; color: var(--text-strong); overflow-wrap: anywhere; }

.rw-meter-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  padding: 11px 13px;
  background: var(--primary-light);
  border: 1px solid color-mix(in srgb, var(--primary) 20%, transparent);
  border-left: 3px solid var(--primary);
  border-radius: var(--radius-md);
}

.rw-meter-note svg { width: 14px; height: 14px; flex: 0 0 auto; margin-top: 1px; color: var(--primary); }
.rw-meter-note span { font-size: 12px; color: var(--text-muted); line-height: 1.5; }

/* ══ Limit step ═════════════════════════════════════════════════ */
.rw-meter-pill {
  display: grid;
  grid-template-columns: 32px minmax(0, 1.2fr) minmax(0, 1fr);
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  background: var(--primary-light);
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: var(--radius-md);
}

.rw-pill-icon {
  width: 32px;
  height: 32px;
  padding: 7px;
  color: var(--primary);
  background: color-mix(in srgb, var(--primary) 10%, transparent);
  border-radius: var(--radius-sm);
  box-sizing: border-box;
}

.rw-pill-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.rw-pill-item > span {
  color: var(--text-faint);
  font-size: 9.5px;
  font-weight: 800;
  text-transform: uppercase;
}

.rw-pill-item strong {
  color: var(--text-strong);
  font-size: 13px;
  letter-spacing: 0;
  overflow-wrap: anywhere;
}

.rw-pill-item:not(.rw-pill-item--tariff) strong {
  font-family: var(--font-mono);
}

.rw-pill-item--tariff {
  padding-left: 12px;
  border-left: 1px solid var(--border-mid);
}

.rw-amount-input-wrap {
  position: relative;
  display: flex;
  align-items: center;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  background: var(--bg-page);
  overflow: hidden;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.rw-amount-input-wrap.focused {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

.rw-amount-input {
  flex: 1;
  display: block;
  padding: 13px 14px;
  background: none;
  border: none;
  outline: none;
  color: var(--text-strong);
  font-size: 26px;
  font-weight: 700;
  font-family: var(--font-mono);
  letter-spacing: -0.01em;
  appearance: textfield;
  min-width: 0;
}

.rw-amount-input::-webkit-outer-spin-button,
.rw-amount-input::-webkit-inner-spin-button { appearance: none; }
.rw-amount-input::placeholder { color: var(--text-faint); }

.rw-amount-unit-badge {
  flex: 0 0 auto;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-faint);
  border-left: 1px solid var(--border-color);
  align-self: stretch;
  display: flex;
  align-items: center;
}

.rw-quick-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}

.rw-chip {
  padding: 6px 13px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 12.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast), color var(--transition-fast);
}

.rw-chip:hover  { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }
.rw-chip.active { background: var(--primary-light); border-color: var(--primary); color: var(--primary); }

.rw-calc-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.rw-calc-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 15px;
}

.rw-calc-row span  { font-size: 13px; color: var(--text-muted); }
.rw-calc-row strong { font-size: 13.5px; color: var(--text-strong); font-weight: 600; font-family: var(--font-mono); }

/* ══ Confirm ═══════════════════════════════════════════════════ */
.rw-confirm-hero {
  display: flex;
  flex-direction: column;
  gap: 7px;
  padding: 18px 18px 16px;
  background: linear-gradient(135deg, var(--primary-light), var(--bg-card));
  border: 1px solid color-mix(in srgb, var(--primary) 30%, transparent);
  border-radius: var(--radius-md);
}

.rw-confirm-label {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--primary);
}

.rw-confirm-amount {
  font-size: 30px;
  font-weight: 800;
  color: var(--primary);
  letter-spacing: -0.02em;
  line-height: 1;
  font-family: var(--font-mono);
}

.rw-confirm-amount--compact {
  font-size: 22px;
  overflow-wrap: anywhere;
}

.rw-review-table {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  overflow: hidden;
}

.rw-review-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 11px 14px;
  border-bottom: 1px solid var(--border-color);
}

.rw-review-row:last-child { border-bottom: none; }
.rw-review-row span  { font-size: 12.5px; color: var(--text-muted); }
.rw-review-row strong { font-size: 13.5px; color: var(--text-strong); font-weight: 700; }
.rw-mono { font-family: var(--font-mono) !important; font-size: 13px !important; letter-spacing: 0.04em; }

/* ══ Token ═════════════════════════════════════════════════════ */
.rw-token-generated-label {
  margin: 0;
  text-align: center;
  font-size: 15px;
  font-weight: 700;
  color: var(--text-strong);
}

.rw-token-vault {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 22px 18px;
  background: var(--bg-page);
  border: 1px solid var(--border-mid);
  border-radius: var(--radius-md);
  box-shadow: inset 0 1px 0 var(--border-color);
}

.rw-token-caption {
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--text-faint);
}

.rw-token-value {
  font-family: var(--font-mono);
  font-size: 22px;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--text-strong);
  word-break: break-all;
  text-align: center;
}

.rw-token-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.rw-action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 11px 14px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast),
              color var(--transition-fast), box-shadow var(--transition-fast);
}

.rw-action-btn svg { width: 14px; height: 14px; flex: 0 0 auto; }

.rw-action-btn:hover:not(:disabled) {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}

.rw-action-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.rw-action-btn--success { border-color: var(--success) !important; color: var(--success) !important; background: var(--success-bg) !important; }
.rw-action-btn--danger  { border-color: var(--danger)  !important; color: var(--danger)  !important; background: var(--danger-bg)  !important; }
.rw-action-btn--loading { opacity: 0.65; cursor: wait; }

.rw-download-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  padding: 11px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-faint);
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition-fast), border-color var(--transition-fast),
              color var(--transition-fast);
}

.rw-download-btn svg { width: 14px; height: 14px; flex: 0 0 auto; }

.rw-download-btn:hover {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}

/* ── Footer ─────────────────────────────────────────────────────── */
.rw-footer {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 14px 20px;
  background: var(--bg-page);
  border-top: 1px solid var(--border-color);
}

.rw-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  padding: 9px 20px;
  border-radius: var(--radius-md);
  font-size: 13.5px;
  font-weight: 800;
  font-family: inherit;
  cursor: pointer;
  border: 1px solid transparent;
  min-height: 44px;
  transition: background var(--transition-fast), border-color var(--transition-fast),
              color var(--transition-fast), box-shadow var(--transition-fast), opacity var(--transition-fast);
}

.rw-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.rw-btn--ghost {
  background: var(--bg-card);
  border-color: var(--border-mid);
  color: var(--text-muted);
}

.rw-btn--ghost:hover:not(:disabled) {
  background: var(--primary-light);
  border-color: var(--primary);
  color: var(--primary);
}

.rw-btn--primary {
  background: var(--primary);
  border-color: var(--primary);
  color: var(--text-inverse);
  box-shadow: var(--shadow-glow-sm);
}

.rw-btn--primary:hover:not(:disabled) {
  background: var(--primary-hover);
  border-color: var(--primary-hover);
  box-shadow: var(--shadow-glow);
}

.rw-spin { animation: rw-spin 0.9s linear infinite; }
@keyframes rw-spin { to { transform: rotate(360deg); } }

.rw-field-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
  font-weight: 600;
}

.rw-popup {
  position: fixed;
  bottom: 24px;
  left: 50%;
  transform: translateX(-50%);
  z-index: calc(var(--z-modal, 2000) + 100);
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 13px 16px 13px 13px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-mid);
  min-width: 268px;
  max-width: min(400px, calc(100vw - 32px));
  box-shadow: var(--shadow-xl);
  background: var(--bg-card);
}

.rw-popup--success { border-color: color-mix(in srgb, var(--success) 40%, transparent); }
.rw-popup--error   { border-color: color-mix(in srgb, var(--danger)  40%, transparent); }

.rw-popup-icon {
  width: 30px;
  height: 30px;
  border-radius: 50%;
  display: grid;
  place-items: center;
  flex: 0 0 auto;
}

.rw-popup--success .rw-popup-icon { background: var(--success); }
.rw-popup--error   .rw-popup-icon { background: var(--danger); }
.rw-popup-icon svg { width: 15px; height: 15px; color: var(--text-inverse); stroke: var(--text-inverse); }

.rw-popup-body { display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0; }
.rw-popup-body strong { font-size: 13px;  color: var(--text-strong); font-weight: 700; }
.rw-popup-body span   { font-size: 11.5px; color: var(--text-muted); overflow-wrap: anywhere; }

.rw-popup-close {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-faint);
  padding: 2px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
  flex: 0 0 auto;
  transition: color var(--transition-fast);
}

.rw-popup-close:hover { color: var(--text-muted); }
.rw-popup-close svg { width: 13px; height: 13px; }

.rw-popup-enter-active { transition: all 0.28s cubic-bezier(0.16, 1, 0.3, 1); }
.rw-popup-leave-active { transition: all 0.2s ease-in; }
.rw-popup-enter-from { opacity: 0; transform: translateX(-50%) translateY(16px) scale(0.96); }
.rw-popup-leave-to   { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.98); }

@media (max-width: 560px) {
  .rw-backdrop {
    align-items: stretch;
    padding: 8px;
  }

  .rw-card {
    width: 100%;
    height: calc(100dvh - 16px);
    max-height: none;
    border-radius: 12px;
  }

  .rw-header {
    padding: 10px 14px 9px;
  }

  .rw-header-top {
    margin-bottom: 9px;
  }

  .rw-body {
    min-height: 0;
    padding: 12px 14px;
    overscroll-behavior: contain;
  }

  .rw-step {
    gap: 10px;
  }

  .rw-meter-hero {
    gap: 12px;
    padding: 12px;
  }

  .rw-meter-hero-icon {
    width: 40px;
    height: 40px;
  }

  .rw-meter-hero-icon svg {
    width: 22px;
    height: 22px;
  }

  .rw-meter-hero-id {
    font-size: 18px;
  }

  .rw-meter-detail-cell {
    padding: 9px 10px;
  }

  .rw-meter-note {
    padding: 9px 10px;
  }

  .rw-meter-pill {
    grid-template-columns: 28px minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 9px;
    padding: 9px 10px;
  }

  .rw-pill-icon {
    width: 28px;
    height: 28px;
    padding: 6px;
  }

  .rw-pill-item--tariff {
    padding-left: 9px;
  }

  .rw-footer {
    padding: 10px 14px max(10px, env(safe-area-inset-bottom));
  }

  .rw-footer > .rw-btn:last-child {
    min-width: 120px;
  }
}
</style>
