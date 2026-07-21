import assert from "node:assert";
import { actionEndpoint, submitRouteAction } from "../src/services/action-service.mjs";
import { aggregateConsumptionRows, buildConsumptionChartOption, buildConsumptionInsights, buildConsumptionStatisticsPayload, decorateConsumptionRows, fetchConsumptionStatistics, normalizeConsumptionDateKey, normalizeConsumptionStatisticsResponse, summarizeConsumptionRows } from "../src/services/consumption-statistics-service.mjs";
import { fetchDashboardData, filterDashboardSeriesToWindow, isSyntheticDashboardResponse } from "../src/services/dashboard-service.mjs";
import { mapActionResponse } from "../src/services/mappers/action-mapper.mjs";
import { mapTableCollection } from "../src/services/mappers/table-mapper.mjs";
import { routeManifest } from "../src/data/route-manifest.js";
import { managementFields, managementFormSeed } from "../src/services/management-forms.mjs";
import { defaultTableOptions, fetchTableData, fetchTableExportData, resolveRowValue, routeSupportsSiteFilter, routeUsesServerPagination, searchRows, sortRows, tableRequest } from "../src/services/table-service.mjs";
import { needsAuthorizationPassword, stripWriteMeta, validateWriteForm } from "../src/services/write-helpers.mjs";

const accountRoute = {
  hash: "#/management/account",
  title: "Account",
  apis: ["/api/account/read"],
  columns: ["Customer Id", "Customer Name", "Actions"]
};
const customerRoute = {
  hash: "#/management/customer",
  title: "Customer",
  apis: ["/api/customer/read"],
  columns: ["Id", "Name", "Actions"]
};
const gatewayRoute = {
  hash: "#/management/gateway",
  title: "Gateway",
  apis: ["/api/gateway/read"],
  columns: ["Id", "Name", "Actions"]
};
const tariffRoute = {
  hash: "#/management/tariff",
  title: "Tariff",
  apis: ["/api/tariff/read"],
  columns: ["Id", "Name", "Actions"]
};
const dlmsRoute = {
  hash: "#/protocol/dlms",
  title: "DLMS",
  apis: ["/api/dlms/read"],
  columns: ["Id", "Version", "Type", "Class Id", "OBIS", "Name", "Remark", "Actions"]
};
const meterRoute = {
  hash: "#/admin/meter",
  title: "Meter",
  apis: ["/api/meter/read"],
  columns: ["meterId", "meterType", "communicationWay", "protocolVersion", "status", "stationId", "remark", "Actions"]
};
const manifestGatewayRoute = routeManifest.find((route) => route.hash === "#/management/gateway");
const manifestDlmsRoute = routeManifest.find((route) => route.hash === "#/protocol/dlms");
const manifestGprsRoute = routeManifest.find((route) => route.hash === "#/remote-support/gprs-tasks");
const manifestEventRoute = routeManifest.find((route) => route.hash === "#/remote-support/event-notification");
const manifestFirmwareRoute = routeManifest.find((route) => route.hash === "#/remote-support/firmware-update");
const manifestFileUploadRoute = routeManifest.find((route) => route.hash === "#/remote-support/file-upload");
const manifestMeterRoute = routeManifest.find((route) => route.hash === "#/admin/meter");
const manifestUserRoute = routeManifest.find((route) => route.hash === "#/admin/user");
const manifestLogRoute = routeManifest.find((route) => route.hash === "#/admin/log");
const manifestOnboardingRoute = routeManifest.find((route) => route.hash === "#/system/station-onboarding-studio");

assert.strictEqual(actionEndpoint(accountRoute, "Add"), "/api/account/create");
assert.strictEqual(actionEndpoint(accountRoute, "Edit"), "/api/account/update");
assert.strictEqual(actionEndpoint(accountRoute, "Delete"), "/api/account/delete");
assert.strictEqual(actionEndpoint(meterRoute, "Add"), "/api/meter/create");
assert.strictEqual(actionEndpoint(meterRoute, "Edit"), "/api/meter/update");
assert.strictEqual(actionEndpoint(meterRoute, "Delete"), "/api/meter/delete");
assert.strictEqual(actionEndpoint(manifestUserRoute, "Add"), "/api/user/create");
assert.strictEqual(actionEndpoint(manifestUserRoute, "Edit"), "/api/user/update");
assert.strictEqual(actionEndpoint(dlmsRoute, "Edit"), "/api/dlms/update");
assert.strictEqual(actionEndpoint(dlmsRoute, "Delete"), "/api/dlms/delete");
assert.strictEqual(actionEndpoint({ hash: "#/remote-support/firmware-update" }, "Add"), "/API/UpdateFirmwareTask/CreateUpdateFirmwareTask");
assert.strictEqual(actionEndpoint({ hash: "#/remote-operation-record/remote-meter-token-task" }, "Confirm"), "/api/RemoteMeterTask/UpdateTokenTask");
assert.deepStrictEqual(
  routeManifest.find((route) => route.hash === "#/management/customer").apis,
  ["/api/customer/read", "/api/station/read"]
);

const creditTokenRecordRoute = {
  hash: "#/token-record/credit-token-record",
  title: "Credit Token Record",
  apis: ["/api/token/creditTokenRecord/read"],
  columns: ["Receipt Id", "Customer Id", "Meter Id", "Actions"]
};
const creditTokenGenerateRoute = routeManifest.find((route) => route.hash === "#/token-generate/credit-token");

assert.strictEqual(actionEndpoint(creditTokenRecordRoute, "Cancel"), "/api/token/creditTokenRecord/cancel");
assert(managementFields(manifestUserRoute, "Add").some((field) => field.name === "status" && field.type === "select"));
assert.strictEqual(managementFormSeed(manifestUserRoute, "Add", {}).status, "true");
assert.strictEqual(managementFormSeed(manifestUserRoute, "Edit", { status: false }).status, "false");

const aliasedCreditRecordRow = {
  transactionId: "TX-1001",
  customerId: "C-1001",
  serialNumber: "M-1001",
  amount: 3500,
  transactionKwh: 12.5,
  timestamp: "2026-05-01 08:30:00"
};
assert.strictEqual(resolveRowValue(creditTokenRecordRoute, aliasedCreditRecordRow, "receiptId"), "TX-1001");
assert.strictEqual(resolveRowValue(creditTokenRecordRoute, aliasedCreditRecordRow, "meterId"), "M-1001");
assert.strictEqual(resolveRowValue(creditTokenRecordRoute, aliasedCreditRecordRow, "totalPaid"), 3500);
assert.strictEqual(resolveRowValue(creditTokenRecordRoute, aliasedCreditRecordRow, "totalUnit"), 12.5);
assert.strictEqual(searchRows(creditTokenRecordRoute, [aliasedCreditRecordRow], "tx-1001").length, 1);
assert.deepStrictEqual(
  sortRows(
    creditTokenRecordRoute,
    [
      { transactionId: "TX-1000", timestamp: "2026-04-01 08:30:00" },
      { transactionId: "TX-1001", timestamp: "2026-05-01 08:30:00" }
    ]
  ).map((row) => resolveRowValue(creditTokenRecordRoute, row, "receiptId")),
  ["TX-1001", "TX-1000"]
);

const table = mapTableCollection({
  code: 0,
  result: {
    data: [{ id: "1001", name: "Ada" }]
  },
  _proxy: { source: "live" }
}, accountRoute);

assert.strictEqual(table.rows[0].id, "1001");
assert.strictEqual(table.rows[0].name, "Ada");
assert.strictEqual(table.total, 1);
assert.strictEqual(table.envelope._proxy.source, "live");

const customerTable = mapTableCollection({
  code: 0,
  result: {
    data: [{ customerId: "2001", customerName: "Binta" }]
  }
}, customerRoute);
assert.strictEqual(customerTable.rows[0].id, "2001");
assert.strictEqual(customerTable.rows[0].name, "Binta");

const accountGridRoute = {
  hash: "#/management/account",
  title: "Account",
  apis: ["/api/account/read"],
  columns: ["customerId", "meterId", "createDate", "updateDate", "Actions"]
};
const aliasedAccountRow = {
  customerId: "4700",
  meterId: "M-4700",
  createTime: "2026-04-01 12:00:00",
  updateTime: "2026-04-02 12:00:00"
};
assert.strictEqual(resolveRowValue(accountGridRoute, aliasedAccountRow, "createDate"), "2026-04-01 12:00:00");
assert.strictEqual(resolveRowValue(accountGridRoute, aliasedAccountRow, "updateDate"), "2026-04-02 12:00:00");

