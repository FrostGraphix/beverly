"use strict";

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const docsPath = path.join(root, "docs", "AMR_API_REFERENCE.md");
const crawlPath = path.join(root, "tmp", "reference-crawl-results.json");
const manifestPath = path.join(root, "reference-route-manifest.json");
const registryPath = path.join(root, "backend", "src", "services", "endpoint-registry.ts");
const outPath = path.join(root, "contracts", "reference-contract.generated.json");
const publishedOutPath = path.join(root, "reference-contract.json");

function operationFromPath(endpointPath) {
  const lower = endpointPath.toLowerCase();
  if (lower.includes("readhourly") || lower.includes("readmonthly")) return "drilldown";
  if (lower.includes("task") && lower.includes("get")) return "task-read";
  if (lower.includes("task") && lower.includes("create")) return "task-create";
  if (lower.includes("task") && lower.includes("update")) return "task-update";
  if (lower.includes("/generate")) return "token-generate";
  if (lower.includes("/cancel")) return "token-cancel";
  if (lower.includes("/upload")) return "file-upload";
  if (lower.endsWith("/read") || lower.endsWith("/readmore") || lower.endsWith("/info") || lower.endsWith("/view") || lower.includes("readitemlist")) return "read";
  if (lower.includes("/create")) return "crud-create";
  if (lower.includes("/update") || lower.includes("/reset") || lower.includes("/modify")) return "crud-update";
  if (lower.includes("/delete")) return "crud-delete";
  if (lower.includes("/import")) return "import";
  return "generic";
}

