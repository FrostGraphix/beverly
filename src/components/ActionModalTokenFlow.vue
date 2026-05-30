<template>
  <BaseModalShell tag="form" class="modal modal-token-flow" @submit.prevent>
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge badge-primary">
            <span><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg></span>
          </div>
          <h2 class="modal-title">{{ modalHeading }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </BaseIconButton>
      </div>
    </template>

    <div class="token-stepper" aria-label="Token progress">
      <div v-for="step in tokenSteps" :key="step.id" class="token-step" :class="{ active: tokenStepState === step.id, done: tokenStepDone(step.id) }">
        <span class="token-step-dot">
          <span v-if="tokenStepDone(step.id)">&#10003;</span>
          <span v-else>{{ step.number }}</span>
        </span>
        <span>{{ step.label }}</span>
      </div>
    </div>

    <div class="modal-body">
      <div class="token-flow" :class="{ 'token-flow-enterprise': isCreditToken && tokenStep === 'confirm', 'token-flow-final': Boolean(tokenFinal) }">
        <div v-if="tokenFinal" class="token-final-panel">
          <div class="token-final-hero">
            <div class="token-final-icon" :class="{ failed: tokenFinalFailed }">
              <svg v-if="tokenFinalFailed" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/></svg>
              <svg v-else viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/></svg>
            </div>
            <div>
              <h3>{{ tokenFinalFailed ? 'Token failed' : 'Token generated' }}</h3>
              <p>{{ tokenFinalFailed ? tokenFinalMessage : 'Receipt opened and record is ready.' }}</p>
            </div>
          </div>
          <div v-if="finalTokenValue" class="token-vault">
            <div class="token-vault-content">
              <span>Token</span>
              <strong>{{ finalTokenValue }}</strong>
            </div>
            <div class="token-send-action">
              <BaseButton
                v-if="!tokenSentStatus"
                size="sm"
                variant="primary"
                :disabled="tokenSendLoading"
                @click.prevent="sendTokenToMeter"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
                </svg>
                {{ tokenSendLoading ? 'Sending...' : 'Send to Meter' }}
              </BaseButton>
              <div v-else-if="tokenSentStatus === 'success'" class="token-sent-success">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                Sent to meter
              </div>
              <div v-else-if="tokenSentStatus === 'error'" class="token-sent-error">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                Send failed
                <BaseButton size="sm" variant="quiet" @click.prevent="sendTokenToMeter">Retry</BaseButton>
              </div>
            </div>
          </div>
          <div class="token-final-grid">
            <div v-for="field in tokenFinalFields" :key="field[0]" class="token-final-row">
              <span>{{ field[0] }}</span>
              <strong>{{ field[1] }}</strong>
            </div>
          </div>
        </div>
        <div v-else-if="isCreditToken && tokenStep === 'confirm'" class="token-confirmation enterprise-confirmation">
          <section class="token-review-hero" aria-label="Transaction confirmation details">
            <div class="token-review-title">
              <span>Review</span>
              <strong>{{ form.customerName || form.customerId }}</strong>
            </div>
            <div class="token-review-amount">
              <span>Total Paid</span>
              <strong>{{ formattedTokenAmount }}</strong>
            </div>
          </section>
          <section class="token-review-grid">
            <div v-for="field in creditConfirmationFields" :key="`${field[0]}-reference-row`" class="token-review-card" :class="{ total: field[0] === 'Total Paid(MMK)' }">
              <span>{{ field[0] }}</span>
              <strong>{{ field[1] }}</strong>
            </div>
          </section>
          <section class="enterprise-approval token-approval" aria-label="Approval controls">
            <label class="modal-field enterprise-field">
              <span>Payment Method</span>
              <BaseSelect v-model="form.paymentMethod">
                <option v-for="method in paymentMethods" :key="method" :value="method">{{ method }}</option>
              </BaseSelect>
            </label>
            <label class="modal-field enterprise-field">
              <span>Authorization Password</span>
              <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" placeholder="Required for live write" />
            </label>
            <div class="enterprise-approval-note">
              <strong>Approval required</strong>
              <span>Confirm payment, then generate the token.</span>
            </div>
          </section>
        </div>
        <div v-else class="modal-grid">
          <div class="token-customer-card modal-span-two">
            <div>
              <span>Selected customer</span>
              <strong>{{ form.customerName || form.customerId || 'No customer selected' }}</strong>
            </div>
            <div>
              <span>Meter</span>
              <strong>{{ form.meterId || 'No meter' }}</strong>
            </div>
            <div v-if="meterPhaseLabel">
              <span>Meter Phase</span>
              <strong>{{ meterPhaseLabel }}</strong>
            </div>
            <div>
              <span>Tariff</span>
              <strong>{{ form.tariffId || 'No tariff' }}</strong>
            </div>
          </div>
          <label class="modal-field">
            <span>Customer Id</span>
            <BaseInput v-model="form.customerId" readonly />
          </label>
          <label class="modal-field">
            <span>Customer Name</span>
            <BaseInput v-model="form.customerName" readonly />
          </label>
          <label class="modal-field">
            <span>Meter Id</span>
            <BaseInput v-model="form.meterId" readonly />
          </label>
          <label class="modal-field">
            <span>Tariff Id</span>
            <BaseInput v-model="form.tariffId" readonly />
          </label>
          <template v-if="isCreditToken">
            <label class="modal-field">
              <span>Debt Percent</span>
              <BaseSelect v-model="form.payDebtPercent">
                <option v-for="value in debtPercents" :key="value" :value="value">{{ value }}</option>
              </BaseSelect>
            </label>
            <label class="modal-field">
              <span>Purchase Way</span>
              <BaseSelect v-model="form.purchaseWay">
                <option v-for="option in purchaseWays" :key="option.value" :value="option.value">{{ option.label }}</option>
              </BaseSelect>
            </label>
            <label class="modal-field">
              <span>Total Paid(MMK)</span>
              <BaseInput v-model="form.amount" type="number" min="0" step="0.01" :readonly="form.purchaseWay === 'unit'" />
            </label>
            <label class="modal-field">
              <span>Total Unit(kWh)</span>
              <BaseInput v-model="form.totalUnit" type="number" min="0" step="0.1" :readonly="form.purchaseWay !== 'unit'" />
            </label>
          </template>
          <template v-else>
            <label v-if="isMaximumPowerToken" class="modal-field">
              <span>Maximum Power(W)</span>
              <BaseInput v-model="form.maximumPower" type="number" min="0" step="1" />
            </label>
            <label v-if="!isSimpleTokenRoute" class="modal-field" :class="{ 'modal-span-two': !isMaximumPowerToken }">
              <span>Remark</span>
              <BaseInput v-model="form.remark" autocomplete="off" />
            </label>
          </template>
          <label v-if="!isCreditToken && !isSimpleTokenRoute" class="modal-field">
            <span>Authorization Password</span>
            <BaseInput v-model="form.authorizationPassword" name="authorizationPassword" type="password" autocomplete="off" />
          </label>
        </div>
        <div v-if="isCreditToken && tokenPriceText && !tokenFinal" class="token-rate-card">
          <span>{{ tokenPriceText }}</span>
          <strong>{{ tokenActionError || 'Ready' }}</strong>
        </div>
      </div>
      <div v-if="error" class="modal-error">{{ error }}</div>
      <div v-if="result" class="modal-result">{{ result }}</div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <BaseButton @click="$emit('close')">Cancel</BaseButton>
        <BaseButton v-if="tokenFinal" @click="downloadFinalReceipt">PDF Receipt</BaseButton>
        <BaseButton v-if="tokenFinal" @click="printFinalReceipt">Print Again</BaseButton>
        <BaseButton v-if="tokenFinal" variant="primary" @click="$emit('done')">Done</BaseButton>
        <BaseButton v-else-if="isCreditToken && tokenStep === 'confirm'" @click="tokenStep = 'form'">Back</BaseButton>
        <BaseButton v-if="!tokenFinal" variant="primary" :disabled="tokenLoading || Boolean(tokenActionError)" @click="handleTokenPrimary">{{ tokenPrimaryLabel }}</BaseButton>
      </div>
    </template>
  </BaseModalShell>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseModalShell from "./base/BaseModalShell.vue";
import BaseSelect from "./base/BaseSelect.vue";
import { printModelForRoute } from "../services/table-service";
import { getCookie, liveWritesAllowed, postApi } from "../services/api.js";
import { buildCanonicalReceiptRow, buildReceiptFilename, buildReceiptThemeFromDocument, downloadReceiptPdf, openBrowserPrint, receiptHtml, validateReceiptModel } from "../services/receipt-tools.mjs";
import { guardedWriteMessage } from "../services/guarded-write.mjs";
import { logPrintJob } from "../services/local-jobs.mjs";
import {
  buildTokenPayload,
  buildChangeMeterKeyTokenPayload,
  buildLocalTokenPreview,
  buildMeterKeyUpdatePayload,
  calculateTokenAmount,
  calculateTokenUnits,
  extractChangeMeterKeyTokens,
  findTariff,
  guardedPreviewError,
  isCreditTokenRoute,
  isTokenRejectRemark,
  keySyncEligible,
  meterPhaseFromRow,
  parseTariffUnitPrice,
  paymentMethods,
  purchaseWays,
  tokenEndpoint,
  tokenResultFields,
  tokenValidationError,
  usesLocalTokenPreview
} from "../services/token-flow.mjs";
import { resolveMeterIsS2Override } from "../services/meter-token-format.mjs";
import {
  remoteTaskConfirmEndpoint,
  remoteTaskConfirmPayload,
  remoteTokenStandbyConfirmPayload,
  remoteTokenTaskStatus,
  remoteTokenTaskLookupPayload
} from "../services/remote-task-flow.mjs";
import { toastSuccess, toastError, toastWarn } from "../services/toast.js";

export default {
  name: "ActionModalTokenFlow",
  components: { BaseButton, BaseIconButton, BaseInput, BaseModalShell, BaseSelect },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  data() {
    return {
      form: {
        ...this.row,
        authorizationPassword: "",
        amount: this.row.amount || "",
        totalUnit: this.row.totalUnit || "",
        payDebtPercent: this.row.payDebtPercent || "0",
        purchaseWay: this.row.purchaseWay || "paid",
        paymentMethod: this.row.paymentMethod || "Cash",
        maximumPower: this.row.maximumPower || ""
      },
      tokenPreview: null,
      tokenFinal: null,
      tokenStep: "form",
      tokenLoading: false,
      tokenSendLoading: false,
      tokenSentStatus: "",
      tariffs: [],
      debtPercents: ["0", "10", "20", "30", "50", "100"],
      purchaseWays,
      paymentMethods,
      error: "",
      result: "",
      requestLog: "",
      responseLog: "",
      receiptTheme: {},
      receiptThemeObserver: null
    };
  },
  computed: {
    title() {
      if (this.isCreditToken && this.tokenStep === "confirm") return "Transaction Confirmation";
      if (this.action === "Recharge") return "Recharge";
      if (this.action === "Generate Token") return `Generate Token (${this.route.title.replace(" Token", "")})`;
      return `${this.action} ${this.route.title}`;
    },
    modalHeading() { return this.title; },
    isCreditToken() { return isCreditTokenRoute(this.route); },
    isMaximumPowerToken() { return String(this.route.hash || "").includes("set-maximum-power-limit"); },
    isSimpleTokenRoute() {
      const hash = String(this.route.hash || "");
      return hash.includes("clear-tamper") || hash.includes("clear-credit") || hash.includes("set-maximum-power-limit");
    },
    selectedTariff() { return findTariff(this.tariffs, this.form.tariffId); },
    tokenUnitPrice() { return parseTariffUnitPrice(this.selectedTariff?.price); },
    tokenPriceText() {
      if (!this.form.tariffId) return "";
      if (!this.selectedTariff) return "Tariff data is missing";
      if (!this.tokenUnitPrice) return "Tariff price is invalid";
      return `Tariff price: ${this.tokenUnitPrice} MMK/kWh`;
    },
    meterPhaseLabel() {
      const phase = meterPhaseFromRow(this.form);
      if (phase === "three-phase") return "3-phase";
      if (phase === "single-phase") return "Single-phase";
      return this.form.requireThreePhase ? "3-phase required" : "";
    },
    tokenFormError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isSimpleTokenRoute });
    },
    tokenPreviewError() {
      return tokenValidationError(this.route, this.form, this.selectedTariff, { requireAuthorization: !this.isCreditToken && !this.isSimpleTokenRoute });
    },
    tokenActionError() {
      if (this.isCreditToken && this.tokenStep === "form") return this.tokenPreviewError;
      if (!this.tokenPreview) return this.tokenPreviewError;
      return this.tokenFormError;
    },
    tokenPrimaryLabel() {
      if (this.tokenLoading) return "Processing...";
      if (this.isCreditToken && this.tokenStep === "form") return "Review";
      return "Generate Token";
    },
    tokenSteps() {
      return [
        { id: "form", number: 1, label: "Details" },
        { id: "confirm", number: 2, label: "Review" },
        { id: "final", number: 3, label: "Result" }
      ];
    },
    tokenStepState() {
      if (this.tokenFinal) return "final";
      return this.tokenStep === "confirm" ? "confirm" : "form";
    },
    formattedTokenAmount() {
      return Number(this.form.amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },
    creditConfirmationFields() {
      return [
        ["Customer Id", this.form.customerId],
        ["Customer Name", this.form.customerName],
        ["Meter Id", this.form.meterId],
        ["Meter Phase", this.meterPhaseLabel],
        ["Pay Debt(MMK)", this.form.payDebtPercent || "0"],
        ["Monthly Charge(MMK)", this.form.monthlyCharge || "0"],
        ["Total Unit(kWh)", this.form.totalUnit],
        ["Total Paid(MMK)", this.form.amount]
      ].filter((field) => field[1] !== undefined && field[1] !== null && field[1] !== "");
    },
    tokenFinalFields() { return tokenResultFields(this.tokenFinal); },
    tokenFinalSource() { return this.tokenFinal?.result || this.tokenFinal?.data || this.tokenFinal || {}; },
    tokenFinalFailed() {
      const source = this.tokenFinalSource;
      const code = Number(source.code);
      return source.status === false || (Number.isFinite(code) && code !== 0 && code !== 200);
    },
    tokenFinalMessage() {
      const source = this.tokenFinalSource;
      return source.reason || source.msg || source.message || "Token request failed.";
    },
    finalTokenValue() {
      const source = this.tokenFinalSource;
      return source.token || source.tokenFirst || "";
    },
    finalReceiptModel() { return printModelForRoute(this.route, this.buildTokenReceiptRow(this.tokenFinal)); },
    finalReceiptValidation() { return validateReceiptModel(this.finalReceiptModel); }
  },
  watch: {
    "form.amount"() { this.syncTokenCalculation("amount"); },
    "form.totalUnit"() { this.syncTokenCalculation("unit"); },
    "form.purchaseWay"() { this.syncTokenCalculation("mode"); },
    tariffs() { this.syncTokenCalculation("tariff"); }
  },
  async created() {
    this.loadTariffs();
  },
  mounted() {
    this.syncReceiptTheme();
    if (typeof MutationObserver !== "undefined" && typeof document !== "undefined" && document.documentElement) {
      this.receiptThemeObserver = new MutationObserver(() => this.syncReceiptTheme());
      this.receiptThemeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    }
  },
  beforeUnmount() {
    if (this.receiptThemeObserver) this.receiptThemeObserver.disconnect();
  },
  methods: {
    syncReceiptTheme() { this.receiptTheme = buildReceiptThemeFromDocument(); },
    receiptHtmlFor(model) { return receiptHtml(model, { theme: this.receiptTheme }); },
    receiptFilename(model, extension = "html") { return buildReceiptFilename(model, extension); },
    normalizeRows(response) {
      const data = response?.data;
      const result = response?.result;
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.data)) return data.data;
      if (Array.isArray(data?.list)) return data.list;
      if (Array.isArray(result)) return result;
      if (Array.isArray(result?.data)) return result.data;
      if (Array.isArray(result?.list)) return result.list;
      if (Array.isArray(response?.rows)) return response.rows;
      return [];
    },
    async loadTariffs() {
      if (!this.isCreditToken && !this.isMaximumPowerToken) return;
      try {
        const response = await postApi("/api/tariff/read", {});
        this.tariffs = this.normalizeRows(response);
      } catch (error) {
        this.error = error?.message || "Tariff data failed";
      }
    },
    syncTokenCalculation(source) {
      if (!this.isCreditToken) return;
      this.tokenPreview = null;
      this.tokenFinal = null;
      this.tokenStep = "form";
      const tariff = this.selectedTariff;
      if (!tariff) return;
      if (this.form.purchaseWay === "unit") {
        if (source === "amount") return;
        const amount = calculateTokenAmount(this.form.totalUnit, tariff);
        if (amount !== "" && String(this.form.amount) !== amount) this.form.amount = amount;
        return;
      }
      if (source === "unit") return;
      const totalUnit = calculateTokenUnits(this.form.amount, tariff);
      if (totalUnit !== "" && String(this.form.totalUnit) !== totalUnit) this.form.totalUnit = totalUnit;
    },
    async handleTokenPrimary() {
      if (this.isCreditToken && this.tokenStep === "form") { await this.previewToken(); return; }
      if (!this.tokenPreview) { await this.previewToken(); return; }
      await this.confirmToken();
    },
    async ensureFormatOverride() {
      if (!this.isCreditToken) return;
      const meterId = String(this.form.meterId || "").trim();
      if (!meterId) return;
      try {
        const sgc = String(this.form.sgc || this.row.sgc || "").trim();
        const resolved = await resolveMeterIsS2Override(meterId, sgc ? { sgc } : {});
        this.form.isS2Override = typeof resolved === "boolean" ? resolved : undefined;
      } catch {
        this.form.isS2Override = undefined;
      }
    },
    async previewToken() {
      this.error = "";
      this.result = "";
      this.tokenFinal = null;
      const validationError = this.tokenPreviewError;
      if (validationError) { this.error = validationError; return; }
      this.tokenLoading = true;
      try {
        await this.ensureFormatOverride();
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: true });
        this.requestLog = "";
        if (usesLocalTokenPreview(this.route) || !liveWritesAllowed()) {
          const fallback = buildLocalTokenPreview(this.route, this.form);
          this.responseLog = JSON.stringify(fallback, null, 2);
          this.tokenPreview = fallback;
          if (this.isCreditToken) this.tokenStep = "confirm";
          return;
        }
        const response = await postApi(endpoint, payload, { headers: this.remoteTaskHeaders(this.route, this.action) });
        this.responseLog = "";
        this.tokenPreview = response;
        if (this.isCreditToken) this.tokenStep = "confirm";
      } catch (error) {
        if (guardedPreviewError(error)) {
          const fallback = buildLocalTokenPreview(this.route, this.form);
          this.responseLog = JSON.stringify(fallback, null, 2);
          this.tokenPreview = fallback;
          if (this.isCreditToken) this.tokenStep = "confirm";
          return;
        }
        this.error = error?.message || "Preview failed";
      } finally {
        this.tokenLoading = false;
      }
    },
    async confirmToken() {
      this.error = "";
      if (!this.tokenPreview) { this.error = "Preview is required"; return; }
      const validationError = this.tokenFormError;
      if (validationError) { this.error = validationError; return; }
      if (!liveWritesAllowed()) { this.error = guardedWriteMessage("Token"); return; }
      this.tokenLoading = true;
      const receiptPopup = typeof window !== "undefined" ? window.open("", "_blank", "width=900,height=700") : null;
      try {
        await this.ensureFormatOverride();
        const endpoint = tokenEndpoint(this.route, this.action);
        const payload = buildTokenPayload(this.route, this.form, { isPreview: false });
        this.requestLog = "";
        const response = await postApi(endpoint, payload, { headers: this.remoteTaskHeaders(this.route, this.action) });
        this.responseLog = "";
        this.tokenFinal = response;
        if (this.tokenFinalFailed) {
          if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
          this.result = "";
          toastError(this.tokenFinalMessage);
          return;
        }
        const receiptRow = this.buildTokenReceiptRow(response);
        const receiptModel = printModelForRoute(this.route, receiptRow);
        const receiptValidation = validateReceiptModel(receiptModel);
        if (!receiptValidation.ok) {
          if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
          const missingText = receiptValidation.missing.join(", ");
          this.error = `Receipt is missing: ${missingText}`;
          toastError(this.error);
          return;
        }
        openBrowserPrint(receiptModel, receiptPopup);
        await logPrintJob(this.route, receiptModel, "auto-token", "credit", {
          fileName: this.receiptFilename(receiptModel, "html"),
          content: this.receiptHtmlFor(receiptModel),
          contentType: "text/html;charset=utf-8",
          format: "html"
        });
        this.result = `Token generated. Receipt opened: ${this.receiptFilename(receiptModel, "pdf")}`;
        toastSuccess("Token generated. Receipt opened.");
      } catch (error) {
        if (receiptPopup && !receiptPopup.closed) receiptPopup.close();
        this.error = error?.message || "Token failed";
        toastError(error?.message || "Token failed");
      } finally {
        this.tokenLoading = false;
      }
    },
    async sendTokenToMeter() {
      if (!this.finalTokenValue) return;
      this.tokenSendLoading = true;
      this.tokenSentStatus = "";
      try {
        await this.sendRemoteTokenValue(this.finalTokenValue, "Auto-sent after generation");
        this.tokenSentStatus = "success";
        toastSuccess("Token delivered to meter successfully.");
      } catch (error) {
        try {
          if (!this.shouldAttemptKeySync(error)) throw error;
          toastWarn("Token rejected. Syncing meter keys.");
          await this.syncMeterKeysToMeter();
          await this.sendRemoteTokenValue(this.finalTokenValue, "Auto-sent after key sync");
          this.tokenSentStatus = "success";
          toastSuccess("Key sync complete. Token delivered.");
        } catch (syncError) {
          toastError(syncError?.message || "Failed to send token to meter.");
          this.tokenSentStatus = "error";
        }
      } finally {
        this.tokenSendLoading = false;
      }
    },
    shouldAttemptKeySync(error) {
      return keySyncEligible({ ...this.row, ...this.form }) && isTokenRejectRemark(error?.message || "");
    },
    remoteTokenPayload(token, remark = "") {
      return {
        customerId: this.form.customerId || this.row.customerId || "",
        customerName: this.form.customerName || this.row.customerName || "",
        meterId: this.form.meterId || this.row.meterId || "",
        version: this.form.protocolVersion || this.row.protocolVersion || "2.2",
        flag: "A120",
        name: "Send Token",
        dataItem: "Send Token",
        dataDefault: "",
        dataPrefix: "",
        data: String(token || "").replace(/\s+/g, ""),
        stationId: this.form.stationId || this.row.stationId || "",
        remark
      };
    },
    async sendRemoteTokenValue(token, remark = "") {
      const payload = [this.remoteTokenPayload(token, remark)];
      const response = await postApi("/API/RemoteMeterTask/CreateTokenTask", payload, {
        headers: this.remoteTaskHeaders({ hash: "#/remote-operation/remote-meter-token" }, "Add Task")
      });
      let confirmPayload = remoteTaskConfirmPayload(response);
      let taskId = Number(confirmPayload[0]?.id);
      if (!confirmPayload.length) {
        const lookup = await postApi("/API/RemoteMeterTask/GetTokenTask", remoteTokenTaskLookupPayload(payload[0]), {
          headers: this.remoteTaskHeaders({ hash: "#/remote-operation-record/remote-meter-token-task" }, "Confirm")
        });
        confirmPayload = remoteTokenStandbyConfirmPayload(lookup, payload[0]);
        taskId = Number(confirmPayload[0]?.id);
      }
      if (!confirmPayload.length) throw new Error("Token task created but confirm id was not returned");
      const confirmResponse = await postApi(remoteTaskConfirmEndpoint({ hash: "#/remote-operation/remote-meter-token" }), confirmPayload, {
        headers: this.remoteTaskHeaders({ hash: "#/remote-operation-record/remote-meter-token-task" }, "Confirm")
      });
      const confirmCode = Number(confirmResponse?.code);
      const confirmReason = String(confirmResponse?.reason || confirmResponse?.msg || "").toLowerCase();
      if (Number.isFinite(confirmCode) && confirmCode !== 0 && confirmCode !== 200 && !(confirmCode === 99 && confirmReason.includes("no data has been changed"))) {
        throw new Error(confirmResponse?.reason || confirmResponse?.msg || `Confirm failed with code ${confirmCode}`);
      }
      const finalTask = await this.pollRemoteTokenDelivery({ ...payload[0], id: taskId });
      const status = String(finalTask?.status || "").toLowerCase();
      const finalRemark = String(finalTask?.remark || "");
      if (status === "1" || status === "success") return finalTask;
      throw new Error(finalRemark ? `Remote send failed: ${finalRemark}` : "Remote send failed");
    },
    async syncMeterKeysToMeter() {
      const keyUpdatePayload = buildMeterKeyUpdatePayload({ ...this.row, ...this.form });
      if (keyUpdatePayload) {
        const updateResponse = await postApi("/api/token/meterKey/update", keyUpdatePayload, {
          headers: this.remoteTaskHeaders(this.route, this.action)
        });
        const updateCode = Number(updateResponse?.code);
        if (Number.isFinite(updateCode) && updateCode !== 0 && updateCode !== 200) {
          throw new Error(updateResponse?.reason || updateResponse?.msg || "Meter key update failed");
        }
      }
      const response = await postApi("/api/token/changeMeterKeyToken/generate", buildChangeMeterKeyTokenPayload(this.form), {
        headers: this.remoteTaskHeaders(this.route, this.action)
      });
      const keyTokens = extractChangeMeterKeyTokens(response);
      if (keyTokens.length < 2) throw new Error("Meter key tokens were not returned");
      await this.sendRemoteTokenValue(keyTokens[0], "Auto key sync token 1");
      await this.sendRemoteTokenValue(keyTokens[1], "Auto key sync token 2");
    },
    async pollRemoteTokenDelivery(form) {
      let latestTask = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 5000));
        const lookup = await postApi("/API/RemoteMeterTask/GetTokenTask", remoteTokenTaskLookupPayload(form), {
          headers: this.remoteTaskHeaders({ hash: "#/remote-operation-record/remote-meter-token-task" }, "Confirm")
        });
        latestTask = remoteTokenTaskStatus(lookup, form);
        const status = String(latestTask?.status || "").toLowerCase();
        if (status === "1" || status === "success" || status === "2" || status === "failure" || status === "failed") return latestTask;
      }
      throw new Error("Remote send still pending after polling");
    },
    buildTokenReceiptRow(response) {
      return buildCanonicalReceiptRow({
        row: this.row,
        form: this.form,
        response,
        tariff: this.selectedTariff,
        actor: {
          name: getCookie("userName"),
          email: getCookie("userEmail") || getCookie("userId")
        }
      });
    },
    tokenStepDone(stepId) {
      const order = { form: 1, confirm: 2, final: 3 };
      return order[stepId] < order[this.tokenStepState];
    },
    async printFinalReceipt() {
      if (!this.finalReceiptValidation.ok) {
        toastError(`Receipt is missing: ${this.finalReceiptValidation.missing.join(", ")}`);
        return;
      }
      const opened = openBrowserPrint(this.finalReceiptModel);
      await logPrintJob(this.route, this.finalReceiptModel, "browser-repeat", "credit", {
        fileName: this.receiptFilename(this.finalReceiptModel, "html"),
        content: this.receiptHtmlFor(this.finalReceiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = opened ? `Browser print opened: ${this.receiptFilename(this.finalReceiptModel, "pdf")}` : "Browser blocked the print window";
    },
    async downloadFinalReceipt() {
      if (!this.finalReceiptValidation.ok) {
        toastError(`Receipt is missing: ${this.finalReceiptValidation.missing.join(", ")}`);
        return;
      }
      const result = await downloadReceiptPdf(this.finalReceiptModel);
      await logPrintJob(this.route, this.finalReceiptModel, "pdf-final", "credit", {
        fileName: this.receiptFilename(this.finalReceiptModel, "html"),
        content: this.receiptHtmlFor(this.finalReceiptModel),
        contentType: "text/html;charset=utf-8",
        format: "html"
      });
      this.result = result?.mode === "fallback" ? `PDF fallback downloaded: ${result.filename}` : `PDF receipt downloaded: ${result.filename}`;
    },
    remoteTaskHeaders(route = this.route, action = this.action) {
      return {
        "X-Route-Hash": String(route?.hash || ""),
        "X-Route-Action": String(action || "Add Task")
      };
    }
  }
};
</script>
