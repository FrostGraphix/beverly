"use strict";

/** @typedef {{ id: string, serial: string, tariff_id?: string | null, meter_phase?: string | null, [key: string]: unknown }} SparkMeterMeter */
/** @typedef {{ id: string, code?: string | null, name: string, phone_number?: string | null, service_area_id?: string | null, site_id?: string | null, meters: SparkMeterMeter[], [key: string]: unknown }} SparkMeterCustomer */
/** @typedef {{ installationId: string, manufacturerId: string, customers: SparkMeterCustomer[] }} ImportPlanInput */
/** @typedef {{ externalId: string, code: string | null, name: string, phone: string | null, serviceAreaId: string | null, siteId: string | null, rawPayload: SparkMeterCustomer }} CustomerPlan */
/** @typedef {{ externalId: string, serial: string, customerExternalId: string, tariffId: string | null, meterPhase: string | null, siteId: string | null, rawPayload: SparkMeterMeter }} MeterPlan */
/** @typedef {{ installationId: string, resourceType: "customer" | "meter", externalId: string }} MappingPlan */
/** @typedef {{ customers: CustomerPlan[], meters: MeterPlan[], mappings: MappingPlan[], skippedWithoutMeters: number }} ImportPlan */

const { Client } = require("pg");

const SPARKMETER_BASE_URL = "https://www.sparkmeter.cloud";
const SUPABASE_CA_URL = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";
const INSTALLATION_ID = "ed0eefb2-f017-43ad-a52e-82169684803b";
const MANUFACTURER_ID = "e1532892-e09d-44f9-a9cb-b99b5c9ebecf";
const BATCH_SIZE = 100;

