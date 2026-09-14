const MAX_COMPRESSED_BYTES = 25 * 1024 * 1024;
const MAX_CSV_BYTES = 50 * 1024 * 1024;
const MAX_BUNDLE_BYTES = 100 * 1024 * 1024;
const MAX_BUNDLE_FILES = 100;

export function buildArchiveSiteRows(siteOptions = [], reports = []) {
  const sites = new Map();
  for (const option of siteOptions) {
    const stationId = String(option?.value || "").trim();
    if (!stationId) continue;
    sites.set(stationId.toUpperCase(), {
      stationId,
      label: String(option?.label || stationId),
      oemSlug: "",
      reportCount: 0,
      rowCount: 0,
      byteSize: 0,
      coversFrom: "",
      coversTo: "",
      refreshedAt: "",
      reportTypes: [],
      granularities: [],
      state: "empty",
      rowCountsByType: {},
    });
  }

  for (const report of reports) {
    const stationId = String(report?.stationId || "").trim();
    if (!stationId) continue;
    const key = stationId.toUpperCase();
    const row = sites.get(key) || {
      stationId,
      label: stationId,
      oemSlug: "",
      reportCount: 0,
      rowCount: 0,
      byteSize: 0,
      coversFrom: "",
      coversTo: "",
      refreshedAt: "",
      reportTypes: [],
      granularities: [],
      state: "empty",
      rowCountsByType: {},
    };
    row.oemSlug ||= String(report.oemSlug || "");
    row.reportCount += 1;
    row.byteSize += Number(report.byteSize || 0);
    const reportType = String(report.reportType || "unknown").toLowerCase();
    const typeCounts = row.rowCountsByType[reportType] || { monthly: 0, yearly: 0 };
    const grain = report.granularity === "monthly" ? "monthly" : "yearly";
    typeCounts[grain] += Number(report.rowCount || 0);
    row.rowCountsByType[reportType] = typeCounts;
    const coversFrom = String(report.coversFrom || "");
    const coversTo = String(report.coversTo || "");
    const refreshedAt = String(report.refreshedAt || "");
    if (coversFrom && (!row.coversFrom || coversFrom < row.coversFrom)) row.coversFrom = coversFrom;
    if (coversTo && (!row.coversTo || coversTo > row.coversTo)) row.coversTo = coversTo;
    if (refreshedAt && (!row.refreshedAt || refreshedAt > row.refreshedAt)) row.refreshedAt = refreshedAt;
    row.reportTypes = Array.from(new Set([...row.reportTypes, report.reportType].filter(Boolean))).sort();
    row.granularities = Array.from(new Set([...row.granularities, report.granularity].filter(Boolean))).sort();
    row.state = "ready";
    sites.set(key, row);
  }

  return Array.from(sites.values()).map(({ rowCountsByType, ...row }) => ({
    ...row,
    rowCount: Object.values(rowCountsByType).reduce(
      (sum, counts) => sum + (counts.monthly || counts.yearly),
      0,
    ),
  })).sort((left, right) => left.label.localeCompare(right.label));
}

export function selectArchiveReports(reports = [], selection = {}) {
  const stations = new Set((selection.stationIds || []).map((value) => String(value).toUpperCase()));
  const reportTypes = new Set((selection.reportTypes || []).map((value) => String(value).toLowerCase()));
  const granularity = String(selection.granularity || "monthly").toLowerCase();
  const from = String(selection.from || "");
  const to = String(selection.to || "");

  return reports.filter((report) => {
    if (stations.size && !stations.has(String(report.stationId || "").toUpperCase())) return false;
    if (reportTypes.size && !reportTypes.has(String(report.reportType || "").toLowerCase())) return false;
    if (granularity && String(report.granularity || "").toLowerCase() !== granularity) return false;
    const coversFrom = String(report.coversFrom || report.periodStart || "").slice(0, 10);
    const coversTo = String(report.coversTo || report.periodEnd || coversFrom).slice(0, 10);
    if (from && coversTo && coversTo < from) return false;
    if (to && coversFrom && coversFrom > to) return false;
    return true;
  }).sort((left, right) => {
    return String(left.stationId || "").localeCompare(String(right.stationId || ""))
      || String(left.reportType || "").localeCompare(String(right.reportType || ""))
      || String(left.coversFrom || left.periodStart || "").localeCompare(String(right.coversFrom || right.periodStart || ""));
  });
}

function tarFilename(value, index) {
  const raw = String(value || `archive-${index + 1}.csv.gz`).split(/[\\/]/).pop();
  const safe = raw.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || `archive-${index + 1}.csv.gz`;
  if (new TextEncoder().encode(safe).byteLength <= 96) return safe;
  const extension = safe.endsWith(".csv.gz") ? ".csv.gz" : safe.endsWith(".csv") ? ".csv" : "";
  return `${safe.slice(0, Math.max(1, 82 - extension.length))}-${index + 1}${extension}`;
}

function writeTarText(header, offset, length, value) {
  const bytes = new TextEncoder().encode(String(value || ""));
  header.set(bytes.slice(0, length), offset);
}

function writeTarOctal(header, offset, length, value) {
  const octal = Math.max(0, Number(value) || 0).toString(8).padStart(length - 1, "0").slice(-(length - 1));
  writeTarText(header, offset, length, `${octal}\0`);
}