function buildPathVariants(endpointPath) {
  const variants = new Set([endpointPath]);
  if (endpointPath.startsWith("/API/")) {
    variants.add(endpointPath.replace(/^\/API\//, "/api/"));
  }
  if (endpointPath.startsWith("/api/")) {
    variants.add(endpointPath.replace(/^\/api\//, "/API/"));
  }
  return Array.from(variants);
}

function methodFromPath(endpointPath) {
  const lower = endpointPath.toLowerCase();
  if ([
    "/api/dashboard",
    "/api/dashboard/hourly",
    "/api/dashboard/gprs",
    "/api/dashboard/events",
    "/api/dashboard/risk-overlay",
    "/api/dashboard/revenue-vs-usage",
    "/api/dashboard/portfolio-health"
  ].includes(lower)) {
    return "GET";
  }
  if (lower.includes("readmore") || lower.includes("readhourly") || lower.includes("readmonthly")) return "GET_OR_POST";
  return "POST";
}

function writeRiskLevelFromOperation(operation) {
  if (["read", "drilldown", "task-read", "generic"].includes(operation)) return "none";
  if (["crud-create", "crud-update", "import"].includes(operation)) return "medium";
  return "high";
}

function parseSwaggerReference(markdown) {
  const endpoints = [];
  let moduleName = "";
  let current = null;
  const lines = markdown.split(/\r?\n/);

  for (const line of lines) {
    const heading = line.match(/^##\s+(.+)$/);
    if (heading && !["Overview", "How The API Operates", "Quick Start Examples", "Common DTO Patterns", "Full Endpoint Catalog", "Practical Reading Of The API Surface", "Limitations And Notes"].includes(heading[1])) {
      moduleName = heading[1];
    }

    const endpoint = line.match(/^- `([^`]+)` \(`([^`]+)`\)/);
    if (endpoint) {
      current = {
        module: moduleName,
        path: endpoint[1],
        operationId: endpoint[2],
        method: "POST",
        requestSchema: "",
        responseSchema: "",
        operation: operationFromPath(endpoint[1]),
        consumers: [],
        observed: false,
        aliases: buildPathVariants(endpoint[1]),
        liveWrite: false
      };
      current.liveWrite = !["read", "drilldown", "task-read", "generic"].includes(current.operation);
      endpoints.push(current);
      continue;
    }

    if (current) {
      const request = line.match(/^\s+request: `([^`]+)`/);
      if (request) current.requestSchema = request[1];
      const response = line.match(/^\s+response: `([^`]+)`/);
      if (response) current.responseSchema = response[1];
    }
  }

  return endpoints;
}

function attachCrawlConsumers(endpoints, crawl, manifest) {
  const byLowerPath = new Map(endpoints.map((endpoint) => [endpoint.path.toLowerCase(), endpoint]));
  const routeByHash = new Map(manifest.map((route) => [route.hash, route]));
  for (const page of crawl) {
    for (const apiCall of page.api || []) {
      const endpoint = byLowerPath.get(apiCall.path.toLowerCase());
      if (!endpoint) continue;
      endpoint.observed = true;
      if (!endpoint.aliases.includes(apiCall.path)) endpoint.aliases.push(apiCall.path);
      endpoint.consumers.push({
        group: page.group,
        title: page.title,
        hash: page.href,
        status: apiCall.status || null
      });
    }
  }
  for (const route of manifest) {
    for (const apiPath of route.apis || []) {
      const endpoint = byLowerPath.get(apiPath.toLowerCase());
      if (!endpoint) continue;
      if (!endpoint.aliases.includes(apiPath)) endpoint.aliases.push(apiPath);
      if (!endpoint.consumers.some((consumer) => consumer.hash === route.hash)) {
        endpoint.consumers.push({ group: route.group, title: route.title, hash: route.hash, status: null });
      }
    }
  }
  for (const endpoint of endpoints) {
    endpoint.consumers = endpoint.consumers.filter((consumer, index, all) => all.findIndex((item) => item.hash === consumer.hash) === index);
    endpoint.visibleRoute = endpoint.consumers.some((consumer) => routeByHash.has(consumer.hash));
  }
}

function buildCoverageSummary(endpoints, crawl, manifest) {
  const endpointPaths = new Set(endpoints.map((endpoint) => endpoint.path.toLowerCase()));
  const crawlPaths = Array.from(new Set(
    crawl.flatMap((page) => (page.api || []).map((apiCall) => apiCall.path.toLowerCase()))
  ));
  const crawlMissing = crawlPaths.filter((endpointPath) => !endpointPaths.has(endpointPath));
  const routeCoverage = manifest.map((route) => ({
    group: route.group,
    title: route.title,
    hash: route.hash,
    apiCount: (route.apis || []).length,
    coveredApiCount: (route.apis || []).filter((apiPath) => endpointPaths.has(apiPath.toLowerCase())).length,
    fullyMapped: (route.apis || []).every((apiPath) => endpointPaths.has(apiPath.toLowerCase()))
  }));

  return {
    crawlUniqueEndpointCount: crawlPaths.length,
    crawlMissingEndpointCount: crawlMissing.length,
    crawlMissingEndpoints: crawlMissing,
    routeCount: manifest.length,
    fullyMappedRouteCount: routeCoverage.filter((route) => route.fullyMapped).length,
    routeCoverage
  };
}

function registryPaths(source) {
  return Array.from(source.matchAll(/\["([^"]+)",\s*"([^"]+)"\]/g)).map((match) => ({
    path: match[1],
    operation: match[2]
  }));
}

function main() {
  const markdown = fs.readFileSync(docsPath, "utf8");
  const crawl = JSON.parse(fs.readFileSync(crawlPath, "utf8"));
  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  const registry = registryPaths(fs.readFileSync(registryPath, "utf8"));
  const endpoints = parseSwaggerReference(markdown);
  const documentedTotal = Number(markdown.match(/Total documented endpoints: `(\d+)`/)?.[1] || endpoints.length);
  attachCrawlConsumers(endpoints, crawl, manifest);

  const endpointMap = new Map(endpoints.map((endpoint) => [endpoint.path.toLowerCase(), endpoint]));
  for (const item of registry) {
    const endpoint = endpointMap.get(item.path.toLowerCase());
    if (endpoint) {
      endpoint.operation = item.operation;
      endpoint.liveWrite = !["read", "drilldown", "task-read", "generic"].includes(item.operation);
      if (!endpoint.aliases.includes(item.path)) endpoint.aliases.push(item.path);
    } else {
      const registryOnly = {
        module: "RegistryOnly",
        path: item.path,
        operationId: "",
        method: item.operation === "read" || item.operation === "drilldown" ? "GET_OR_POST" : "POST",
        requestSchema: "",
        responseSchema: "",
        operation: item.operation,
        consumers: [],
        observed: false,
        aliases: buildPathVariants(item.path),
        liveWrite: !["read", "drilldown", "task-read", "generic"].includes(item.operation),
        visibleRoute: false,
        registryOnly: true
      };
      endpoints.push(registryOnly);
      endpointMap.set(item.path.toLowerCase(), registryOnly);
    }
  }

  for (const route of manifest) {
    for (const apiPath of route.apis || []) {
      if (endpointMap.has(apiPath.toLowerCase())) continue;
      const manifestOnly = {
        module: route.group || "ManifestOnly",
        path: apiPath,
        operationId: "",
        method: methodFromPath(apiPath),
        requestSchema: "",
        responseSchema: "",
        operation: operationFromPath(apiPath),
        consumers: [{ group: route.group, title: route.title, hash: route.hash, status: null }],
        observed: false,
        aliases: buildPathVariants(apiPath),
        liveWrite: !["read", "drilldown", "task-read", "generic"].includes(operationFromPath(apiPath)),
        visibleRoute: true,
        manifestOnly: true
      };
      endpoints.push(manifestOnly);
      endpointMap.set(apiPath.toLowerCase(), manifestOnly);
    }
  }

  for (const endpoint of endpoints) {
    endpoint.aliases = Array.from(new Set(endpoint.aliases));
    endpoint.casingVariants = endpoint.aliases.slice();
    endpoint.uiRouteConsumers = endpoint.consumers.map((consumer) => ({
      group: consumer.group,
      title: consumer.title,
      hash: consumer.hash
    }));
    endpoint.writeRiskLevel = writeRiskLevelFromOperation(endpoint.operation);
  }

  const contract = {
    name: "Beverly by ACOB",
    source: {
      swaggerReference: "docs/AMR_API_REFERENCE.md",
      crawlResults: "tmp/reference-crawl-results.json",
      routeManifest: "reference-route-manifest.json",
      endpointRegistry: "backend/src/services/endpoint-registry.ts"
    },
    generatedAt: new Date().toISOString(),
    documentedTotal,
    endpointCount: endpoints.length,
    endpointCountNote: documentedTotal === endpoints.length ? "matches overview" : "overview count differs from endpoint catalog lines",
    observedEndpointCount: endpoints.filter((endpoint) => endpoint.observed).length,
    visibleEndpointCount: endpoints.filter((endpoint) => endpoint.visibleRoute).length,
    liveWriteEndpointCount: endpoints.filter((endpoint) => endpoint.liveWrite).length,
    coverage: buildCoverageSummary(endpoints, crawl, manifest),
    endpoints
  };

  fs.writeFileSync(outPath, `${JSON.stringify(contract, null, 2)}\n`);
  fs.writeFileSync(publishedOutPath, `${JSON.stringify(contract, null, 2)}\n`);
  console.log(JSON.stringify({
    output: outPath,
    publishedOutput: publishedOutPath,
    endpointCount: contract.endpointCount,
    observedEndpointCount: contract.observedEndpointCount,
    visibleEndpointCount: contract.visibleEndpointCount,
    liveWriteEndpointCount: contract.liveWriteEndpointCount
  }, null, 2));
}

main();
