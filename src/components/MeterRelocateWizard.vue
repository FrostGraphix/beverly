<template>
  <BaseModalShell tag="form" class="modal modal-meter-relocate" @submit.prevent="handleSubmit">
    <template #header>
      <div class="modal-header">
        <div class="modal-header-left">
          <div class="modal-action-badge badge-primary">
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71z" />
            </svg>
          </div>
          <h2 class="modal-title">{{ isBatch ? `Relocate ${targetMeters.length} Meters` : `Relocate Meter ${singleMeterId}` }}</h2>
        </div>
        <BaseIconButton class="modal-close" aria-label="Close" :disabled="executing" @click="$emit('close')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </BaseIconButton>
      </div>
    </template>

    <!-- Wizard Stepper -->
    <div v-if="step < 5" class="relocate-stepper">
      <div class="relocate-step" :class="{ active: step === 1, done: step > 1 }">
        <div class="relocate-step-dot"><span v-if="step > 1">&#10003;</span><span v-else>1</span></div>
        <span>Target Station</span>
      </div>
      <div class="relocate-step-line" :class="{ done: step > 1 }"></div>
      <div class="relocate-step" :class="{ active: step === 2, done: step > 2 }">
        <div class="relocate-step-dot"><span v-if="step > 2">&#10003;</span><span v-else>2</span></div>
        <span>Customer Details</span>
      </div>
      <div class="relocate-step-line" :class="{ done: step > 2 }"></div>
      <div class="relocate-step" :class="{ active: step === 3, done: step > 3 }">
        <div class="relocate-step-dot"><span v-if="step > 3">&#10003;</span><span v-else>3</span></div>
        <span>Review & Safety</span>
      </div>
      <div class="relocate-step-line" :class="{ done: step > 3 }"></div>
      <div class="relocate-step" :class="{ active: step === 4 }">
        <div class="relocate-step-dot">4</div>
        <span>Execute</span>
      </div>
    </div>

    <div class="modal-body">
      <!-- Step 1: Target Station Selection -->
      <div v-if="step === 1" class="step-content">
        <div class="relocate-summary-box">
          <strong>Selected Meter(s):</strong>
          <div class="meter-tags">
            <span v-for="m in targetMeters.slice(0, 10)" :key="m.meterId" class="meter-pill">
              {{ m.meterId }} <small>({{ m.stationId || 'No station' }})</small>
            </span>
            <span v-if="targetMeters.length > 10" class="meter-pill-more">+{{ targetMeters.length - 10 }} more</span>
          </div>
        </div>

        <div class="modal-grid">
          <div class="modal-field modal-field-full">
            <span class="modal-field-label">
              <em class="req-star">*</em>Destination Station
            </span>
            <BaseSelect v-model="targetStation" name="targetStation" aria-label="Destination Station">
              <option value="">-- Select Destination Station --</option>
              <option v-for="s in stations" :key="s.value" :value="s.value">{{ s.label }}</option>
            </BaseSelect>
          </div>
        </div>
      </div>

      <!-- Step 2: Customer & Pole Details (Optional) -->
      <div v-if="step === 2" class="step-content">
        <p class="step-hint">
          Optionally provide or update customer contact info, phone number, and pole ID under the new station.
        </p>
        <div v-if="!isBatch" class="modal-grid">
          <div class="modal-field">
            <span class="modal-field-label">Customer Name</span>
            <BaseInput v-model="customerName" name="customerName" placeholder="e.g. Elias Nebeani" />
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Phone Number</span>
            <BaseInput v-model="phone" name="phone" placeholder="e.g. 07085558195" />
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Pole Number</span>
            <BaseInput v-model="pole" name="pole" placeholder="e.g. 56 or P_056" />
          </div>
          <div class="modal-field">
            <span class="modal-field-label">Tariff Plan</span>
            <BaseSelect v-model="tariffId" name="tariffId">
              <option value="123">Standard (123)</option>
              <option value="RESIDENTIAL">RESIDENTIAL</option>
              <option value="COMMERCIAL">COMMERCIAL</option>
              <option value="PRODUCTIVE">PRODUCTIVE</option>
            </BaseSelect>
          </div>
        </div>
        <div v-else class="batch-notice-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
          <div>
            <strong>Batch Relocation Mode ({{ targetMeters.length }} meters)</strong>
            <p>Each meter will be moved to <strong>{{ targetStation }}</strong> preserving its existing customer profile and hardware STS keys.</p>
          </div>
        </div>
      </div>

      <!-- Step 3: Review & Safety Checklist -->
      <div v-if="step === 3" class="step-content">
        <div class="safety-card">
          <div class="safety-card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
            <span>Safety & STS Preservation Guarantee</span>
          </div>
          <ul class="safety-list">
            <li>
              <span class="check-icon">&#10003;</span>
              <span><strong>STS Encryption Keys Preserved</strong>: SGC, KRN, KEN, TI, KT, base year, and phase settings remain 100% intact.</span>
            </li>
            <li>
              <span class="check-icon">&#10003;</span>
              <span><strong>Atomic Operator Switch</strong>: Unregisters from origin station scope and registers into <strong>{{ targetStation }}</strong>.</span>
            </li>
            <li>
              <span class="check-icon">&#10003;</span>
              <span><strong>Live Upstream Verification</strong>: Confirms live Calinmeter readback before finalizing CRM database synchronization.</span>
            </li>
          </ul>
        </div>

        <div class="review-table-wrap">
          <table class="review-table">
            <thead>
              <tr>
                <th>Meter ID</th>
                <th>Current Station</th>
                <th>Target Station</th>
                <th v-if="phone || customerName">Contact</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="m in targetMeters.slice(0, 5)" :key="m.meterId">
                <td><strong>{{ m.meterId }}</strong></td>
                <td>{{ m.stationId || '0001' }}</td>
                <td><span class="target-badge">{{ targetStation }}</span></td>
                <td v-if="phone || customerName">{{ customerName || '-' }} ({{ phone || '-' }})</td>
              </tr>
            </tbody>
          </table>
          <div v-if="targetMeters.length > 5" class="review-more-note">
            +{{ targetMeters.length - 5 }} additional meters included in this relocation.
          </div>
        </div>
      </div>

      <!-- Step 4: Live Execution Progress -->
      <div v-if="step === 4" class="step-content">
        <div class="exec-progress-box">
          <div class="spinner-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
          </div>
          <div class="exec-status-title">Relocating Meters...</div>
          <p class="exec-status-msg">{{ progressMessage }}</p>
          <div class="progress-bar-wrap">
            <div class="progress-bar-inner" :style="{ width: `${progressPercent}%` }"></div>
          </div>
        </div>
      </div>

      <!-- Step 5: Completion & Status Summary -->
      <div v-if="step === 5" class="step-content">
        <div class="success-banner" :class="{ 'has-warnings': executionResult && executionResult.failed > 0 }">
          <div class="success-icon">
            <span v-if="executionResult && executionResult.failed === 0">&#10003;</span>
            <span v-else>!</span>
          </div>
          <div>
            <h3>{{ executionResult && executionResult.failed === 0 ? 'Relocation Completed Successfully' : 'Relocation Completed with Warnings' }}</h3>
            <p>{{ executionResult?.reason || 'All meters have been safely relocated and verified upstream.' }}</p>
          </div>
        </div>

        <div class="review-table-wrap">
          <table class="review-table">
            <thead>
              <tr>
                <th>Meter ID</th>
                <th>Previous Station</th>
                <th>New Station</th>
                <th>Verification</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="res in (executionResult?.results || [])" :key="res.meterId">
                <td><strong>{{ res.meterId }}</strong></td>
                <td>{{ res.fromStation || '-' }}</td>
                <td><span class="target-badge">{{ res.toStation || targetStation }}</span></td>
                <td>
                  <span v-if="res.ok" class="status-pill status-pill-success">&#10003; Verified</span>
                  <span v-else class="status-pill status-pill-danger">{{ res.error || 'Failed' }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div v-if="errorMessage" class="modal-error">{{ errorMessage }}</div>
    </div>

    <template #footer>
      <div class="modal-actions">
        <template v-if="step === 1">
          <BaseButton variant="secondary" :disabled="executing" @click="$emit('close')">Cancel</BaseButton>
          <BaseButton variant="primary" :disabled="!targetStation" @click="goToStep(2)">Next: Customer Details &rarr;</BaseButton>
        </template>
        <template v-else-if="step === 2">
          <BaseButton variant="secondary" :disabled="executing" @click="goToStep(1)">&larr; Back</BaseButton>
          <BaseButton variant="primary" @click="goToStep(3)">Next: Review &amp; Safety &rarr;</BaseButton>
        </template>
        <template v-else-if="step === 3">
          <BaseButton variant="secondary" :disabled="executing" @click="goToStep(2)">&larr; Back</BaseButton>
          <BaseButton variant="primary" :loading="executing" @click="runRelocation">Confirm &amp; Relocate Now</BaseButton>
        </template>
        <template v-else-if="step === 5">
          <BaseButton variant="primary" @click="finish">Done &amp; Refresh</BaseButton>
        </template>
      </div>
    </template>
  </BaseModalShell>
</template>

<script>
import BaseModalShell from './base/BaseModalShell.vue';
import BaseButton from './base/BaseButton.vue';
import BaseInput from './base/BaseInput.vue';
import BaseSelect from './base/BaseSelect.vue';
import BaseIconButton from './base/BaseIconButton.vue';
import { executeMeterRelocation, validateRelocationForm } from '../services/meter-relocation-flow.mjs';
import { loadDynamicStationOptions, tableSiteOptions } from '../services/table-service';
import { postApi } from '../services/api.js';

export default {
  name: 'MeterRelocateWizard',
  components: { BaseModalShell, BaseButton, BaseInput, BaseSelect, BaseIconButton },
  props: {
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ['close', 'done'],
  data() {
    return {
      step: 1,
      targetStation: '',
      customerName: this.row?.customerName || this.row?.customer_name || '',
      phone: this.row?.phone || '',
      pole: this.row?.certifiNo || this.row?.pole || '',
      tariffId: this.row?.tariffId || '123',
      stations: [],
      executing: false,
      progressMessage: 'Preparing relocation...',
      progressPercent: 10,
      executionResult: null,
      errorMessage: ''
    };
  },
  computed: {
    targetMeters() {
      if (this.rows && this.rows.length > 0) {
        return this.rows.map(r => ({
          meterId: String(r.meterId || r.meter_sn || r.id || '').trim(),
          stationId: String(r.stationId || '').trim(),
          ...r
        })).filter(r => r.meterId);
      }
      const singleId = String(this.row?.meterId || this.row?.meter_sn || this.row?.id || '').trim();
      if (singleId) {
        return [{
          meterId: singleId,
          stationId: String(this.row?.stationId || '').trim(),
          ...this.row
        }];
      }
      return [];
    },
    isBatch() {
      return this.targetMeters.length > 1;
    },
    singleMeterId() {
      return this.targetMeters[0]?.meterId || '';
    }
  },
  async mounted() {
    this.loadStations();
  },
  methods: {
    async loadStations() {
      try {
        await loadDynamicStationOptions();
        this.stations = tableSiteOptions.filter(o => o.value && o.value !== '' && o.value.toLowerCase() !== 'admin');
        if (!this.stations || this.stations.length === 0) {
          // Fallback direct query to /api/station/read
          const res = await postApi('/api/station/read', { pageNumber: 1, pageSize: 200 });
          const rows = res?.result?.data || res?.data?.data || res?.data || [];
          if (Array.isArray(rows)) {
            this.stations = rows.map(s => {
              const val = String(s.stationId || s.id || s.name || '').trim();
              const name = String(s.stationName || s.name || val).trim();
              return { value: val, label: name !== val ? `${name} (${val})` : val };
            }).filter(s => s.value && s.value.toLowerCase() !== 'admin');
          }
        }
      } catch (err) {
        console.warn('Failed to load stations:', err);
        if (tableSiteOptions && tableSiteOptions.length > 1) {
          this.stations = tableSiteOptions.filter(o => o.value && o.value !== '' && o.value.toLowerCase() !== 'admin');
        }
      }
    },
    goToStep(target) {
      this.errorMessage = '';
      if (target === 2) {
        const errors = validateRelocationForm(this.targetStation, this.targetMeters);
        if (errors.length > 0) {
          this.errorMessage = errors.join(' ');
          return;
        }
      }
      this.step = target;
    },
    handleSubmit() {
      if (this.step < 3) {
        this.goToStep(this.step + 1);
      } else if (this.step === 3) {
        this.runRelocation();
      }
    },
    async runRelocation() {
      this.executing = true;
      this.step = 4;
      this.errorMessage = '';
      this.progressPercent = 20;

      try {
        const result = await executeMeterRelocation(
          {
            meters: this.targetMeters,
            targetStation: this.targetStation,
            customerName: this.customerName,
            phone: this.phone,
            pole: this.pole,
            tariffId: this.tariffId,
            options: {
              updateCustomer: Boolean(this.customerName || this.phone || this.pole)
            }
          },
          { postApi },
          (progress) => {
            this.progressMessage = progress.message;
            this.progressPercent = Math.min(95, Math.round((progress.step / progress.totalSteps) * 100));
          }
        );

        this.progressPercent = 100;
        this.executionResult = result;
        this.step = 5;
      } catch (err) {
        this.errorMessage = err.message || 'An unexpected error occurred during relocation.';
        this.step = 3;
      } finally {
        this.executing = false;
      }
    },
    finish() {
      this.$emit('done', {
        action: 'Move Station',
        success: true,
        result: this.executionResult
      });
      this.$emit('close');
    }
  }
};
</script>

<style scoped>
.modal-meter-relocate {
  max-width: 640px;
  width: 95vw;
}

.relocate-stepper {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem 0.5rem;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
}

.relocate-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-muted, #94a3b8);
}

.relocate-step.active {
  color: var(--primary, #2563eb);
}

.relocate-step.done {
  color: var(--success, #16a34a);
}

.relocate-step-dot {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-muted, #f1f5f9);
  color: var(--text-muted, #64748b);
  font-size: 0.75rem;
  font-weight: 700;
  border: 2px solid transparent;
}

.relocate-step.active .relocate-step-dot {
  background: var(--primary, #2563eb);
  color: #fff;
  border-color: var(--primary-light, #93c5fd);
}

.relocate-step.done .relocate-step-dot {
  background: var(--success, #16a34a);
  color: #fff;
}

.relocate-step-line {
  flex: 1;
  height: 2px;
  background: var(--border-color, #e2e8f0);
  margin: 0 0.5rem 1rem;
}

.relocate-step-line.done {
  background: var(--success, #16a34a);
}

.step-content {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.relocate-summary-box {
  background: var(--bg-surface, #f8fafc);
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  padding: 0.875rem;
}

.meter-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
  margin-top: 0.5rem;
}

.meter-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: var(--bg-card, #ffffff);
  border: 1px solid var(--border-color, #cbd5e1);
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  font-family: monospace;
  font-size: 0.8125rem;
  font-weight: 600;
}

.meter-pill small {
  color: var(--text-muted, #64748b);
  font-size: 0.75rem;
}

.step-hint {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0;
}

.batch-notice-box {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 1rem;
  color: #1e40af;
}

.batch-notice-box svg {
  width: 24px;
  height: 24px;
  flex-shrink: 0;
}

.batch-notice-box p {
  margin: 0.25rem 0 0;
  font-size: 0.875rem;
}

.safety-card {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 1rem;
}

.safety-card-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-weight: 700;
  color: #15803d;
  margin-bottom: 0.5rem;
}

.safety-card-title svg {
  width: 18px;
  height: 18px;
}

.safety-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  font-size: 0.8125rem;
  color: #166534;
}

.safety-list li {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}

.check-icon {
  font-weight: 900;
  color: #16a34a;
}

.review-table-wrap {
  border: 1px solid var(--border-color, #e2e8f0);
  border-radius: 8px;
  overflow: hidden;
}

.review-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.8125rem;
}

.review-table th {
  background: var(--bg-surface, #f8fafc);
  padding: 0.5rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid var(--border-color, #e2e8f0);
  font-weight: 600;
}

.review-table td {
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--border-color, #f1f5f9);
}

.target-badge {
  background: #dbeafe;
  color: #1d4ed8;
  font-weight: 700;
  padding: 0.125rem 0.375rem;
  border-radius: 4px;
}

.status-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.status-pill-success {
  background: #dcfce7;
  color: #15803d;
}

.status-pill-danger {
  background: #fee2e2;
  color: #b91c1c;
}

.exec-progress-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  padding: 2rem 1rem;
  gap: 0.75rem;
}

.spinner-icon svg {
  width: 40px;
  height: 40px;
  color: var(--primary, #2563eb);
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.exec-status-title {
  font-size: 1.125rem;
  font-weight: 700;
}

.exec-status-msg {
  font-size: 0.875rem;
  color: var(--text-muted, #64748b);
  margin: 0;
}

.progress-bar-wrap {
  width: 100%;
  max-width: 360px;
  height: 8px;
  background: var(--bg-muted, #e2e8f0);
  border-radius: 4px;
  overflow: hidden;
  margin-top: 0.5rem;
}

.progress-bar-inner {
  height: 100%;
  background: var(--primary, #2563eb);
  transition: width 0.3s ease;
}

.success-banner {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 8px;
  padding: 1rem;
  color: #15803d;
}

.success-banner h3 {
  margin: 0 0 0.25rem;
  font-size: 1rem;
}

.success-banner p {
  margin: 0;
  font-size: 0.8125rem;
}

.success-icon {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #22c55e;
  color: #fff;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 900;
  flex-shrink: 0;
}
</style>
