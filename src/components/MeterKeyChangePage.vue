<template>
  <div class="mkc">
    <header class="mkc-head">
      <div class="mkc-head-copy">
        <h1 class="mkc-title">Change Meter Key (KCT)</h1>
        <p class="mkc-sub">
          Re-key an STS meter so it accepts credit tokens again. Used when a meter rejects
          tokens because its key (SGC / KRN / KEN / TI / KT / base year) no longer matches the
          vending system — typically a new meter, a key-revision rollover, or an SGC change.
        </p>
      </div>
      <span :class="['mkc-write', liveWrites ? 'mkc-write--on' : 'mkc-write--off']">
        {{ liveWrites ? "Live writes ON" : "Live writes OFF (preview only)" }}
      </span>
    </header>

    <!-- Step 1 — look up meter -->
    <section class="mkc-card">
      <div class="mkc-card-head"><span class="mkc-step">1</span><strong>Look up meter</strong></div>
      <div class="mkc-lookup">
        <BaseInput
          v-model="meterIdInput"
          class="mkc-meter-input"
          placeholder="Enter meter number, e.g. 44120…"
          inputmode="numeric"
          @keyup.enter="lookupMeter"
        />
        <BaseButton variant="primary" :loading="loadingLookup" :disabled="!meterIdInput.trim()" @click="lookupMeter">
          Look up
        </BaseButton>
      </div>
      <p v-if="lookupError" class="mkc-alert mkc-alert--error">{{ lookupError }}</p>
    </section>

    <template v-if="meter">
      <!-- Step 2 — meter summary + key diff -->
      <section class="mkc-card">
        <div class="mkc-card-head">
          <span class="mkc-step">2</span><strong>Meter &amp; key status</strong>
          <span :class="['mkc-badge', meter.isThreePhase ? 'mkc-badge--info' : 'mkc-badge--neutral']">
            {{ meter.isThreePhase ? "Three Phase" : "Single Phase" }}
          </span>
        </div>

        <div class="mkc-grid">
          <div class="mkc-field"><span>Customer</span><strong>{{ meter.customerName || "—" }}</strong></div>
          <div class="mkc-field"><span>Meter</span><strong class="mkc-mono">{{ meter.meterId }}</strong></div>
          <div class="mkc-field"><span>Station</span><strong>{{ meter.stationId || "—" }}</strong></div>
          <div class="mkc-field"><span>Tariff</span><strong>{{ meter.tariffId || "—" }}</strong></div>
        </div>

        <div v-if="keyMismatch" class="mkc-keys">
          <div class="mkc-key-col">
            <h4>Current key</h4>
            <div class="mkc-key-row"><span>SGC</span><strong class="mkc-mono">{{ meter.sgc || "—" }}</strong></div>
            <div class="mkc-key-row"><span>KRN</span><strong class="mkc-mono">{{ meter.krn ?? "—" }}</strong></div>
            <div class="mkc-key-row"><span>KT</span><strong class="mkc-mono">{{ meter.kt ?? "—" }}</strong></div>
          </div>
          <div class="mkc-key-arrow" aria-hidden="true">→</div>
          <div class="mkc-key-col">
            <h4>Staged new key</h4>
            <div class="mkc-key-row"><span>SGC</span><strong class="mkc-mono">{{ meter.sgcNew || "—" }}</strong></div>
            <div class="mkc-key-row"><span>KRN</span><strong class="mkc-mono">{{ meter.krnNew ?? "—" }}</strong></div>
            <div class="mkc-key-row"><span>KT</span><strong class="mkc-mono">{{ meter.ktNew ?? "—" }}</strong></div>
          </div>
        </div>

        <p v-if="keyMismatch" class="mkc-alert mkc-alert--warn">
          Current and staged keys differ — this meter needs a key change. Generate the KCT pair below
          and deliver both tokens to the meter before vending credit again.
        </p>
        <p v-else class="mkc-alert mkc-alert--ok">
          Current and staged keys match. A KCT is only needed if you are deliberately rotating the key.
        </p>
      </section>

      <!-- Token format + SGC rule side by side at desktop -->
      <div class="mkc-pair">

      <!-- Token format (S1/S2) override -->
      <section class="mkc-card mkc-card--accent">
        <div class="mkc-card-head">
          <span class="mkc-step mkc-step--alt">S</span>
          <strong>Token format (S1 / S2)</strong>
        </div>
        <p class="mkc-hint">
          The credit-token <code>isS2</code> flag is normally guessed from phase, but STS standard isn’t
          implied by phase. If a meter rejects tokens despite a correct key, pin the format it actually accepts —
          every future credit token (and remote send) for this meter will use it.
        </p>
        <div class="mkc-grid">
          <div class="mkc-field"><span>Phase-derived default</span><strong>{{ phaseDefaultFormat }}</strong></div>
          <div class="mkc-field"><span>Effective for this meter</span><strong>{{ effectiveFormat }}</strong></div>
          <div class="mkc-field" v-if="formatRecord && formatRecord.updatedAt">
            <span>Last set</span><strong>{{ fmtDate(formatRecord.updatedAt) }}</strong>
          </div>
        </div>
        <div class="mkc-seg">
          <BaseButton :variant="formatChoice === 'auto' ? 'primary' : 'secondary'" size="sm" @click="formatChoice = 'auto'">Auto (by phase)</BaseButton>
          <BaseButton :variant="formatChoice === 's1' ? 'primary' : 'secondary'" size="sm" @click="formatChoice = 's1'">Force S1 (isS2=false)</BaseButton>
          <BaseButton :variant="formatChoice === 's2' ? 'primary' : 'secondary'" size="sm" @click="formatChoice = 's2'">Force S2 (isS2=true)</BaseButton>
        </div>
        <div class="mkc-actions">
          <BaseButton variant="primary" :loading="savingFormat" @click="saveFormat">Save token format</BaseButton>
        </div>
      </section>

      <!-- SGC-level rule (covers the whole supply group) -->
      <section class="mkc-card mkc-card--accent">
        <div class="mkc-card-head">
          <span class="mkc-step mkc-step--alt">SGC</span>
          <strong>Supply-group rule (SGC {{ meter.sgc || "—" }})</strong>
        </div>
        <p class="mkc-hint">
          STS standard is uniform within an SGC, so one rule classifies every meter in this group at once.
          A per-meter override (above) still wins where set; otherwise this rule decides the format.
        </p>
        <div class="mkc-grid">
          <div class="mkc-field"><span>SGC</span><strong class="mkc-mono">{{ meter.sgc || "—" }}</strong></div>
          <div class="mkc-field">
            <span>Current rule</span>
            <strong>{{ sgcRecord && typeof sgcRecord.isS2 === "boolean" ? (sgcRecord.isS2 ? "S2 (isS2=true)" : "S1 (isS2=false)") : "None (phase fallback)" }}</strong>
          </div>
          <div class="mkc-field" v-if="sgcRecord && sgcRecord.updatedAt">
            <span>Last set</span><strong>{{ fmtDate(sgcRecord.updatedAt) }}</strong>
          </div>
        </div>
        <div class="mkc-seg">
          <BaseButton :variant="sgcChoice === 'auto' ? 'primary' : 'secondary'" size="sm" @click="sgcChoice = 'auto'">No rule (phase)</BaseButton>
          <BaseButton :variant="sgcChoice === 's1' ? 'primary' : 'secondary'" size="sm" @click="sgcChoice = 's1'">All S1 (isS2=false)</BaseButton>
          <BaseButton :variant="sgcChoice === 's2' ? 'primary' : 'secondary'" size="sm" @click="sgcChoice = 's2'">All S2 (isS2=true)</BaseButton>
        </div>
        <div class="mkc-actions">
          <BaseButton variant="primary" :loading="savingSgc" :disabled="!meter.sgc" @click="saveSgcRule">Save supply-group rule</BaseButton>
        </div>
      </section>

      </div><!-- /.mkc-pair -->

      <!-- Step 3 — new key parameters -->
      <section class="mkc-card">
        <div class="mkc-card-head"><span class="mkc-step">3</span><strong>New key parameters</strong></div>
        <p class="mkc-hint">Confirm the target key the meter should adopt, then stage it in the vending system.</p>
        <div class="mkc-keyform">
          <label class="mkc-input"><span>SGC (new)</span><BaseInput v-model="keyForm.sgcNew" placeholder="600728" /></label>
          <label class="mkc-input"><span>KRN (new)</span><BaseInput v-model.number="keyForm.krnNew" type="number" placeholder="1" /></label>
          <label class="mkc-input"><span>KEN (new)</span><BaseInput v-model.number="keyForm.kenNew" type="number" placeholder="1" /></label>
          <label class="mkc-input"><span>TI (new)</span><BaseInput v-model.number="keyForm.tiNew" type="number" placeholder="7" /></label>
          <label class="mkc-input"><span>KT (new)</span><BaseInput v-model.number="keyForm.ktNew" type="number" placeholder="2" /></label>
          <label class="mkc-input"><span>Base year (new)</span><BaseInput v-model.number="keyForm.baseYearNew" type="number" placeholder="2014" /></label>
        </div>
        <div class="mkc-actions">
          <BaseButton variant="secondary" :loading="loadingKeyUpdate" :disabled="!canUpdateKey" @click="updateMeterKey">
            Stage new key
          </BaseButton>
          <span v-if="!canUpdateKey" class="mkc-hint">All six fields are required to stage a key.</span>
        </div>
      </section>

      <!-- Step 4 — generate KCT -->
      <section class="mkc-card">
        <div class="mkc-card-head"><span class="mkc-step">4</span><strong>Generate key-change token (KCT)</strong></div>
        <p class="mkc-hint">STS key changes are delivered as a pair — both tokens must be entered, in order.</p>
        <BaseButton variant="primary" :loading="loadingGenerate" @click="generateKct">Generate KCT pair</BaseButton>

        <div v-if="kct.first || kct.second" class="mkc-tokens">
          <div class="mkc-token">
            <span class="mkc-token-label">KCT 1</span>
            <code class="mkc-token-value">{{ formatToken(kct.first) }}</code>
            <BaseIconButton title="Copy KCT 1" @click="copy(kct.first)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </BaseIconButton>
          </div>
          <div class="mkc-token">
            <span class="mkc-token-label">KCT 2</span>
            <code class="mkc-token-value">{{ formatToken(kct.second) }}</code>
            <BaseIconButton title="Copy KCT 2" @click="copy(kct.second)">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </BaseIconButton>
          </div>
        </div>
      </section>

      <!-- Step 5 — deliver -->
      <section v-if="kct.first && kct.second" class="mkc-card">
        <div class="mkc-card-head"><span class="mkc-step">5</span><strong>Deliver to meter</strong></div>
        <p class="mkc-hint">
          Remote-send both tokens to the meter over the network, or hand them to the field agent /
          customer to key in manually (KCT 1 first, then KCT 2).
        </p>
        <div class="mkc-actions">
          <BaseButton variant="primary" :loading="loadingSend" @click="remoteSendKct">Remote-send KCT 1 &amp; 2</BaseButton>
          <span v-if="sendStatus" :class="['mkc-send-status', `mkc-send-status--${sendStatusTone}`]">{{ sendStatus }}</span>
        </div>
      </section>

      <!-- Step 6 — history -->
      <section class="mkc-card">
        <div class="mkc-card-head">
          <span class="mkc-step">6</span><strong>Key-change history</strong>
          <BaseButton variant="ghost" size="sm" :loading="loadingHistory" @click="loadHistory">Refresh</BaseButton>
        </div>
        <div class="mkc-table-wrap">
          <table class="mkc-table">
            <thead>
              <tr><th>Date</th><th>Receipt</th><th>KCT 1</th><th>KCT 2</th><th>Status</th></tr>
            </thead>
            <tbody>
              <tr v-for="row in history" :key="row.receiptId || row.createDate">
                <td class="mkc-mono">{{ fmtDate(row.createDate) }}</td>
                <td class="mkc-mono">{{ row.receiptId ?? "—" }}</td>
                <td class="mkc-mono">{{ formatToken(row.tokenFirst) || "—" }}</td>
                <td class="mkc-mono">{{ formatToken(row.tokenSecond) || "—" }}</td>
                <td><span :class="['mkc-badge', row.status === false ? 'mkc-badge--danger' : 'mkc-badge--ok']">{{ statusLabel(row.status) }}</span></td>
              </tr>
              <tr v-if="!history.length">
                <td colspan="5" class="mkc-empty">No key-change tokens recorded for this meter yet.</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseInput from "./base/BaseInput.vue";
