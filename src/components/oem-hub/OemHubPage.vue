<template>
  <div class="oem-hub-root">
    <OemSettingsPage
      v-if="settingsOem"
      :oem="settingsOem"
      @back="settingsOem = null"
      @edit="handleEdit"
    />

    <div v-else class="oem-hub">
      <header class="oem-hub__header">
        <div>
          <h1 class="oem-hub__title">Welcome back</h1>
          <p class="oem-hub__subtitle">Choose an OEM below to continue, or add a new one.</p>
        </div>
        <BaseButton class="bw-btn primary" variant="primary" @click="handleAddOem">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
          Add OEM
        </BaseButton>
      </header>

      <div class="oem-hub__toolbar">
        <label class="oem-hub__search">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
          <BaseInput v-model="searchQuery" type="search" placeholder="Search OEM…" aria-label="Search OEM" />
        </label>
        <BaseButton class="bw-btn ghost oem-hub__refresh" variant="ghost" :disabled="store.status === 'loading'" aria-label="Refresh OEM list" @click="store.loadOems()">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true" :class="{ 'oem-hub__refresh-icon--spin': store.status === 'loading' }">
            <path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" />
          </svg>
        </BaseButton>
      </div>

      <div v-if="store.status === 'loading' && !store.hasOems" class="oem-hub__grid" aria-busy="true">
        <div v-for="n in 3" :key="n" class="bw-card oem-hub__skeleton"></div>
      </div>

      <div v-else-if="store.status === 'error'" class="bw-error-banner" role="alert">
        Couldn't load OEMs: {{ store.error }}
        <BaseButton class="bw-btn ghost sm" variant="ghost" size="sm" @click="store.loadOems()">Retry</BaseButton>
      </div>

      <div v-else-if="!store.hasOems" class="bw-empty">
        <p>No OEMs configured yet.</p>
        <BaseButton class="bw-btn primary" variant="primary" @click="handleAddOem">Add your first OEM</BaseButton>
      </div>

      <div v-else-if="!filteredOems.length" class="bw-empty">
        <p>No OEM matches "{{ searchQuery }}".</p>
      </div>

      <div v-else class="oem-hub__grid">
        <OemCard
          v-for="oem in filteredOems"
          :key="oem.id"
          :oem="oem"
          :warm-state="store.warmCache[oem.id]"
          @select="handleSelect"
          @edit="handleEdit"
          @settings="handleSettings"
          @delete="handleDelete"
        />
      </div>
    </div>

    <OemFormModal
      v-if="showForm"
      :oem="editingOem"
      @close="closeForm"
      @saved="onFormSaved"
    />

    <div v-if="deletingOem" class="bw-modal-backdrop" @click.self="deletingOem = null">
      <div class="bw-modal oem-hub__confirm" role="dialog" aria-modal="true" aria-label="Delete OEM">
        <h2 class="bw-modal-title">Delete {{ deletingOem.displayName }}?</h2>
        <p class="oem-hub__confirm-text">This removes the OEM, its credentials, and endpoint configuration. It cannot be undone.</p>
        <p v-if="deleteError" class="oem-hub__confirm-error" role="alert">{{ deleteError }}</p>
        <div class="oem-hub__confirm-actions">
          <BaseButton class="bw-btn ghost" variant="ghost" @click="deletingOem = null">Cancel</BaseButton>
          <BaseButton class="bw-btn danger" variant="danger" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? "Deleting…" : "Delete OEM" }}
          </BaseButton>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { useOemStore } from "../../stores/oem-store";
import BaseButton from "../base/BaseButton.vue";
import BaseInput from "../base/BaseInput.vue";
import OemCard from "./OemCard.vue";
import OemFormModal from "./OemFormModal.vue";
import OemSettingsPage from "./OemSettingsPage.vue";

