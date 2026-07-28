"use strict";

// Shared helpers for resolving an OEM's community/station list.
//
// Both local-database.js and storage-adapter.js implement the same three-tier
// lookup (explicit mappings → derived from operational data → canonical list),
// so the identifiers, labelling, and filtering rules live here to keep the two
// backends from drifting apart.

// Station ids used by the CRM's own reporting scope (see refresh-targets.js).
// Deliberately the last resort only: real mappings come from the OEM's live
// /api/station/read via backend/scripts/seed-calinmeter-oem.cjs.
const CANONICAL_CALIN_STATIONS = [
  { stationId: "BONDU", communityLabel: "Bondu" },
  { stationId: "KADUNA", communityLabel: "Kaduna" },
  { stationId: "KYAKALE", communityLabel: "Kyakale" },
  { stationId: "MUSHA", communityLabel: "Musha" },
  { stationId: "OGUFA", communityLabel: "Ogufa" },
  { stationId: "TUNGA", communityLabel: "Tunga" },
  { stationId: "UMAISHA", communityLabel: "Umaisha" }
];

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Placeholder/scratch identifiers that operational tables accumulate. These are
// never real communities and must not reach the OEM Hub dropdown.
const PLACEHOLDER_STATION_PATTERNS = [
  /test/i,
  /^demo/i,
  /^sample/i,
  /^dummy/i,
  /^placeholder/i,
  /^(n\/a|na|null|none|unknown|undefined)$/i
];

function isUuid(value) {
  return UUID_PATTERN.test(String(value || "").trim());
}

function titleCaseStationId(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

// Tier 1 — an operator deliberately mapped this station to this OEM, so the row
// is honoured as-is. Only ADMIN is dropped: it is an access scope the upstream
// API returns alongside real sites, not a community.
function isExplicitStationId(stationId) {
  const raw = String(stationId || "").trim();
  return Boolean(raw) && raw.toLowerCase() !== "admin";
}

// Tiers 2/3 — the station list is inferred from operational tables that also
// carry test rows and synthetic meter ids, so it gets sanitised before display.
// Numeric-only ids (0001) are meter/site scratch keys, not community names.
function isDerivedStationId(stationId) {
  const raw = String(stationId || "").trim();
  if (!isExplicitStationId(raw)) return false;
  if (/^\d+$/.test(raw)) return false;
  return !PLACEHOLDER_STATION_PATTERNS.some((pattern) => pattern.test(raw));
}

// Builds display rows from bare station ids discovered in operational tables.
function toDerivedStationRows(oemId, stationIds) {
  const unique = Array.from(new Set(
    (Array.isArray(stationIds) ? stationIds : [])
      .map((id) => String(id || "").trim())
      .filter(Boolean)
  )).sort();

  return unique.filter(isDerivedStationId).map((stationId) => ({
    oemId: String(oemId || ""),
    stationId,
    communityLabel: titleCaseStationId(stationId)
  }));
}

function canonicalStationRows(oemId) {
  return CANONICAL_CALIN_STATIONS
    .filter((station) => isDerivedStationId(station.stationId))
    .map((station) => ({
      oemId: String(oemId || ""),
      stationId: station.stationId,
      communityLabel: station.communityLabel
    }));
}

module.exports = {
  CANONICAL_CALIN_STATIONS,
  UUID_PATTERN,
  isUuid,
  titleCaseStationId,
  isExplicitStationId,
  isDerivedStationId,
  toDerivedStationRows,
  canonicalStationRows
};
