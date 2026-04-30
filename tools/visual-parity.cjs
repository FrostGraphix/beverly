"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default;
const { chromium } = require("playwright");
const apiHandler = require("../api/reference");
const { buildParityTargets, summarizeResults } = require("./visual-parity-lib.cjs");

const root = path.resolve(__dirname, "..");
const distRoot = path.join(root, "dist");
const outRoot = path.join(root, "replica-screenshots", "phase-11");
const reportPath = path.join(outRoot, "visual-parity-report.json");
const desktopViewport = { width: 1365, height: 768 };
const mobileViewport = { width: 390, height: 844 };
const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
let webPort = Number(process.env.PARITY_WEB_PORT || 9411);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml; charset=utf-8"],
  [".map", "application/json; charset=utf-8"]
]);

function safePath(urlPath) {
  const clean = decodeURIComponent(String(urlPath || "/").split("?")[0] || "/");
  const nextPath = clean === "/" ? "index.html" : clean.replace(/^\/+/, "");
  const resolved = path.resolve(distRoot, nextPath);
  return resolved.startsWith(distRoot) ? resolved : null;
}

function createWebServer() {
  return http.createServer((request, response) => {
    if ((request.url || "").startsWith("/api/")) {
      const apiResponse = {
        statusCode: 200,
        status(code) {
          this.statusCode = code;
          return this;
        },
        json(body) {
          response.writeHead(this.statusCode, { "Content-Type": "application/json; charset=utf-8" });
          response.end(JSON.stringify(body));
        }
      };
      Promise.resolve(apiHandler(request, apiResponse)).catch((error) => {
        response.writeHead(500, { "Content-Type": "application/json; charset=utf-8" });
        response.end(JSON.stringify({ code: 500, msg: error.message, data: null }));
      });
      return;
    }
    const resolved = safePath(request.url || "/");
    if (!resolved || !fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      response.end(fs.readFileSync(path.join(distRoot, "index.html"), "utf8"));
      return;
    }
    response.writeHead(200, {
      "Content-Type": mimeTypes.get(path.extname(resolved).toLowerCase()) || "application/octet-stream",
      "Cache-Control": "no-store"
    });
    fs.createReadStream(resolved).pipe(response);
  });
}

function listenWebServer(webServer) {
  return new Promise((resolve, reject) => {
    const onError = (error) => {
      if (error.code !== "EADDRINUSE" || process.env.PARITY_WEB_PORT) {
        reject(error);
        return;
      }
      webServer.removeListener("error", onError);
      webServer.listen(0, "127.0.0.1", () => {
        const address = webServer.address();
        webPort = Number(address.port);
        resolve();
      });
    };
    webServer.once("error", onError);
    webServer.listen(webPort, "127.0.0.1", () => {
      webServer.removeListener("error", onError);
      resolve();
    });
  });
}

function ensureOutput() {
  fs.mkdirSync(path.join(outRoot, "desktop"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "mobile"), { recursive: true });
  fs.mkdirSync(path.join(outRoot, "diff"), { recursive: true });
}

function filterTargets(targets) {
  const targetText = String(process.env.PARITY_TARGETS || "").trim();
  const limit = Number(process.env.PARITY_TARGET_LIMIT || 0);
  const offset = Number(process.env.PARITY_TARGET_OFFSET || 0);
  let selected = targets;
  if (targetText) {
    const terms = targetText
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
    selected = selected.filter((target) => terms.some((term) => {
      const haystack = `${target.group} ${target.title} ${target.hash}`.toLowerCase();
      return haystack.includes(term);
    }));
  }
  if (Number.isFinite(offset) && offset > 0) selected = selected.slice(offset);
  if (Number.isFinite(limit) && limit > 0) selected = selected.slice(0, limit);
  return selected;
}

function shouldSkipMobile() {
  return process.env.PARITY_SKIP_MOBILE === "true";
}