export default {
  name: "OemHubPage",
  components: { BaseButton, BaseInput, OemCard, OemFormModal, OemSettingsPage },
  emits: ["oem-selected"],
  setup() {
    return { store: useOemStore() };
  },
  data() {
    return {
      searchQuery: "",
      showForm: false,
      editingOem: null,
      settingsOem: null,
      deletingOem: null,
      deleting: false,
      deleteError: ""
    };
  },
  computed: {
    filteredOems() {
      const query = this.searchQuery.trim().toLowerCase();
      if (!query) return this.store.oems;
      return this.store.oems.filter((oem) => String(oem.displayName || "").toLowerCase().includes(query));
    }
  },
  mounted() {
    if (!this.store.hasOems) this.store.loadOems();
  },
  methods: {
    handleSelect(oem) {
      this.store.selectOem(oem.id);
      this.$emit("oem-selected", oem);
    },
    handleAddOem() {
      this.editingOem = null;
      this.showForm = true;
    },
    handleEdit(oem) {
      this.editingOem = oem;
      this.showForm = true;
    },
    closeForm() {
      this.showForm = false;
      this.editingOem = null;
    },
    onFormSaved(saved) {
      // If we edited the OEM currently open in settings, refresh that view's copy.
      if (this.settingsOem && saved && saved.id === this.settingsOem.id) {
        this.settingsOem = saved;
      }
    },
    handleSettings(oem) {
      this.settingsOem = oem;
    },
    handleDelete(oem) {
      this.deleteError = "";
      this.deletingOem = oem;
    },
    async confirmDelete() {
      if (!this.deletingOem) return;
      this.deleting = true;
      this.deleteError = "";
      try {
        await this.store.deleteOem(this.deletingOem.id);
        this.deletingOem = null;
      } catch (err) {
        this.deleteError = err?.response?.data?.msg || err?.message || "Could not delete OEM";
      } finally {
        this.deleting = false;
      }
    }
  }
};
</script>

<style scoped>
.oem-hub-root { width: 100%; }
.oem-hub { display: flex; flex-direction: column; gap: var(--s-5); padding: var(--s-6); max-width: 1200px; margin: 0 auto; width: 100%; }
.oem-hub__header { display: flex; align-items: flex-start; justify-content: space-between; gap: var(--s-4); flex-wrap: wrap; }
.oem-hub__title { margin: 0; font-size: var(--t-xl, 1.5rem); font-weight: 700; letter-spacing: -0.02em; }
.oem-hub__subtitle { margin: 4px 0 0; color: var(--text-muted); font-size: var(--t-sm); }
.oem-hub__header .bw-btn { display: inline-flex; align-items: center; gap: 6px; }

.oem-hub__toolbar { display: flex; align-items: center; gap: var(--s-3); }
.oem-hub__search {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--s-2);
  padding: 0 var(--s-3);
  height: 38px;
  border-radius: var(--r-md);
  background: var(--surface-2);
  border: 1px solid var(--border);
  color: var(--text-muted);
}
.oem-hub__search input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  background: transparent;
  color: var(--text);
  font-size: var(--t-sm);
  outline: none;
}
.oem-hub__refresh { width: 38px; height: 38px; padding: 0; flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center; }
.oem-hub__refresh-icon--spin { animation: oem-hub-spin 0.9s linear infinite; }
@keyframes oem-hub-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

.oem-hub__grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: var(--s-5);
}
.oem-hub__skeleton { height: 150px; opacity: 0.5; animation: oem-hub-shimmer 1.4s ease-in-out infinite; }
@keyframes oem-hub-shimmer { 0%, 100% { opacity: 0.35; } 50% { opacity: 0.6; } }

.oem-hub__confirm { max-width: 420px; }
.oem-hub__confirm-text { color: var(--text-muted); font-size: var(--t-sm); margin: var(--s-2) 0 var(--s-4); }
.oem-hub__confirm-error { color: var(--danger-on-surface, #ef4444); font-size: var(--t-sm); margin: 0 0 var(--s-3); }
.oem-hub__confirm-actions { display: flex; justify-content: flex-end; gap: var(--s-3); }

/* ── Responsive ─────────────────────────────────────────────────────── */
@media (max-width: 768px) {
  .oem-hub { padding: var(--s-4); gap: var(--s-4); }
  .oem-hub__grid { grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: var(--s-4); }
}
@media (max-width: 560px) {
  .oem-hub__header { flex-direction: column; align-items: stretch; }
  .oem-hub__header .bw-btn { justify-content: center; }
  .oem-hub__grid { grid-template-columns: 1fr; }
  .oem-hub__confirm { max-width: 100%; }
}
@media (max-width: 420px) {
  .oem-hub { padding: var(--s-3); }
  /* flex-basis (from `flex: 1 1 0%` on .oem-hub__search) wins over `width`, so
     force the search box onto its own row rather than fighting flex sizing. */
  .oem-hub__toolbar { flex-wrap: wrap; }
  .oem-hub__search { flex: 1 1 100%; }
  .oem-hub__refresh { margin-left: auto; }
}
</style>
