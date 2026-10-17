import assert from 'node:assert/strict';
assert.equal(process.env.CI, 'true');
assert.equal(process.env.APP_ENV, 'test');
assert(['127.0.0.1', 'localhost'].includes(new URL(process.env.SUPABASE_URL).hostname));
// No provider calls may escape the disposable runner through the app's fetch clients.
const originalFetch = globalThis.fetch;
globalThis.fetch = (input, options) => {
  const url = new URL(input instanceof Request ? input.url : input);
  assert(['127.0.0.1', 'localhost'].includes(url.hostname), 'External fetch blocked in isolated CI');
  return originalFetch(input, { ...options, redirect: 'error' });
};
const { build } = await import('../../backend/wallet/dist/server.js');
const app = await build();
process.once('SIGTERM', async () => { await app.close(); process.exit(0); });
await app.listen({ host: '127.0.0.1', port: 4000 });
