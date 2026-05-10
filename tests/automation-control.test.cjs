"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "automation-control-"));
process.env.TEMP = tempRoot;
process.env.TMPDIR = tempRoot;
process.env.LOCAL_DB_PATH = path.join(tempRoot, "automation-control.sqlite");

const {
  automationControlReport,
  controlPath,
  handleAutomationIncident,
  saveAutomationControl
} = require("../backend/src/services/automation-control");

saveAutomationControl({
  webhooks: [
    {
      id: "test-hook",
      name: "Test Hook",
      url: "http://127.0.0.1:9/webhook",
      secret: "x",
      enabled: true,
      events: ["manual-test"]
    }
  ],
  remediation: {
    retryFailedRefreshOnce: true,
    captureIncidentArtifact: true,
    forceWriteGuardOnAuthFailure: true
  }
});

assert(fs.existsSync(controlPath), "Expected control file.");

(async () => {
  const outcome = await handleAutomationIncident({
    kind: "manual-test",
    severity: "info",
    title: "Manual test",
    message: "Automation control test"
  });

  assert.strictEqual(outcome.incident.kind, "manual-test");
  assert(outcome.incident.alerts.length >= 1, "Expected webhook delivery attempt.");
  assert(outcome.incident.remediation.some((action) => action.type === "capture-incident-artifact"));

  const report = automationControlReport();
  assert(report.webhooks.length >= 1);
  assert(report.incidents.length >= 1);
  assert(report.deliveryHistory.length >= 3);
  assert.strictEqual(report.deliveryPolicy.retryCount, 2);
  assert.strictEqual(report.remediation.runHotRefreshOnSmokeFailure, true);

  console.log(JSON.stringify({
    webhooks: report.webhooks.length,
    incidents: report.incidents.length,
    deliveries: report.deliveryHistory.length,
    status: "automation control passed"
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
