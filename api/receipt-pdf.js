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
const DEFAULT_CHROMIUM_PACK_URL =
  "https://github.com/Sparticuz/chromium/releases/download/v149.0.0/chromium-v149.0.0-pack.x64.tar";
const CHROMIUM_PACK_URL = String(process.env.RECEIPT_PDF_CHROMIUM_PACK_URL || "").trim() || DEFAULT_CHROMIUM_PACK_URL;

// The Chromium pack is a Linux x64 build, so it cannot run on a developer machine. Outside a
// serverless runtime we drive a locally installed Chrome/Edge instead, which keeps `npm run
// dev` rendering the same real receipt the deployed function does rather than dropping the
// browser onto the plain-text fallback PDF.
const IS_SERVERLESS = Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.VERCEL);

function localBrowserCandidates() {
  const env = process.env;
  if (process.platform === "win32") {
    const roots = [env.PROGRAMFILES, env["PROGRAMFILES(X86)"], env.LOCALAPPDATA].filter(Boolean);
    return roots.flatMap((root) => [
      `${root}\\Google\\Chrome\\Application\\chrome.exe`,
      `${root}\\Microsoft\\Edge\\Application\\msedge.exe`
    ]);
  }
  if (process.platform === "darwin") {
    return [
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge"
    ];
  }
  return ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser", "/usr/bin/microsoft-edge"];
}

function resolveLocalBrowser() {
  const fs = require("node:fs");
  const explicit = String(process.env.RECEIPT_PDF_CHROME_PATH || "").trim();
  if (explicit) {
    if (!fs.existsSync(explicit)) throw new Error(`RECEIPT_PDF_CHROME_PATH does not exist: ${explicit}`);
    return explicit;
  }
  const found = localBrowserCandidates().find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw new Error(
      "No local Chrome/Edge found for receipt rendering. Install Chrome or set RECEIPT_PDF_CHROME_PATH."
    );
  }
  return found;
}


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
    subtitle: sanitizeString(input.subtitle) || "",
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

// Cold start pays for a ~50MB pack download + decompress before Chromium can launch. Keeping
// the browser on the warm lambda across invocations turns every subsequent receipt into a
// sub-second render instead of repeating the launch cost.
let warmBrowser = null;

async function loadBrowserRuntime(serverless = IS_SERVERLESS) {
  const puppeteer = await import("puppeteer-core");
  if (typeof puppeteer.launch !== "function" || typeof puppeteer.defaultArgs !== "function") {
    throw new Error("puppeteer-core runtime exports are invalid");
  }
  if (!serverless) return { puppeteer, chromium: null };

  const chromium = (await import("@sparticuz/chromium-min")).default;
  if (!chromium || !Array.isArray(chromium.args) || typeof chromium.executablePath !== "function") {
    throw new Error("@sparticuz/chromium-min runtime exports are invalid");
  }
  return { puppeteer, chromium };
}

async function isBrowserUsable(browser) {
  if (!browser?.connected) return false;
  // `connected` only reflects the socket's own view. A lambda that was frozen and thawed can
  // still report connected while the CDP channel is dead, so confirm with a real round-trip
  // before betting a 60s request on it.
  try {
    await Promise.race([
      browser.version(),
      new Promise((_, reject) => setTimeout(() => reject(new Error("browser health check timed out")), 2000))
    ]);
    return true;
  } catch {
    return false;
  }
}

async function getBrowser() {
  if (await isBrowserUsable(warmBrowser)) return warmBrowser;
  if (warmBrowser) await warmBrowser.close().catch(() => {});
  warmBrowser = null;
  const { puppeteer, chromium } = await loadBrowserRuntime(IS_SERVERLESS);
  const defaultViewport = { width: 794, height: 1123, deviceScaleFactor: 2 };

  if (!IS_SERVERLESS) {
    // Local dev: a normal Chrome/Edge install has no chrome-headless-shell binary, so use the
    // standard headless mode. Same page setup, same template, same PDF options as production.
    warmBrowser = await puppeteer.launch({
      defaultViewport,
      executablePath: resolveLocalBrowser(),
      headless: true
    });
    return warmBrowser;
  }

  // Cold-start cost is dominated by fetching and unpacking the ~70MB Chromium pack, which only
  // happens when /tmp is empty. Record which case this was and how long it took, so the decision
  // to mirror the pack somewhere faster rests on production numbers rather than a guess.
  const packAlreadyUnpacked = require("node:fs").existsSync("/tmp/chromium");
  const startedAt = Date.now();
  warmBrowser = await puppeteer.launch({
    args: await puppeteer.defaultArgs({ args: chromium.args, headless: "shell" }),
    defaultViewport,
    executablePath: await chromium.executablePath(CHROMIUM_PACK_URL),
    headless: "shell"
  });
  console.log("[receipt-pdf] browser launched", {
    ms: Date.now() - startedAt,
    packAlreadyUnpacked,
    packUrlSource: process.env.RECEIPT_PDF_CHROMIUM_PACK_URL ? "env" : "default"
  });
  return warmBrowser;
}

