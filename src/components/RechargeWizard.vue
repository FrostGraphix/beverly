<template>
  <!-- ──────────────────────────────────────────────────────────────
       RECHARGE WIZARD — redesigned multi-step token credit flow
       Fully theme-aware via Beverly design tokens.
       Steps: Meter → Amount → Confirm → Token
  ─────────────────────────────────────────────────────────────────── -->
  <div class="rw-backdrop" @mousedown.self="$emit('close')">
    <div class="rw-card" role="dialog" aria-modal="true" aria-labelledby="recharge-wizard-title">

      <!-- ── HEADER ─────────────────────────────────────────── -->
      <header class="rw-header">
        <div class="rw-header-top">
          <h2 id="recharge-wizard-title" class="rw-title">Recharge meter</h2>
          <div class="rw-header-actions">
            <span class="rw-step-counter">Step {{ currentStep }} of 4</span>
            <BaseButton
              class="rw-close"
              aria-label="Close recharge wizard"
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
          aria-label="Recharge progress"
          aria-valuemin="1"
          aria-valuemax="4"
          :aria-valuenow="currentStep"
        >
          <div
            v-for="n in 4"
            :key="n"
            class="rw-progress-bar"
            :class="{ done: n < currentStep, active: n === currentStep }"
          />
        </div>

        <!-- Step labels -->
        <div class="rw-step-labels" aria-hidden="true">
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

          <!-- STEP 1 — Meter info -->
          <div v-if="currentStep === 1" key="step-meter" class="rw-step">

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
                <strong class="rw-meter-hero-id">{{ form.meterId }}</strong>
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
                <span>Unit price</span>
                <strong>₦{{ tariffUnitPrice }}/kWh</strong>
              </div>
              <div class="rw-meter-detail-cell">
                <span>Phase</span>
                <strong>{{ form.isThreePhase ? '3-Phase' : 'Single-phase' }}</strong>
              </div>
            </div>

            <!-- Confirmation note -->
            <div class="rw-meter-note">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              <span>Verify this is the correct meter before continuing. Tokens are locked to one meter and cannot be redirected.</span>
            </div>
          </div>

          <!-- STEP 2 — Amount -->
          <div v-else-if="currentStep === 2" key="step-amount" class="rw-step">
            <!-- Meter + tariff summary -->
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
                <span>Tariff rate</span>
                <strong>₦{{ tariffUnitPrice }}/kWh</strong>
              </span>
            </div>

            <!-- By amount / By units toggle -->
            <div class="rw-mode-toggle" role="group" aria-label="Purchase mode">
              <BaseButton
                class="rw-mode-btn"
                :class="{ active: purchaseMode === 'paid' }"
                @click="purchaseMode = 'paid'"
              >By amount</BaseButton>
              <BaseButton
                class="rw-mode-btn"
                :class="{ active: purchaseMode === 'unit' }"
                @click="purchaseMode = 'unit'"
              >By units</BaseButton>
            </div>

            <!-- Amount / units input -->
            <div class="rw-amount-input-wrap" :class="{ focused: amountFocused }">
              <BaseInput
                v-if="purchaseMode === 'paid'"
                v-model="form.amount"
                class="rw-amount-input"
                type="number"
                min="1"
                step="1"
                inputmode="decimal"
                placeholder="0"
                autofocus
                @focus="amountFocused = true"
                @blur="amountFocused = false"
              />
              <BaseInput
                v-else
                v-model="form.totalUnit"
                class="rw-amount-input"
                type="number"
                min="0.1"
                step="0.1"
                inputmode="decimal"
                placeholder="0.0"
                autofocus
                @focus="amountFocused = true"
                @blur="amountFocused = false"
              />
              <span v-if="purchaseMode === 'unit'" class="rw-amount-unit-badge">kWh</span>
            </div>

            <!-- Quick-pick chips (only in paid mode) -->
            <div v-if="purchaseMode === 'paid'" class="rw-quick-chips" aria-label="Quick amounts">
              <BaseButton
                v-for="amt in quickAmounts"
                :key="amt"
                class="rw-chip"
                :class="{ active: form.amount === String(amt) }"
                @click="form.amount = String(amt)"
              >₦{{ amt.toLocaleString() }}</BaseButton>
            </div>

            <!-- VAT breakdown card -->
            <div class="rw-calc-card" aria-label="Purchase calculation">
              <div class="rw-calc-row">
                <span>{{ purchaseMode === 'unit' ? 'Calculated amount' : 'Energy value' }}</span>
                <strong>{{ purchaseMode === 'unit' ? formattedGross : formattedEnergyAmount }}</strong>
              </div>
              <div class="rw-calc-divider"/>
              <div class="rw-calc-row">
                <span>Units</span>
                <strong>{{ displayUnits }} kWh</strong>
              </div>
              <div class="rw-calc-divider"/>
              <div class="rw-calc-row">
                <span>VAT ({{ vatPercent }}%)</span>
                <strong>{{ formattedVatAmount }}</strong>
              </div>
              <div class="rw-calc-divider"/>
              <div class="rw-calc-row rw-calc-row--total">
                <span>Total payable</span>
                <strong class="rw-total-value">{{ formattedGross }}</strong>
              </div>
            </div>

            <p v-if="step2Error" class="rw-field-error" role="alert">{{ step2Error }}</p>
          </div>

          <!-- STEP 3 — Confirm -->
          <div v-else-if="currentStep === 3" key="step-confirm" class="rw-step">
            <!-- Amount hero banner -->
            <div class="rw-confirm-hero">
              <span class="rw-confirm-label">Amount paid</span>
              <strong class="rw-confirm-amount">{{ formattedGross }}</strong>
            </div>

            <!-- Summary rows -->
            <div class="rw-review-table" aria-label="Transaction summary">
              <div class="rw-review-row">
                <span>Customer</span>
                <strong>{{ form.customerName || form.customerId || '—' }}</strong>
              </div>
              <div class="rw-review-row">
                <span>Meter</span>
                <strong class="rw-mono">{{ form.meterId }}</strong>
              </div>
              <div class="rw-review-row">
                <span>Units</span>
                <strong>{{ displayUnits }} kWh</strong>
              </div>
            </div>

            <!-- Payment method -->
            <label class="rw-field-label">
              <span class="rw-field-caption">Payment method</span>
              <div class="rw-select-wrap">
                <BaseSelect v-model="form.paymentMethod" class="rw-select">
                  <option v-for="m in paymentMethods" :key="m" :value="m">{{ m }}</option>
                </BaseSelect>
                <svg class="rw-select-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="6 9 12 15 18 9"/>
                </svg>
              </div>
            </label>

            <!-- Auth password -->
            <label class="rw-field-label">
              <span class="rw-field-caption">Authorization password</span>
              <BaseInput
                v-model="form.authorizationPassword"
                class="rw-text-input"
                type="password"
                autocomplete="off"
                placeholder="Required to issue token"
              />
            </label>

            <p v-if="step3Error" class="rw-field-error" role="alert">{{ step3Error }}</p>
          </div>

          <!-- STEP 4 — Token -->
          <div v-else-if="currentStep === 4" key="step-token" class="rw-step">
            <p class="rw-token-generated-label">Token generated</p>

            <!-- Token vault -->
            <div class="rw-token-vault" aria-label="Generated token">
              <span class="rw-token-caption">Token</span>
              <strong class="rw-token-value">{{ formattedToken }}</strong>
            </div>

            <!-- Copy + Send to meter -->
            <div class="rw-token-actions">
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
            <BaseButton class="rw-download-btn" @click="downloadReceipt">
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
        <!-- Back: hidden on step 2 when meter was preselected, and on step 1 / step 4 -->
        <BaseButton
          v-if="showBackButton"
          class="rw-btn rw-btn--ghost"
          @click="goBack"
        >Back</BaseButton>
        <span v-else/>

        <!-- Continue (steps 1–2) -->
        <BaseButton
          v-if="currentStep < 3"
          class="rw-btn rw-btn--primary"
          :disabled="isNextDisabled"
          @click="goNext"
        >Continue</BaseButton>

        <!-- Confirm & generate (step 3) -->
        <BaseButton
          v-else-if="currentStep === 3"
          class="rw-btn rw-btn--primary"
          :disabled="tokenLoading || isStep3Invalid"
          @click="confirmAndGenerate"
        >
          <svg v-if="tokenLoading" class="rw-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" stroke-dasharray="30" stroke-dashoffset="10"/>
          </svg>
          {{ tokenLoading ? 'Generating…' : 'Confirm and generate' }}
        </BaseButton>

        <!-- Done (step 4) -->
        <BaseButton
          v-else-if="currentStep === 4"
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
import BaseSelect from './base/BaseSelect.vue';
import { calculateVendingVatBreakdown, VENDING_VAT_BASIS_POINTS } from '../../packages/tokens/index.js';
import { postApi, liveWritesAllowed, getCookie } from '../services/api.js';
import { buildCanonicalReceiptRow, buildReceiptFilename, buildReceiptThemeFromDocument, downloadReceiptPdf } from '../services/receipt-tools.mjs';
import { printModelForRoute } from '../services/table-service';
import {
  buildLocalTokenPreview, calculateTokenUnits, calculateTokenAmount,
  parseTariffUnitPrice, findTariff, paymentMethods,
  guardedPreviewError, buildTokenPayload, tokenEndpoint, usesLocalTokenPreview,
} from '../services/token-flow.mjs';

