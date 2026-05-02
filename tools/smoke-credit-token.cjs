"use strict";

const { loadEnvFile } = require("./env-loader.cjs");

loadEnvFile();

const apiBaseUrl = process.env.SMOKE_API_BASE_URL || "http://127.0.0.1:9310";
const unitToVend = Number(process.env.SMOKE_TOKEN_UNIT || "0.1");
const meterId = process.env.SMOKE_METER_ID || "";
const customerId = process.env.SMOKE_CUSTOMER_ID || "";
const authorizationPassword = process.env.SMOKE_AUTHORIZATION_PASSWORD || "";
const confirmLive = process.argv.includes("--confirm-live");

function usage() {
  return [
    "Usage:",
    "  SMOKE_METER_ID=<meterId> SMOKE_AUTHORIZATION_PASSWORD=<password> node tools/smoke-credit-token.cjs",
    "  SMOKE_METER_ID=<meterId> SMOKE_AUTHORIZATION_PASSWORD=<password> node tools/smoke-credit-token.cjs --confirm-live",
    "",
    "Defaults to preview mode. --confirm-live sends the real credit token request.",
    `Current unit target: ${unitToVend} kWh`
  ].join("\n");
}

function assertConfig() {
  if (!Number.isFinite(unitToVend) || unitToVend <= 0) {
    throw new Error("SMOKE_TOKEN_UNIT must be greater than 0");
  }
  if (!meterId && !customerId) {
    throw new Error(`SMOKE_METER_ID or SMOKE_CUSTOMER_ID is required.\n${usage()}`);
  }
  if (!authorizationPassword) {
    throw new Error(`SMOKE_AUTHORIZATION_PASSWORD is required.\n${usage()}`);
  }
}

async function postApi(path, payload = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const reason = body.reason || body.msg || response.statusText;
    throw new Error(`${path} failed (${response.status}): ${reason}`);
  }
  return body;
}

function rowsFrom(response) {
  const data = response.data || response.result || response;
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.rows)) return data.rows;
  if (Array.isArray(data.records)) return data.records;
  if (Array.isArray(data.data)) return data.data;
  if (Array.isArray(data.list)) return data.list;
  return [];
}

function parseTariffUnitPrice(price) {
  const parts = String(price ?? "").split("~").map((part) => Number(part)).filter(Number.isFinite);
  if (parts.length >= 3) return parts[2] > 0 ? parts[2] : 0;
  return parts[0] > 0 ? parts[0] : 0;
}

function findAccount(accounts) {
  return accounts.find((account) => {
    const accountMeterId = String(account.meterId || account.id || "").trim();
    const accountCustomerId = String(account.customerId || "").trim();
    return (meterId && accountMeterId === meterId) || (customerId && accountCustomerId === customerId);
  });
}

function findTariff(tariffs, tariffId) {
  const id = String(tariffId || "").trim().toLowerCase();
  return tariffs.find((tariff) => String(tariff.tariffId || tariff.id || "").trim().toLowerCase() === id);
}

function buildSmokeCreditTokenPayload(account, options = {}) {
  const targetUnit = Number(options.unitToVend ?? unitToVend);
  const unitPrice = Number(options.unitPrice);
  if (!Number.isFinite(targetUnit) || targetUnit <= 0) {
    throw new Error("unitToVend must be greater than 0");
  }
  if (!Number.isFinite(unitPrice) || unitPrice <= 0) {
    throw new Error("unitPrice must be greater than 0");
  }
  const amount = Math.round(targetUnit * unitPrice * 100) / 100;
  const payload = {
    customerId: account.customerId,
    meterId: account.meterId || meterId,
    tariffId: account.tariffId,
    authorizationPassword: options.authorizationPassword ?? authorizationPassword,
    remark: `Smoke test vend ${targetUnit} kWh`,
    isPreview: options.isPreview ?? !confirmLive,
    isVendByTotalPaid: true,
    amount,
    totalUnit: targetUnit,
    payDebtPercent: 0,
    paymentMethod: "Cash",
    isS2: false
  };
  if (payload.isVendByTotalPaid !== true) {
    throw new Error("Smoke credit token payload must vend by total paid");
  }
  return payload;
}

async function readAccount() {
  const targetPayloads = [
    customerId ? { customerId } : null,
    meterId ? { meterId } : null,
    customerId ? { searchTerm: customerId } : null,
    meterId ? { searchTerm: meterId } : null
  ].filter(Boolean);

  for (const targetPayload of targetPayloads) {
    const response = await postApi("/api/account/read", {
      pageNumber: 1,
      pageSize: 50,
      ...targetPayload
    });
    const account = findAccount(rowsFrom(response));
    if (account) return account;
  }

  for (let pageNumber = 1; pageNumber <= 25; pageNumber += 1) {
    const response = await postApi("/api/account/read", { pageNumber, pageSize: 500 });
    const rows = rowsFrom(response);
    const account = findAccount(rows);
    if (account) return account;
    if (rows.length < 500) break;
  }

  return null;
}

async function main() {
  assertConfig();

  const [account, tariffResponse] = await Promise.all([
    readAccount(),
    postApi("/api/tariff/read", { pageNumber: 1, pageSize: 500 })
  ]);
  if (!account) {
    throw new Error(`No account found for ${meterId ? `meter ${meterId}` : `customer ${customerId}`}`);
  }

  const tariff = findTariff(rowsFrom(tariffResponse), account.tariffId);
  if (!tariff) {
    throw new Error(`No tariff found for tariffId ${account.tariffId || "(missing)"}`);
  }

  const unitPrice = parseTariffUnitPrice(tariff.price);
  if (!unitPrice) {
    throw new Error(`Tariff ${account.tariffId} has invalid price ${tariff.price}`);
  }

  const payload = buildSmokeCreditTokenPayload(account, {
    unitToVend,
    unitPrice,
    authorizationPassword,
    isPreview: !confirmLive
  });

  const response = await postApi("/api/token/creditToken/generate", payload);
  const result = response.result || response.data || response;
  console.log(JSON.stringify({
    mode: confirmLive ? "LIVE_SEND" : "PREVIEW_ONLY",
    apiBaseUrl,
    target: {
      customerId: payload.customerId,
      meterId: payload.meterId,
      tariffId: payload.tariffId,
      unitPrice,
      totalUnit: payload.totalUnit,
      amount: payload.amount
    },
    response: {
      code: response.code,
      msg: response.msg,
      reason: response.reason,
      receiptId: result.receiptId || result.id || "",
      tokenPresent: Boolean(result.token || result.tokenFirst),
      status: result.status ?? ""
    }
  }, null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}

module.exports = {
  buildSmokeCreditTokenPayload,
  parseTariffUnitPrice
};
