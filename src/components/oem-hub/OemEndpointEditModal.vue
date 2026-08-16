<template>
  <div class="bw-modal-backdrop" @click.self="$emit('close')">
    <div class="bw-modal oem-endpoint" role="dialog" aria-modal="true" aria-label="Edit endpoint">
      <header class="bw-modal-head">
        <h2 class="bw-modal-title">{{ isNew ? "Add endpoint" : endpoint.logicalKey }}</h2>
        <button type="button" class="bw-btn ghost sm oem-endpoint__close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </header>

      <div class="oem-endpoint__body">
        <div v-if="isNew" class="oem-endpoint__field">
          <label class="bw-label" for="ep-key">Logical key</label>
          <input id="ep-key" v-model="logicalKey" class="bw-input" type="text" placeholder="e.g. StationRead" autocomplete="off" />
          <small class="oem-endpoint__hint">Stable internal name your CRM code references (not the raw path). Letters, numbers, dashes.</small>
        </div>

        <div class="oem-endpoint__field">
          <label class="bw-label" for="ep-path">Upstream path</label>
          <input id="ep-path" v-model="form.upstreamPath" class="bw-input" type="text" placeholder="/api/station/read" />
        </div>

        <div class="oem-endpoint__grid">
          <div class="oem-endpoint__field">
            <label class="bw-label" for="ep-method">Method</label>
            <select id="ep-method" v-model="form.method" class="bw-select">
              <option>GET</option>
              <option>POST</option>
              <option>PUT</option>
              <option>PATCH</option>
              <option>DELETE</option>
            </select>
          </div>
          <div class="oem-endpoint__field">
            <label class="bw-label" for="ep-pagination">Pagination</label>
            <select id="ep-pagination" v-model="form.paginationStyle" class="bw-select">
              <option value="none">None</option>
              <option value="pageNumber">pageNumber</option>
              <option value="offset">offset</option>
            </select>
          </div>
        </div>

        <div class="oem-endpoint__field">
          <label class="bw-label" for="ep-casing">Casing note</label>
          <input id="ep-casing" v-model="form.casingVariant" class="bw-input" type="text" placeholder="lowercase-api / pascal-api" />
        </div>

        <div class="oem-endpoint__toggles">
          <label class="oem-endpoint__toggle">
            <input type="checkbox" v-model="form.enabled" />
            <span>Enabled</span>
          </label>
          <label class="oem-endpoint__toggle">
            <input type="checkbox" v-model="form.requiresLiveRead" />
            <span>Requires live read</span>
          </label>
        </div>

        <div class="oem-endpoint__field">
          <label class="bw-label" for="ep-reqmap">Request field map (JSON)</label>
          <textarea id="ep-reqmap" v-model="requestFieldMapText" class="bw-textarea" rows="3" placeholder="{ &quot;amount&quot;: &quot;Amount&quot; }"></textarea>
        </div>

        <div class="oem-endpoint__field">
          <label class="bw-label" for="ep-payload">Static payload fields (JSON)</label>
          <textarea id="ep-payload" v-model="payloadShapeText" class="bw-textarea" rows="3" placeholder="{ &quot;lang&quot;: &quot;en&quot; }"></textarea>
        </div>

        <p v-if="error" class="oem-endpoint__error" role="alert">{{ error }}</p>
      </div>

      <footer class="oem-endpoint__footer">
        <button type="button" class="bw-btn ghost" @click="$emit('close')">Cancel</button>
        <button type="button" class="bw-btn primary" :disabled="saving" @click="save">{{ saving ? "Saving…" : "Save endpoint" }}</button>
      </footer>
    </div>
  </div>
</template>

