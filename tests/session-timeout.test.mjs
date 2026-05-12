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

api.clearSessionState();
assert.strictEqual(api.readSessionState(), null);

const now = 1_700_000_000_000;
const state = api.writeSessionState(now);
assert.strictEqual(state.lastActiveAt, now);
assert.strictEqual(state.expiresAt, now + api.sessionTimeoutMs());
assert.deepStrictEqual(api.readSessionState(), state);

assert.strictEqual(api.isSessionExpired(now), false);
assert.strictEqual(api.isSessionExpired(state.expiresAt), true);

api.clearSessionState();
assert.strictEqual(api.readSessionState(), null);

console.log(JSON.stringify({
  timeoutMs: api.sessionTimeoutMs(),
  status: "session timeout passed"
}, null, 2));