function fileStem(target) {
  return `${target.group.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${target.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

function readPng(filePath) {
  return PNG.sync.read(fs.readFileSync(filePath));
}

function writeDiff(reference, local, diffPath) {
  const diff = new PNG({ width: reference.width, height: reference.height });
  const pixelsDifferent = pixelmatch(reference.data, local.data, diff.data, reference.width, reference.height, { threshold: 0.1 });
  fs.writeFileSync(diffPath, PNG.sync.write(diff));
  return {
    pixelsDifferent,
    percentDifferent: Number(((pixelsDifferent / (reference.width * reference.height)) * 100).toFixed(2))
  };
}

async function waitForSettled(page) {
  await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(500);
}

async function loginIfNeeded(page) {
  if (!page.url().includes("#/login")) return;
  await page.fill('input[name="userId"]', "admin");
  await page.fill('input[name="password"]', "123456");
  await page.fill('input[name="verifycode"]', "1234");
  await page.click('button[type="submit"]');
  await waitForSettled(page);
}

async function desktopCapture(browser, target) {
  const referenceSize = fs.existsSync(target.reference) ? readPng(target.reference) : null;
  const page = await browser.newPage({
    viewport: referenceSize ? { width: referenceSize.width, height: referenceSize.height } : desktopViewport,
    deviceScaleFactor: 1
  });
  await page.addInitScript(() => {
    window.__VISUAL_PARITY__ = true;
    window.localStorage.setItem("parityMode", "visible");
  });
  await page.goto(`http://127.0.0.1:${webPort}/${target.hash}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginIfNeeded(page);
  await page.goto(`http://127.0.0.1:${webPort}/${target.hash}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForSettled(page);

  const stem = fileStem(target);
  const localPath = path.join(outRoot, "desktop", `${stem}.png`);
  await page.screenshot({ path: localPath, fullPage: false });
  await page.close();

  const result = {
    title: target.title,
    hash: target.hash,
    mode: "desktop",
    reference: target.reference,
    local: localPath,
    diff: null,
    percentDifferent: null,
    pixelsDifferent: null
  };

  if (fs.existsSync(target.reference)) {
    const reference = referenceSize || readPng(target.reference);
    const local = readPng(localPath);
    if (reference.width === local.width && reference.height === local.height) {
      const diffPath = path.join(outRoot, "diff", `${stem}.png`);
      const diffStats = writeDiff(reference, local, diffPath);
      result.diff = diffPath;
      result.percentDifferent = diffStats.percentDifferent;
      result.pixelsDifferent = diffStats.pixelsDifferent;
    }
  }

  return result;
}

async function mobileCapture(browser, target) {
  const page = await browser.newPage({
    viewport: mobileViewport,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  await page.addInitScript(() => {
    window.__VISUAL_PARITY__ = true;
    window.localStorage.setItem("parityMode", "visible");
  });
  await page.goto(`http://127.0.0.1:${webPort}/${target.hash}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await loginIfNeeded(page);
  await page.goto(`http://127.0.0.1:${webPort}/${target.hash}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await waitForSettled(page);
  const overflow = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth > window.innerWidth + 4,
    height: document.documentElement.scrollHeight > window.innerHeight * 4
  }));
  const stem = fileStem(target);
  const localPath = path.join(outRoot, "mobile", `${stem}.png`);
  await page.screenshot({ path: localPath, fullPage: true });
  await page.close();
  return {
    title: target.title,
    hash: target.hash,
    mode: "mobile",
    local: localPath,
    overflow: overflow.width || overflow.height
  };
}

async function main() {
  if (!fs.existsSync(distRoot)) {
    throw new Error("dist build missing. Run npm run build first.");
  }

  ensureOutput();
  let targets = buildParityTargets({
    root,
    routeManifestPath: path.join(root, "reference-route-manifest.json"),
    crawlResultsPath: path.join(root, "tmp", "reference-crawl-results.json")
  });
  targets = filterTargets(targets);
  const webServer = createWebServer();

  await listenWebServer(webServer);

  const browser = await chromium.launch({ headless: true, executablePath: edge });
  const results = [];

  try {
    for (const target of targets) {
      results.push(await desktopCapture(browser, target));
      if (!shouldSkipMobile()) results.push(await mobileCapture(browser, target));
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => webServer.close(resolve));
  }

  const summary = summarizeResults(results);
  const report = {
    generatedAt: new Date().toISOString(),
    targets: targets.length,
    mobileSkipped: shouldSkipMobile(),
    summary,
    results
  };
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
