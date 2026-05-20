const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const actionModal = fs.readFileSync(path.join(root, "src", "components", "ActionModal.vue"), "utf8");
const api = fs.readFileSync(path.join(root, "src", "services", "api.js"), "utf8");
const reference = fs.readFileSync(path.join(root, "api", "reference.js"), "utf8");

assert.match(actionModal, /remoteTaskHeaders\(route = this\.route, action = this\.action\)/);
assert.match(actionModal, /"X-Route-Hash": String\(route\?\.hash \|\| ""\)/);
assert.match(actionModal, /postApi\(endpoint, items, \{ headers \}\)/);
assert.match(actionModal, /CreateTokenTask", payload, \{\s*headers: this\.remoteTaskHeaders\(\{ hash: "#\/remote-operation\/remote-meter-token" \}, "Add Task"\)/s);

assert.match(api, /window\.localStorage\?\.getItem\("beverly\.allow_live_writes"\)/);
assert.match(api, /\["localhost", "127\.0\.0\.1", "::1"\]\.includes\(host\)/);

assert.match(reference, /process\.env\.APPROVED_LIVE_WRITES === "true"/);
assert.match(reference, /X-Route-Hash,X-Route-Action/);
assert.match(reference, /function routeHashForWritePath\(pathname\)/);
assert.match(reference, /createreadingtask"\)\) return "#\/remote-operation\/remote-meter-reading"/);
assert.match(reference, /createtokentask"\)\) return "#\/remote-operation\/remote-meter-token"/);

console.log("remote task write-on contract ok");