const QUICK_AMOUNTS = [1000, 2000, 5000, 10000];

export default {
  name: 'RechargeWizard',
  components: { BaseButton, BaseInput, BaseSelect },

  props: {
    route: { type: Object, required: true },
    row:   { type: Object, default: () => ({}) },
    rows:  { type: Array,  default: () => [] },
  },

  emits: ['close', 'done'],

  data() {
    return {
      quickAmounts: QUICK_AMOUNTS,
      stepLabels: ['Meter', 'Amount', 'Confirm', 'Token'],
      paymentMethods,

      currentStep: 1,
      slideDir: 'slide-forward',
      amountFocused: false,

      form: {
        meterId:               this.row?.meterId         || '',
        customerId:            this.row?.customerId       || '',
        customerName:          this.row?.customerName     || '',
        stationId:             this.row?.stationId        || '',
        tariffId:              this.row?.tariffId         || '',
        protocolVersion:       this.row?.protocolVersion  || '2.2',
        isThreePhase:          this.row?.isThreePhase,
        sgc:                   this.row?.sgc              || '',
        purchaseWay:           'paid',
        amount:                '',
        totalUnit:             '',
        payDebtPercent:        '0',
        paymentMethod:         'Cash',
        authorizationPassword: '',
      },

      purchaseMode: 'paid',

      tariffs: [],
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
    showBackButton() {
      return this.currentStep > 1 && this.currentStep < 4;
    },

    // ── Tariff ─────────────────────────────────────────────────────
    selectedTariff() { return findTariff(this.tariffs, this.form.tariffId); },
    tariffUnitPrice() { return parseTariffUnitPrice(this.selectedTariff?.price) || '—'; },

    // ── VAT (inclusive) ────────────────────────────────────────────
    vatBreakdown() {
      const gross = Math.round(Number(this.form.amount) * 100);
      if (!(gross > 0)) {
        return { grossAmountMinor: 0, energyAmountMinor: 0, vatAmountMinor: 0, vatRateBasisPoints: VENDING_VAT_BASIS_POINTS };
      }
      return calculateVendingVatBreakdown(gross, VENDING_VAT_BASIS_POINTS);
    },

    vatPercent()            { return this.vatBreakdown.vatRateBasisPoints / 100; },
    formattedGross()        { return this.fmt(this.vatBreakdown.grossAmountMinor / 100); },
    formattedEnergyAmount() { return this.fmt(this.vatBreakdown.energyAmountMinor / 100); },
    formattedVatAmount()    { return this.fmt(this.vatBreakdown.vatAmountMinor / 100); },

    displayUnits() {
      if (this.purchaseMode === 'unit') return this.form.totalUnit || '0.0000';
      return calculateTokenUnits(this.form.amount, this.selectedTariff) || '0.0000';
    },

    // ── Token display ──────────────────────────────────────────────
    finalSource()   { return this.tokenFinal?.result || this.tokenFinal?.data || this.tokenFinal || {}; },
    finalTokenRaw() { return this.finalSource?.token || this.finalSource?.tokenFirst || ''; },
    formattedToken() {
      const t = String(this.finalTokenRaw).replace(/\s+/g, '');
      if (!t) return '— — — —';
      return t.match(/.{1,4}/g)?.join(' ') ?? t;
    },



    // ── Validation ─────────────────────────────────────────────────
    isNextDisabled() {
      if (this.currentStep === 2) return !(Number(this.form.amount) > 0 || Number(this.form.totalUnit) > 0);
      return false;
    },
    isStep3Invalid() { return !this.form.authorizationPassword.trim(); },

    // ── Send button label ──────────────────────────────────────────
    sendBtnLabel() {
      if (this.tokenSentStatus === 'success') return 'Sent to meter';
      if (this.tokenSentStatus === 'error')   return 'Retry send';
      if (this.tokenSendLoading)              return 'Sending…';
      return 'Send to meter';
    },
  },

  watch: {
    purchaseMode(mode) { this.form.purchaseWay = mode === 'unit' ? 'unit' : 'paid'; },
    'form.amount'()    { this.syncUnits('amount'); },
    'form.totalUnit'() { this.syncUnits('unit'); },
  },

  async created() {
    this.receiptTheme = buildReceiptThemeFromDocument();
    await this.loadTariffs();
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

    // ── Formatting ─────────────────────────────────────────────────
    fmt(value) {
      const n = Number(value);
      return '₦' + (Number.isFinite(n)
        ? n.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : '0.00');
    },

    // ── Navigation ─────────────────────────────────────────────────
    goNext() {
      this.clearErrors();
      if (this.currentStep === 2) {
        if (this.purchaseMode === 'paid' && !(Number(this.form.amount) > 0)) {
          this.step2Error = 'Enter an amount to continue.'; return;
        }
        if (this.purchaseMode === 'unit' && !(Number(this.form.totalUnit) > 0)) {
          this.step2Error = 'Enter the number of units to continue.'; return;
        }
      }
      this.slideDir = 'slide-forward';
      this.currentStep = Math.min(this.currentStep + 1, 4);
    },
    goBack() {
      this.clearErrors();
      this.slideDir = 'slide-back';
      this.currentStep = Math.max(this.currentStep - 1, 1);
    },
    clearErrors() { this.step1Error = ''; this.step2Error = ''; this.step3Error = ''; },

    // ── Tariff loading ─────────────────────────────────────────────
    async loadTariffs() {
      try {
        const res = await postApi('/api/tariff/read', {});
        const data = res?.data?.data || res?.data || res?.result?.data || res?.result || [];
        this.tariffs = Array.isArray(data) ? data : [];
      } catch { /* optional */ }
    },

    // ── Amount ↔ units sync ────────────────────────────────────────
    syncUnits(source) {
      if (!this.selectedTariff) return;
      if (this.purchaseMode === 'paid' && source === 'amount') {
        const u = calculateTokenUnits(this.form.amount, this.selectedTariff);
        if (u !== '' && String(this.form.totalUnit) !== u) this.form.totalUnit = u;
      }
      if (this.purchaseMode === 'unit' && source === 'unit') {
        const a = calculateTokenAmount(this.form.totalUnit, this.selectedTariff);
        if (a !== '' && String(this.form.amount) !== a) this.form.amount = a;
      }
    },

    // ── Token generation ───────────────────────────────────────────
    async confirmAndGenerate() {
      this.step3Error = '';
      if (this.isStep3Invalid) { this.step3Error = 'Authorization password is required.'; return; }
      this.tokenLoading = true;
      try {
        let response;
        if (usesLocalTokenPreview(this.route) || !liveWritesAllowed()) {
          response = buildLocalTokenPreview(this.route, { ...this.form, purchaseWay: this.purchaseMode });
        } else {
          const payload  = buildTokenPayload(this.route, { ...this.form, purchaseWay: this.purchaseMode }, { isPreview: false });
          const endpoint = tokenEndpoint(this.route, 'Recharge');
          response = await postApi(endpoint, payload, {
            headers: { 'X-Route-Hash': this.route?.hash || '', 'X-Route-Action': 'Recharge' },
          });
        }
        this.tokenFinal = response;
        const code   = Number(this.finalSource?.code ?? 0);
        const failed = this.finalSource?.status === false || (Number.isFinite(code) && code !== 0 && code !== 200);
        if (failed) { this.step3Error = this.finalSource?.reason || this.finalSource?.msg || 'Token generation failed.'; return; }
        this.slideDir   = 'slide-forward';
        this.currentStep = 4;
      } catch (err) {
        if (guardedPreviewError(err)) {
          this.tokenFinal  = buildLocalTokenPreview(this.route, { ...this.form, purchaseWay: this.purchaseMode });
          this.slideDir    = 'slide-forward';
          this.currentStep = 4;
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
          remark:       'Beverly recharge wizard send',
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
            amount:       this.vatBreakdown.grossAmountMinor / 100,
            tax:          this.vatBreakdown.vatAmountMinor   / 100,
            energyAmount: this.vatBreakdown.energyAmountMinor / 100,
          },
          response: this.tokenFinal,
          tariff: this.selectedTariff,
          actor:  { name: getCookie('userName'), email: getCookie('userEmail') || getCookie('userId') },
        });
        const model  = printModelForRoute(this.route, receiptRow);
        const result = await downloadReceiptPdf(model);
        const fallback = result?.mode === 'fallback';
        this.showPopup('success', fallback ? 'Basic receipt downloaded' : 'Receipt downloaded',
          fallback ? `${result.filename} — styled PDF export was unavailable.` : result?.filename || 'PDF saved.');
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
   RECHARGE WIZARD — scoped styles, 100% Beverly design token driven.
   Zero hardcoded colours — every value flows from the token system
   so light / dark / executive / contrast themes all work correctly.
═══════════════════════════════════════════════════════════════════ */

/* ── Backdrop ───────────────────────────────────────────────────── */
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

/* ── Card shell ─────────────────────────────────────────────────── */
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

/* ── Header ─────────────────────────────────────────────────────── */
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

/* Progress bars */
.rw-progress-bars {
  display: grid;
  grid-template-columns: repeat(var(--rw-steps, 4), 1fr);
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

/* Step labels */
.rw-step-labels {
  display: grid;
  grid-template-columns: repeat(var(--rw-steps, 4), 1fr);
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

/* ── Body ───────────────────────────────────────────────────────── */
.rw-body {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 18px 20px;
  background: linear-gradient(180deg, var(--bg-card), var(--bg-page));
  scrollbar-width: thin;
  scrollbar-color: var(--border-color) transparent;
}

/* ── Step container ─────────────────────────────────────────────── */
.rw-step {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* ── Step transitions ───────────────────────────────────────────── */
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

/* ══ STEP 1 — Meter search ══════════════════════════════════════ */
/* ══ STEP 1 — Meter info card ═══════════════════════════════════ */
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

/* ══ STEP 2 — Amount ════════════════════════════════════════════ */
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

/* Mode toggle */
.rw-mode-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  padding: 3px;
  gap: 3px;
}

.rw-mode-btn {
  padding: 8px;
  border: none;
  border-radius: calc(var(--radius-md) - 3px);
  background: transparent;
  color: var(--text-muted);
  font-size: 13px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  transition: background var(--transition-fast), color var(--transition-fast), box-shadow var(--transition-fast);
}

.rw-mode-btn.active {
  background: var(--primary-light);
  color: var(--primary);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--primary) 35%, transparent);
}

/* Amount input */
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

/* Quick chips */
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

/* Calculation card */
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
.rw-calc-row--total span  { font-weight: 600; color: var(--text-main); font-size: 13.5px; }
.rw-total-value { color: var(--primary) !important; font-size: 15px !important; font-weight: 800 !important; }

.rw-calc-divider { height: 1px; background: var(--border-color); }

/* ══ STEP 3 — Confirm ═══════════════════════════════════════════ */
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

/* Field labels */
.rw-field-label  { display: flex; flex-direction: column; gap: 5px; }
.rw-field-caption {
  font-size: 10.5px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.rw-select-wrap { position: relative; display: flex; align-items: center; }

.rw-select {
  width: 100%;
  padding: 10px 36px 10px 13px;
  appearance: none;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-strong);
  font-size: 14px;
  font-family: inherit;
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.rw-select:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

.rw-select-chevron {
  position: absolute;
  right: 11px;
  width: 15px;
  height: 15px;
  color: var(--text-faint);
  pointer-events: none;
}

.rw-text-input {
  padding: 10px 13px;
  background: var(--bg-page);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-md);
  color: var(--text-strong);
  font-size: 14px;
  font-family: inherit;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  width: 100%;
  box-sizing: border-box;
}

.rw-text-input::placeholder { color: var(--text-faint); }
.rw-text-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-light); }

/* ══ STEP 4 — Token ═════════════════════════════════════════════ */
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

/* Token action buttons */
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

/* Download receipt */
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

/* ── Spin animation ─────────────────────────────────────────────── */
.rw-spin { animation: rw-spin 0.9s linear infinite; }
@keyframes rw-spin { to { transform: rotate(360deg); } }

/* ── Field error ────────────────────────────────────────────────── */
.rw-field-error {
  margin: 0;
  font-size: 12px;
  color: var(--danger);
  font-weight: 600;
}

/* ── Popup ──────────────────────────────────────────────────────── */
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

/* Popup enter/leave */
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
