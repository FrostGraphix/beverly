import assert from "node:assert/strict";
import {
  guardedWriteMessage,
  isGuardedWriteError,
  userFacingError
} from "../src/services/guarded-write.mjs";

assert.equal(isGuardedWriteError({ response: { status: 403 } }), true);
assert.equal(isGuardedWriteError({ response: { data: { _proxy: { source: "guard" } } } }), true);
assert.equal(isGuardedWriteError("Remote task blocked. Your session lacks permission for this live write."), true);
assert.equal(isGuardedWriteError("Writes are blocked until VITE_ALLOW_LIVE_WRITES=true"), true);
assert.equal(isGuardedWriteError("Network unavailable"), false);

assert.equal(guardedWriteMessage("Remote task"), "Remote task not submitted. Live writes are off.");
assert.equal(userFacingError({ response: { status: 403 } }), "Action not submitted. Live writes are off.");
assert.equal(userFacingError(new Error("Network unavailable")), "Network unavailable");

console.log("guarded-write tests passed");
