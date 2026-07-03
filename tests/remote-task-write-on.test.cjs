const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const remoteTaskModal = fs.readFileSync(path.join(root, "src", "components", "ActionModalRemoteTask.vue"), "utf8");
const tokenFlowModal = fs.readFileSync(path.join(root, "src", "components", "ActionModalTokenFlow.vue"), "utf8");
const api = fs.readFileSync(path.join(root, "src", "services", "api.js"), "utf8");
const reference = fs.readFileSync(path.join(root, "api", "reference.js"), "utf8");
const { _test } = require(path.join(root, "api", "reference.js"));

assert.match(remoteTaskModal, /remoteTaskHeaders\(route = this\.route, action = this\.action\)/);
assert.match(remoteTaskModal, /"X-Route-Hash": String\(route\?\.hash \|\| ""\)/);
assert.match(remoteTaskModal, /postApi\(endpoint, items, \{ headers \}\)/);

assert.match(tokenFlowModal, /remoteTaskHeaders\(route = this\.route, action = this\.action\)/);
assert.match(tokenFlowModal, /"X-Route-Hash": String\(route\?\.hash \|\| ""\)/);
assert.match(tokenFlowModal, /async previewToken\(\)[\s\S]*postApi\(endpoint, payload, \{\s*headers: this\.remoteTaskHeaders\(this\.route, this\.action\)\s*\}\)/s);
assert.match(tokenFlowModal, /async confirmToken\(\)[\s\S]*postApi\(endpoint, payload, \{\s*headers: this\.remoteTaskHeaders\(this\.route, this\.action\)\s*\}\)/s);
assert.match(tokenFlowModal, /CreateTokenTask", payload, \{\s*headers: this\.remoteTaskHeaders\(\{ hash: "#\/remote-operation\/remote-meter-token" \}, "Add Task"\)/s);
assert.match(tokenFlowModal, /postApi\(remoteTaskConfirmEndpoint\(\{ hash: "#\/remote-operation\/remote-meter-token" \}\), confirmPayload, \{\s*headers: this\.remoteTaskHeaders\(\{ hash: "#\/remote-operation-record\/remote-meter-token-task" \}, "Confirm"\)/s);

assert.match(api, /let runtimeLiveWritesAllowed = false/);
assert.match(api, /export async function refreshLiveWriteStatus\(\)/);
assert.match(api, /return runtimeLiveWritesAllowed/);
assert.doesNotMatch(api, /beverly\.allow_live_writes/);
assert.doesNotMatch(api, /VITE_ALLOW_LIVE_WRITES/);

assert.match(reference, /crm\.live_writes\.\$\{liveWriteEnvironment\(\)\}\.enabled/);
assert.match(reference, /allowLiveWrites: liveWriteControl\.enabled === true/);
assert.match(reference, /X-Route-Hash,X-Route-Action/);
assert.match(reference, /function routeHashForWritePath\(pathname\)/);
assert.match(reference, /createreadingtask"\)\) return "#\/remote-operation\/remote-meter-reading"/);
assert.match(reference, /createtokentask"\)\) return "#\/remote-operation\/remote-meter-token"/);
assert.deepStrictEqual(
  _test.validateLiveWriteChange({
    enabled: true,
    reason: "Approved preview verification",
    confirmation: "ENABLE LIVE WRITES"
  }),
  { enabled: true, reason: "Approved preview verification" }
);
assert.match(
  _test.validateLiveWriteChange({ enabled: true, reason: "too short", confirmation: "wrong" }).error,
  /Type ENABLE LIVE WRITES/
);

console.log("remote task write-on contract ok");
