import assert from "node:assert/strict";
import {
  buildRemoteTaskPayload,
  defaultRemoteDataItem,
  formatToken,
  normalizeAccountStatus,
  normalizeRemoteStatus,
  remoteTaskEndpoint,
  remoteTaskNeedsAuthorization,
  remoteTaskValidationError
} from "../src/services/remote-task-flow.mjs";

const tokenRoute = { hash: "#/remote-operation/remote-meter-token" };
const readingRoute = { hash: "#/remote-operation/remote-meter-reading" };
const controlRoute = { hash: "#/remote-operation/remote-meter-control" };

assert.equal(remoteTaskEndpoint(tokenRoute), "/API/RemoteMeterTask/CreateTokenTask");
assert.equal(remoteTaskEndpoint(readingRoute), "/API/RemoteMeterTask/CreateReadingTask");
assert.equal(remoteTaskEndpoint(controlRoute), "/API/RemoteMeterTask/CreateControlTask");
assert.equal(remoteTaskNeedsAuthorization(readingRoute), false);
assert.equal(remoteTaskNeedsAuthorization(controlRoute), false);
assert.equal(remoteTaskNeedsAuthorization(tokenRoute), false);

assert.equal(defaultRemoteDataItem(tokenRoute), "Send Token");
assert.equal(defaultRemoteDataItem(controlRoute), "Switch On");
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
assert.equal(remoteTaskValidationError(controlRoute, { ...form, authorizationPassword: "", dataItem: "Switch On" }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, meterId: "", stationId: "", authorizationPassword: "", dataItem: "Credit balance" }, { action: "Add Batch Task", rows: [{ meterId: "M1" }] }), "");
assert.equal(remoteTaskValidationError(readingRoute, { ...form, meterId: "", stationId: "", authorizationPassword: "", dataItem: "Credit balance" }, { action: "Add Batch Task", rows: [] }), "rows are required");

assert.deepEqual(buildRemoteTaskPayload(tokenRoute, "Add Task", form), [
  {
    customerId: "47005372686",
    customerName: "Mohammed Kaura",
    meterId: "47005372686",
    version: "2.2",
    flag: "Send Token",
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

const batch = buildRemoteTaskPayload(tokenRoute, "Add Batch Task", form, [
  { customerId: "1", customerName: "A", meterId: "M1", stationId: "S1", protocolVersion: "2.2" },
  { customerId: "2", customerName: "B", meterId: "M2", stationId: "S2", protocolVersion: "2.2" }
]);
assert.equal(batch.length, 2);
assert.equal(batch[1].meterId, "M2");
assert.equal(batch[1].data, "00212636862844086688");

console.log("remote-task-flow tests passed");
