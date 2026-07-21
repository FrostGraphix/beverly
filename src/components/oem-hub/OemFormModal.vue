<template>
  <div class="bw-modal-backdrop" @click.self="$emit('close')">
    <div class="bw-modal oem-form" role="dialog" aria-modal="true" :aria-label="isEdit ? 'Edit OEM' : 'Add OEM'">
      <header class="bw-modal-head">
        <h2 class="bw-modal-title">{{ isEdit ? "Edit OEM" : "Add OEM" }}</h2>
        <button type="button" class="bw-btn ghost sm oem-form__close" aria-label="Close" @click="$emit('close')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
        </button>
      </header>

      <div class="oem-form__body">
        <div class="oem-form__field">
          <label class="bw-label" for="oem-name">OEM name</label>
          <input id="oem-name" v-model="form.displayName" class="bw-input" type="text" placeholder="e.g. Sparkmeter" @input="onNameInput" />
        </div>

        <div class="oem-form__field">
          <label class="bw-label" for="oem-slug">Slug</label>
          <input id="oem-slug" v-model="form.slug" class="bw-input" type="text" placeholder="sparkmeter" :disabled="isEdit && oem.isSeedDefault" />
          <small class="oem-form__hint">Used in URLs and the X-Oem-Id header. Lowercase, dashes only.</small>
        </div>

        <div class="oem-form__field">
          <label class="bw-label">Logo</label>
          <div class="oem-form__logo-row">
            <div class="oem-form__logo-preview" aria-hidden="true">
              <img v-if="logoPreview" :src="logoPreview" alt="" />
              <span v-else>{{ initials }}</span>
            </div>
            <div class="oem-form__logo-actions">
              <label class="bw-btn ghost sm oem-form__logo-btn">
                {{ logoFile ? "Change image" : "Upload image" }}
                <input type="file" :accept="logoAccept" class="oem-form__logo-input" @change="onLogoChange" />
              </label>
              <small v-if="logoError" class="oem-form__error">{{ logoError }}</small>
              <small v-else class="oem-form__hint">JPG, PNG or WebP, up to 2MB.</small>
            </div>
          </div>
        </div>

        <div class="oem-form__field">
          <label class="bw-label" for="oem-vending">Vending strategy</label>
          <select id="oem-vending" v-model="form.vendingStrategy" class="bw-select">
            <option value="sts_token">STS token (customer types a 20-digit code)</option>
            <option value="direct_credit">Direct credit (OEM credits the meter over API, no token)</option>
          </select>
        </div>

        <div class="oem-form__field">
          <span class="bw-label">Capabilities</span>
          <p class="oem-form__hint">Turn on what this OEM supports. This shapes which sidebar pages appear when you enter its workspace.</p>
          <ul class="oem-form__caps">
            <li v-for="cap in capabilityDefs" :key="cap.key" class="oem-form__cap">
              <label class="oem-form__cap-label">
                <input type="checkbox" :checked="form.capabilities[cap.key]" @change="toggleCapability(cap.key)" />
                <span>
                  <strong>{{ cap.label }}</strong>
                  <small>{{ cap.description }}</small>
                </span>
              </label>
            </li>
          </ul>
        </div>

        <div class="oem-form__preview">
          <span class="bw-label">Sidebar preview</span>
          <div class="oem-form__preview-chips">
            <span v-for="group in previewGroups" :key="group" class="bw-badge oem-form__chip">{{ group }}</span>
          </div>
        </div>

        <p v-if="error" class="oem-form__error" role="alert">{{ error }}</p>
      </div>

      <footer class="oem-form__footer">
        <button type="button" class="bw-btn ghost" @click="$emit('close')">Cancel</button>
        <button type="button" class="bw-btn primary" :disabled="saving || !form.displayName.trim()" @click="save">
          {{ saving ? "Saving…" : isEdit ? "Save changes" : "Create OEM" }}
        </button>
      </footer>
    </div>
  </div>
</template>

<script>
import { useOemStore } from "../../stores/oem-store";
import { CAPABILITY_DEFINITIONS, defaultCapabilities, previewGroupsFor } from "./oem-capabilities.mjs";
import { logoUploadAcceptValue, validateLogoFile } from "../../services/oem-logo-upload-policy.mjs";
import { uploadApi } from "../../services/api";

