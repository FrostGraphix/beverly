export function gatewayIsDown(row = {}) {
  if (typeof row.status === "boolean") return !row.status;
  const status = String(row.status || "").trim();
  if (status) return /offline|down|fault|error/i.test(status);
  return row.successRate !== undefined && Number(row.successRate) <= 0;
}

export function formatGatewayDuration(milliseconds = 0) {
  const minutes = Math.max(0, Math.floor(Number(milliseconds) / 60000));
  if (minutes < 1) return "Less than one minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const remainingMinutes = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${remainingMinutes}m`;
  return `${remainingMinutes}m`;
}

export function updateGatewayHealth(rows = [], previous = {}, now = new Date()) {
  const checkedAt = now.toISOString();
  const state = {};
  const events = [];

  for (const row of rows) {
    const gateway = String(row.gatewayId || row.id || "Unknown gateway");
    const station = String(row.stationId || row.station || "Unknown station");
    const key = `${station}::${gateway}`;
    const prior = previous[key];
    const down = gatewayIsDown(row);
    const changedAt = prior && prior.down === down ? prior.changedAt : checkedAt;
    const snapshot = {
      down,
      changedAt,
      checkedAt,
      gateway,
      station,
      status: String(row.status ?? (down ? "Offline" : "Online")),
      successRate: Number.isFinite(Number(row.successRate)) ? Number(row.successRate) : null,
      lastReportedAt: row.updateDate || row.updatedAt || null
    };
    state[key] = snapshot;

    if (down && !prior?.down) {
      events.push({ ...snapshot, id: `${key}-down-${now.getTime()}`, kind: "down", startedAt: checkedAt });
    } else if (!down && prior?.down) {
      events.push({ ...snapshot, id: `${key}-recovered-${now.getTime()}`, kind: "recovered", startedAt: prior.changedAt, endedAt: checkedAt });
    }
  }

  return { state, events };
}
