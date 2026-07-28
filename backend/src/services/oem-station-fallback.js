"use strict";

// Shared helpers for resolving an OEM's community/station list.
//
// Both local-database.js and storage-adapter.js implement the same three-tier
// lookup (explicit mappings → derived from operational data → canonical list),
// so the identifiers, labelling, and filtering rules live here to keep the two
// backends from drifting apart.

// Registered, verified Calinmeter stations. This is a superset of the CRM's
// reporting scope (refresh-targets.js): BONDU and KADUNA are commissioned sites
// whose meters have not been onboarded yet, so they legitimately have no rows in
// any operational table. That is precisely why the derived tier below must not
// be treated as the complete station list — see mergeDerivedWithCanonical.
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
// never real communities and must not reach the OEM Hub dropdown. Keep this list
// conservative: a real station wrongly matched here disappears from the operator's
// community list silently, which is worse than one stray row showing through.
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
// carry scratch rows, so it gets sanitised before display.
//
// Only genuine placeholders are dropped. Numeric ids are NOT filtered: 0001
// ("Station0001") is a real commissioned station, so the shape of an id says
// nothing about whether it is a real community. TEST_STATION, by contrast,
// exists only in station_meter_read_rollups and in no OEM station registry.
function isDerivedStationId(stationId) {
  const raw = String(stationId || "").trim();
  if (!isExplicitStationId(raw)) return false;
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

// Union of "stations that have data" and "stations we know are commissioned".
//
// Neither source is complete on its own: the derived list misses registered
// sites whose meters are not onboarded yet (no rollups, no bindings), and the
// canonical list is a static snapshot that will not know about sites added
// after it was written. Taking whichever is non-empty first — the obvious
// fall-through — silently drops verified communities the moment any operational
// row exists, so the two are merged instead.
//
// Curated canonical labels win over machine-derived ones ("Bondu" over "Bondu"
// derived from BONDU); ids are deduped case-insensitively and sorted.
function mergeDerivedWithCanonical(oemId, stationIds) {
  const byId = new Map();

  for (const row of toDerivedStationRows(oemId, stationIds)) {
    byId.set(row.stationId.toUpperCase(), row);
  }
  for (const row of canonicalStationRows(oemId)) {
    const key = row.stationId.toUpperCase();
    const existing = byId.get(key);
    byId.set(key, existing ? { ...existing, communityLabel: row.communityLabel } : row);
  }

  return Array.from(byId.values()).sort((a, b) => a.stationId.localeCompare(b.stationId));
}

module.exports = {
  CANONICAL_CALIN_STATIONS,
  UUID_PATTERN,
  isUuid,
  titleCaseStationId,
  isExplicitStationId,
  isDerivedStationId,
  toDerivedStationRows,
  canonicalStationRows,
  mergeDerivedWithCanonical
};
