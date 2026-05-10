import assert from "node:assert/strict";
import {
  buildRemoteTaskPayload,
  defaultRemoteDataItem,
  findRemoteTaskOption,
  formatToken,
  isRemoteTaskAction,
  normalizeRemoteDataItem,
  normalizeAccountStatus,
  normalizeRemoteStatus,
  remoteTaskEndpoint,
  remoteTaskNeedsAuthorization,
  remoteTaskTitle,
  remoteTaskValidationError
} from "../src/services/remote-task-flow.mjs";

const tokenRoute = { hash: "#/remote-operation/remote-meter-token" };
const readingRoute = { hash: "#/remote-operation/remote-meter-reading" };
const controlRoute = { hash: "#/remote-operation/remote-meter-control" };
const gprsRoute = { hash: "#/remote-support/gprs-tasks" };

assert.equal(remoteTaskEndpoint(tokenRoute), "/API/RemoteMeterTask/CreateTokenTask");
assert.equal(remoteTaskEndpoint(readingRoute), "/API/RemoteMeterTask/CreateReadingTask");
assert.equal(remoteTaskEndpoint(controlRoute), "/API/RemoteMeterTask/CreateControlTask");
assert.equal(remoteTaskEndpoint(gprsRoute), "/API/GPRSMeterTask/GPRSCreateReadingTask");
assert.equal(remoteTaskNeedsAuthorization(readingRoute), false);
assert.equal(remoteTaskNeedsAuthorization(controlRoute), false);
assert.equal(remoteTaskNeedsAuthorization(tokenRoute), false);
assert.equal(isRemoteTaskAction(gprsRoute, "Add Task"), true);
assert.equal(remoteTaskTitle(gprsRoute, "Add Task"), "Add Task (GPRS Reading)");

assert.equal(defaultRemoteDataItem(tokenRoute), "Send Token");
assert.equal(defaultRemoteDataItem(controlRoute), "Switch On");
assert.equal(defaultRemoteDataItem(gprsRoute), "Credit balance");
assert.equal(normalizeRemoteDataItem(readingRoute, " total consumption "), "Total Consumption");
assert.equal(normalizeRemoteDataItem(readingRoute, "Total Consumption(kWh)"), "Total Consumption");
assert.equal(normalizeRemoteDataItem(readingRoute, "READ_TOTAL_ENERGY"), "Total Consumption");
assert.equal(normalizeRemoteDataItem(readingRoute, "unknown"), "");
assert.equal(findRemoteTaskOption(readingRoute, "unknown"), null);
assert.equal(formatToken("00212636862844086688"), "0021 2636 8628 4408 6688");
assert.equal(normalizeAccountStatus(true), "Online");
assert.equal(normalizeAccountStatus(false), "Offline");
assert.equal(normalizeRemoteStatus(0), "StandBy");
assert.equal(normalizeRemoteStatus(1), "Success");
assert.equal(normalizeRemoteStatus(2), "Failure");
assert.equal(normalizeRemoteStatus(3), "Processing");

const form = {
  customerId: "47005372686",
  customerName: "Mohammed Kaura",
  meterId: "47005372686",
  stationId: "TUNGA",
  dataItem: "Send Token",
  token: "0021 2636 8628 4408 6688",
  authorizationPassword: "secret",
  remark: ""
};

assert.equal(remoteTaskValidationError(tokenRoute, form), "");
assert.equal(remoteTaskValidationError(tokenRoute, { ...form, token: "" }), "token is required");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, authorizationPassword: "", dataItem: "Credit balance" }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, authorizationPassword: "", dataItem: "READ_TOTAL_ENERGY" }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, authorizationPassword: "", dataItem: "not-a-real-item" }), "Select a valid data item");
assert.equal(remoteTaskValidationError(controlRoute, { ...form, authorizationPassword: "", dataItem: "Switch On" }), "");
assert.equal(remoteTaskValidationError(gprsRoute, { ...form, authorizationPassword: "", dataItem: "Credit balance", meterId: "47005372686", stationId: "TUNGA" }), "");
assert.equal(remoteTaskValidationError(gprsRoute, { ...form, authorizationPassword: "", dataItem: "Credit balance", meterId: "", stationId: "TUNGA" }), "meterId is required");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, selectedMeterIds: ["M1"], selectedDataItems: ["Credit balance"], meterId: "", stationId: "", authorizationPassword: "", dataItem: "Credit balance" }, { action: "Add Batch Task", rows: [{ meterId: "M1" }] }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, selectedMeterIds: [], selectedDataItems: ["Credit balance"], meterId: "", stationId: "", authorizationPassword: "", dataItem: "Credit balance" }, { action: "Add Batch Task", rows: [{ meterId: "M1" }] }), "meterIds are required");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, meterId: "", stationId: "", authorizationPassword: "", dataItem: "Credit balance" }, { action: "Add Batch Task", rows: [] }), "rows are required");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, selectedMeterIds: ["M1"], selectedDataItems: ["Credit balance", "Power"] }, { action: "Add Batch Task", rows: [{ meterId: "M1", stationId: "S1" }] }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, selectedMeterIds: ["M1"], selectedDataItems: [] }, { action: "Add Batch Task", rows: [{ meterId: "M1", stationId: "S1" }] }), "dataItems are required");