<script>
export default {
  name: "OemEndpointEditModal",
  props: {
    endpoint: {
      type: Object,
      required: true
    },
    isNew: {
      type: Boolean,
      default: false
    },
    existingKeys: {
      type: Array,
      default: () => []
    }
  },
  emits: ["close", "save"],
  data() {
    return {
      saving: false,
      error: "",
      logicalKey: this.endpoint.logicalKey || "",
      requestFieldMapText: JSON.stringify(this.endpoint.requestFieldMap || {}, null, 2),
      payloadShapeText: JSON.stringify(this.endpoint.payloadShape || {}, null, 2),
      form: {
        upstreamPath: this.endpoint.upstreamPath || "",
        method: this.endpoint.method || "GET",
        casingVariant: this.endpoint.casingVariant || "",
        paginationStyle: this.endpoint.paginationStyle || "none",
        enabled: this.endpoint.enabled !== false,
        requiresLiveRead: Boolean(this.endpoint.requiresLiveRead)
      }
    };
  },
  mounted() {
    document.addEventListener("keydown", this.onKeydown);
  },
  beforeUnmount() {
    document.removeEventListener("keydown", this.onKeydown);
  },
  methods: {
    onKeydown(event) {
      if (event.key === "Escape") this.$emit("close");
    },
    parseJsonField(text, label) {
      const trimmed = String(text || "").trim();
      if (!trimmed) return {};
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
        throw new Error("must be a JSON object");
      } catch (err) {
        throw new Error(`${label} is not valid JSON: ${err.message}`);
      }
    },
    async save() {
      this.error = "";
      const logicalKey = String(this.logicalKey || "").trim();
      if (this.isNew) {
        if (!logicalKey) {
          this.error = "Logical key is required";
          return;
        }
        if (!/^[A-Za-z0-9_-]+$/.test(logicalKey)) {
          this.error = "Logical key may only contain letters, numbers, dashes and underscores";
          return;
        }
        if (this.existingKeys.some((key) => key.toLowerCase() === logicalKey.toLowerCase())) {
          this.error = `An endpoint named "${logicalKey}" already exists`;
          return;
        }
      }
      let requestFieldMap;
      let payloadShape;
      try {
        requestFieldMap = this.parseJsonField(this.requestFieldMapText, "Request field map");
        payloadShape = this.parseJsonField(this.payloadShapeText, "Static payload fields");
      } catch (err) {
        this.error = err.message;
        return;
      }
      this.saving = true;
      try {
        await this.$emit("save", {
          logicalKey,
          upstreamPath: this.form.upstreamPath.trim(),
          method: this.form.method,
          casingVariant: this.form.casingVariant.trim(),
          paginationStyle: this.form.paginationStyle,
          enabled: this.form.enabled,
          requiresLiveRead: this.form.requiresLiveRead,
          requestFieldMap,
          payloadShape
        });
      } finally {
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.oem-endpoint { max-width: 520px; display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
.oem-endpoint__close { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.oem-endpoint__body { display: flex; flex-direction: column; gap: var(--s-4); overflow-y: auto; }
.oem-endpoint__field { display: flex; flex-direction: column; gap: 6px; }
.oem-endpoint__hint { color: var(--text-muted); font-size: var(--t-xs); margin: 0; }
.oem-endpoint__grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
.oem-endpoint__toggles { display: flex; gap: var(--s-5); }
.oem-endpoint__toggle { display: flex; align-items: center; gap: 8px; font-size: var(--t-sm); cursor: pointer; }
.oem-endpoint__error { color: var(--danger-on-surface, #ef4444); font-size: var(--t-xs); margin: 0; }
.oem-endpoint__footer { display: flex; justify-content: flex-end; gap: var(--s-3); margin-top: var(--s-5); }

/* ── Responsive ─────────────────────────────────────────────────────── */
@media (max-width: 560px) {
  .bw-modal-backdrop { padding: 0; align-items: flex-end; }
  .oem-endpoint {
    max-width: 100%;
    width: 100%;
    max-height: 92dvh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    padding: var(--s-5);
  }
  .oem-endpoint__grid { grid-template-columns: 1fr; }
}
@media (max-width: 420px) {
  .oem-endpoint__toggles { flex-direction: column; gap: var(--s-2); }
  .oem-endpoint__footer { flex-direction: column-reverse; }
  .oem-endpoint__footer .bw-btn { width: 100%; justify-content: center; }
}
</style>