import BaseIconButton from "./base/BaseIconButton.vue";
import { postApi, liveWritesAllowed } from "../services/api.js";
import { userFacingError } from "../services/guarded-write.mjs";
import { toastSuccess, toastError } from "../services/toast.js";
import { getMeterTokenFormat, setMeterTokenFormat, getSgcTokenRule, setSgcTokenRule } from "../services/meter-token-format.mjs";
import {
  buildMeterKeyUpdatePayload,
  buildChangeMeterKeyTokenPayload,
  extractChangeMeterKeyTokens,
  meterPhaseFromRow
} from "../services/token-flow.mjs";
import {
  formatToken,
  remoteTokenTaskLookupPayload,
  remoteTaskConfirmPayload,
  remoteTokenStandbyConfirmPayload,
  remoteTokenTaskStatus,
  remoteTaskId,
  isRemoteTaskTerminalStatus,
  normalizeRemoteStatus
} from "../services/remote-task-flow.mjs";

function firstRow(response = {}) {
  const buckets = [
    response?.result?.data, response?.result?.records, response?.result?.list,
    response?.data?.data, response?.data?.records, response?.data?.list,
    response?.data, response?.result, response?.records, response?.rows
  ];
  for (const bucket of buckets) {
    if (Array.isArray(bucket) && bucket.length) return bucket;
  }
  return [];
}

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

