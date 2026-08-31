import assert from "node:assert/strict";

import {
  preflightAccountImport,
  provisionMissingCustomers,
  provisionAndRecheckAccountImport
} from "../src/services/account-import-preflight.mjs";
import { submitRouteAction } from "../src/services/action-service.mjs";

const api = {
  async postApi(path) {
    if (path === "/api/customer/read") {
      return { code: 0, result: { data: [] } };
    }
    if (path === "/api/meter/read") {
      return {
        code: 0,
        result: {
          data: [
            { meterId: "M-1", stationId: "MILE 9 & 10" },
            { meterId: "M-2", stationId: "MILE 9 & 10" }
          ]
        }
      };
    }
    throw new Error(`Unexpected path: ${path}`);
  }
};

const report = await preflightAccountImport([
  {
    customerId: "C-1",
    customerName: "Customer One",
    meterId: "M-1",
    stationId: "MILE 9 & 10"
  },
  {
    customerId: "C-2",
    customerName: "Customer Two",
    meterId: "M-2",
    stationId: "MILE 9 & 10"
  },
  {
    customerId: "C-3",
    customerName: "Customer Three",
    meterId: "M-404",
    stationId: "MILE 9 & 10"
  }
], api);

assert.deepStrictEqual(report.missingCustomers, [
  {
    customerId: "C-1",
    customerName: "Customer One",
    stationId: "MILE 9 & 10",
    phone: "",
    address: "",
    remark: "Imported with account CSV"
  },
  {
    customerId: "C-2",
    customerName: "Customer Two",
    stationId: "MILE 9 & 10",
    phone: "",
    address: "",
    remark: "Imported with account CSV"
  }
]);
assert.deepStrictEqual(report.missingMeters, [{
  line: 4,
  meterId: "M-404",
  customerId: "C-3"
}]);
assert.strictEqual(report.blocking.length, 3);
assert.strictEqual(report.ready.length, 0);

const aliasReport = await preflightAccountImport([{
  customerId: "C-ALIAS",
  customerName: "Alias Customer",
  meterId: "M-ALIAS",
  stationId: "MILE 9 & 10"
}], {
  async postApi(path) {
    if (path === "/api/customer/read") {
      return { code: 0, result: { data: [{ id: "C-ALIAS", stationId: "MILE 9 & 10" }] } };
    }
    if (path === "/api/meter/read") {
      return { code: 0, result: { data: [{ id: "M-ALIAS", stationId: "MILE 9 & 10" }] } };
    }
    throw new Error(`Unexpected path: ${path}`);
  }
});
assert.strictEqual(aliasReport.blocking.length, 0);
assert.strictEqual(aliasReport.ready.length, 1);

const writes = [];
const provisioned = await provisionMissingCustomers(report, {
  async postApi(path, payload, options) {
    writes.push({ path, payload, options });
    return { code: 0, reason: "success" };
  }
});

assert.deepStrictEqual(writes, [{
  path: "/api/customer/import",
  payload: report.missingCustomers,
  options: {
    timeout: 900_000,
    headers: {
      "X-Route-Hash": "#/management/customer",
      "X-Route-Action": "Import"
    }
  }
}]);
assert.deepStrictEqual(provisioned, {
  attempted: 2,
  created: 2
});

await assert.rejects(
  () => provisionMissingCustomers({
    missingCustomers: [{
      customerId: "C-INVALID",
      customerName: "",
      stationId: ""
    }]
  }, {
    async postApi() {
      throw new Error("The API must not receive incomplete customers");
    }
  }),
  /name and station/i
);

let customersProvisioned = false;
const workflowApi = {
  async postApi(path, payload) {
    if (path === "/api/customer/read") {
      return {
        code: 0,
        result: {
          data: customersProvisioned
            ? [{ customerId: "C-1", stationId: "MILE 9 & 10" }]
            : []
        }
      };
    }
    if (path === "/api/meter/read") {
      return {
        code: 0,
        result: { data: [{ meterId: "M-1", stationId: "MILE 9 & 10" }] }
      };
    }
    if (path === "/api/customer/import") {
      customersProvisioned = true;
      assert.strictEqual(payload.length, 1);
      return { code: 0, reason: "success" };
    }
    throw new Error(`Unexpected path: ${path}`);
  }
};
const onboardingRows = [{
  customerId: "C-1",
  customerName: "Customer One",
  meterId: "M-1",
  stationId: "MILE 9 & 10"
}];
const initialWorkflowReport = await preflightAccountImport(onboardingRows, workflowApi);
const workflow = await provisionAndRecheckAccountImport(
  onboardingRows,
  initialWorkflowReport,
  workflowApi
);
assert.deepStrictEqual(workflow.provisioned, { attempted: 1, created: 1 });
assert.strictEqual(workflow.report.blocking.length, 0);
assert.strictEqual(workflow.report.ready.length, 1);

let staleCustomerReads = 0;
const eventuallyConsistentApi = {
  async postApi(path) {
    if (path === "/api/customer/import") return { code: 0, reason: "success" };
    if (path === "/api/customer/read") {
      staleCustomerReads += 1;
      return {
        code: 0,
        result: {
          data: staleCustomerReads >= 3
            ? [{ customerId: "C-1", stationId: "MILE 9 & 10" }]
            : []
        }
      };
    }
    if (path === "/api/meter/read") {
      return { code: 0, result: { data: [{ meterId: "M-1", stationId: "MILE 9 & 10" }] } };
    }
    throw new Error(`Unexpected path: ${path}`);
  }
};
const staleReport = await preflightAccountImport(onboardingRows, eventuallyConsistentApi);
const consistentWorkflow = await provisionAndRecheckAccountImport(
  onboardingRows,
  staleReport,
  eventuallyConsistentApi,
  { readbackDelaysMs: [0, 0] }
);
assert.strictEqual(consistentWorkflow.report.missingCustomers.length, 0);
assert.strictEqual(consistentWorkflow.report.ready.length, 1);

let accountImportOptions = null;
await submitRouteAction({
  hash: "#/management/account",
  title: "Account",
  columns: []
}, "Import", {}, {
  importRows: [{
    customerId: "C-1",
    meterId: "M-1",
    tariffId: "RESIDENTIAL",
    stationId: "MILE 9 & 10"
  }],
  liveWritesAllowed: true,
  api: {
    async postApi(_path, _payload, options) {
      accountImportOptions = options;
      return { code: 0, result: {} };
    }
  }
});
assert.ok(accountImportOptions.timeout >= 600_000);

console.log("account import onboarding preflight passed");