// A4 at the 96 CSS-px-per-inch the print pipeline assumes: 210mm x 297mm = 794 x 1122.5px.
// Rounded up, because a document laid out to exactly 1123px still prints as one page and must
// not be scaled.
const A4_HEIGHT_PX = 1123;
const MIN_FIT_SCALE = 0.5;

function pdfPageCount(buffer) {
  // Chromium/Skia writes an uncompressed page tree, so the page objects are greppable.
  const matches = Buffer.from(buffer).toString("latin1").match(/\/Type\s*\/Page(?![s])/g);
  return matches ? matches.length : 1;
}

function fitScaleForHeight(contentHeight) {
  const height = Number(contentHeight) || 0;
  if (height <= A4_HEIGHT_PX) return 1;
  // Floor rather than round, so the scaled height never lands a hair over the page.
  return Math.max(MIN_FIT_SCALE, Math.floor((A4_HEIGHT_PX / height) * 1000) / 1000);
}

// A receipt's height depends on how many fields the row carries, so a fixed stylesheet cannot
// promise a single page. Measure the laid-out document and scale the render down to fit exactly
// one A4 sheet — this keeps the design's proportions intact instead of reflowing it, and is what
// "Fit to page" does in a browser print dialog. Page count is then verified on the real output.
async function renderToSinglePage(page) {
  const client = await page.createCDPSession();
  let scale = 1;
  try {
    // Page.getLayoutMetrics is a protocol call, not page script, so this works with
    // JavaScript disabled and does not weaken the render sandbox.
    const metrics = await client.send("Page.getLayoutMetrics");
    scale = fitScaleForHeight(metrics?.contentSize?.height);
  } finally {
    await client.detach().catch(() => {});
  }

  let pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, scale });
  // Rounding, fractional page breaks and unbreakable blocks can still push a sliver onto a
  // second sheet; shave the scale until the real output is one page.
  for (let attempt = 0; attempt < 3 && pdfPageCount(pdf) > 1 && scale > MIN_FIT_SCALE; attempt += 1) {
    scale = Math.max(MIN_FIT_SCALE, Math.round(scale * 0.96 * 1000) / 1000);
    pdf = await page.pdf({ format: "A4", printBackground: true, preferCSSPageSize: true, scale });
  }
  return pdf;
}

async function renderReceiptPdf(html) {
  const browser = await getBrowser();

  let page = null;
  try {
    page = await browser.newPage();
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
    return await renderToSinglePage(page);
  } catch (error) {
    // A page-level failure can mean the browser process itself is gone; drop the warm handle
    // so the next request relaunches instead of inheriting a dead one.
    await browser.close().catch(() => {});
    warmBrowser = null;
    throw error;
  } finally {
    if (page && !page.isClosed()) await page.close().catch(() => {});
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
    // Log the pack URL alongside the failure: every render outage so far has been a bad or
    // missing Chromium pack, and the message alone does not say which URL was tried.
    console.error("[receipt-pdf] render failed", {
      packUrl: CHROMIUM_PACK_URL,
      packUrlSource: process.env.RECEIPT_PDF_CHROMIUM_PACK_URL ? "env" : "default",
      error: error instanceof Error ? error.stack || error.message : String(error)
    });
    response.status(502).json({ code: 502, msg: "PDF render failed" });
  }
}

module.exports = handler;
module.exports.sanitizeModel = sanitizeModel;
module.exports.cookieValue = cookieValue;
module.exports.fitScaleForHeight = fitScaleForHeight;
module.exports.pdfPageCount = pdfPageCount;
module.exports.loadBrowserRuntime = loadBrowserRuntime;
module.exports.renderReceiptPdf = renderReceiptPdf;
module.exports.DEFAULT_CHROMIUM_PACK_URL = DEFAULT_CHROMIUM_PACK_URL;
module.exports.CHROMIUM_PACK_URL = CHROMIUM_PACK_URL;
