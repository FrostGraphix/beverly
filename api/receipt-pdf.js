"use strict";

// Renders the canonical receipt template (src/services/receipt-tools.mjs) in a real
// headless Chromium instance so the downloaded PDF has selectable text and pixel-accurate
// CSS, instead of the client-side html2canvas rasterization fallback.
//
// Security: this endpoint NEVER accepts raw HTML from the client. It accepts a bounded,
// type-checked receipt "model" (label/value pairs), re-derives the brand block server-side,
// and renders it through the existing receiptHtml() template (which HTML-escapes every
// value). The Chromium page runs with JS disabled and all network requests blocked except
// data: URIs and the Google Fonts hosts the template itself references — this closes off
// the SSRF surface a "POST HTML string, render it" endpoint would otherwise open.

const { authUserFromAccessToken } = require("../backend/src/services/supabase-service");

const MAX_FIELDS = 60;
const MAX_STRING = 500;
const CHROMIUM_PACK_URL = process.env.RECEIPT_PDF_CHROMIUM_PACK_URL
  || "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";

function cookieValue(request, name) {
  const cookieHeader = String(request?.headers?.cookie || "");
  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? decodeURIComponent(match[1].trim()) : "";
}

function sanitizeString(value) {
  return typeof value === "string" ? value.slice(0, MAX_STRING) : "";
}

function sanitizeModel(input, brand) {
  if (!input || typeof input !== "object") return null;
  const rawFields = Array.isArray(input.fields) ? input.fields.slice(0, MAX_FIELDS) : [];
  const fields = rawFields
    .map((entry) => ({
      label: sanitizeString(entry?.label),
      value: sanitizeString(entry?.value),
      section: sanitizeString(entry?.section) || "transaction",
      isToken: Boolean(entry?.isToken),
      emphasis: Boolean(entry?.emphasis)
    }))
    .filter((entry) => entry.label && entry.value);
  if (!fields.length) return null;
  return {
    title: sanitizeString(input.title) || "Transaction Receipt",
    subtitle: sanitizeString(input.subtitle) || "Energy Operations & Management System",
    amount: sanitizeString(input.amount),
    generatedAt: sanitizeString(input.generatedAt),
    receiptId: sanitizeString(input.receiptId) || "no-id",
    fields,
    // brand is server-owned. Client-supplied brand/company data is discarded so a
    // caller cannot spoof the footer's company identity in an official receipt.
    brand
  };
}

function readRawBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

async function readJsonBody(request) {
  if (request.body && typeof request.body === "object") return request.body;
  const raw = await readRawBody(request);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function renderReceiptPdf(html) {
  const puppeteer = require("puppeteer-core");
  const chromium = require("@sparticuz/chromium-min");

  const browser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport: { width: 794, height: 1123, deviceScaleFactor: 2 },
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: "shell"
  });

  try {
    const page = await browser.newPage();
    await page.setJavaScriptEnabled(false);
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      // receiptHtml() is fully self-contained (no external stylesheets/images) —
      // block everything except the initial document and data: URIs so nothing
      // client-supplied field text could reference is ever fetched.
      const url = req.url();
      if (url.startsWith("data:") || req.resourceType() === "document") req.continue();
      else req.abort();
    });
    await page.setContent(html, { waitUntil: "load", timeout: 15000 });
    return await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

async function handler(request, response) {
  if (String(request.method || "GET").toUpperCase() !== "POST") {
    response.status(405).json({ code: 405, msg: "Method not allowed" });
    return;
  }

  const cookieToken = cookieValue(request, "bev_token");
  if (!cookieToken) {
    response.status(401).json({ code: 401, msg: "No session" });
    return;
  }
  const actor = await authUserFromAccessToken(cookieToken).catch(() => null);
  if (!actor) {
    response.status(401).json({ code: 401, msg: "Session expired" });
    return;
  }

  const body = await readJsonBody(request);
  if (!body) {
    response.status(400).json({ code: 400, msg: "Invalid JSON body" });
    return;
  }

  const { receiptHtml, brand } = await import("../src/services/receipt-tools.mjs");
  const model = sanitizeModel(body.model, brand);
  if (!model) {
    response.status(400).json({ code: 400, msg: "Invalid receipt model" });
    return;
  }

  try {
    const html = receiptHtml(model, {});
    const pdfBuffer = await renderReceiptPdf(html);
    response.setHeader("Content-Type", "application/pdf");
    response.setHeader("Content-Disposition", `attachment; filename="receipt-${model.receiptId.replace(/[^a-z0-9_-]+/gi, "_")}.pdf"`);
    response.status(200).send(Buffer.from(pdfBuffer));
  } catch (error) {
    console.error("[receipt-pdf]", error instanceof Error ? error.message : String(error));
    response.status(502).json({ code: 502, msg: "PDF render failed" });
  }
}

module.exports = handler;
module.exports.sanitizeModel = sanitizeModel;
module.exports.cookieValue = cookieValue;
