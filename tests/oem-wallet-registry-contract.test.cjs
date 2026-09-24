"use strict";

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const registry = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "oem-registry.ts"), "utf8");
const engine = fs.readFileSync(path.join(root, "backend", "wallet", "src", "services", "token-engine.ts"), "utf8");
const env = fs.readFileSync(path.join(root, "backend", "wallet", "src", "config", "env.ts"), "utf8");

assert(!registry.includes(".eq('station_id'"), "legacy credentials have no station_id column");
assert(!registry.includes("stationId?: string | null"), "manufacturer resolver must not imply installation scope");
assert.match(registry, /\.from\('oem_credentials'\)[\s\S]*?\.eq\('oem_id', manufacturer\.id\)/, "legacy Calinmeter credentials remain manufacturer-scoped");
assert(!engine.includes("resolveOemConfig(oemId, stationId)"), "token engine must not request imaginary station credentials");
assert.match(env, /values\.node_env === 'production'[\s\S]*?!values\.oem_credentials_encryption_key/i, "wallet production must require OEM encryption");
assert.match(registry, /throw new error\('oem_credentials_encryption_key is required in production\.'\)/i, "wallet crypto must reject production defaults");

const previousNodeEnv = process.env.NODE_ENV;
const previousKey = process.env.OEM_CREDENTIALS_ENCRYPTION_KEY;
process.env.NODE_ENV = "production";
delete process.env.OEM_CREDENTIALS_ENCRYPTION_KEY;
const cryptoModulePath = path.join(root, "backend", "src", "services", "oem-credential-crypto.js");
delete require.cache[require.resolve(cryptoModulePath)];
const credentialCrypto = require(cryptoModulePath);
assert.throws(() => credentialCrypto.encryptSecret("secret"), /required in production/i);
if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
else process.env.NODE_ENV = previousNodeEnv;
if (previousKey === undefined) delete process.env.OEM_CREDENTIALS_ENCRYPTION_KEY;
else process.env.OEM_CREDENTIALS_ENCRYPTION_KEY = previousKey;

console.log(JSON.stringify({ status: "wallet OEM registry contract passed" }, null, 2));