const gatewayTable = mapTableCollection({
  code: 0,
  result: {
    data: [{ gatewayId: "GW-1", gatewayName: "UMAISHA_2", status: true, stationId: "admin" }]
  }
}, gatewayRoute);
assert.strictEqual(gatewayTable.rows[0].id, "GW-1");
assert.strictEqual(gatewayTable.rows[0].name, "UMAISHA_2");
assert.strictEqual(gatewayTable.rows[0].stationId, "UMAISHA");
assert.strictEqual(gatewayTable.rows[0].status, "Online");
assert(manifestGatewayRoute.actions.includes("Edit"));
assert(manifestGatewayRoute.actions.includes("Delete"));
assert(manifestDlmsRoute.actions.includes("Edit"));
assert(manifestDlmsRoute.actions.includes("Delete"));
assert.deepStrictEqual(manifestGprsRoute.actions, ["Sort", "Search", "Reset", "Add Task", "Export"]);
assert.strictEqual(manifestGprsRoute.columns.includes("Actions"), false);
assert.deepStrictEqual(manifestEventRoute.apis, ["/API/EventNotification/Read"]);
assert.deepStrictEqual(manifestEventRoute.actions, ["Sort", "Search", "Reset", "Export"]);
assert.strictEqual(manifestEventRoute.columns.includes("Actions"), false);
assert.deepStrictEqual(manifestEventRoute.columns, ["eventCode", "eventContent", "meterId", "currentDate", "remark", "createDate", "updateDate", "stationId"]);
assert.deepStrictEqual(manifestFirmwareRoute.actions, ["Sort", "Search", "Reset", "Add", "Export"]);
assert.strictEqual(manifestFirmwareRoute.columns.includes("Actions"), false);
assert.deepStrictEqual(manifestFileUploadRoute.actions, ["Sort", "Search", "Reset", "Import", "Export"]);
assert.strictEqual(manifestFileUploadRoute.columns.includes("Actions"), false);
assert(manifestMeterRoute.actions.includes("Add"));
assert(manifestMeterRoute.actions.includes("Edit"));
assert(manifestMeterRoute.actions.includes("Delete"));
assert.strictEqual(manifestOnboardingRoute.customComponent, "OnboardingStudioPage");
assert.strictEqual(needsAuthorizationPassword("Delete", gatewayRoute), false);
assert.strictEqual(needsAuthorizationPassword("Delete", dlmsRoute), false);

const tariffTable = mapTableCollection({
  code: 0,
  result: {
    data: [{ tariffId: "RES", tariffName: "Residential" }]
  }
}, tariffRoute);
assert.strictEqual(tariffTable.rows[0].id, "RES");
assert.strictEqual(tariffTable.rows[0].name, "Residential");

const emptyTable = mapTableCollection({ code: 0, result: { data: [] }, _proxy: { source: "cache" } }, accountRoute);
assert.strictEqual(emptyTable.rows.length, 0);

const remoteTokenTaskRoute = routeManifest.find((route) => route.hash === "#/remote-operation-record/remote-meter-token-task");
const rejectedTokenTaskTable = mapTableCollection({
  code: 0,
  result: {
    data: [{
      id: 8370,
      meterId: "47300481810",
      data: "63751343398450415494",
      status: 3,
      remark: "TokenReject"
    }]
  }
}, remoteTokenTaskRoute);
assert.strictEqual(rejectedTokenTaskTable.rows[0].status, "Failure");
assert.strictEqual(rejectedTokenTaskTable.rows[0].token, "6375 1343 3984 5041 5494");
assert.strictEqual(emptyTable.total, 0);
assert.strictEqual(emptyTable.envelope._proxy.source, "cache");

const request = tableRequest(accountRoute, {
  siteId: "SITE-1",
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-17T00:00:00.000Z",
  pageNumber: 2,
  pageSize: 25
});

assert.strictEqual(defaultTableOptions.siteId, "");
assert.strictEqual(request.path, "/api/account/read");
assert.strictEqual(request.payload.pageNumber, 2);
assert.strictEqual(request.payload.pageSize, 20);
assert.strictEqual(request.payload.stationId, "SITE-1");
assert.strictEqual(tableRequest(accountRoute, { pageNumber: 1, pageSize: 10, orderBy: "id asc" }).payload.orderBy, "customerId asc");
assert.strictEqual(tableRequest(accountRoute, { pageNumber: 1, pageSize: 10, orderBy: "meterId desc" }).payload.orderBy, "meterId desc");
assert.strictEqual("orderBy" in tableRequest(accountRoute, { pageNumber: 1, pageSize: 10, orderBy: "asc" }).payload, false);
assert.strictEqual(routeUsesServerPagination(accountRoute), true);
assert.strictEqual(routeUsesServerPagination(creditTokenGenerateRoute), true);
assert.strictEqual(routeUsesServerPagination(meterRoute), true);
assert.strictEqual(routeUsesServerPagination(manifestLogRoute), true);
assert.strictEqual(tableRequest(creditTokenGenerateRoute, { pageNumber: 4, pageSize: 50, orderBy: "meterId asc" }).payload.pageSize, 20);
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 100, orderBy: "meterId asc" }).payload.pageSize, 20);
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 500, bulkRead: true }).payload.pageSize, 500);
assert.strictEqual(tableRequest(accountRoute, { pageNumber: 1, pageSize: 500, bulkRead: true }).payload.pageSize, 500);
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 10, meterPhaseFilter: "three-phase" }).payload.isThreePhase, 1);
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 10, meterPhaseFilter: "single-phase" }).payload.isThreePhase, 0);
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 10, orderBy: "meterId asc" }).payload.orderBy, "meterId asc");
assert.strictEqual(tableRequest(meterRoute, { pageNumber: 1, pageSize: 10, orderBy: "protocolVersion desc" }).payload.orderBy, "protocolVersion desc");
assert.strictEqual("orderBy" in tableRequest(meterRoute, { pageNumber: 1, pageSize: 10, orderBy: "asc" }).payload, false);
assert.strictEqual(tableRequest(manifestLogRoute, { pageNumber: 3, pageSize: 100, searchTerm: "admin", orderBy: "createDate desc" }).payload.pageSize, 20);
assert.strictEqual(tableRequest(manifestLogRoute, { pageNumber: 3, pageSize: 10, searchTerm: "admin", orderBy: "createDate desc" }).payload.searchTerm, "admin");
assert.strictEqual(tableRequest(manifestLogRoute, { pageNumber: 1, pageSize: 10, orderBy: "unknown desc" }).payload.orderBy, undefined);

