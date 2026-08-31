import assert from "node:assert";

const storage = new Map();

globalThis.localStorage = {
  getItem(key) {
    return storage.has(key) ? storage.get(key) : null;
  },
  setItem(key, value) {
    storage.set(key, String(value));
  },
  removeItem(key) {
    storage.delete(key);
  }
};

const api = await import("../src/services/api.js");
const { validateLoginResponse } = await import("../src/services/runtime-schemas.mjs");

api.clearSessionState();
assert.strictEqual(api.readSessionState(), null);

const now = 1_700_000_000_000;
const state = api.startSession(now);
assert.strictEqual(state.startedAt, now);
assert.strictEqual(state.lastActiveAt, now);
assert.strictEqual(state.expiresAt, now + api.sessionTimeoutMs());
assert.deepStrictEqual(api.readSessionState(), state);

assert.strictEqual(api.isSessionExpired(now), false);
assert.strictEqual(api.isSessionExpired(state.expiresAt), true);

assert.strictEqual(api.isTerminalSessionFailure("Session idle timeout"), true);
assert.strictEqual(api.isTerminalSessionFailure("Session absolute timeout"), true);
assert.strictEqual(api.isTerminalSessionFailure("Reauthentication required"), true);
assert.strictEqual(api.isTerminalSessionFailure("Invalid session"), false);
assert.strictEqual(api.isTerminalSessionFailure("Session expired"), false);
assert.strictEqual(api.isTerminalSessionFailure("Access token expired"), false);

const nearAbsoluteTimeout = now + api.sessionAbsoluteTimeoutMs() - 1_000;
const touched = api.writeSessionState(nearAbsoluteTimeout);
assert.strictEqual(touched.startedAt, now);
assert.strictEqual(touched.expiresAt, now + api.sessionAbsoluteTimeoutMs());

api.clearSessionState();
assert.strictEqual(api.readSessionState(), null);

const loginResponse = validateLoginResponse({
  code: 0,
  data: {
    token: "token",
    refreshToken: "refresh",
    userId: "admin",
    email: "admin@example.com",
    startedAt: now,
    absoluteExpiresAt: now + api.sessionAbsoluteTimeoutMs()
  }
});
assert.strictEqual(loginResponse.data.startedAt, now);
assert.strictEqual(loginResponse.data.refreshToken, "refresh");
assert.strictEqual(loginResponse.data.email, "admin@example.com");

console.log(JSON.stringify({
  timeoutMs: api.sessionTimeoutMs(),
  status: "session timeout passed"
}, null, 2));