function slugify(value) {
  return String(value || "").toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export default {
  name: "OemFormModal",
  props: {
    oem: {
      type: Object,
      default: null
    }
  },
  emits: ["close", "saved"],
  setup() {
    return { store: useOemStore() };
  },
  data() {
    const source = this.oem || {};
    return {
      capabilityDefs: CAPABILITY_DEFINITIONS,
      logoAccept: logoUploadAcceptValue(),
      slugTouched: Boolean(this.oem),
      logoFile: null,
      logoPreview: source.logoStoragePath || "",
      logoError: "",
      saving: false,
      error: "",
      form: {
        displayName: source.displayName || "",
        slug: source.slug || "",
        vendingStrategy: source.vendingStrategy || "sts_token",
        capabilities: { ...defaultCapabilities(), ...(source.capabilities || {}) }
      }
    };
  },
  computed: {
    isEdit() {
      return Boolean(this.oem);
    },
    initials() {
      return String(this.form.displayName || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("");
    },
    previewGroups() {
      return previewGroupsFor(this.form.capabilities);
    }
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
    onNameInput() {
      if (!this.slugTouched) this.form.slug = slugify(this.form.displayName);
    },
    toggleCapability(key) {
      this.form.capabilities = { ...this.form.capabilities, [key]: !this.form.capabilities[key] };
    },
    onLogoChange(event) {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const validationError = validateLogoFile({ name: file.name, type: file.type, size: file.size });
      if (validationError) {
        this.logoError = validationError;
        this.logoFile = null;
        return;
      }
      this.logoError = "";
      this.logoFile = file;
      this.logoPreview = URL.createObjectURL(file);
    },
    async save() {
      this.error = "";
      this.saving = true;
      try {
        const payload = {
          displayName: this.form.displayName.trim(),
          slug: this.form.slug.trim(),
          vendingStrategy: this.form.vendingStrategy,
          capabilities: this.form.capabilities
        };
        let saved;
        if (this.isEdit) {
          saved = await this.store.updateOem(this.oem.id, payload);
        } else {
          saved = await this.store.createOem(payload);
        }
        const oemId = saved?.id || this.oem?.id;
        if (this.logoFile && oemId) {
          const formData = new FormData();
          formData.append("file", this.logoFile);
          try {
            await uploadApi(`/system/oem/${oemId}/logo`, formData);
            await this.store.loadOems();
          } catch (logoErr) {
            // OEM itself saved fine; surface the logo issue without losing the record.
            this.error = `OEM saved, but logo upload failed: ${logoErr?.message || logoErr}`;
            this.saving = false;
            return;
          }
        }
        this.$emit("saved", saved);
        this.$emit("close");
      } catch (err) {
        this.error = err?.response?.data?.msg || err?.message || "Could not save OEM";
        this.saving = false;
      }
    }
  }
};
</script>

<style scoped>
.oem-form { max-width: 560px; display: flex; flex-direction: column; max-height: calc(100dvh - 48px); }
.oem-form__close { width: 30px; height: 30px; padding: 0; display: inline-flex; align-items: center; justify-content: center; }
.oem-form__body { display: flex; flex-direction: column; gap: var(--s-4); overflow-y: auto; padding-right: 2px; }
.oem-form__field { display: flex; flex-direction: column; gap: 6px; }
.oem-form__hint { color: var(--text-muted); font-size: var(--t-xs); margin: 0; }
.oem-form__error { color: var(--danger-on-surface, #ef4444); font-size: var(--t-xs); margin: 0; }

.oem-form__logo-row { display: flex; align-items: center; gap: var(--s-4); }
.oem-form__logo-preview {
  width: 56px; height: 56px; border-radius: var(--r-lg);
  background: var(--surface-2); border: 1px solid var(--border);
  display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0;
  font-weight: 700; color: var(--text-muted);
}
.oem-form__logo-preview img { width: 100%; height: 100%; object-fit: cover; }
.oem-form__logo-actions { display: flex; flex-direction: column; gap: 4px; }
.oem-form__logo-btn { position: relative; overflow: hidden; cursor: pointer; }
.oem-form__logo-input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }

.oem-form__caps { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 8px; }
.oem-form__cap-label { display: flex; align-items: flex-start; gap: 10px; cursor: pointer; }
.oem-form__cap-label input { margin-top: 3px; flex-shrink: 0; }
.oem-form__cap-label span { display: flex; flex-direction: column; gap: 1px; }
.oem-form__cap-label strong { font-size: var(--t-sm); font-weight: 600; }
.oem-form__cap-label small { color: var(--text-muted); font-size: var(--t-xs); }

.oem-form__preview { display: flex; flex-direction: column; gap: 6px; }
.oem-form__preview-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.oem-form__chip { text-transform: none; letter-spacing: normal; }

.oem-form__footer { display: flex; justify-content: flex-end; gap: var(--s-3); margin-top: var(--s-5); }

/* ── Responsive ─────────────────────────────────────────────────────── */
@media (max-width: 560px) {
  .bw-modal-backdrop { padding: 0; align-items: flex-end; }
  .oem-form {
    max-width: 100%;
    width: 100%;
    max-height: 92dvh;
    border-radius: var(--r-xl) var(--r-xl) 0 0;
    padding: var(--s-5);
  }
}
@media (max-width: 420px) {
  .oem-form__logo-row { align-items: flex-start; }
  .oem-form__footer { flex-direction: column-reverse; }
  .oem-form__footer .bw-btn { width: 100%; justify-content: center; }
}
</style>
