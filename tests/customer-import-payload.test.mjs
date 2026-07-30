import assert from "node:assert";
import { submitRouteAction } from "../src/services/action-service.mjs";

const requests = [];
const route = {
  hash: "#/management/customer",
  title: "Customer",
  columns: ["Id", "Name", "Phone", "Address", "CertifiName", "CertifiNo", "Remark", "Create Time", "Update Time", "Station Id"]
};

await submitRouteAction(route, "Import", {}, {
  importRows: [{
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
  liveWritesAllowed: true,
  api: {
    postApi: async (endpoint, payload) => {
      requests.push({ endpoint, payload });
      return { code: 0, result: {} };
    }
  }
});

assert.deepStrictEqual(requests, [{
  endpoint: "/api/customer/import",
  payload: [{
    customerId: "470005342689",
    customerName: "HARUNA ADAMU",
    phone: "08012345678",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "",
    remark: "Imported",
    stationId: "TUNGA"
  }]
}]);

console.log("customer import payload passed");
