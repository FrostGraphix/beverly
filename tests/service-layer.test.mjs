import assert from "node:assert";
import { actionEndpoint, submitRouteAction } from "../src/services/action-service.mjs";
import { aggregateConsumptionRows, buildConsumptionChartOption, buildConsumptionStatisticsPayload, normalizeConsumptionStatisticsResponse } from "../src/services/consumption-statistics-service.mjs";
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
const dlmsRoute = {
  hash: "#/protocol/dlms",
  title: "DLMS",
  apis: ["/api/dlms/read"],
  columns: ["Id", "Version", "Type", "Class Id", "OBIS", "Name", "Remark", "Actions"]
};
const manifestGatewayRoute = routeManifest.find((route) => route.hash === "#/management/gateway");
const manifestDlmsRoute = routeManifest.find((route) => route.hash === "#/protocol/dlms");

assert.strictEqual(actionEndpoint(accountRoute, "Add"), "/api/account/create");
assert.strictEqual(actionEndpoint(accountRoute, "Edit"), "/api/account/update");
assert.strictEqual(actionEndpoint(accountRoute, "Delete"), "/api/account/delete");
assert.strictEqual(actionEndpoint(dlmsRoute, "Edit"), "/api/dlms/update");
assert.strictEqual(actionEndpoint(dlmsRoute, "Delete"), "/api/dlms/delete");
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

const consumptionRequest = tableRequest({
  hash: "#/prepay-report/consumption-statistics",
  title: "Consumption Statistics",
  apis: ["/api/customer/read", "/api/meter/read", "/api/DailyDataMeter/read"],
  columns: ["collectionDate", "consumption"]
}, {
  pageNumber: 1,
  pageSize: 50
});
assert.strictEqual(consumptionRequest.path, "/api/DailyDataMeter/readHourly");
assert.strictEqual(consumptionRequest.method, "GET");
assert.strictEqual(consumptionRequest.params.offset, 0);
assert.strictEqual(consumptionRequest.params.pageLimit, 50);
assert.ok(consumptionRequest.params.FROM);
assert.ok(consumptionRequest.params.TO);

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
    FROM: "2026-04-01T00:00:00.000Z",
    TO: "2026-04-30T23:59:59.999Z",
    customerId: "470005342689",
    meterId: "470005342689",
    stationId: "TUNGA"
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
const accountAddFields = managementFields(accountRoute, "Add");
assert(accountAddFields.some((field) => field.name === "ctRatio"));
assert(accountAddFields.some((field) => field.name === "stationId" && field.required));
const dlmsEditFields = managementFields(dlmsRoute, "Edit");
assert(dlmsEditFields.some((field) => field.name === "dlmsId" && field.readonly));
assert(dlmsEditFields.some((field) => field.name === "nameEN"));
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
  /Writes are blocked/
);

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