export default {
  name: "MeterKeyChangePage",
  components: { BaseButton, BaseInput, BaseIconButton },
  props: {
    route: { type: Object, default: () => ({}) }
  },
  data() {
    return {
      meterIdInput: "",
      loadingLookup: false,
      lookupError: "",
      meter: null,
      keyForm: { sgcNew: "", krnNew: "", kenNew: "", tiNew: "", ktNew: "", baseYearNew: "" },
      loadingKeyUpdate: false,
      loadingGenerate: false,
      kct: { first: "", second: "" },
      loadingSend: false,
      sendStatus: "",
      sendStatusTone: "info",
      loadingHistory: false,
      history: [],
      formatChoice: "auto",
      formatRecord: null,
      savingFormat: false,
      sgcChoice: "auto",
      sgcRecord: null,
      savingSgc: false
    };
  },
  computed: {
    liveWrites() { return liveWritesAllowed(); },
    phaseDefaultFormat() {
      // What the current phase-derived guess would send.
      return this.meter?.isThreePhase ? "S2 (isS2 = true)" : "S1 (isS2 = false)";
    },
    effectiveFormat() {
      if (this.formatChoice === "s2") return "S2 (isS2 = true)";
      if (this.formatChoice === "s1") return "S1 (isS2 = false)";
      return `Auto → ${this.phaseDefaultFormat}`;
    },
    keyMismatch() {
      if (!this.meter) return false;
      const sgcDiff = this.meter.sgcNew && String(this.meter.sgc) !== String(this.meter.sgcNew);
      const krnDiff = this.meter.krnNew != null && String(this.meter.krn) !== String(this.meter.krnNew);
      return Boolean(sgcDiff || krnDiff);
    },
    canUpdateKey() {
      return Boolean(buildMeterKeyUpdatePayload({ meterId: this.meter?.meterId, ...this.keyForm }));
    }
  },
  methods: {
    formatToken,
    async lookupMeter() {
      const meterId = this.meterIdInput.trim();
      if (!meterId) return;
      this.loadingLookup = true;
      this.lookupError = "";
      this.meter = null;
      this.kct = { first: "", second: "" };
      this.sendStatus = "";
      try {
        const [accountRes, meterRes] = await Promise.allSettled([
          postApi("/api/account/read", { meterId, pageNumber: 1, pageSize: 50 }),
          postApi("/api/meter/read", { meterId, pageNumber: 1, pageSize: 50 })
        ]);
        const accountRow = accountRes.status === "fulfilled"
          ? firstRow(accountRes.value).find((row) => String(row.meterId || row.meter_id || "").trim() === meterId) || firstRow(accountRes.value)[0]
          : null;
        const meterRow = meterRes.status === "fulfilled"
          ? firstRow(meterRes.value).find((row) => String(row.meterId || row.meter_id || row.id || "").trim() === meterId) || firstRow(meterRes.value)[0]
          : null;

        if (!accountRow && !meterRow) {
          this.lookupError = `Meter ${meterId} was not found in the account or meter catalog.`;
          return;
        }
        const merged = { ...(meterRow || {}), ...(accountRow || {}) };
        this.meter = {
          meterId,
          customerName: merged.customerName || merged.customer_name || merged.name || "",
          customerId: merged.customerId || merged.customer_id || "",
          stationId: merged.stationId || merged.station_id || merged.SITE_ID || "",
          tariffId: merged.tariffId || merged.tariff_id || "",
          protocolVersion: merged.protocolVersion || merged.protocol_version || "2.2",
          isThreePhase: meterPhaseFromRow(merged) === "three-phase",
          sgc: merged.sgc, krn: merged.krn, kt: merged.kt,
          sgcNew: merged.sgcNew, krnNew: merged.krnNew, ktNew: merged.ktNew
        };
        // Prefill the new-key form from the meter's staged values where present.
        this.keyForm = {
          sgcNew: merged.sgcNew ?? merged.sgc ?? "",
          krnNew: num(merged.krnNew ?? merged.krn) ?? "",
          kenNew: num(merged.kenNew ?? merged.ken) ?? "",
          tiNew: num(merged.tiNew ?? merged.ti) ?? "",
          ktNew: num(merged.ktNew ?? merged.kt) ?? "",
          baseYearNew: num(merged.baseYearNew ?? merged.baseYear) ?? ""
        };
        const fmt = await getMeterTokenFormat(meterId);
        this.formatRecord = fmt;
        this.formatChoice = fmt && typeof fmt.isS2 === "boolean" ? (fmt.isS2 ? "s2" : "s1") : "auto";
        const sgcRule = this.meter.sgc ? await getSgcTokenRule(this.meter.sgc) : null;
        this.sgcRecord = sgcRule;
        this.sgcChoice = sgcRule && typeof sgcRule.isS2 === "boolean" ? (sgcRule.isS2 ? "s2" : "s1") : "auto";
        await this.loadHistory();
      } catch (error) {
        this.lookupError = userFacingError(error, "Meter lookup failed.");
      } finally {
        this.loadingLookup = false;
      }
    },
    async saveFormat() {
      if (!this.meter?.meterId) return;
      this.savingFormat = true;
      try {
        const isS2 = this.formatChoice === "s2" ? true : this.formatChoice === "s1" ? false : null;
        await setMeterTokenFormat(this.meter.meterId, isS2, "Set via Change Meter Key tool");
        this.formatRecord = await getMeterTokenFormat(this.meter.meterId);
        toastSuccess(isS2 === null
          ? "Token format reset to phase default for this meter."
          : `Token format pinned to ${isS2 ? "S2" : "S1"} for this meter.`);
      } catch (error) {
        toastError(userFacingError(error, "Could not save token format."));
      } finally {
        this.savingFormat = false;
      }
    },
    async saveSgcRule() {
      const sgc = String(this.meter?.sgc || "").trim();
      if (!sgc) { toastError("This meter has no SGC to rule on."); return; }
      this.savingSgc = true;
      try {
        const isS2 = this.sgcChoice === "s2" ? true : this.sgcChoice === "s1" ? false : null;
        await setSgcTokenRule(sgc, isS2, "Set via Change Meter Key tool");
        this.sgcRecord = await getSgcTokenRule(sgc);
        toastSuccess(isS2 === null
          ? `SGC ${sgc} rule cleared.`
          : `SGC ${sgc} pinned to ${isS2 ? "S2" : "S1"} — applies to every meter in this group.`);
      } catch (error) {
        toastError(userFacingError(error, "Could not save SGC rule."));
      } finally {
        this.savingSgc = false;
      }
    },
    async updateMeterKey() {
      const payload = buildMeterKeyUpdatePayload({ meterId: this.meter?.meterId, ...this.keyForm });
      if (!payload) { toastError("Provide all six new-key fields."); return; }
      this.loadingKeyUpdate = true;
      try {
        const res = await postApi("/api/token/meterKey/update", payload, {
          headers: { "X-Route-Hash": this.route?.hash || "" }
        });
        const code = Number(res?.code);
        if (Number.isFinite(code) && code !== 0 && code !== 200) {
          throw new Error(res?.reason || res?.msg || "Meter key update failed.");
        }
        toastSuccess("New key staged on the meter record.");
        await this.lookupMeter();
      } catch (error) {
        toastError(userFacingError(error, "Meter key update failed."));
      } finally {
        this.loadingKeyUpdate = false;
      }
    },
    async generateKct() {
      this.loadingGenerate = true;
      this.kct = { first: "", second: "" };
      this.sendStatus = "";
      try {
        const res = await postApi(
          "/api/token/changeMeterKeyToken/generate",
          buildChangeMeterKeyTokenPayload({ meterId: this.meter?.meterId }),
          { headers: { "X-Route-Hash": this.route?.hash || "" } }
        );
        const tokens = extractChangeMeterKeyTokens(res);
        if (tokens.length < 2) throw new Error(res?.reason || res?.msg || "Key-change tokens were not returned.");
        this.kct = { first: tokens[0], second: tokens[1] };
        toastSuccess("KCT pair generated.");
        await this.loadHistory();
      } catch (error) {
        toastError(userFacingError(error, "Could not generate the key-change token."));
      } finally {
        this.loadingGenerate = false;
      }
    },
    remoteTokenPayload(token, remark) {
      return {
        customerId: this.meter.customerId || this.meter.meterId,
        customerName: this.meter.customerName || "",
        meterId: this.meter.meterId,
        version: this.meter.protocolVersion || "2.2",
        flag: "A120",
        name: "Send Token",
        dataItem: "Send Token",
        dataDefault: "",
        dataPrefix: "",
        data: String(token || "").replace(/\s+/g, ""),
        stationId: this.meter.stationId || "",
        remark
      };
    },
    async sendOneToken(token, remark) {
      const payload = [this.remoteTokenPayload(token, remark)];
      const createRes = await postApi("/API/RemoteMeterTask/CreateTokenTask", payload, {
        headers: { "X-Route-Hash": this.route?.hash || "" }
      });
      let confirm = remoteTaskConfirmPayload(createRes);
      let taskId = Number(confirm[0]?.id);
      if (!confirm.length) {
        const lookup = await postApi("/API/RemoteMeterTask/GetTokenTask", remoteTokenTaskLookupPayload(payload[0]));
        confirm = remoteTokenStandbyConfirmPayload(lookup, payload[0]);
        taskId = Number(confirm[0]?.id);
      }
      if (!confirm.length) throw new Error("Token task created but no confirm id was returned.");
      const confirmRes = await postApi("/API/RemoteMeterTask/UpdateTokenTask", confirm, {
        headers: { "X-Route-Hash": this.route?.hash || "" }
      });
      const code = Number(confirmRes?.code);
      const reason = String(confirmRes?.reason || confirmRes?.msg || "").toLowerCase();
      if (Number.isFinite(code) && code !== 0 && code !== 200 && !(code === 99 && reason.includes("no data has been changed"))) {
        throw new Error(confirmRes?.reason || confirmRes?.msg || `Confirm failed with code ${code}`);
      }
      return this.pollDelivery({ ...payload[0], id: taskId });
    },
    async pollDelivery(form) {
      let latest = null;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        if (attempt) await new Promise((resolve) => setTimeout(resolve, 5000));
        const lookup = await postApi("/API/RemoteMeterTask/GetTokenTask", remoteTokenTaskLookupPayload(form));
        latest = remoteTokenTaskStatus(lookup, form);
        if (latest && isRemoteTaskTerminalStatus(latest.status)) return latest;
      }
      throw new Error("Remote send still pending after polling.");
    },
    async remoteSendKct() {
      if (!this.kct.first || !this.kct.second) return;
      this.loadingSend = true;
      this.sendStatus = "Sending KCT 1…";
      this.sendStatusTone = "info";
      try {
        const first = await this.sendOneToken(this.kct.first, "Key change token 1");
        if (String(normalizeRemoteStatus(first?.status)).toLowerCase() !== "success") {
          throw new Error(`KCT 1 not confirmed: ${first?.remark || normalizeRemoteStatus(first?.status)}`);
        }
        this.sendStatus = "Sending KCT 2…";
        const second = await this.sendOneToken(this.kct.second, "Key change token 2");
        if (String(normalizeRemoteStatus(second?.status)).toLowerCase() !== "success") {
          throw new Error(`KCT 2 not confirmed: ${second?.remark || normalizeRemoteStatus(second?.status)}`);
        }
        this.sendStatus = "Both key-change tokens delivered. The meter is re-keyed — vend a fresh credit token to confirm.";
        this.sendStatusTone = "ok";
        toastSuccess("KCT pair delivered to the meter.");
        await this.loadHistory();
      } catch (error) {
        this.sendStatus = userFacingError(error, "Remote send failed.");
        this.sendStatusTone = "error";
        toastError(this.sendStatus);
      } finally {
        this.loadingSend = false;
      }
    },
    async loadHistory() {
      if (!this.meter?.meterId) return;
      this.loadingHistory = true;
      try {
        const res = await postApi("/api/token/changeMeterKeyTokenRecord/read", {
          meterId: this.meter.meterId,
          pageNumber: 1,
          pageSize: 20,
          orderBy: "createDate desc"
        });
        this.history = firstRow(res);
      } catch {
        this.history = [];
      } finally {
        this.loadingHistory = false;
      }
    },
    async copy(token) {
      try { await navigator.clipboard.writeText(String(token || "").replace(/\s+/g, "")); toastSuccess("Token copied."); }
      catch { toastError("Copy failed — select the token manually."); }
    },
    statusLabel(status) {
      if (status === false) return "Failed";
      if (status === true) return "Success";
      return normalizeRemoteStatus(status) || "—";
    },
    fmtDate(value) {
      if (!value) return "—";
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString();
    }
  },
  // referenced to keep linter aware these helpers are intentionally available
  created() { void remoteTaskId; }
};
</script>

