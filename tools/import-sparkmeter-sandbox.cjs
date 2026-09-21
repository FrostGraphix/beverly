"use strict";

/** @typedef {{ id: string, serial: string, tariff_id?: string | null, meter_phase?: string | null, [key: string]: unknown }} SparkMeterMeter */
/** @typedef {{ id: string, code?: string | null, name: string, phone_number?: string | null, service_area_id?: string | null, site_id?: string | null, meters: SparkMeterMeter[], [key: string]: unknown }} SparkMeterCustomer */
/** @typedef {{ installationId: string, manufacturerId: string, customers: SparkMeterCustomer[] }} ImportPlanInput */
/** @typedef {{ externalId: string, code: string | null, name: string, phone: string | null, serviceAreaId: string | null, siteId: string | null, rawPayload: SparkMeterCustomer }} CustomerPlan */
/** @typedef {{ externalId: string, serial: string, customerExternalId: string, tariffId: string | null, meterPhase: string | null, siteId: string | null, rawPayload: SparkMeterMeter }} MeterPlan */
/** @typedef {{ installationId: string, resourceType: "customer" | "meter", externalId: string }} MappingPlan */
/** @typedef {{ customers: CustomerPlan[], meters: MeterPlan[], mappings: MappingPlan[], skippedWithoutMeters: number }} ImportPlan */
/** @typedef {{ installationId: string, manufacturerId: string, environment: "sandbox" | "production", status: "draft", connectionEnvironmentVariable: string }} ImportTarget */

const { Client } = require("pg");

const SPARKMETER_BASE_URL = "https://www.sparkmeter.cloud";
const SUPABASE_CA_URL = "https://supabase-downloads.s3-ap-southeast-1.amazonaws.com/prod/ssl/prod-ca-2021.crt";
const BATCH_SIZE = 100;
const MANUFACTURER_ID = "e1532892-e09d-44f9-a9cb-b99b5c9ebecf";

const SANDBOX_TARGET = Object.freeze({
  installationId: "ed0eefb2-f017-43ad-a52e-82169684803b",
  manufacturerId: MANUFACTURER_ID,
  environment: "sandbox",
  status: "draft",
  connectionEnvironmentVariable: "OEM_RESTORE_POOLER_DB_URL"
});

const PRODUCTION_TARGET = Object.freeze({
  installationId: "53f12390-74f7-40b3-b1db-e907c256986d",
  manufacturerId: MANUFACTURER_ID,
  environment: "production",
  status: "draft",
  connectionEnvironmentVariable: "OEM_PRODUCTION_POOLER_DB_URL"
});

/**
 * Selects the only permitted import targets.
 * Production requires both explicit flags and remains a non-routable draft.
 *
 * @param {readonly string[]} argumentsList
 * @returns {ImportTarget}
 */
function resolveImportTarget(argumentsList) {
  const production = argumentsList.includes("--production");
  const apply = argumentsList.includes("--apply");
  if (production && !apply) {
    throw new Error("SparkMeter production import requires --apply");
  }
  return production ? PRODUCTION_TARGET : SANDBOX_TARGET;
}

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

/** @param {Client} client @param {ImportTarget} target @returns {Promise<void>} */
async function assertImportInstallation(client, target) {
  const result = await client.query(
    "SELECT i.id::text, i.environment, i.status, o.id::text AS manufacturer_id, o.slug " +
      "FROM public.oem_installations i JOIN public.oem_manufacturers o ON o.id = i.oem_id WHERE i.id = $1",
    [target.installationId]
  );
  const row = result.rows[0];
  if (!row || row.environment !== target.environment || row.status !== target.status || row.slug !== "sparkmeter" || row.manufacturer_id !== target.manufacturerId) {
    throw new Error(`Target is not the approved draft SparkMeter ${target.environment} installation`);
  }
}

