<template>
  <div class="automation-page">
    <BasePageHeader
      title="Automation Command Center"
      description="Wire alert webhooks, runtime remediation, and live automation visibility."
    >
      <template #actions>
        <div class="automation-actions">
          <BaseButton variant="ghost" :disabled="loading" @click="refreshData">Refresh</BaseButton>
          <BaseButton variant="ghost" :disabled="saving" @click="sendTestAlert">Send Test Alert</BaseButton>
          <BaseButton variant="primary" :disabled="saving" @click="saveControl">{{ saving ? "Saving..." : "Save Control" }}</BaseButton>
        </div>
      </template>
    </BasePageHeader>

    <div class="automation-summary-grid">
      <BaseCard v-for="card in summaryCards" :key="card.label" tone="glass" class="automation-summary-card">
        <div class="automation-summary-label">{{ card.label }}</div>
        <div class="automation-summary-value">{{ card.value }}</div>
        <div class="automation-summary-meta">{{ card.meta }}</div>
      </BaseCard>
    </div>

    <div class="automation-layout">
      <BaseCard class="automation-panel" tone="glass">
        <div class="automation-panel-head">
          <div>
            <h2>Alert Webhooks</h2>
            <p>Post incidents to external responders.</p>
          </div>
          <BaseButton variant="ghost" @click="addWebhook">Add Webhook</BaseButton>
        </div>
        <div v-if="form.webhooks.length" class="automation-stack">
          <div v-for="(hook, index) in form.webhooks" :key="hook.id" class="webhook-card">
            <div class="webhook-card-head">
              <strong>{{ hook.name || `Webhook ${index + 1}` }}</strong>
              <BaseButton variant="ghost" @click="removeWebhook(index)">Remove</BaseButton>
            </div>
            <div class="automation-form-grid">
              <label class="automation-field">
                <span>Name</span>
                <BaseInput v-model="hook.name" placeholder="Ops Pager" />
              </label>
              <label class="automation-field">
                <span>URL</span>
                <BaseInput v-model="hook.url" placeholder="https://example.com/webhook" />
              </label>
              <label class="automation-field">
                <span>Secret</span>
                <div class="automation-secret-row">
                  <BaseInput :type="revealedSecrets[hook.id] ? 'text' : 'password'" v-model="hook.secret" placeholder="Optional shared secret" />
                  <BaseButton variant="ghost" @click="toggleSecret(hook.id)">{{ revealedSecrets[hook.id] ? "Hide" : "Show" }}</BaseButton>
                </div>
                <small class="automation-secret-meta">{{ maskSecret(hook.secret) }}</small>
              </label>
              <label class="automation-field automation-field-inline">
                <span>Enabled</span>
                <BaseToggle v-model="hook.enabled" />
              </label>
            </div>
            <div class="automation-event-pills">
              <BaseCheckbox v-for="eventName in eventOptions" :key="eventName" :value="hook.events.includes(eventName)" @input="toggleHookEvent(hook, eventName, $event)">
                {{ eventName }}
              </BaseCheckbox>
            </div>
          </div>
        </div>
        <div v-else class="automation-empty">No webhooks configured yet.</div>
      </BaseCard>

      <BaseCard class="automation-panel" tone="glass">
        <div class="automation-panel-head">
          <div>
            <h2>Auto-Remediation</h2>
            <p>Apply safe runtime recovery hooks.</p>
          </div>
        </div>
        <div class="automation-remediation-list">
          <div class="automation-policy-grid">
            <label class="automation-field">
              <span>Retry Count</span>
              <BaseInput v-model.number="form.deliveryPolicy.retryCount" type="number" min="0" max="5" />
            </label>
            <label class="automation-field">
              <span>Retry Delay Ms</span>
              <BaseInput v-model.number="form.deliveryPolicy.retryDelayMs" type="number" min="0" max="10000" />
            </label>
          </div>
          <label class="automation-switch">
            <div>
              <strong>Retry failed refresh once</strong>
              <span>Re-run a failed refresh target before incident closeout.</span>
            </div>
            <BaseToggle v-model="form.remediation.retryFailedRefreshOnce" />
          </label>
          <label class="automation-switch">
            <div>
              <strong>Capture incident artifact</strong>
              <span>Persist incident payloads into the automation incident ledger.</span>
            </div>
            <BaseToggle v-model="form.remediation.captureIncidentArtifact" />
          </label>
          <label class="automation-switch">
            <div>
              <strong>Force write guard on auth failure</strong>
              <span>Drop `ALLOW_LIVE_WRITES` to `false` after live auth failure.</span>
            </div>
            <BaseToggle v-model="form.remediation.forceWriteGuardOnAuthFailure" />
          </label>
          <label class="automation-switch">
            <div>
              <strong>Run hot refresh on smoke failure</strong>
              <span>Kick a hot refresh cycle after failed smoke telemetry lands.</span>
            </div>
            <BaseToggle v-model="form.remediation.runHotRefreshOnSmokeFailure" />
          </label>
        </div>
      </BaseCard>

      <BaseCard class="automation-panel automation-panel-wide" tone="glass">
        <div class="automation-panel-head">
          <div>
            <h2>Lane Readout</h2>
            <p>Current automation footprint by operational lane.</p>
          </div>
        </div>
        <div class="lane-grid">
          <section v-for="lane in lanes" :key="lane.lane" class="lane-card">
            <div class="lane-title">{{ lane.lane }}</div>
            <div class="lane-list">
              <article v-for="entry in lane.entries" :key="entry.key" class="lane-entry">
                <div>
                  <strong>{{ entry.title }}</strong>
                  <span>{{ entry.notes }}</span>
                </div>
                <span class="lane-badge" :class="entry.status">{{ entry.status }}</span>
              </article>
            </div>
          </section>
        </div>
      </BaseCard>

      <BaseCard class="automation-panel automation-panel-wide" tone="glass">
        <div class="automation-panel-head">
          <div>
            <h2>Webhook Delivery History</h2>
            <p>Latest delivery attempts across all incident alerts.</p>
          </div>
        </div>
        <div v-if="deliveryHistory.length" class="delivery-table-wrap">
          <table class="delivery-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Incident</th>
                <th>Webhook</th>
                <th>Status</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="entry in deliveryHistory" :key="entry.id">
                <td>{{ formatTime(entry.createdAt) }}</td>
                <td>{{ entry.incidentKind }}</td>
                <td>{{ entry.webhookName }}</td>
                <td>{{ entry.status || "-" }}</td>
                <td>
                  <span class="lane-badge" :class="entry.ok ? 'ready' : 'error'">{{ entry.ok ? "delivered" : "failed" }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else class="automation-empty">No deliveries logged yet.</div>
      </BaseCard>

      <BaseCard class="automation-panel automation-panel-wide" tone="glass">
        <div class="automation-panel-head">
          <div>
            <h2>Incident Feed</h2>
            <p>Latest automation alerts and remediation outcomes.</p>
          </div>
        </div>
        <div v-if="incidents.length" class="incident-list">
          <article v-for="incident in incidents" :key="incident.id" class="incident-card">
            <div class="incident-topline">
              <strong>{{ incident.title }}</strong>
              <span class="lane-badge" :class="incident.severity">{{ incident.severity }}</span>
            </div>
            <p>{{ incident.message }}</p>
            <div class="incident-meta">{{ incident.kind }} - {{ formatTime(incident.createdAt) }}</div>
            <div v-if="incident.remediation && incident.remediation.length" class="incident-strip">
              <span v-for="action in incident.remediation" :key="action.type">{{ action.type }}</span>
            </div>
          </article>
        </div>
        <div v-else class="automation-empty">No incidents recorded yet.</div>
      </BaseCard>
    </div>
  </div>
</template>

<script>
import BaseButton from "./base/BaseButton.vue";
import BaseCard from "./base/BaseCard.vue";
import BaseCheckbox from "./base/BaseCheckbox.vue";
import BaseInput from "./base/BaseInput.vue";
import BasePageHeader from "./base/BasePageHeader.vue";
import BaseToggle from "./base/BaseToggle.vue";
import { getApi, postApi } from "../services/api.js";

function emptyWebhook() {
  return {
    id: `hook-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: "",
    url: "",
    secret: "",
    enabled: true,
    events: ["refresh-failure", "live-auth-failure"]
  };
}

export default {
  name: "AutomationCommandPage",
  components: {
    BaseButton,
    BaseCard,
    BaseCheckbox,
    BaseInput,
    BasePageHeader,
    BaseToggle
  },
  data() {
    return {
      loading: false,
      saving: false,
      report: null,
      control: null,
      revealedSecrets: {},
      form: {
        webhooks: [],
        remediation: {
          retryFailedRefreshOnce: true,
          captureIncidentArtifact: true,
          forceWriteGuardOnAuthFailure: true,
          runHotRefreshOnSmokeFailure: true
        },
        deliveryPolicy: {
          retryCount: 2,
          retryDelayMs: 400
        }
      },
      eventOptions: ["refresh-failure", "live-auth-failure", "manual-test", "smoke-failure"]
    };
  },
  computed: {
    summaryCards() {
      const summary = this.report?.summary || {};
      return [
        { label: "Automations", value: summary.total || 0, meta: `${summary.ready || 0} ready` },
        { label: "Webhooks", value: this.form.webhooks.filter((hook) => hook.enabled && hook.url).length, meta: "active endpoints" },
        { label: "Deliveries", value: this.deliveryHistory.length, meta: "webhook attempts" },
        { label: "Retries", value: this.form.deliveryPolicy.retryCount, meta: `${this.form.deliveryPolicy.retryDelayMs} ms delay` }
      ];
    },
    lanes() {
      return this.report?.lanes || [];
    },
    incidents() {
      return this.control?.incidents || [];
    },
    deliveryHistory() {
      return this.control?.deliveryHistory || [];
    }
  },
  created() {
    this.refreshData();
  },
  methods: {
    async refreshData() {
      this.loading = true;
      const [reportResponse, controlResponse] = await Promise.all([
        getApi("/api/system/automation-report"),
        getApi("/api/system/automation-control")
      ]);
      this.report = reportResponse.data || {};
      this.control = controlResponse.data || {};
      this.form = {
        webhooks: Array.isArray(this.control.webhooks)
          ? this.control.webhooks.map((hook) => ({
            ...hook,
            events: Array.isArray(hook.events) ? [...hook.events] : []
          }))
          : [],
        remediation: {
          retryFailedRefreshOnce: this.control?.remediation?.retryFailedRefreshOnce !== false,
          captureIncidentArtifact: this.control?.remediation?.captureIncidentArtifact !== false,
          forceWriteGuardOnAuthFailure: this.control?.remediation?.forceWriteGuardOnAuthFailure !== false,
          runHotRefreshOnSmokeFailure: this.control?.remediation?.runHotRefreshOnSmokeFailure !== false
        },
        deliveryPolicy: {
          retryCount: Number(this.control?.deliveryPolicy?.retryCount ?? 2),
          retryDelayMs: Number(this.control?.deliveryPolicy?.retryDelayMs ?? 400)
        }
      };
      this.loading = false;
    },
    addWebhook() {
      this.form.webhooks.push(emptyWebhook());
    },
    removeWebhook(index) {
      this.form.webhooks.splice(index, 1);
    },
    toggleSecret(id) {
      this.$set(this.revealedSecrets, id, !this.revealedSecrets[id]);
    },
    toggleHookEvent(hook, eventName, enabled) {
      const next = new Set(hook.events || []);
      if (enabled) next.add(eventName);
      else next.delete(eventName);
      hook.events = Array.from(next);
    },
    async saveControl() {
      this.saving = true;
      await postApi("/api/system/automation-control", {
        webhooks: this.form.webhooks,
        remediation: this.form.remediation,
        deliveryPolicy: this.form.deliveryPolicy
      });
      await this.refreshData();
      this.saving = false;
    },
    async sendTestAlert() {
      this.saving = true;
      await postApi("/api/system/automation-hooks/test", {
        kind: "manual-test",
        title: "Manual test alert",
        message: "Automation Command Center test dispatch"
      });
      await this.refreshData();
      this.saving = false;
    },
    formatTime(value) {
      if (!value) return "Unknown";
      return new Date(value).toLocaleString();
    },
    maskSecret(value) {
      const text = String(value || "");
      if (!text) return "No secret set";
      if (text.length <= 4) return "*".repeat(text.length);
      return `${"*".repeat(Math.max(4, text.length - 4))}${text.slice(-4)}`;
    }
  }
};
</script>

<style scoped>
.automation-page {
  display: grid;
  gap: 18px;
}

.automation-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.automation-summary-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.automation-summary-card {
  padding: 18px;
}

.automation-summary-label {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.automation-summary-value {
  margin-top: 10px;
  color: var(--text-strong);
  font-size: 32px;
  font-weight: 800;
  line-height: 1;
}

.automation-summary-meta {
  margin-top: 10px;
  color: var(--text-muted);
  font-size: 12px;
}

.automation-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, .9fr);
  gap: 16px;
}

.automation-panel {
  padding: 20px;
}

.automation-panel-wide {
  grid-column: 1 / -1;
}

.automation-panel-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 18px;
}

.automation-panel-head h2 {
  margin: 0;
  color: var(--text-strong);
  font-size: 18px;
}

.automation-panel-head p {
  margin: 6px 0 0;
  color: var(--text-muted);
  font-size: 13px;
}

.automation-stack,
.incident-list,
.lane-grid {
  display: grid;
  gap: 14px;
}

.webhook-card,
.lane-card,
.incident-card {
  padding: 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
}

.webhook-card-head,
.incident-topline {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 14px;
}

.automation-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.automation-field {
  display: grid;
  gap: 8px;
}

.automation-field span {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.automation-field-inline {
  align-items: end;
}

.automation-event-pills {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  margin-top: 14px;
}

.automation-secret-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 8px;
}

.automation-secret-meta {
  color: var(--text-muted);
  font-size: 11px;
}

.automation-remediation-list {
  display: grid;
  gap: 14px;
}

.automation-policy-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.automation-switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 14px 16px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--bg-card) 88%, transparent);
}

.automation-switch strong,
.lane-entry strong {
  display: block;
  color: var(--text-strong);
  font-size: 14px;
}

.automation-switch span,
.lane-entry span,
.incident-card p,
.incident-meta {
  color: var(--text-muted);
  font-size: 12px;
}

.lane-list {
  display: grid;
  gap: 10px;
  margin-top: 12px;
}

.lane-title {
  color: var(--text-strong);
  font-size: 15px;
  font-weight: 800;
}

.lane-entry {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.lane-badge {
  padding: 4px 8px;
  border-radius: 999px;
  font-size: 10px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: .08em;
}

.lane-badge.ready,
.lane-badge.info {
  background: var(--success-bg);
  color: var(--success);
}

.lane-badge.conditional,
.lane-badge.warning {
  background: var(--warning-bg);
  color: var(--warning);
}

.lane-badge.missing,
.lane-badge.error {
  background: var(--danger-bg);
  color: var(--danger);
}

.incident-card p {
  margin: 10px 0 6px;
}

.incident-strip {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  margin-top: 10px;
}

.incident-strip span {
  padding: 4px 8px;
  border-radius: 999px;
  background: var(--primary-light);
  color: var(--primary);
  font-size: 11px;
  font-weight: 700;
}

.delivery-table-wrap {
  overflow-x: auto;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-lg);
}

.delivery-table {
  width: 100%;
  border-collapse: collapse;
  min-width: 680px;
}

.delivery-table th,
.delivery-table td {
  padding: 12px 14px;
  border-bottom: 1px solid var(--border-color);
  text-align: left;
  font-size: 12px;
}

.delivery-table th {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: .08em;
  text-transform: uppercase;
}

.automation-empty {
  padding: 20px;
  border: 1px dashed var(--border-color);
  border-radius: var(--radius-lg);
  color: var(--text-muted);
  text-align: center;
}

.automation-page :deep(.base-input),
.automation-page :deep(.base-select) {
  background: var(--bg-card);
  color: var(--text-main);
}

.automation-page :deep(.base-input:focus),
.automation-page :deep(.base-select:focus) {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-light);
}

@media (max-width: 1100px) {
  .automation-summary-grid,
  .automation-layout,
  .automation-form-grid,
  .automation-policy-grid {
    grid-template-columns: 1fr 1fr;
  }
}

@media (max-width: 760px) {
  .automation-summary-grid,
  .automation-layout,
  .automation-form-grid,
  .automation-policy-grid {
    grid-template-columns: 1fr;
  }

  .automation-panel-head,
  .automation-switch,
  .lane-entry,
  .incident-topline {
    align-items: flex-start;
    flex-direction: column;
  }
}
</style>