<style scoped>
.mkc { display: flex; flex-direction: column; gap: 16px; padding: 22px; max-width: 920px; }
.mkc-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.mkc-title { margin: 0 0 6px; font-size: var(--bev-font-size-3xl); color: var(--text-strong); }
.mkc-sub { margin: 0; max-width: 640px; color: var(--text-muted); font-size: var(--bev-font-size-md); line-height: 1.55; }
.mkc-write { font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
.mkc-write--on { background: var(--color-success-soft); color: var(--color-success); }
.mkc-write--off { background: var(--color-warning-soft); color: var(--color-warning); }

.mkc-card { border: 1px solid var(--border-color); border-radius: var(--radius-md); background: var(--bg-card); padding: 18px; box-shadow: var(--shadow-sm); }
.mkc-card-head { display: flex; align-items: center; gap: 10px; margin-bottom: 14px; font-size: var(--bev-font-size-lg); color: var(--text-strong); }
.mkc-step { width: 24px; height: 24px; flex-shrink: 0; display: grid; place-items: center; border-radius: 50%; background: var(--primary); color: var(--text-inverse); font-size: 12px; font-weight: 800; }
.mkc-step--alt { background: var(--color-info); border-radius: var(--radius-sm); }
.mkc-card--accent { border-color: color-mix(in srgb, var(--color-info) 40%, var(--border-color)); background: color-mix(in srgb, var(--color-info-soft) 40%, var(--bg-card)); }
.mkc-seg { display: flex; flex-wrap: wrap; gap: 8px; margin: 4px 0 14px; }

.mkc-lookup { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.mkc-meter-input { flex: 1; min-width: 220px; }

.mkc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-bottom: 16px; }
.mkc-field { display: flex; flex-direction: column; gap: 3px; }
.mkc-field span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; }
.mkc-field strong { color: var(--text-strong); }

