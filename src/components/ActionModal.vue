<template>
  <div class="modal-backdrop show" role="dialog" aria-modal="true" @click.self="$emit('close')">
    <ActionModalTokenFlow
      v-if="isTokenFlow"
      :action="action"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
    <ActionModalSopFlow
      v-else-if="isSopFlow"
      :action="action"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
    <ActionModalRemoteTask
      v-else-if="isRemoteTaskFlow"
      :action="action"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
    <ActionModalPrint
      v-else-if="action === 'Print'"
      :action="action"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
    <ActionModalGeneric
      v-else
      :action="action"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
  </div>
</template>

<script>
import ActionModalTokenFlow from "./ActionModalTokenFlow.vue";
import ActionModalSopFlow from "./ActionModalSopFlow.vue";
import ActionModalRemoteTask from "./ActionModalRemoteTask.vue";
import ActionModalPrint from "./ActionModalPrint.vue";
import ActionModalGeneric from "./ActionModalGeneric.vue";
import { isTokenGenerateAction } from "../services/token-flow.mjs";
import { isRemoteTaskAction } from "../services/remote-task-flow.mjs";

export default {
  name: "ActionModal",
  components: { ActionModalTokenFlow, ActionModalSopFlow, ActionModalRemoteTask, ActionModalPrint, ActionModalGeneric },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  computed: {
    isTokenFlow() { return isTokenGenerateAction(this.route, this.action); },
    isSopFlow() {
      const h = this.route?.hash || "";
      return (h.includes("admin/user") || h.includes("admin/role")) && (this.action === "Add" || this.action === "Edit");
    },
    isRemoteTaskFlow() { return isRemoteTaskAction(this.route, this.action); }
  }
};
</script>
