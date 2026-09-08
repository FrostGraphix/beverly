"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

const meters = read("apps/customer/src/views/Meters.vue");
const exportWizard = read("packages/tokens/WalletExportWizard.vue");
const voice = read("packages/tokens/use-assistant-voice.ts");

assert.ok(meters.includes('class="meter-page-head"'), "meters page needs a responsive header wrapper");
assert.ok(meters.includes('@media (max-width: 640px)'), "meters header must reflow before phone widths");
assert.ok(meters.includes('.meter-page-actions { grid-template-columns:'), "meter actions must use a bounded mobile grid");
assert.ok(meters.includes('.meter-card-row') && meters.includes('flex-wrap: wrap'), "meter cards must reflow their actions");

assert.match(exportWizard, /class="bw-btn bw-export-wizard-trigger"/);
assert.doesNotMatch(exportWizard, /class="bw-btn sm bw-export-wizard-trigger"/);

for (const portal of ["admin", "vendor", "customer"]) {
  const component = read(`apps/${portal}/src/components/acobot/AcobotWidget.vue`);
  assert.ok(component.includes("@beverly/tokens/use-assistant-voice"), `${portal} assistant must use the shared voice controller`);
  assert.ok(component.includes(':aria-pressed="isListening"'), `${portal} microphone must expose listening state`);
  assert.ok(component.includes('role="status" aria-live="polite"'), `${portal} must announce voice status changes`);
  assert.ok(component.includes(':disabled="isThinking"'), `${portal} must prevent overlapping voice and assistant requests`);
  assert.ok(component.includes('Voice input unavailable'), `${portal} must label unsupported voice input without hiding recovery guidance`);
  assert.ok(!component.includes("alert('Speech recognition"), `${portal} must use inline recoverable feedback instead of alerts`);
}

for (const behavior of [
  "activeRecognition.abort()",
  "activeRecognition.stop()",
  "next.onspeechend",
  "next.onerror",
  "onBeforeUnmount",
  "speechSynthesis.cancel()",
  "Microphone access is blocked",
]) {
  assert.ok(voice.includes(behavior), `shared voice controller must retain ${behavior}`);
}

console.log(JSON.stringify({ status: "customer responsive export and wallet-wide voice contract passed" }, null, 2));
