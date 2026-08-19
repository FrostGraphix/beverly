<template>
  <article class="wallet-table-card">
    <div class="table-head">
      <h2>{{ title }}</h2>
      <span>{{ rows.length }} results</span>
    </div>
    <div class="table-command-strip" aria-live="polite">
      <div><span>{{ rows.length }} visible</span></div>
      <div class="table-command-meta">
        <span>Page {{ currentPage }} / {{ pageCount }}</span>
        <span>{{ pageSize }}/page</span>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th
              v-for="col in columns"
              :key="col"
              :class="{ 'action-column bw-align-center': col === 'Actions' || col === 'Action' }"
            >{{ col }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in visibleRows"
            :key="keyForRow(row)"
            :class="{ selected: selectedKey === keyForRow(row) }"
            @click="selectedKey = keyForRow(row)"
          >
            <slot name="row" :row="row" />
          </tr>
          <tr v-if="!visibleRows.length">
            <td :colspan="columns.length" class="empty-cell">No matching records</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div class="pagination wallet-pagination">
      <span>Showing {{ visibleStart }} to {{ visibleEnd }} of {{ rows.length }} results</span>
      <BaseSelect class="sort-select" aria-label="Page size" :value="pageSize" @change="changePageSize">
        <option v-for="n in [10, 25, 50, 100]" :key="n" :value="n">{{ n }}/page</option>
      </BaseSelect>
      <BaseButton class="page-chip" size="sm" :disabled="currentPage === 1" @click="goToPage(currentPage - 1)">&#8249;</BaseButton>
      <BaseButton
        v-for="page in pages"
        :key="page"
        :class="['page-chip', page === currentPage ? 'active' : '']"
        size="sm"
        @click="goToPage(page)"
      >{{ page }}</BaseButton>
      <BaseButton class="page-chip" size="sm" :disabled="currentPage === pageCount" @click="goToPage(currentPage + 1)">&#8250;</BaseButton>
    </div>
  </article>
</template>

<script>
import BaseButton from "../base/BaseButton.vue";
import BaseSelect from "../base/BaseSelect.vue";

export default {
  name: "WalletDataTable",
  components: { BaseButton, BaseSelect },
  props: {
    title: String,
    columns: Array,
    rows: Array
  },
  data() {
    return { currentPage: 1, pageSize: 10, selectedKey: "" };
  },
  computed: {
    pageCount() { return Math.max(1, Math.ceil(this.rows.length / this.pageSize)); },
    pages() { return Array.from({ length: this.pageCount }, (_, i) => i + 1).slice(0, 5); },
    visibleRows() {
      const start = (this.currentPage - 1) * this.pageSize;
      return this.rows.slice(start, start + this.pageSize);
    },
    visibleStart() { return this.rows.length ? (this.currentPage - 1) * this.pageSize + 1 : 0; },
    visibleEnd() { return Math.min(this.currentPage * this.pageSize, this.rows.length); }
  },
  watch: {
    rows() {
      this.currentPage = Math.min(this.currentPage, this.pageCount);
      if (!this.rows.some(row => this.keyForRow(row) === this.selectedKey)) this.selectedKey = "";
    }
  },
  methods: {
    keyForRow(row) { return row.id || row.code || row.ref || row.email || row.name || JSON.stringify(row); },
    goToPage(page) { this.currentPage = Math.min(Math.max(1, page), this.pageCount); },
    changePageSize(event) { this.pageSize = Number(event.target.value) || 10; this.currentPage = 1; }
  }
};
</script>
