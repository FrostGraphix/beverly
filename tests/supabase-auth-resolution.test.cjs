"use strict";

const assert = require("assert");
const {
  resolveAuthEmail,
  getAuthUserByIdentifier,
  authUserFromAccessToken
} = require("../backend/src/services/supabase-service");

const previousEnv = {
  SUPABASE_AUTH_ENABLED: process.env.SUPABASE_AUTH_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  LOGIN_EMAIL_DOMAIN: process.env.LOGIN_EMAIL_DOMAIN
};
const originalFetch = global.fetch;

process.env.SUPABASE_URL = "https://example.supabase.co";
process.env.SUPABASE_AUTH_ENABLED = "true";
process.env.SUPABASE_ANON_KEY = "anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role";
process.env.LOGIN_EMAIL_DOMAIN = "org.acoblighting.com";

global.fetch = async (url) => {
  if (String(url).includes("/auth/v1/user")) {
    return {
      ok: true,
      text: async () => JSON.stringify({
        id: "admin-auth",
        email: "admin@acoblighting.com",
        user_metadata: {
          user_id: "admin",
          role: "super-admin"
        }
      })
    };
  }
  return {
    ok: true,
    text: async () => JSON.stringify({
      users: [
        {
          id: "user-1",
          email: "mary@org.acoblighting.com",
          user_metadata: {
            user_id: "mary",
            role_key: "operations-manager"
          }
        }
      ]
    })
  };
};

(async () => {
  const authUser = await getAuthUserByIdentifier("mary");
  assert.strictEqual(authUser.email, "mary@org.acoblighting.com");
  assert.strictEqual(await resolveAuthEmail("mary"), "mary@org.acoblighting.com");
  assert.strictEqual(await resolveAuthEmail("mary@org.acoblighting.com"), "mary@org.acoblighting.com");
  assert.strictEqual(await resolveAuthEmail("jane"), "jane@org.acoblighting.com");
  assert.strictEqual((await authUserFromAccessToken("admin-token")).roleId, "super-admin");

  if (typeof previousEnv.SUPABASE_AUTH_ENABLED === "undefined") delete process.env.SUPABASE_AUTH_ENABLED;
  else process.env.SUPABASE_AUTH_ENABLED = previousEnv.SUPABASE_AUTH_ENABLED;

  if (typeof previousEnv.SUPABASE_URL === "undefined") delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = previousEnv.SUPABASE_URL;

  if (typeof previousEnv.SUPABASE_ANON_KEY === "undefined") delete process.env.SUPABASE_ANON_KEY;
  else process.env.SUPABASE_ANON_KEY = previousEnv.SUPABASE_ANON_KEY;

  if (typeof previousEnv.SUPABASE_SERVICE_ROLE_KEY === "undefined") delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = previousEnv.SUPABASE_SERVICE_ROLE_KEY;

  if (typeof previousEnv.LOGIN_EMAIL_DOMAIN === "undefined") delete process.env.LOGIN_EMAIL_DOMAIN;
  else process.env.LOGIN_EMAIL_DOMAIN = previousEnv.LOGIN_EMAIL_DOMAIN;

  global.fetch = originalFetch;

  console.log(JSON.stringify({
    status: "supabase auth resolution passed"
  }, null, 2));
})().catch((error) => {
  global.fetch = originalFetch;
  console.error(error);
  process.exit(1);
});
