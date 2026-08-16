/**
 * Parses an upstream NGN/kWh tariff price without inventing a fallback rate.
 * Upstream tier strings use the third `~` segment as their effective price.
 * @param {unknown} value
 * @returns {number}
 */
export function parseTariffUnitPrice(value) {
  const parts = String(value ?? "")
    .split("~")
    .map((part) => Number(part))
    .filter((part) => Number.isFinite(part));
  const parsed = parts.length >= 3 ? parts[2] : parts[0];
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