export function createArchiveTar(files = []) {
  const parts = [];
  files.forEach((file, index) => {
    const bytes = file.bytes instanceof Uint8Array ? file.bytes : new Uint8Array(file.bytes || 0);
    const header = new Uint8Array(512);
    writeTarText(header, 0, 100, tarFilename(file.filename, index));
    writeTarOctal(header, 100, 8, 0o644);
    writeTarOctal(header, 108, 8, 0);
    writeTarOctal(header, 116, 8, 0);
    writeTarOctal(header, 124, 12, bytes.byteLength);
    writeTarOctal(header, 136, 12, Math.floor(Date.now() / 1000));
    header.fill(32, 148, 156);
    header[156] = 48;
    writeTarText(header, 257, 6, "ustar");
    writeTarText(header, 263, 2, "00");
    const checksum = header.reduce((sum, byte) => sum + byte, 0);
    writeTarText(header, 148, 8, `${checksum.toString(8).padStart(6, "0")}\0 `);
    parts.push(header, bytes);
    const padding = (512 - (bytes.byteLength % 512)) % 512;
    if (padding) parts.push(new Uint8Array(padding));
  });
  parts.push(new Uint8Array(1024));
  return new Blob(parts, { type: "application/x-tar" });
}

function archiveBundleName(reports) {
  const stations = Array.from(new Set(reports.map((report) => String(report.stationId || "").trim()).filter(Boolean)));
  const station = stations.length === 1 ? stations[0].toLowerCase().replace(/[^a-z0-9_-]+/g, "-") : "multi-site";
  const from = reports.reduce((value, report) => {
    const day = String(report.coversFrom || report.periodStart || "").slice(0, 10);
    return !value || (day && day < value) ? day : value;
  }, "") || "unknown";
  const to = reports.reduce((value, report) => {
    const day = String(report.coversTo || report.periodEnd || report.coversFrom || "").slice(0, 10);
    return !value || day > value ? day : value;
  }, "") || "unknown";
  return `beverly-archive-${station}-${from}-to-${to}.tar`;
}

export async function buildArchiveBundle(reports = [], options = {}) {
  if (!reports.length) throw new Error("No archived files match this selection.");
  if (reports.length > MAX_BUNDLE_FILES) throw new Error(`Choose a smaller range. Bundles support ${MAX_BUNDLE_FILES} files.`);
  if (typeof options.requestDownload !== "function") throw new Error("Archive download service is unavailable.");
  const fetchImpl = options.fetchImpl || fetch;
  const format = options.format === "csv" ? "csv" : "gzip";
  const files = [];
  let bundleBytes = 0;

  for (let index = 0; index < reports.length; index += 1) {
    const report = reports[index];
    const signed = await options.requestDownload(report.id);
    if (!signed?.url) throw new Error(signed?.reason || "Archive download link was unavailable.");
    let filename = signed.filename || report.filename || `archive-${index + 1}.csv.gz`;
    let bytes;
    if (format === "csv") {
      const expanded = await fetchArchiveCsv(signed.url, { ...report, filename }, fetchImpl);
      filename = expanded.filename;
      bytes = new Uint8Array(await expanded.blob.arrayBuffer());
    } else {
      const response = await fetchImpl(signed.url);
      if (!response.ok) throw new Error(`Archive download failed (${response.status}).`);
      bytes = new Uint8Array(await response.arrayBuffer());
    }
    bundleBytes += bytes.byteLength;
    if (bundleBytes > MAX_BUNDLE_BYTES) throw new Error("Choose a smaller range. Bundle size exceeds 100 MB.");
    files.push({ filename, bytes });
    options.onProgress?.({ completed: index + 1, total: reports.length, filename });
  }

  return {
    blob: createArchiveTar(files),
    filename: archiveBundleName(reports),
    fileCount: files.length,
    contentBytes: bundleBytes,
  };
}

export async function loadArchiveCatalogue(fetchPage, filters = {}, options = {}) {
  if (typeof fetchPage !== "function") throw new Error("Archive catalogue service is unavailable.");
  const pageSize = 100;
  const maxReports = Math.max(pageSize, Number(options.maxReports || 5000));
  const reports = [];
  let page = 1;
  let pageCount = 1;
  do {
    const result = await fetchPage({ ...filters, page, pageSize });
    reports.push(...(Array.isArray(result?.reports) ? result.reports : []));
    pageCount = Math.max(1, Number(result?.pageCount || 1));
    if (reports.length >= maxReports) {
      if (page < pageCount) throw new Error(`Archive catalogue exceeds ${maxReports} files. Narrow the server scope.`);
      break;
    }
    page += 1;
  } while (page <= pageCount);
  return reports.slice(0, maxReports);
}

export function archiveCsvFilename(filename) {
  const safe = String(filename || "archive.csv.gz").split(/[\\/]/).pop();
  return safe.endsWith(".csv.gz") ? safe.slice(0, -3) : `${safe.replace(/\.gz$/i, "")}.csv`;
}

export function canExpandArchive(report) {
  return Number(report?.byteSize) <= MAX_COMPRESSED_BYTES
    && typeof DecompressionStream !== "undefined";
}

export async function fetchArchiveCsv(url, report, fetchImpl = fetch) {
  if (!canExpandArchive(report)) throw new Error("This archive is too large for browser conversion. Download the original CSV.gz file.");
  const response = await fetchImpl(url);
  if (!response.ok || !response.body) throw new Error("Archive download failed. Try again.");
  const reader = response.body.pipeThrough(new DecompressionStream("gzip")).getReader();
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_CSV_BYTES) throw new Error("Expanded archive exceeds 50 MB. Download the original CSV.gz file.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
  return {
    filename: archiveCsvFilename(report?.filename),
    blob: new Blob(["\uFEFF", ...chunks], { type: "text/csv;charset=utf-8" }),
  };
}
