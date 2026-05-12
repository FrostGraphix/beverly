import assert from "node:assert";
import { routeManifest, routeAllowed, visibleRoutes } from "../src/data/route-manifest.mjs";

const originalDocument = global.document;

function setRemarkCookie(value) {
  global.document = {
    cookie: `userRemark=${encodeURIComponent(value)}`
  };
}

const tokenRoute = routeManifest.find((route) => route.hash === "#/remote-operation/remote-meter-token");
const tokenTaskRoute = routeManifest.find((route) => route.hash === "#/remote-operation-record/remote-meter-token-task");
const creditTokenRoute = routeManifest.find((route) => route.hash === "#/token-generate/credit-token");

assert(tokenRoute, "Token route missing");
assert(tokenTaskRoute, "Token task route missing");
assert(creditTokenRoute, "Credit token route missing");

setRemarkCookie("RemoteMeterTask.CreateTokenTask,RemoteMeterTaskRecord.GetTokenTask+RemoteMeterTaskRecord.UpdateTokenTask");
assert.strictEqual(routeAllowed(tokenRoute, "vendor"), true, "Vendor token create permission should unlock meter token route");
assert.strictEqual(routeAllowed(tokenTaskRoute, "vendor"), true, "Vendor token task permissions should unlock token task route");

setRemarkCookie("Token.CreditToken,TokenRecord.CreditTokenRecord");
assert.strictEqual(routeAllowed(creditTokenRoute, "vendor"), true, "Token permission should unlock credit token route");

setRemarkCookie("");
assert.strictEqual(visibleRoutes("vendor").some((route) => route.hash === "#/admin/user"), false, "Vendor should not inherit admin routes");

global.document = originalDocument;

console.log(JSON.stringify({
  status: "route permissions passed"
}, null, 2));