assert.deepEqual(buildRemoteTaskPayload(tokenRoute, "Add Task", form), [
  {
    customerId: "47005372686",
    customerName: "Mohammed Kaura",
    meterId: "47005372686",
    version: "2.2",
    flag: "A120",
    name: "Send Token",
    dataItem: "Send Token",
    dataDefault: "",
    dataPrefix: "",
    data: "00212636862844086688",
    stationId: "TUNGA",
    remark: ""
  }
]);

assert.equal(buildRemoteTaskPayload(controlRoute, "Add Task", { ...form, dataItem: "Switch Off" })[0].dataDefault, "335500000001");
assert.equal(buildRemoteTaskPayload(controlRoute, "Add Task", { ...form, dataItem: "Switch Off" })[0].flag, "C03C", "Switch Off flag must be protocol command");
assert.equal(buildRemoteTaskPayload(controlRoute, "Add Task", { ...form, dataItem: "Switch Off" })[0].data, "335500000001", "Switch Off data must be protocol payload");
assert.equal(buildRemoteTaskPayload(controlRoute, "Add Task", { ...form, dataItem: "Switch On" })[0].flag, "C03D", "Switch On flag must be protocol command");
assert.equal(buildRemoteTaskPayload(controlRoute, "Add Task", { ...form, dataItem: "Switch On" })[0].data, "996600000001", "Switch On data must be protocol payload");
assert.equal(buildRemoteTaskPayload(readingRoute, "Add Task", { ...form, dataItem: "Credit balance" })[0].dataPrefix, "Credit balance,,");
assert.equal(buildRemoteTaskPayload(readingRoute, "Add Task", { ...form, dataItem: "Credit balance" })[0].flag, "E421");
assert.equal(buildRemoteTaskPayload(readingRoute, "Add Task", { ...form, dataItem: "Total Consumption" })[0].flag, "901F");
assert.equal(buildRemoteTaskPayload(readingRoute, "Add Task", { ...form, customerId: "", dataItem: "Credit balance" })[0].customerId, "47005372686");
assert.deepEqual(buildRemoteTaskPayload(gprsRoute, "Add Task", { ...form, dataItem: "Credit balance", protocolVersion: "1.0" }), [
  {
    customerId: "47005372686",
    customerName: "Mohammed Kaura",
    meterId: "47005372686",
    version: "1.0",
    flag: "E421",
    name: "Credit balance",
    dataItem: "Credit balance",
    dataDefault: "",
    dataPrefix: "Credit balance,,",
    data: "",
    stationId: "TUNGA",
    remark: ""
  }
]);

const batch = buildRemoteTaskPayload(tokenRoute, "Add Batch Task", form, [
  { customerId: "1", customerName: "A", meterId: "M1", stationId: "S1", protocolVersion: "2.2" },
  { customerId: "2", customerName: "B", meterId: "M2", stationId: "S2", protocolVersion: "2.2" }
]);
assert.equal(batch.length, 2);
assert.equal(batch[1].meterId, "M2");
assert.equal(batch[1].data, "00212636862844086688");

const readingBatch = buildRemoteTaskPayload(readingRoute, "Add Batch Task", {
  ...form,
  selectedMeterIds: ["M1", "M2"],
  selectedDataItems: ["Credit balance", "Power"]
}, [
  { customerId: "1", customerName: "A", meterId: "M1", stationId: "S1", protocolVersion: "2.2" },
  { customerId: "2", customerName: "B", meterId: "M2", stationId: "S2", protocolVersion: "2.2" },
  { customerId: "3", customerName: "C", meterId: "M3", stationId: "S3", protocolVersion: "2.2" }
]);
assert.equal(readingBatch.length, 4);
assert.deepEqual(readingBatch.map((item) => item.meterId), ["M1", "M1", "M2", "M2"]);
assert.deepEqual(readingBatch.map((item) => item.dataItem), ["Credit balance", "Power", "Credit balance", "Power"]);

console.log("remote-task-flow tests passed");
