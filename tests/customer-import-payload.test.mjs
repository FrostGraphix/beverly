import assert from "node:assert";
import { submitRouteAction } from "../src/services/action-service.mjs";

const cases = [
  {
    hash: "#/management/customer",
    expectedEndpoint: "/api/customer/import",
    rows: [{
    id: "470005342689",
    name: "HARUNA ADAMU",
    phone: "08012345678",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "",
    remark: "Imported",
    createDate: "2026-07-30",
    updateDate: "2026-07-30",
    stationId: "TUNGA"
    }],
    expectedPayload: [{
    customerId: "470005342689",
    customerName: "HARUNA ADAMU",
    phone: "08012345678",
    address: "TUNGA",
    remark: "Imported",
    stationId: "TUNGA"
    }]
  },
  {
    hash: "#/management/gateway",
    expectedEndpoint: "/api/gateway/import",
    rows: [{ id: "GATEWAY-001", name: "TUNGA", stationId: "TUNGA", createDate: "2026-07-30" }],
    expectedPayload: [{ gatewayId: "GATEWAY-001", gatewayName: "TUNGA", stationId: "TUNGA" }]
  },
  {
    hash: "#/management/tariff",
    expectedEndpoint: "/api/tariff/import",
    rows: [{ id: "RESIDENTIAL", name: "Residential", price: "350", updateDate: "2026-07-30" }],
    expectedPayload: [{ tariffId: "RESIDENTIAL", tariffName: "Residential", price: "350" }]
  },
  {
    hash: "#/management/account",
    expectedEndpoint: "/api/account/import",
    rows: [{ customerId: "C-1", meterId: "M-1", tariffId: "RESIDENTIAL", ctRatio: "1", remark: "", stationId: "TUNGA" }],
    expectedPayload: [{ customerId: "C-1", meterId: "M-1", tariffId: "RESIDENTIAL", ctRatio: "1", remark: "", stationId: "TUNGA" }]
  },
  {
    hash: "#/admin/user",
    expectedEndpoint: "/api/user/import",
    rows: [{ userId: "operator", name: "Operator", status: "true", stationId: "TUNGA" }],
    expectedPayload: [{ userId: "operator", name: "Operator", status: "true", stationId: "TUNGA" }]
  },
  {
    hash: "#/admin/meter",
    expectedEndpoint: "/api/meter/import",
    rows: [{ meterId: "M-1", meterType: "0", communicationWay: "1", protocolVersion: "2.2", stationId: "TUNGA" }],
    expectedPayload: [{ meterId: "M-1", type: "0", communicationWay: "1", protocolVersion: "2.2", stationId: "TUNGA" }]
  },
  {
    hash: "#/protocol/dlms",
    expectedEndpoint: "/api/dlms/import",
    rows: [{ id: "1", name: "Voltage", version: "1", type: "1", classId: "1", obis: "1.0.32.7.0.255" }],
    expectedPayload: [{ dlmsId: "1", nameEN: "Voltage", version: "1", type: "1", classId: "1", obis: "1.0.32.7.0.255" }]
  }
];

for (const testCase of cases) {
  const requests = [];
  await submitRouteAction({ hash: testCase.hash, title: "Import", columns: [] }, "Import", {}, {
    importRows: testCase.rows,
    liveWritesAllowed: true,
    api: {
      postApi: async (endpoint, payload) => {
        requests.push({ endpoint, payload });
        return { code: 0, result: {} };
      }
    }
  });
  assert.deepStrictEqual(requests, [{ endpoint: testCase.expectedEndpoint, payload: testCase.expectedPayload }]);
}

console.log("management import payloads passed");