/** @param {Client} client @param {ImportPlan} plan @param {ImportTarget} target @returns {Promise<void>} */
async function applyPlan(client, plan, target) {
  for (let start = 0; start < plan.customers.length; start += BATCH_SIZE) {
    const customerBatch = plan.customers.slice(start, start + BATCH_SIZE);
    const customerIds = new Set(customerBatch.map((customer) => customer.externalId));
    const meterBatch = plan.meters.filter((meter) => customerIds.has(meter.customerExternalId));
    const customerRows = customerBatch.map((customer) => ({
      external_id: customer.externalId,
      name: customer.name,
      phone: customer.phone,
      site_id: customer.siteId,
      raw_payload: customer.rawPayload,
      metadata: { provider: "sparkmeter", service_area_id: customer.serviceAreaId, import_scope: "metered_only" }
    }));
    const meterRows = meterBatch.map((meter) => ({
      external_id: meter.externalId,
      serial: meter.serial,
      customer_external_id: meter.customerExternalId,
      site_id: meter.siteId,
      meter_phase: meter.meterPhase,
      tariff_id: meter.tariffId,
      raw_payload: meter.rawPayload,
      metadata: { provider: "sparkmeter", import_scope: "metered_only" }
    }));
    const customerJson = JSON.stringify(customerRows);
    const meterJson = JSON.stringify(meterRows);
    await client.query("BEGIN");
    try {
      await client.query(
        "INSERT INTO public.customers (upstream_id, upstream_customer_id, name, customer_name, phone, site_id, source, raw_payload, metadata, oem_id) " +
          "SELECT input.external_id, input.external_id, input.name, input.name, input.phone, input.site_id, 'sparkmeter', input.raw_payload, input.metadata, $2 " +
          "FROM jsonb_to_recordset($1::jsonb) AS input(external_id text, name text, phone text, site_id text, raw_payload jsonb, metadata jsonb) " +
          "ON CONFLICT (oem_id, upstream_id) DO NOTHING",
        [customerJson, target.manufacturerId]
      );
      const customerCheck = await client.query(
        "SELECT count(*)::int AS expected, count(customer.id)::int AS linked FROM jsonb_to_recordset($1::jsonb) AS input(external_id text) " +
          "LEFT JOIN public.customers customer ON customer.oem_id = $2 AND customer.upstream_id = input.external_id",
        [customerJson, target.manufacturerId]
      );
      if (customerCheck.rows[0].expected !== customerCheck.rows[0].linked) throw new Error("Customer batch verification failed");
      await client.query(
        "INSERT INTO public.meters (upstream_id, upstream_meter_id, meter_sn, customer_id, site_id, meter_type, tariff_id, raw_payload, metadata, oem_id) " +
          "SELECT input.external_id, input.external_id, input.serial, customer.id, input.site_id, input.meter_phase, input.tariff_id, input.raw_payload, input.metadata, $2 " +
          "FROM jsonb_to_recordset($1::jsonb) AS input(external_id text, serial text, customer_external_id text, site_id text, meter_phase text, tariff_id text, raw_payload jsonb, metadata jsonb) " +
          "JOIN public.customers customer ON customer.oem_id = $2 AND customer.upstream_id = input.customer_external_id " +
          "ON CONFLICT (oem_id, upstream_id) DO NOTHING",
        [meterJson, target.manufacturerId]
      );
      const meterCheck = await client.query(
        "SELECT count(*)::int AS expected, count(meter.id) FILTER (WHERE meter.customer_id = customer.id AND meter.meter_sn = input.serial)::int AS linked " +
          "FROM jsonb_to_recordset($1::jsonb) AS input(external_id text, serial text, customer_external_id text) " +
          "JOIN public.customers customer ON customer.oem_id = $2 AND customer.upstream_id = input.customer_external_id " +
          "LEFT JOIN public.meters meter ON meter.oem_id = $2 AND meter.upstream_id = input.external_id",
        [meterJson, target.manufacturerId]
      );
      if (meterCheck.rows[0].expected !== meterCheck.rows[0].linked) throw new Error("Meter batch verification failed");
      for (const [resourceType, payload] of [["customer", customerJson], ["meter", meterJson]]) {
        const inputColumns = resourceType === "customer" ? "external_id text" : "external_id text";
        const table = resourceType === "customer" ? "customers" : "meters";
        await client.query(
          "INSERT INTO public.external_resource_mappings (oem_installation_id, resource_type, internal_id, external_id, metadata) " +
            `SELECT $1, '${resourceType}', resource.id, input.external_id, '{\"provider\":\"sparkmeter\",\"import_scope\":\"metered_only\"}'::jsonb ` +
            `FROM jsonb_to_recordset($2::jsonb) AS input(${inputColumns}) JOIN public.${table} resource ON resource.oem_id = $3 AND resource.upstream_id = input.external_id ` +
            "ON CONFLICT (oem_installation_id, resource_type, external_id) DO NOTHING",
          [target.installationId, payload, target.manufacturerId]
        );
        const mappingCheck = await client.query(
          `SELECT count(*)::int AS expected, count(mapping.id) FILTER (WHERE mapping.internal_id = resource.id)::int AS linked FROM jsonb_to_recordset($1::jsonb) AS input(${inputColumns}) ` +
            `JOIN public.${table} resource ON resource.oem_id = $2 AND resource.upstream_id = input.external_id ` +
            `LEFT JOIN public.external_resource_mappings mapping ON mapping.oem_installation_id = $3 AND mapping.resource_type = '${resourceType}' AND mapping.external_id = input.external_id`,
          [payload, target.manufacturerId, target.installationId]
        );
        if (mappingCheck.rows[0].expected !== mappingCheck.rows[0].linked) throw new Error(`${resourceType} mapping batch verification failed`);
      }
      await client.query("COMMIT");
      console.log(JSON.stringify({ batch: start / BATCH_SIZE + 1, importedCustomers: start + customerBatch.length, importedMeters: start + meterBatch.length }));
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  }
}

/** @returns {Promise<void>} */
async function main() {
  process.loadEnvFile(".env");
  const argumentsList = process.argv.slice(2);
  const apply = argumentsList.includes("--apply");
  const target = resolveImportTarget(argumentsList);
  const connectionString = requiredText(process.env[target.connectionEnvironmentVariable], target.connectionEnvironmentVariable);
  const caResponse = await fetch(SUPABASE_CA_URL);
  if (!caResponse.ok) throw new Error(`Supabase CA download failed: HTTP ${caResponse.status}`);
  const ca = await caResponse.text();
  const databaseUrl = new URL(connectionString);
  for (const parameter of ["sslmode", "sslrootcert", "sslcert", "sslkey"]) databaseUrl.searchParams.delete(parameter);
  const client = new Client({ connectionString: databaseUrl.toString(), ssl: { ca, rejectUnauthorized: true }, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
  try {
    await client.connect();
    await assertImportInstallation(client, target);
    const customers = await fetchSparkMeterCustomers();
    const plan = buildSparkMeterSandboxImportPlan({ installationId: target.installationId, manufacturerId: target.manufacturerId, customers });
    if (apply) await applyPlan(client, plan, target);
    console.log(JSON.stringify({ apply, environment: target.environment, customers: plan.customers.length, meters: plan.meters.length, mappings: plan.mappings.length, skippedWithoutMeters: plan.skippedWithoutMeters }));
  } finally {
    await client.end().catch(() => undefined);
  }
}

module.exports = { buildSparkMeterSandboxImportPlan, fetchWithRetries, resolveImportTarget };

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