.mkc-keys { display: flex; align-items: stretch; gap: 16px; padding: 14px; border: 1px dashed var(--border-color); border-radius: var(--radius-sm); background: color-mix(in srgb, var(--primary-light) 30%, transparent); }
.mkc-key-col { flex: 1; }
.mkc-key-col h4 { margin: 0 0 8px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); }
.mkc-key-row { display: flex; justify-content: space-between; gap: 12px; padding: 3px 0; font-size: var(--bev-font-size-md); }
.mkc-key-row span { color: var(--text-muted); }
.mkc-key-arrow { display: grid; place-items: center; color: var(--text-muted); font-size: 20px; }

.mkc-keyform { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-bottom: 14px; }
.mkc-input { display: flex; flex-direction: column; gap: 4px; }
.mkc-input span { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); font-weight: 700; }

.mkc-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.mkc-hint { margin: 0 0 12px; color: var(--text-muted); font-size: var(--bev-font-size-sm); }

.mkc-tokens { display: flex; flex-direction: column; gap: 10px; margin-top: 14px; }
.mkc-token { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: 1px solid var(--border-color); border-radius: var(--radius-sm); background: var(--color-surface-page); }
.mkc-token-label { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--primary); min-width: 48px; }
.mkc-token-value { flex: 1; font-family: var(--font-mono); font-size: var(--bev-font-size-xl); letter-spacing: 0.08em; color: var(--text-strong); }