/** @param {unknown} value @param {string} field @returns {string} */
function requiredText(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required ${field}`);
  }
  return value.trim();
}

/** @param {unknown} value @returns {string | null} */
function optionalText(value) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Retries only safe read failures.
 *
 * @param {string} url
 * @param {Record<string, string>} headers
 * @param {(url: string, init: { headers: Record<string, string>, signal: AbortSignal }) => Promise<Response>} request
 * @param {number} delayMs
 * @returns {Promise<Response>}
 */
async function fetchWithRetries(url, headers, request = fetch, delayMs = 1700) {
  /** @type {Error | null} */
  let lastError = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const response = await request(url, { headers, signal: controller.signal });
      if (response.ok || (response.status < 500 && response.status !== 429)) return response;
      lastError = new Error(`SparkMeter customer read failed: HTTP ${response.status}`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error("SparkMeter customer read failed");
    } finally {
      clearTimeout(timeout);
    }
    if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, delayMs * (attempt + 1)));
  }
  throw lastError || new Error("SparkMeter customer read failed");
}

/**
 * Builds a fail-closed, meter-only import plan.
 * Meterless provider customers are intentionally excluded.
 *
 * @param {ImportPlanInput} input
 * @returns {ImportPlan}
 */
function buildSparkMeterSandboxImportPlan(input) {
  requiredText(input.installationId, "installation ID");
  requiredText(input.manufacturerId, "manufacturer ID");

  /** @type {CustomerPlan[]} */
  const customers = [];
  /** @type {MeterPlan[]} */
  const meters = [];
  /** @type {MappingPlan[]} */
  const mappings = [];
  const customerIds = new Set();
  const meterIds = new Set();
  let skippedWithoutMeters = 0;

  for (const rawCustomer of input.customers) {
    const externalId = requiredText(rawCustomer.id, "SparkMeter customer ID");
    if (customerIds.has(externalId)) {
      throw new Error(`Duplicate SparkMeter customer ID: ${externalId}`);
    }
    customerIds.add(externalId);

    if (!Array.isArray(rawCustomer.meters) || rawCustomer.meters.length === 0) {
      skippedWithoutMeters += 1;
      continue;
    }

    const customer = {
      externalId,
      code: optionalText(rawCustomer.code),
      name: requiredText(rawCustomer.name, "SparkMeter customer name"),
      phone: optionalText(rawCustomer.phone_number),
      serviceAreaId: optionalText(rawCustomer.service_area_id),
      siteId: optionalText(rawCustomer.site_id),
      rawPayload: rawCustomer
    };
    customers.push(customer);
    mappings.push({ installationId: input.installationId, resourceType: "customer", externalId });

    for (const rawMeter of rawCustomer.meters) {
      const meterId = requiredText(rawMeter.id, "SparkMeter meter ID");
      if (meterIds.has(meterId)) {
        throw new Error(`Duplicate SparkMeter meter ID: ${meterId}`);
      }
      meterIds.add(meterId);
      meters.push({
        externalId: meterId,
        serial: requiredText(rawMeter.serial, "SparkMeter meter serial"),
        customerExternalId: externalId,
        tariffId: optionalText(rawMeter.tariff_id),
        meterPhase: optionalText(rawMeter.meter_phase),
        siteId: customer.siteId,
        rawPayload: rawMeter
      });
      mappings.push({ installationId: input.installationId, resourceType: "meter", externalId: meterId });
    }
  }

  return { customers, meters, mappings, skippedWithoutMeters };
}

/** @returns {Promise<SparkMeterCustomer[]>} */
async function fetchSparkMeterCustomers() {
  const apiKey = requiredText(process.env.SPARKMETER_API_KEY, "SPARKMETER_API_KEY");
  const apiSecret = requiredText(process.env.SPARKMETER_API_SECRET, "SPARKMETER_API_SECRET");
  /** @type {SparkMeterCustomer[]} */
  const customers = [];
  let cursor = null;

  do {
    const url = new URL("/api/v1/customers", SPARKMETER_BASE_URL);
    url.searchParams.set("per_page", "50");
    if (cursor) url.searchParams.set("cursor", cursor);
    const response = await fetchWithRetries(url.toString(), { "X-API-KEY": apiKey, "X-API-SECRET": apiSecret });
    if (!response.ok) throw new Error(`SparkMeter customer read failed: HTTP ${response.status}`);
    /** @type {{ data?: unknown, next_cursor?: unknown }} */
    const body = await response.json();
    if (!Array.isArray(body.data)) throw new Error("SparkMeter customer response lacks data array");
    customers.push(.../** @type {SparkMeterCustomer[]} */ (body.data));
    cursor = optionalText(body.next_cursor);
    if (cursor) await new Promise((resolve) => setTimeout(resolve, 1700));
  } while (cursor);

  return customers;
}

/** @param {Client} client @returns {Promise<void>} */
async function assertSandboxInstallation(client) {
  const result = await client.query(
    "SELECT i.id::text, i.environment, i.status, o.id::text AS manufacturer_id, o.slug " +
      "FROM public.oem_installations i JOIN public.oem_manufacturers o ON o.id = i.oem_id WHERE i.id = $1",
    [INSTALLATION_ID]
  );
  const row = result.rows[0];
  if (!row || row.environment !== "sandbox" || row.status !== "draft" || row.slug !== "sparkmeter" || row.manufacturer_id !== MANUFACTURER_ID) {
    throw new Error("Target is not the approved draft SparkMeter sandbox installation");
  }
}

/** @param {Client} client @param {CustomerPlan} customer @returns {Promise<string>} */
async function ensureCustomer(client, customer) {
  const inserted = await client.query(
    "INSERT INTO public.customers (upstream_id, upstream_customer_id, name, customer_name, phone, site_id, source, raw_payload, metadata, oem_id) " +
      "VALUES ($1,$1,$2,$2,$3,$4,'sparkmeter',$5::jsonb,$6::jsonb,$7) " +
      "ON CONFLICT (oem_id, upstream_id) DO NOTHING RETURNING id::text",
    [
      customer.externalId,
      customer.name,
      customer.phone,
      customer.siteId,
      JSON.stringify(customer.rawPayload),
      JSON.stringify({ provider: "sparkmeter", service_area_id: customer.serviceAreaId, import_scope: "metered_only" }),
      MANUFACTURER_ID
    ]
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await client.query("SELECT id::text FROM public.customers WHERE oem_id = $1 AND upstream_id = $2", [MANUFACTURER_ID, customer.externalId]);
  if (!existing.rows[0]) throw new Error(`Customer import did not resolve: ${customer.externalId}`);
  return existing.rows[0].id;
}

/** @param {Client} client @param {MeterPlan} meter @param {string} customerId @returns {Promise<string>} */
async function ensureMeter(client, meter, customerId) {
  const inserted = await client.query(
    "INSERT INTO public.meters (upstream_id, upstream_meter_id, meter_sn, customer_id, site_id, meter_type, tariff_id, raw_payload, metadata, oem_id) " +
      "VALUES ($1,$1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) " +
      "ON CONFLICT (oem_id, upstream_id) DO NOTHING RETURNING id::text",
    [
      meter.externalId,
      meter.serial,
      customerId,
      meter.siteId,
      meter.meterPhase,
      meter.tariffId,
      JSON.stringify(meter.rawPayload),
      JSON.stringify({ provider: "sparkmeter", import_scope: "metered_only" }),
      MANUFACTURER_ID
    ]
  );
  if (inserted.rows[0]) return inserted.rows[0].id;
  const existing = await client.query("SELECT id::text, customer_id::text FROM public.meters WHERE oem_id = $1 AND upstream_id = $2", [MANUFACTURER_ID, meter.externalId]);
  if (!existing.rows[0] || existing.rows[0].customer_id !== customerId) {
    throw new Error(`Meter import ownership conflict: ${meter.externalId}`);
  }
  return existing.rows[0].id;
}

/** @param {Client} client @param {"customer" | "meter"} resourceType @param {string} externalId @param {string} internalId @returns {Promise<void>} */
async function ensureMapping(client, resourceType, externalId, internalId) {
  await client.query(
    "INSERT INTO public.external_resource_mappings (oem_installation_id, resource_type, internal_id, external_id, metadata) " +
      "VALUES ($1,$2,$3,$4,$5::jsonb) ON CONFLICT (oem_installation_id, resource_type, external_id) DO NOTHING",
    [INSTALLATION_ID, resourceType, internalId, externalId, JSON.stringify({ provider: "sparkmeter", import_scope: "metered_only" })]
  );
  const existing = await client.query(
    "SELECT internal_id::text FROM public.external_resource_mappings WHERE oem_installation_id = $1 AND resource_type = $2 AND external_id = $3",
    [INSTALLATION_ID, resourceType, externalId]
  );
  if (!existing.rows[0] || existing.rows[0].internal_id !== internalId) {
    throw new Error(`External mapping conflict: ${resourceType}:${externalId}`);
  }
}

/** @param {Client} client @param {ImportPlan} plan @returns {Promise<void>} */
async function applyPlan(client, plan) {
  const metersByCustomer = new Map();
  for (const meter of plan.meters) {
    const values = metersByCustomer.get(meter.customerExternalId) || [];
    values.push(meter);
    metersByCustomer.set(meter.customerExternalId, values);
  }
  for (let start = 0; start < plan.customers.length; start += BATCH_SIZE) {
    await client.query("BEGIN");
    try {
      for (const customer of plan.customers.slice(start, start + BATCH_SIZE)) {
        const customerId = await ensureCustomer(client, customer);
        await ensureMapping(client, "customer", customer.externalId, customerId);
        for (const meter of metersByCustomer.get(customer.externalId) || []) {
          const meterId = await ensureMeter(client, meter, customerId);
          await ensureMapping(client, "meter", meter.externalId, meterId);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

/** @returns {Promise<void>} */
async function main() {
  process.loadEnvFile(".env");
  const apply = process.argv.includes("--apply");
  const connectionString = requiredText(process.env.OEM_RESTORE_POOLER_DB_URL, "OEM_RESTORE_POOLER_DB_URL");
  const caResponse = await fetch(SUPABASE_CA_URL);
  if (!caResponse.ok) throw new Error(`Supabase CA download failed: HTTP ${caResponse.status}`);
  const ca = await caResponse.text();
  const databaseUrl = new URL(connectionString);
  for (const parameter of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) databaseUrl.searchParams.delete(parameter);
  const client = new Client({ connectionString: databaseUrl.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  try {
    await client.connect();
    await assertSandboxInstallation(client);
    const customers = await fetchSparkMeterCustomers();
    const plan = buildSparkMeterSandboxImportPlan({ installationId: INSTALLATION_ID, manufacturerId: MANUFACTURER_ID, customers });
    if (apply) await applyPlan(client, plan);
    console.log(JSON.stringify({ apply, customers: plan.customers.length, meters: plan.meters.length, mappings: plan.mappings.length, skippedWithoutMeters: plan.skippedWithoutMeters }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = { buildSparkMeterSandboxImportPlan, fetchWithRetries };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
