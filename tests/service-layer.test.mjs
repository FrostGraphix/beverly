import assert from "node:assert";
import { actionEndpoint, submitRouteAction } from "../src/services/action-service.mjs";
import { fetchDashboardData } from "../src/services/dashboard-service.mjs";
import { mapActionResponse } from "../src/services/mappers/action-mapper.mjs";
import { mapTableCollection } from "../src/services/mappers/table-mapper.mjs";
import { routeManifest } from "../src/data/route-manifest.js";
import { managementFields, managementFormSeed } from "../src/services/management-forms.mjs";
import { defaultTableOptions, tableRequest } from "../src/services/table-service.mjs";
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
const manifestGatewayRoute = routeManifest.find((route) => route.hash === "#/management/gateway");

assert.strictEqual(actionEndpoint(accountRoute, "Add"), "/api/account/create");
assert.strictEqual(actionEndpoint(accountRoute, "Edit"), "/api/account/update");
assert.strictEqual(actionEndpoint(accountRoute, "Delete"), "/api/account/delete");

const creditTokenRecordRoute = {
  hash: "#/token-record/credit-token-record",
  title: "Credit Token Record",
  apis: ["/api/token/creditTokenRecord/read"],
  columns: ["Receipt Id", "Customer Id", "Meter Id", "Actions"]
};

assert.strictEqual(actionEndpoint(creditTokenRecordRoute, "Cancel"), "/api/token/creditTokenRecord/cancel");

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

const gatewayTable = mapTableCollection({
  code: 0,
  result: {
    data: [{ gatewayId: "GW-1", gatewayName: "North Hub", status: true }]
  }
}, gatewayRoute);
assert.strictEqual(gatewayTable.rows[0].id, "GW-1");
assert.strictEqual(gatewayTable.rows[0].name, "North Hub");
assert.strictEqual(gatewayTable.rows[0].status, "Online");
assert(manifestGatewayRoute.actions.includes("Edit"));
assert(manifestGatewayRoute.actions.includes("Delete"));
assert.strictEqual(needsAuthorizationPassword("Delete", gatewayRoute), false);

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
assert.strictEqual(request.payload.pageSize, 25);

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
  tableRequest({
    hash: "#/prepay-report/consumption-statistics",
    title: "Consumption Statistics",
    apis: ["/api/DailyDataMeter/readHourly"],
    columns: ["collectionDate", "consumption"]
  }, {
    pageNumber: 1,
    pageSize: 50
  }).params,
  {
    offset: 0,
    pageLimit: 50,
    FROM: "2026-01-01T00:00:00.000Z",
    TO: "2026-01-17T00:00:00.000Z"
  }
);

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
assert.deepStrictEqual(
  managementFields(gatewayRoute, "Edit"),
  [
    { name: "gatewayId", label: "Gateway Id", required: true, readonly: true },
    { name: "gatewayName", label: "Gateway Name", required: false, readonly: false },
    { name: "stationId", label: "Station Id", required: false, readonly: false },
    { name: "remark", label: "Remark", required: false, readonly: false }
  ]
);
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
  /Writes are blocked/
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
  { label: "Battery Low", value: 2, color: "#35c2c1" },
  { label: "Relay Open", value: 4, color: "#5caee8" },
  { label: "Current Reverse", value: 1, color: "#b399dd" },
  { label: "No Data Report", value: 3, color: "#ffb26a" }
]);
assert.strictEqual(dashboard.meta.siteId, "KYAKALE");

const dashboardCalls = [];
await fetchDashboardData({
  activeType: 2,
  pageSize: 50,
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

assert.deepStrictEqual(
  dashboardCalls.filter((call) => call.method === "POST" && call.path === "/api/dashboard/readLineChart"),
  [
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", type: 2, days: 30 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", type: 4, days: 30 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", type: 6, days: 48 }
    },
    {
      method: "POST",
      path: "/api/dashboard/readLineChart",
      payload: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", type: 7, days: 1 }
    }
  ]
);

assert.deepStrictEqual(
  dashboardCalls.filter((call) => call.method === "GET").map((call) => ({
    path: call.path,
    params: call.params
  })),
  [
    {
      path: "/api/dashboard/hourly",
      params: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", pageNumber: 1, pageSize: 50 }
    },
    {
      path: "/api/dashboard/gprs",
      params: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", pageNumber: 1, pageSize: 48 }
    },
    {
      path: "/api/dashboard/events",
      params: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE", pageNumber: 1, pageSize: 20 }
    },
    {
      path: "/api/token/creditTokenRecord/readMore",
      params: { from: "2026-03-29T00:00:00.000Z", to: "2026-04-27T23:59:59.999Z", siteId: "KYAKALE" }
    }
  ]
);

console.log(JSON.stringify({
  tableRows: table.rows.length,
  dashboardLabels: dashboard.top.labels.length,
  status: "service layer passed"
}, null, 2));