.mkc-send-status { font-size: var(--bev-font-size-sm); font-weight: 600; }
.mkc-send-status--info { color: var(--text-muted); }
.mkc-send-status--ok { color: var(--color-success); }
.mkc-send-status--error { color: var(--color-danger); }

.mkc-badge { font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 999px; }
.mkc-badge--info { background: var(--color-info-soft); color: var(--color-info); }
.mkc-badge--neutral { background: var(--color-neutral-soft); color: var(--color-neutral); }
.mkc-badge--ok { background: var(--color-success-soft); color: var(--color-success); }
.mkc-badge--danger { background: var(--color-danger-soft); color: var(--color-danger); }

.mkc-alert { margin: 14px 0 0; padding: 10px 12px; border-radius: var(--radius-sm); font-size: var(--bev-font-size-sm); }
.mkc-alert--warn { background: var(--color-warning-soft); color: var(--color-warning); }
.mkc-alert--ok { background: var(--color-success-soft); color: var(--color-success); }
.mkc-alert--error { background: var(--color-danger-soft); color: var(--color-danger); }

.mkc-pair { display: flex; flex-direction: column; gap: 16px; }
@media (min-width: 768px) { .mkc-pair { flex-direction: row; align-items: flex-start; } .mkc-pair > .mkc-card { flex: 1; } }

.mkc-table-wrap { overflow-x: auto; }
.mkc-table { width: 100%; border-collapse: collapse; font-size: var(--bev-font-size-sm); }
.mkc-table th { text-align: left; padding: 8px 10px; color: var(--text-muted); font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; border-bottom: 1px solid var(--border-color); }
.mkc-table td { padding: 9px 10px; border-bottom: 1px solid color-mix(in srgb, var(--border-color) 70%, transparent); color: var(--text-main); }
.mkc-empty { text-align: center; color: var(--text-muted); padding: 18px; }
.mkc-mono { font-family: var(--font-mono); }
</style>