const accountPageCalls = [];
const accountPageTable = await fetchTableData(accountRoute, { pageNumber: 3, pageSize: 10, orderBy: "id asc" }, {
  async postApi(path, payload = {}) {
    accountPageCalls.push({ path, payload });
    assert.strictEqual(path, "/api/account/read");
    const pageNumber = Number(payload.pageNumber || 1);
    const pageSize = Number(payload.pageSize || 10);
    const start = (pageNumber - 1) * pageSize;
    return {
      code: 0,
      result: {
        total: 2443,
        data: Array.from({ length: pageSize }, (_, index) => ({
          customerId: `AC-${String(start + index + 1).padStart(4, "0")}`,
          meterId: `M-${String(start + index + 1).padStart(4, "0")}`
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(accountPageCalls.length, 1);
assert.strictEqual(accountPageCalls[0].payload.pageNumber, 3);
assert.strictEqual(accountPageCalls[0].payload.pageSize, 10);
assert.strictEqual(accountPageCalls[0].payload.orderBy, "customerId asc");
assert.strictEqual(accountPageTable.serverPaginated, true);
assert.strictEqual(accountPageTable.total, 2443);
assert.strictEqual(accountPageTable.rows.length, 10);

const creditTokenPageCalls = [];
const creditTokenPageTable = await fetchTableData(creditTokenGenerateRoute, { pageNumber: 4, pageSize: 10, orderBy: "meterId asc" }, {
  async postApi(path, payload = {}) {
    creditTokenPageCalls.push({ path, payload });
    assert.strictEqual(path, "/api/account/read");
    return {
      code: 0,
      result: {
        total: 9814,
        data: Array.from({ length: 10 }, (_, index) => ({
          customerId: `CT-${index + 1}`,
          meterId: `4700530${index + 1}`
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(creditTokenPageCalls.length, 1);
assert.strictEqual(creditTokenPageCalls[0].payload.pageNumber, 4);
assert.strictEqual(creditTokenPageCalls[0].payload.pageSize, 10);
assert.strictEqual(creditTokenPageCalls[0].payload.orderBy, "meterId asc");
assert.strictEqual(creditTokenPageTable.serverPaginated, true);
assert.strictEqual(creditTokenPageTable.total, 9814);
assert.strictEqual(creditTokenPageTable.rows.length, 10);

const creditTokenPhaseCalls = [];
const creditTokenPhaseTable = await fetchTableData(creditTokenGenerateRoute, { pageNumber: 1, pageSize: 10, meterPhaseFilter: "three-phase", orderBy: "meterId asc" }, {
  async postApi(path, payload = {}) {
    creditTokenPhaseCalls.push({ path, payload });
    if (path === "/api/meter/read") {
      return {
        code: 0,
        result: {
          total: 2,
          data: [
            { meterId: "M-3P-002", isThreePhase: true },
            { meterId: "M-3P-001", isThreePhase: true }
          ]
        }
      };
    }
    if (path === "/api/account/read") {
      return {
        code: 0,
        result: {
          total: 4,
          data: [
            { customerId: "A-1", meterId: "M-1P-001" },
            { customerId: "A-2", meterId: "M-3P-002" },
            { customerId: "A-3", meterId: "M-3P-001" },
            { customerId: "A-4", meterId: "M-1P-002" }
          ]
        }
      };
    }
    throw new Error(`Unexpected path ${path}`);
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.deepStrictEqual(creditTokenPhaseCalls.map((call) => call.path), ["/api/meter/read", "/api/account/read"]);
assert.strictEqual(creditTokenPhaseCalls[0].payload.isThreePhase, 1);
assert.strictEqual(creditTokenPhaseTable.serverPaginated, true);
assert.strictEqual(creditTokenPhaseTable.meta.source, "meter-phase-filter");
assert.strictEqual(creditTokenPhaseTable.total, 2);
assert.deepStrictEqual(creditTokenPhaseTable.rows.map((row) => row.meterId), ["M-3P-001", "M-3P-002"]);
assert.deepStrictEqual(creditTokenPhaseTable.rows.map((row) => row.isThreePhase), [true, true]);

const creditTokenSinglePhaseTable = await fetchTableData(creditTokenGenerateRoute, { pageNumber: 1, pageSize: 10, meterPhaseFilter: "single-phase" }, {
  async postApi(path, payload = {}) {
    if (path === "/api/meter/read") {
      assert.strictEqual(payload.isThreePhase, 0);
      return { code: 0, result: { total: 1, data: [{ meterId: "M-1P-001", isThreePhase: 0 }] } };
    }
    if (path === "/api/account/read") {
      return { code: 0, result: { total: 2, data: [{ meterId: "M-1P-001" }, { meterId: "M-3P-001" }] } };
    }
    throw new Error(`Unexpected path ${path}`);
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(creditTokenSinglePhaseTable.total, 1);
assert.deepStrictEqual(creditTokenSinglePhaseTable.rows.map((row) => row.meterId), ["M-1P-001"]);
assert.deepStrictEqual(creditTokenSinglePhaseTable.rows.map((row) => row.isThreePhase), [false]);

const meterPageCalls = [];
const meterPageTable = await fetchTableData(meterRoute, { pageNumber: 5, pageSize: 10, searchTerm: "4700", orderBy: "meterId asc" }, {
  async postApi(path, payload = {}) {
    meterPageCalls.push({ path, payload });
    assert.strictEqual(path, "/api/meter/read");
    return {
      code: 0,
      result: {
        total: 7662,
        data: Array.from({ length: 10 }, (_, index) => ({
          meterId: `470053${String(index + 41).padStart(4, "0")}`,
          meterType: "Electricity",
          stationId: "TUNGA"
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(meterPageCalls.length, 1);
assert.strictEqual(meterPageCalls[0].payload.pageNumber, 5);
assert.strictEqual(meterPageCalls[0].payload.pageSize, 10);
assert.strictEqual(meterPageCalls[0].payload.searchTerm, "4700");
assert.strictEqual(meterPageCalls[0].payload.orderBy, "meterId asc");
assert.strictEqual(meterPageTable.serverPaginated, true);
assert.strictEqual(meterPageTable.total, 7662);
assert.strictEqual(meterPageTable.rows.length, 10);

const logPageCalls = [];
const logPageTable = await fetchTableData(manifestLogRoute, { pageNumber: 3, pageSize: 10, searchTerm: "admin", orderBy: "createDate desc" }, {
  async postApi(path, payload = {}) {
    logPageCalls.push({ path, payload });
    assert.strictEqual(path, "/api/log/read");
    return {
      code: 0,
      result: {
        total: 1340,
        data: Array.from({ length: 10 }, (_, index) => ({
          id: `LOG-${index + 21}`,
          createId: "admin",
          method: "POST",
          status: 200,
          createDate: `2026-05-${String(22 - index).padStart(2, "0")}`
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(logPageCalls.length, 1);
assert.strictEqual(logPageCalls[0].payload.pageNumber, 3);
assert.strictEqual(logPageCalls[0].payload.pageSize, 10);
assert.strictEqual(logPageCalls[0].payload.searchTerm, "admin");
assert.strictEqual(logPageCalls[0].payload.orderBy, "createDate desc");
assert.strictEqual(logPageTable.serverPaginated, true);
assert.strictEqual(logPageTable.total, 1340);
assert.strictEqual(logPageTable.rows.length, 10);

assert.strictEqual(routeUsesServerPagination(gatewayRoute), true);
assert.strictEqual(tableRequest(gatewayRoute, { pageNumber: 1, pageSize: 50, orderBy: "successRate desc" }).payload.pageSize, 20);
assert.strictEqual("orderBy" in tableRequest(gatewayRoute, { pageNumber: 1, pageSize: 10, orderBy: "successRate desc" }).payload, false);
assert.strictEqual(tableRequest(gatewayRoute, { pageNumber: 1, pageSize: 10, orderBy: "id asc" }).payload.orderBy, "gatewayId asc");
const gatewayCalls = [];
const gatewayPageTable = await fetchTableData(gatewayRoute, { pageNumber: 2, pageSize: 10, searchTerm: "TUNGA", orderBy: "id asc" }, {
  async postApi(path, payload = {}) {
    gatewayCalls.push({ path, payload });
    assert.strictEqual(path, "/api/gateway/read");
    return {
      code: 0,
      result: {
        total: 37,
        data: Array.from({ length: 10 }, (_, index) => ({
          gatewayId: `GW-${String(index + 11).padStart(3, "0")}`,
          gatewayName: `Gateway ${index + 11}`
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(gatewayCalls.length, 1);
assert.strictEqual(gatewayCalls[0].payload.pageNumber, 2);
assert.strictEqual(gatewayCalls[0].payload.pageSize, 10);
assert.strictEqual(gatewayCalls[0].payload.searchTerm, "TUNGA");
assert.strictEqual(gatewayCalls[0].payload.orderBy, "gatewayId asc");
assert.strictEqual(gatewayPageTable.serverPaginated, true);
assert.strictEqual(gatewayPageTable.total, 37);
assert.strictEqual(gatewayPageTable.rows.length, 10);

assert.strictEqual(routeUsesServerPagination(tariffRoute), true);
assert.strictEqual(tableRequest(tariffRoute, { pageNumber: 1, pageSize: 100, orderBy: "id asc" }).payload.pageSize, 20);
assert.strictEqual(tableRequest(tariffRoute, { pageNumber: 1, pageSize: 10, orderBy: "id asc" }).payload.orderBy, "tariffId asc");
const tariffCalls = [];
const tariffPageTable = await fetchTableData(tariffRoute, { pageNumber: 3, pageSize: 10, searchTerm: "RES", orderBy: "name desc" }, {
  async postApi(path, payload = {}) {
    tariffCalls.push({ path, payload });
    assert.strictEqual(path, "/api/tariff/read");
    return {
      code: 0,
      result: {
        total: 26,
        data: Array.from({ length: 6 }, (_, index) => ({
          tariffId: `T-${String(index + 21).padStart(3, "0")}`,
          tariffName: `Tariff ${index + 21}`,
          price: 350
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(tariffCalls.length, 1);
assert.strictEqual(tariffCalls[0].payload.pageNumber, 3);
assert.strictEqual(tariffCalls[0].payload.pageSize, 10);
assert.strictEqual(tariffCalls[0].payload.searchTerm, "RES");
assert.strictEqual(tariffCalls[0].payload.orderBy, "tariffName desc");
assert.strictEqual(tariffPageTable.serverPaginated, true);
assert.strictEqual(tariffPageTable.total, 26);
assert.strictEqual(tariffPageTable.rows.length, 6);

const remoteOperationRoute = routeManifest.find((route) => route.hash === "#/remote-operation/remote-meter-reading");
assert.strictEqual(routeUsesServerPagination(remoteOperationRoute), true);
assert.strictEqual(tableRequest(remoteOperationRoute, { pageNumber: 1, pageSize: 100, orderBy: "customerName asc" }).payload.pageSize, 20);
assert.strictEqual(tableRequest(remoteOperationRoute, { pageNumber: 1, pageSize: 10, orderBy: "customerName asc" }).payload.orderBy, "customerName asc");
const remoteOperationCalls = [];
const remoteOperationTable = await fetchTableData(remoteOperationRoute, { pageNumber: 2, pageSize: 10, searchTerm: "ADAMU", orderBy: "customerName asc" }, {
  async postApi(path, payload = {}) {
    remoteOperationCalls.push({ path, payload });
    assert.strictEqual(path, "/api/account/read");
    return {
      code: 0,
      result: {
        total: 2443,
        data: Array.from({ length: 10 }, (_, index) => ({
          customerId: `CU-${String(index + 11).padStart(3, "0")}`,
          customerName: `Remote Customer ${index + 11}`,
          meterId: `M-${String(index + 11).padStart(3, "0")}`,
          meterType: 0,
          status: index % 2 === 0,
          stationId: "TUNGA"
        }))
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(remoteOperationCalls.length, 1);
assert.strictEqual(remoteOperationCalls[0].payload.pageNumber, 2);
assert.strictEqual(remoteOperationCalls[0].payload.pageSize, 10);
assert.strictEqual(remoteOperationCalls[0].payload.searchTerm, "ADAMU");
assert.strictEqual(remoteOperationCalls[0].payload.orderBy, "customerName asc");
assert.strictEqual(remoteOperationTable.serverPaginated, true);
assert.strictEqual(remoteOperationTable.total, 2443);
assert.strictEqual(remoteOperationTable.rows.length, 10);
assert.strictEqual(remoteOperationTable.rows[0].meterType, "Electricity");

const remoteReadingRoute = {
  hash: "#/remote-operation-record/remote-meter-reading-task",
  title: "Meter Reading Task",
  apis: ["/api/station/read", "/api/remoteMeterTask/getReadingTask"],
  columns: ["customerId", "customerName", "meterId", "dataItem", "stationId", "dataValue", "status", "createDate", "updateDate"],
  actions: ["Sort", "Search", "Reset", "Export", "Close", "Cancel", "Confirm"]
};

const remoteReadingRequest = tableRequest(remoteReadingRoute, {
  siteId: "TUNGA",
  pageNumber: 3,
  pageSize: 40
});

assert.deepStrictEqual(remoteReadingRequest, {
  path: "/API/RemoteMeterTask/GetReadingTask",
  method: "POST",
  payload: {
    lang: "en",
    stationId: "TUNGA",
    pageNumber: 3,
    pageSize: 40
  },
  pagination: "pageNumber"
});

const remoteSupportRoute = {
  hash: "#/remote-support/gprs-tasks",
  title: "GPRS Tasks",
  apis: ["/API/GPRSMeterTask/GPRSGetReadingTask"],
  columns: ["id", "gatewayId", "status"]
};
const eventNotificationRoute = {
  hash: "#/remote-support/event-notification",
  title: "Event Notification",
  apis: ["/API/EventNotification/Read"],
  columns: ["eventCode", "eventContent", "meterId", "currentDate", "remark", "createDate", "updateDate", "stationId"]
};

assert.strictEqual(defaultTableOptions.siteId, "");

assert.deepStrictEqual(
  tableRequest(remoteSupportRoute, {
    pageNumber: 1,
    pageSize: 20
  }),
  {
    path: "/API/GPRSMeterTask/GPRSGetReadingTask",
    method: "POST",
    payload: {
      lang: "en",
      pageNumber: 1,
      pageSize: 20
    },
    pagination: "pageNumber"
  }
);

assert.deepStrictEqual(
  tableRequest(remoteSupportRoute, {
    siteId: "MUSHA",
    pageNumber: 2,
    pageSize: 30
  }),
  {
    path: "/API/GPRSMeterTask/GPRSGetReadingTask",
    method: "POST",
    payload: {
      lang: "en",
      stationId: "MUSHA",
      pageNumber: 2,
      pageSize: 30
    },
    pagination: "pageNumber"
  }
);

assert.deepStrictEqual(
  tableRequest(eventNotificationRoute, {
    siteId: "TUNGA",
    from: "2026-04-01T00:00:00.000Z",
    to: "2026-04-30T23:59:59.999Z",
    pageNumber: 2,
    pageSize: 15
  }),
  {
    path: "/API/EventNotification/Read",
    method: "POST",
    payload: {
      lang: "en",
      stationId: "TUNGA",
      currentDateRange: ["2026-04-01T00:00:00.000Z", "2026-04-30T23:59:59.999Z"],
      pageNumber: 2,
      pageSize: 15
    },
    pagination: "pageNumber"
  }
);

const consumptionRequest = tableRequest({
  hash: "#/prepay-report/consumption-statistics",
  title: "Consumption Statistics",
  apis: ["/api/customer/read", "/api/meter/read", "/api/DailyDataMeter/read"],
  columns: ["collectionDate", "consumption"]
}, {
  siteId: "TUNGA",
  from: "2026-04-01T00:00:00.000Z",
  to: "2026-04-30T23:59:59.999Z",
  pageNumber: 1,
  pageSize: 50
});
assert.strictEqual(consumptionRequest.path, "/api/DailyDataMeter/read");
assert.strictEqual(consumptionRequest.method, "POST");
assert.strictEqual(consumptionRequest.payload.pageNumber, 1);
assert.strictEqual(consumptionRequest.payload.pageSize, 50);
assert.strictEqual(consumptionRequest.payload.stationId, "TUNGA");
assert.strictEqual(consumptionRequest.payload.FROM, "2026-04-01T00:00:00.000Z");
assert.strictEqual(consumptionRequest.payload.TO, "2026-04-30T23:59:59.999Z");

assert.deepStrictEqual(
  buildConsumptionStatisticsPayload({
    customerId: "470005342689",
    meterId: "470005342689",
    stationId: "TUNGA",
    dateFrom: "2026-04-01",
    dateTo: "2026-04-30"
  }, {
    pageNumber: 2,
    pageSize: 20
  }),
  {
    lang: "en",
    pageNumber: 2,
    pageSize: 20,
    FROM: "2026-03-31T00:00:00.000Z",
    TO: "2026-04-30T23:59:59.999Z",
    stationId: "TUNGA",
    customerId: "470005342689",
    meterId: "470005342689"
  }
);

const normalizedConsumption = normalizeConsumptionStatisticsResponse({
  code: 0,
  result: {
    total: 2,
    data: [
      { currentDate: "2026-04-05 00:00:00", usage1: "0.5", meterId: "A", customerId: "C" },
      { currentDate: "2026-04-06 00:00:00", usage1: "-1", meterId: "A", customerId: "C" }
    ]
  }
});
assert.strictEqual(normalizedConsumption.total, 2);
assert.strictEqual(normalizedConsumption.rows[0].consumption, 0.5);
assert.strictEqual(normalizedConsumption.rows[1].consumption, 0);

const normalizedMonthlyConsumption = normalizeConsumptionStatisticsResponse({
  code: 0,
  result: {
    total: 1,
    data: [{ currentMonth: "2026-04", usage1: "4.2", meterId: "A", customerId: "C" }]
  }
});
assert.strictEqual(normalizedMonthlyConsumption.rows[0].collectionDate, "2026-04");
assert.strictEqual(normalizedMonthlyConsumption.rows[0].consumption, 4.2);
assert.strictEqual(normalizeConsumptionDateKey("14/04/2026"), "2026-04-14");
assert.strictEqual(normalizeConsumptionDateKey("2026/04/14"), "2026-04-14");
assert.strictEqual(normalizeConsumptionDateKey("14/04/2026", "monthly"), "2026-04");

assert.deepStrictEqual(
  aggregateConsumptionRows([
    { collectionDate: "2026-04-05 00:00:00", consumption: 0.2 },
    { collectionDate: "2026-04-05 12:00:00", consumption: 0.3 },
    { collectionDate: "2026-05-01 00:00:00", consumption: 1.5 }
  ], "daily").map((row) => ({ collectionDate: row.collectionDate, consumption: row.consumption })),
  [
    { collectionDate: "2026-04-05", consumption: 0.5 },
    { collectionDate: "2026-05-01", consumption: 1.5 }
  ]
);

assert.deepStrictEqual(
  aggregateConsumptionRows([
    { collectionDate: "2026-04-14 00:00:00", consumption: 0.07 },
    { collectionDate: "2026-04-22 00:00:00", consumption: 0.99 }
  ], "daily", {
    granularity: "daily",
    dateFrom: "14/04/2026",
    dateTo: "17/04/2026"
  }).map((row) => ({ collectionDate: row.collectionDate, consumption: row.consumption })),
  [
    { collectionDate: "2026-04-14", consumption: 0.07 },
    { collectionDate: "2026-04-15", consumption: 0 },
    { collectionDate: "2026-04-16", consumption: 0 },
    { collectionDate: "2026-04-17", consumption: 0 }
  ]
);

assert.deepStrictEqual(
  aggregateConsumptionRows([
    { collectionDate: "2026-04-14 00:00:00", consumption: 0.07 },
    { collectionDate: "2026-04-16 00:00:00", consumption: 0.21 }
  ], "daily", {
    granularity: "daily",
    dateFrom: "2026-04-14",
    dateTo: "2026-04-17"
  }).map((row) => ({ collectionDate: row.collectionDate, consumption: row.consumption })),
  [
    { collectionDate: "2026-04-14", consumption: 0.07 },
    { collectionDate: "2026-04-15", consumption: 0 },
    { collectionDate: "2026-04-16", consumption: 0.21 },
    { collectionDate: "2026-04-17", consumption: 0 }
  ]
);

assert.deepStrictEqual(
  aggregateConsumptionRows([
    { collectionDate: "2026-04-05 00:00:00", consumption: 0.2 },
    { collectionDate: "2026-04-25 12:00:00", consumption: 0.3 },
    { collectionDate: "2026-05-01 00:00:00", consumption: 1.5 }
  ], "monthly").map((row) => ({ collectionDate: row.collectionDate, consumption: row.consumption })),
  [
    { collectionDate: "2026-04", consumption: 0.5 },
    { collectionDate: "2026-05", consumption: 1.5 }
  ]
);

const chartOption = buildConsumptionChartOption([
  { collectionDate: "2026-04-05", consumption: 0.5 },
  { collectionDate: "2026-04-06", consumption: 0 }
], "daily");
assert.strictEqual(chartOption.title.text, "Daily Consumption");
assert.deepStrictEqual(chartOption.xAxis.data, ["2026-04-05", "2026-04-06"]);
assert.deepStrictEqual(chartOption.series[0].data, [0.5, 0]);
assert.strictEqual(chartOption.series[0].type, "bar");
assert.strictEqual(chartOption.yAxis.name, "kWh");

const decoratedConsumption = decorateConsumptionRows([
  { collectionDate: "2026-04-05", consumption: 0.5 },
  { collectionDate: "2026-04-06", consumption: 0.2 },
  { collectionDate: "2026-04-07", consumption: 0 }
]);
assert.strictEqual(decoratedConsumption[0].change, null);
assert.strictEqual(decoratedConsumption[1].change, -0.3);
assert.strictEqual(decoratedConsumption[2].status, "Zero");

assert.deepStrictEqual(
  summarizeConsumptionRows([
    { collectionDate: "2026-04-05", consumption: 0.5 },
    { collectionDate: "2026-04-06", consumption: 0.2 }
  ], {
    granularity: "daily",
    dateFrom: "2026-04-05",
    dateTo: "2026-04-07"
  }),
  {
    total: 0.7,
    average: 0.35,
    peakDate: "2026-04-05",
    peakValue: 0.5,
    reportingDays: 2,
    expectedDays: 3,
    missingDays: 1,
    zeroDays: 0
  }
);

assert.strictEqual(
  buildConsumptionInsights([
    { collectionDate: "2026-04-05", consumption: 0.5 },
    { collectionDate: "2026-04-06", consumption: 1 }
  ], {
    granularity: "daily",
    dateFrom: "2026-04-05",
    dateTo: "2026-04-06"
  })[3].value,
  "Increasing"
);

assert.strictEqual(
  summarizeConsumptionRows([
    { collectionDate: "2026-04", consumption: 4.2 }
  ], {
    granularity: "monthly",
    dateFrom: "2026-04-01",
    dateTo: "2026-05-06"
  }).expectedDays,
  2
);

const consumptionCalls = [];
const liveConsumption = await fetchConsumptionStatistics({
  dateFrom: "01/04/2026",
  dateTo: "30/04/2026"
}, {
  pageNumber: 1,
  pageSize: 20
}, {
  async postApi(path, payload) {
    consumptionCalls.push({ path, payload });
    return {
      code: 0,
      result: {
        total: 1,
        data: [{ currentDate: "2026-04-05 00:00:00", usage1: "0.5", meterId: "A" }]
      },
      _proxy: { source: "live" }
    };
  }
});
assert.strictEqual(liveConsumption.endpoint, "/api/DailyDataMeter/read");
assert.strictEqual(liveConsumption.source, "live-derived");
assert.deepStrictEqual(consumptionCalls.map((call) => call.path), ["/api/DailyDataMeter/read"]);
assert.strictEqual(liveConsumption.rows[0].consumption, 0.5);
assert.strictEqual(consumptionCalls[0].payload.FROM, "2026-03-31T00:00:00.000Z");
assert.strictEqual(consumptionCalls[0].payload.TO, "2026-04-30T23:59:59.999Z");

const monthlyConsumptionCalls = [];
const monthlyConsumptionPayloads = [];
const monthlyConsumption = await fetchConsumptionStatistics({
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30",
  granularity: "monthly"
}, {
  pageNumber: 1,
  pageSize: 20
}, {
  async postApi(path, payload) {
    monthlyConsumptionCalls.push(path);
    monthlyConsumptionPayloads.push(payload);
    if (path.includes("readMonthly")) {
      return { code: 0, result: { total: 0, data: [] }, _proxy: { source: "live" } };
    }
    return {
      code: 0,
      result: {
        total: 1,
        data: [{ currentDate: "2026-04-05 00:00:00", usage1: "1.2", meterId: "A" }]
      },
      _proxy: { source: "live" }
    };
  }
});
assert.deepStrictEqual(monthlyConsumptionCalls, ["/api/DailyDataMeter/readMonthly", "/api/DailyDataMeter/read"]);
assert.strictEqual(monthlyConsumptionPayloads[0].FROM, "2026-04-01T00:00:00.000Z");
assert.strictEqual(monthlyConsumptionPayloads[0].TO, "2026-04-30T23:59:59.999Z");
assert.strictEqual(monthlyConsumptionPayloads[1].FROM, "2026-03-31T00:00:00.000Z");
assert.strictEqual(monthlyConsumption.endpoint, "/api/DailyDataMeter/read");
assert.match(monthlyConsumption.warning, /grouped from live daily AMR data/);

await assert.rejects(() => fetchConsumptionStatistics({
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30"
}, {
  pageNumber: 1,
  pageSize: 20
}, {
  async postApi(path) {
    assert.strictEqual(path, "/api/DailyDataMeter/read");
    return { code: 99, reason: "Value does not fall within the expected range.", result: null };
  }
}), /Value does not fall within the expected range/);

await assert.rejects(() => fetchConsumptionStatistics({
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30"
}, {
  pageNumber: 1,
  pageSize: 20
}, {
  async postApi(path) {
    assert.strictEqual(path, "/api/DailyDataMeter/read");
    return {
      code: 0,
      total: 1,
      readings: [{ timestamp: "2026-01-10T00:00:00.000Z", energyConsumptionKwh: 0.21 }],
      _proxy: { source: "sample" }
    };
  }
}), /Live AMR consumption data is unavailable/);

const supabaseBackedConsumption = await fetchConsumptionStatistics({
  dateFrom: "2026-04-01",
  dateTo: "2026-04-30"
}, {
  pageNumber: 1,
  pageSize: 20
}, {
  async postApi(path) {
    assert.strictEqual(path, "/api/DailyDataMeter/read");
    return {
      code: 0,
      result: {
        total: 1,
        data: [{ currentDate: "2026-04-10 00:00:00", usage1: "0.9", meterId: "A" }]
      },
      _proxy: { source: "supabase-consumption" }
    };
  }
});
assert.strictEqual(supabaseBackedConsumption.rows.length, 1);

const dailyDataMeterRequest = tableRequest({
  hash: "#/prepay-report/daily-data-meter",
  title: "Interval Data",
  apis: ["/api/station/read", "/api/DailyDataMeter/read"],
  columns: ["customerId", "meterId"]
}, {
  siteId: "TUNGA",
  from: "2026-01-01T00:00:00.000Z",
  to: "2026-01-31T23:59:59.999Z",
  pageNumber: 2,
  pageSize: 25
});
assert.strictEqual(dailyDataMeterRequest.payload.stationId, "TUNGA");
assert.strictEqual(dailyDataMeterRequest.payload.FROM, "2026-01-01T00:00:00.000Z");
assert.strictEqual(dailyDataMeterRequest.payload.TO, "2026-01-31T23:59:59.999Z");

const stationTableRoutes = routeManifest.filter((route) => route.columns.some((column) => column === "stationId"));
assert(stationTableRoutes.length > 0);
for (const route of stationTableRoutes) {
  assert.strictEqual(routeSupportsSiteFilter(route), true, `${route.title} should expose a station filter`);
  if (route.isCustomPage) continue;
  const request = tableRequest(route, { siteId: "TUNGA", pageNumber: 1, pageSize: 10 });
  const requestData = request.payload || request.params || {};
  assert.strictEqual(
    requestData.stationId || requestData.SITE_ID || requestData.station_id,
    "TUNGA",
    `${route.title} should send its station filter`
  );
}

const abnormalAlarmRoute = routeManifest.find((route) => route.hash === "#/prepay-report/abnormal-alarm");
const abnormalAlarmRequest = tableRequest(abnormalAlarmRoute, {
  siteId: "OGUFA",
  pageNumber: 3,
  pageSize: 10,
  searchTerm: "47300481810",
  orderBy: "meterId desc"
});
assert.strictEqual(routeUsesServerPagination(abnormalAlarmRoute), true);
assert.strictEqual(abnormalAlarmRequest.path, "/api/local/abnormal-alarms");
assert.strictEqual(abnormalAlarmRequest.params.station_id, "OGUFA");
assert.strictEqual(abnormalAlarmRequest.params.searchTerm, "47300481810");
assert.strictEqual(abnormalAlarmRequest.params.sortBy, "meterId");
assert.strictEqual(abnormalAlarmRequest.params.sortDirection, "desc");
assert.strictEqual(abnormalAlarmRequest.params.offset, 20);
assert.strictEqual(abnormalAlarmRequest.params.pageLimit, 10);

const lowPurchaseRoute = routeManifest.find((route) => route.hash === "#/prepay-report/low-purchase-situation");
const lowPurchaseRows = Array.from({ length: 45 }, (_, index) => ({
  customerId: `C-${String(index + 1).padStart(3, "0")}`,
  customerName: `Low Purchase ${index + 1}`,
  meterId: `M-${String(index + 1).padStart(3, "0")}`,
  tariffId: "RESIDENTIAL",
  purchaseTotalUnit: 2.8,
  purchaseTotalPaid: 1000
}));
const lowPurchaseCalls = [];
assert.strictEqual(routeUsesServerPagination(lowPurchaseRoute), true);
const lowPurchaseTable = await fetchTableData(lowPurchaseRoute, { pageNumber: 2, pageSize: 10 }, {
  async postApi(path, payload = {}) {
    if (path !== "/api/PrepayReport/LowPurchaseSituation") {
      return { code: 0, result: { total: 0, data: [] } };
    }
    lowPurchaseCalls.push(payload);
    const pageNumber = Number(payload.pageNumber || 1);
    const pageSize = Math.min(Number(payload.pageSize || 10), 20);
    const start = (pageNumber - 1) * pageSize;
    return {
      code: 0,
      result: {
        total: lowPurchaseRows.length,
        data: lowPurchaseRows.slice(start, start + pageSize)
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(lowPurchaseCalls.length, 1);
assert.strictEqual(lowPurchaseCalls[0].pageNumber, 2);
assert.strictEqual(lowPurchaseCalls[0].pageSize, 10);
assert.strictEqual(lowPurchaseTable.rows.length, 10);
assert.strictEqual(lowPurchaseTable.total, 45);
assert.strictEqual(lowPurchaseTable.meta.source, "mapped");
assert.strictEqual(lowPurchaseTable.rows[0].customerId, "C-011");
assert.strictEqual(lowPurchaseTable.rows[9].totalPaid, 1000);
assert.strictEqual(tableRequest(lowPurchaseRoute, { pageNumber: 1, pageSize: 10 }).payload.dateRange.length, 2);

const lowPurchaseSiteCalls = [];
const lowPurchaseSiteTable = await fetchTableData(lowPurchaseRoute, { siteId: "TUNGA", pageNumber: 2, pageSize: 10 }, {
  async postApi(path, payload = {}) {
    lowPurchaseSiteCalls.push(payload);
    assert.strictEqual(path, "/api/PrepayReport/LowPurchaseSituation");
    return {
      code: 0,
      result: {
        total: lowPurchaseRows.length,
        data: lowPurchaseRows.slice(10, 20)
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.strictEqual(lowPurchaseSiteCalls.length, 1);
assert.strictEqual(lowPurchaseSiteCalls[0].stationId, "TUNGA");
assert.strictEqual(lowPurchaseSiteCalls[0].pageNumber, 2);
assert.strictEqual(lowPurchaseSiteCalls[0].dateRange.length, 2);
assert.strictEqual(lowPurchaseSiteTable.total, 45);

const managementCustomerRoute = routeManifest.find((route) => route.hash === "#/management/customer");
assert.strictEqual(routeUsesServerPagination(managementCustomerRoute), true);
assert.strictEqual(tableRequest(managementCustomerRoute, { pageNumber: 1, pageSize: 10, orderBy: "customerId asc" }).payload.orderBy, "customerId asc");
assert.strictEqual(tableRequest(managementCustomerRoute, { pageNumber: 1, pageSize: 10, orderBy: "id asc" }).payload.orderBy, "customerId asc");
assert.strictEqual("orderBy" in tableRequest(managementCustomerRoute, { pageNumber: 1, pageSize: 10, orderBy: "asc" }).payload, false);
const managementCustomerRows = Array.from({ length: 63 }, (_, index) => ({
  customerId: `CU-${String(index + 1).padStart(3, "0")}`,
  customerName: `Management Customer ${index + 1}`,
  phone: `0800000${String(index + 1).padStart(3, "0")}`,
  address: "Kyakale",
  stationId: "KYAKALE"
}));
const managementCustomerCalls = [];
const managementCustomerTable = await fetchTableData(managementCustomerRoute, { pageNumber: 2, pageSize: 10, searchTerm: "AHJ" }, {
  async postApi(path, payload = {}) {
    managementCustomerCalls.push({ path, payload });
    if (path === "/api/station/read") {
      return { code: 0, result: { total: 0, data: [] } };
    }
    assert.strictEqual(path, "/api/customer/read");
    const pageNumber = Number(payload.pageNumber || 1);
    const pageSize = Math.min(Number(payload.pageSize || 20), 20);
    const start = (pageNumber - 1) * pageSize;
    return {
      code: 0,
      result: {
        total: 63,
        data: managementCustomerRows.slice(start, start + pageSize)
      }
    };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
const customerReadCalls = managementCustomerCalls.filter((call) => call.path === "/api/customer/read");
assert.strictEqual(customerReadCalls.length, 1);
assert.strictEqual(managementCustomerCalls.some((call) => call.path === "/api/station/read"), false);
assert.strictEqual(customerReadCalls[0].payload.pageNumber, 2);
assert.strictEqual(customerReadCalls[0].payload.pageSize, 10);
assert.strictEqual(customerReadCalls[0].payload.searchTerm, "AHJ");
assert.strictEqual(managementCustomerTable.rows.length, 10);
assert.strictEqual(managementCustomerTable.total, 63);
assert.strictEqual(managementCustomerTable.serverPaginated, true);
assert.strictEqual(managementCustomerTable.rows[0].id, "CU-011");
assert.strictEqual(managementCustomerTable.rows[9].name, "Management Customer 20");

const creditTokenRoute = routeManifest.find((route) => route.hash === "#/token-record/credit-token-record");
const creditTokenCalls = [];
const creditTokenTable = await fetchTableData(creditTokenRoute, { pageNumber: 3, pageSize: 10 }, {
  async postApi(path, payload = {}) {
    creditTokenCalls.push({ path, payload });
    return {
      code: 0,
      result: {
        total: 318,
        data: Array.from({ length: 10 }, (_, index) => ({ receiptId: 21 + index }))
      }
    };
  },
  async getApi() {
    throw new Error("Credit token pagination must use POST.");
  }
});
assert.strictEqual(creditTokenCalls.length, 1);
assert.strictEqual(creditTokenCalls[0].path, "/api/token/creditTokenRecord/read");
assert.strictEqual(creditTokenCalls[0].payload.pageNumber, 3);
assert.strictEqual(creditTokenCalls[0].payload.pageSize, 10);
assert.strictEqual(creditTokenTable.rows.length, 10);
assert.strictEqual(creditTokenTable.total, 318);
assert.strictEqual(creditTokenTable.serverPaginated, true);

const exportSourceRows = Array.from({ length: 45 }, (_, index) => ({
  receiptId: index + 1,
  customerName: `Customer ${index + 1}`,
  createDate: "2026-07-01T10:00:00.000Z"
}));
const creditTokenExportCalls = [];
const creditTokenExport = await fetchTableExportData(creditTokenRoute, {
  from: "2026-06-01T00:00:00.000Z",
  to: "2026-08-01T00:00:00.000Z",
  orderBy: "createDate desc"
}, {
  async postApi(path, payload = {}) {
    creditTokenExportCalls.push({ path, payload });
    const pageNumber = Number(payload.pageNumber || 1);
    const pageSize = Math.min(Number(payload.pageSize || 20), 20);
    const start = (pageNumber - 1) * pageSize;
    return { code: 0, result: { total: exportSourceRows.length, data: exportSourceRows.slice(start, start + pageSize) } };
  },
  async getApi() {
    throw new Error("Credit token export must use POST.");
  }
});
assert.strictEqual(creditTokenExport.rows.length, 45);
assert.strictEqual(creditTokenExport.total, 45);
assert.strictEqual(creditTokenExportCalls.length, 3);
assert.deepStrictEqual(creditTokenExportCalls.map((call) => call.payload.pageNumber), [1, 2, 3]);

const remoteReadingTaskRoute = routeManifest.find((route) => route.hash === "#/remote-operation-record/remote-meter-reading-task");
const remoteReadingTaskTable = await fetchTableData(remoteReadingTaskRoute, { pageSize: 2 }, {
  async postApi(path, payload = {}) {
    if (path === "/api/station/read") {
      return { code: 0, result: { total: 0, data: [] } };
    }
    assert.strictEqual(path, "/API/RemoteMeterTask/GetReadingTask");
    const pageNumber = Number(payload.pageNumber || 1);
    const rows = pageNumber === 1
      ? [
        { meterId: "M-1", customerId: "C-1", dataItem: "Power", createDate: "2026-05-18 10:00:00", status: 1 },
        { meterId: "M-2", customerId: "C-2", dataItem: "Power", createDate: "2026-05-18 10:01:00", status: 1 }
      ]
      : [
        { meterId: "M-2", customerId: "C-2", dataItem: "Power", createDate: "2026-05-18 10:01:00", status: 1 },
        { meterId: "M-3", customerId: "C-3", dataItem: "Power", createDate: "2026-05-18 10:02:00", status: 1 }
      ];
    return { code: 0, result: { total: 4, data: rows } };
  },
  async getApi() {
    return { code: 0, result: { total: 0, data: [] } };
  }
});
assert.deepStrictEqual(remoteReadingTaskTable.rows.map((row) => row.meterId), ["M-1", "M-2", "M-3"]);
assert.strictEqual(remoteReadingTaskTable.total, 3);

const action = mapActionResponse({
  code: 0,
  result: {
    token: "123456"
  },
  _proxy: {
    source: "live"
  }
}, "Generate Token");

assert.strictEqual(action.resultText, "Token: 123456");
assert.strictEqual(action.envelope._proxy.source, "live");
const gatewayEditFields = managementFields(gatewayRoute, "Edit");
assert.strictEqual(gatewayEditFields.find((field) => field.name === "stationId").required, true);
assert.strictEqual(gatewayEditFields.find((field) => field.name === "stationId").type, "select");
const meterAddFields = managementFields(meterRoute, "Add");
assert(meterAddFields.some((field) => field.name === "meterId" && field.required));
assert(meterAddFields.some((field) => field.name === "type" && field.type === "select"));
assert(meterAddFields.some((field) => field.name === "communicationWay" && field.type === "select"));
assert(meterAddFields.some((field) => field.name === "stationId" && field.required));
const accountAddFields = managementFields(accountRoute, "Add");
assert(accountAddFields.some((field) => field.name === "ctRatio"));
assert(accountAddFields.some((field) => field.name === "stationId" && field.required));
const dlmsEditFields = managementFields(dlmsRoute, "Edit");
assert(dlmsEditFields.some((field) => field.name === "dlmsId" && field.readonly));
assert(dlmsEditFields.some((field) => field.name === "nameEN"));
const firmwareAddFields = managementFields({ hash: "#/remote-support/firmware-update" }, "Add");
assert(firmwareAddFields.some((field) => field.name === "gatewayId" && field.required));
assert(firmwareAddFields.some((field) => field.name === "fileName" && field.picker && field.pickerApi === "/api/local/importJobs/read"));
assert.deepStrictEqual(
  managementFormSeed(accountRoute, "Edit", { customerId: "C-1", meterId: "M-1" }),
  {
    customerId: "C-1",
    meterId: "M-1",
    tariffId: "",
    ctRatio: "",
    remark: "",
    stationId: "",
    oldMeterId: "M-1"
  }
);
assert.deepStrictEqual(
  managementFormSeed(dlmsRoute, "Edit", { dlmsId: 17, nameEN: "Reconnect", obis: "0.0.96.3.10.255", version: "1.1", type: 2, classId: 70, remark: "System" }),
  {
    dlmsId: 17,
    version: "1.1",
    type: 2,
    classId: 70,
    obis: "0.0.96.3.10.255",
    nameEN: "Reconnect",
    remark: "System"
  }
);
assert.strictEqual(
  validateWriteForm("Delete", gatewayRoute, { gatewayId: "GW-1", confirmDelete: false }, managementFields(gatewayRoute, "Delete")),
  "delete confirmation is required"
);
assert.strictEqual(
  validateWriteForm("Delete", gatewayRoute, { gatewayId: "GW-1", confirmDelete: true }, managementFields(gatewayRoute, "Delete")),
  ""
);
assert.deepStrictEqual(
  stripWriteMeta({
    gatewayId: "GW-1",
    authorizationPassword: "secret",
    confirmDelete: true,
    confirmationText: "Confirm delete",
    routeHash: "#/management/gateway",
    action: "Delete",
    authorizationProvided: true,
    fileName: "sample.csv"
  }),
  { gatewayId: "GW-1" }
);

await assert.rejects(
  () => submitRouteAction(accountRoute, "Add", {
    customerId: "1001",
    customerName: "Ada",
    confirmationText: "Confirm Add Account",
    authorizationPassword: "approved"
  }, {
    fields: [{ name: "customerId", label: "Customer Id" }]
  }),
  /not submitted/
);

const remoteConfirmCalls = [];
const remoteConfirmRoute = routeManifest.find((route) => route.hash === "#/remote-operation-record/remote-meter-token-task");
const remoteConfirmResult = await submitRouteAction(remoteConfirmRoute, "Confirm", {
  id: 8364,
  meterId: "47300481810",
  data: "61688642353365376881"
}, {
  liveWritesAllowed: true,
  api: {
    async postApi(path, payload, options = {}) {
      remoteConfirmCalls.push({ path, payload, headers: options.headers });
      return { code: 0, result: [{ id: 8364 }] };
    }
  }
});
assert.strictEqual(remoteConfirmResult.endpoint, "/api/RemoteMeterTask/UpdateTokenTask");
assert.deepStrictEqual(remoteConfirmCalls[0].payload, [{ id: 8364 }]);
assert.strictEqual(remoteConfirmCalls[0].headers["X-Route-Action"], "Confirm");

const remoteConfirmAcceptedResult = await submitRouteAction(remoteConfirmRoute, "Confirm", {
  id: 8370,
  meterId: "47300481810",
  data: "63751343398450415494"
}, {
  liveWritesAllowed: true,
  api: {
    async postApi() {
      return { code: 99, reason: "No data has been changed", result: null };
    }
  }
});
assert.strictEqual(remoteConfirmAcceptedResult.resultText, "Confirm submitted");

const customerDeleteCalls = [];
const customerDeleteApi = {
  async postApi(path, payload = {}) {
    customerDeleteCalls.push({ path, payload });
    if (path === "/api/account/read") {
      if (customerDeleteCalls.filter((call) => call.path === "/api/account/read").length === 1) {
        return {
          code: 0,
          result: {
            data: [{ customerId: "12345678", meterId: "47005306088" }]
          }
        };
      }
      return {
        code: 0,
        result: {
          data: []
        }
      };
    }
    if (path === "/api/account/delete") return { code: 0, result: null };
    if (path === "/api/customer/delete") return { code: 0, result: null };
    if (path === "/api/customer/read") return { code: 0, result: { data: [] } };
    throw new Error(`Unexpected path: ${path}`);
  }
};

const customerDeleteResult = await submitRouteAction(customerRoute, "Delete", {
  customerId: "12345678",
  confirmDelete: true,
  confirmationText: "Confirm delete for Customer"
}, {
  fields: managementFields(customerRoute, "Delete"),
  liveWritesAllowed: true,
  api: customerDeleteApi
});

assert.strictEqual(customerDeleteResult.resultText, "Delete success");
assert.deepStrictEqual(customerDeleteCalls.map((call) => call.path), [
  "/api/account/read",
  "/api/account/delete",
  "/api/account/read",
  "/api/customer/delete",
  "/api/customer/read"
]);

await assert.rejects(
  () => submitRouteAction(customerRoute, "Delete", {
    customerId: "12345678",
    confirmDelete: true,
    confirmationText: "Confirm delete for Customer"
  }, {
    fields: managementFields(customerRoute, "Delete"),
    liveWritesAllowed: true,
    api: {
      async postApi(path) {
        if (path === "/api/account/read") return { code: 0, result: { data: [] } };
        if (path === "/api/customer/delete") return { code: 0, result: null };
        if (path === "/api/customer/read") {
          return { code: 0, result: { data: [{ customerId: "12345678" }] } };
        }
        throw new Error(`Unexpected path: ${path}`);
      }
    }
  }),
  /record still exists/
);

const dashboard = await fetchDashboardData({
  activeType: 3,
  pageSize: 1,
  api: {
    postApi(path, payload = {}) {
      if (path === "/api/dashboard/readPanelGroup") {
        return Promise.resolve({
          code: 0,
          result: {
            totalAccountCount: 2,
            totalPurchaseTimes: 3,
            totalPurchaseUnit: 4,
            totalPurchaseMoney: 5
          },
          _proxy: { source: "live" }
        });
      }
      if (payload.type === 3) {
        return Promise.resolve({ code: 0, result: { xData: ["2026-01-01"], yData: [5] } });
      }
      if (payload.type === 6) {
        return Promise.resolve({
          code: 0,
          result: {
            xData: ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"],
            yData: [91, 95, 93, 94, 96, 92]
          }
        });
      }
      if (payload.type === 7) {
        return Promise.resolve({
          code: 0,
          result: {
            xData: ["Battery Low", "Relay Open", "Current Reverse", "No Data Report"],
            yData: [2, 4, 1, 3]
          }
        });
      }
      return Promise.resolve({ code: 0, result: { data: [] } });
    },
    getApi() {
      return Promise.resolve({ code: 0, result: { data: [] } });
    }
  }
});

assert(dashboard.panel.totalAccountCount >= 0);
assert(dashboard.top.labels.length >= 1);
assert.deepStrictEqual(dashboard.success.labels, ["10:00", "12:00", "14:00", "16:00", "18:00", "20:00"]);
assert.deepStrictEqual(dashboard.success.values, [91, 95, 93, 94, 96, 92]);
assert.deepStrictEqual(dashboard.alarms, [
  { label: "No Data Report", color: "#2ec7c9", value: 3 },
  { label: "Current Unbalance", color: "#b6a2de", value: 0 },
  { label: "Current Reverse", color: "#5ab1ef", value: 1 },
  { label: "Cover Open", color: "#ffb26a", value: 0 },
  { label: "Terminal Cover Open", color: "#d87a80", value: 0 },
  { label: "Magnetic Interference", color: "#8d98b3", value: 0 },
  { label: "Battery Low", color: "#e5cf0d", value: 2 },
  { label: "Relay Open", color: "#97b552", value: 4 }
]);
assert.strictEqual(dashboard.meta.siteId, "KYAKALE");

const dashboardCalls = [];
const monthlyDashboard = await fetchDashboardData({
  activeType: 2,
  consumptionType: 5,
  pageSize: 50,
  now: new Date("2026-07-16T12:00:00.000Z"),
  api: {
    postApi(path, payload = {}) {
      dashboardCalls.push({ method: "POST", path, payload });
      return Promise.resolve({ code: 0, result: { xData: [], yData: [] } });
    },
    getApi(path, params = {}) {
      dashboardCalls.push({ method: "GET", path, params });
      return Promise.resolve({ code: 0, result: { data: [] } });
    }
  }
});

assert.strictEqual(monthlyDashboard.consumption.title, "Monthly Consumption");
assert.deepStrictEqual(monthlyDashboard.consumption.labels, []);

assert.strictEqual(isSyntheticDashboardResponse({ _proxy: { source: "sample" } }), true);
assert.strictEqual(isSyntheticDashboardResponse({ _proxy: { source: "sample-after-live-failure" } }), true);
assert.strictEqual(isSyntheticDashboardResponse({ _proxy: { source: "live" } }), false);
assert.deepStrictEqual(
  filterDashboardSeriesToWindow(
    { labels: ["2026-04-03", "2026-07-15"], values: [1580, 2600] },
    "2026-06-17T00:00:00.000Z",
    "2026-07-16T12:00:00.000Z"
  ),
  { labels: ["2026-07-15"], values: [2600] }
);

const truthfulDashboard = await fetchDashboardData({
  now: new Date("2026-07-16T12:00:00.000Z"),
  api: {
    postApi(path, payload = {}) {
      if (path === "/api/dashboard/readLineChart" && payload.type === 4) {
        return Promise.resolve({
          code: 0,
          result: { xData: ["2026-04-03"], yData: [1580] },
          _proxy: { source: "sample-after-live-failure" }
        });
      }
      return Promise.resolve({ code: 0, result: { xData: [], yData: [] }, _proxy: { source: "live" } });
    },
    getApi(path) {
      if (path === "/api/dashboard/hourly") {
        return Promise.resolve({
          code: 0,
          result: { data: [{ freezeDate: "2026-04-03", positiveActiveTotalPower: 1580 }] },
          _proxy: { source: "sample-after-live-failure" }
        });
      }
      return Promise.resolve({ code: 0, result: { data: [] }, _proxy: { source: "live" } });
    }
  }
});

assert.deepStrictEqual(truthfulDashboard.consumption.labels, []);
assert.deepStrictEqual(truthfulDashboard.consumption.values, []);
assert.strictEqual(truthfulDashboard.meta.consumptionSource, "sample-after-live-failure");
assert.strictEqual(truthfulDashboard.meta.hourlySource, "sample-after-live-failure");

assert.deepStrictEqual(
  dashboardCalls.filter((call) => call.method === "POST" && call.path === "/api/dashboard/readLineChart"),
  [
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-06-17T00:00:00.000Z", to: "2026-07-16T12:00:00.000Z", siteId: "KYAKALE", type: 2, days: 30 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-06-17T00:00:00.000Z", to: "2026-07-16T12:00:00.000Z", siteId: "KYAKALE", type: 5, days: 30 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-06-17T00:00:00.000Z", to: "2026-07-16T12:00:00.000Z", siteId: "KYAKALE", type: 6, days: 48 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-06-17T00:00:00.000Z", to: "2026-07-16T12:00:00.000Z", siteId: "KYAKALE", type: 7, days: 1 }
    }
  ]
);

assert.deepStrictEqual(
  dashboardCalls.filter((call) => call.method === "GET").map((call) => ({
    path: call.path,
    params: call.params
  })),
  []
);

console.log(JSON.stringify({
  tableRows: table.rows.length,
  dashboardLabels: dashboard.top.labels.length,
  status: "service layer passed"
}, null, 2));
