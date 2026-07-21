<template>
  <div
    class="modal-backdrop show"
    :class="{ 'modal-backdrop--recharge': action === 'Recharge' || isTokenFlow }"
    role="dialog"
    aria-modal="true"
    @click.self="$emit('close')"
  >
    <RechargeWizard
      v-if="action === 'Recharge'"
      :route="route"
      :row="row"
      :rows="rows"
      @close="$emit('close')"
      @done="$emit('done', $event)"
    />
    <GenerateTokenWizard
      v-else-if="isTokenFlow"
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
import RechargeWizard from "./RechargeWizard.vue";
import GenerateTokenWizard from "./GenerateTokenWizard.vue";
import ActionModalSopFlow from "./ActionModalSopFlow.vue";
import ActionModalRemoteTask from "./ActionModalRemoteTask.vue";
import ActionModalPrint from "./ActionModalPrint.vue";
import ActionModalGeneric from "./ActionModalGeneric.vue";
import { isTokenGenerateAction } from "../services/token-flow.mjs";
import { isRemoteTaskAction } from "../services/remote-task-flow.mjs";

export default {
  name: "ActionModal",
  components: { RechargeWizard, GenerateTokenWizard, ActionModalSopFlow, ActionModalRemoteTask, ActionModalPrint, ActionModalGeneric },
  props: {
    action: { type: String, required: true },
    route: { type: Object, required: true },
    row: { type: Object, default: () => ({}) },
    rows: { type: Array, default: () => [] }
  },
  emits: ["close", "done"],
  computed: {
    // Recharge uses RechargeWizard; other token-generate actions use GenerateTokenWizard
    isTokenFlow() { return isTokenGenerateAction(this.route, this.action) && this.action !== 'Recharge'; },
    isSopFlow() {
      const h = this.route?.hash || "";
      return (h.includes("admin/user") || h.includes("admin/role")) && (this.action === "Add" || this.action === "Edit");
    },
    isRemoteTaskFlow() { return isRemoteTaskAction(this.route, this.action); }
  }
};
</script>

<style scoped>
.modal-backdrop.show.modal-backdrop--recharge {
  padding: 0;
  background:
    radial-gradient(circle at 88% 7%, color-mix(in srgb, var(--primary) 18%, transparent), transparent 17rem),
    linear-gradient(180deg, color-mix(in srgb, var(--bg-page) 18%, transparent), color-mix(in srgb, var(--bg-page) 34%, transparent)) !important;
  backdrop-filter: blur(4px) saturate(108%);
  -webkit-backdrop-filter: blur(4px) saturate(108%);
}
</style>
