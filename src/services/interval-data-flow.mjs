export function hourlyCreateTime(row = {}) {
  return row.createTime
    || row.create_time
    || row.createDate
    || row.create_date
    || row.create_time_str
    || row.createDateTime
    || row.createdAt
    || row.created_at
    || row.createdDate
    || row.created_date
    || row.recordCreateTime
    || row.record_create_time
    || row.readingCreateTime
    || row.reading_create_time
    || row.serverCreateTime
    || row.server_create_time
    || row.collectTime
    || row.collect_time
    || row.collectionTime
    || row.collection_time
    || row.freezeTime
    || row.freeze_time
    || row.dataTime
    || row.data_time
    || row.currentTime
    || row.current_time
    || row.currentDate
    || row.collectionDate
    || row.timestamp
    || "";
}

export function normalizeDailyMeterRow(row = {}) {
  return {
    ...row,
    meterId: row.meterId || row.serialNumber || "",
    gatewayId: row.gatewayId || row.gateway || "",
    currentDate: row.currentDate || row.collectionDate || row.timestamp || row.createDate || "",
    customerId: row.customerId || row.customerAccountId || "",
    customerName: row.customerName || row.name || "",
    stationId: row.stationId || row.station || row.siteId || "",
    total1: row.total1 ?? row.totalEnergy ?? row.energyReadingKwh,
    usage1: row.usage1 ?? row.lastHourUsage ?? row.energyConsumptionKwh,
    remain1: row.remain1 ?? row.creditBalance ?? row.energyBalanceKwh,
    intervalDemand: row.intervalDemand ?? row.maximumDemand,
    power: row.power,
    relayOpen: row.relayOpen ?? row.relayStatus,
    batteryLow: row.batteryLow ?? row.batteryStatus,
    magneticInterference: row.magneticInterference ?? row.magneticStatus,
    terminalCoverOpen: row.terminalCoverOpen ?? row.terminalCover,
    coverOpen: row.coverOpen ?? row.upperOpen,
    currentReverse: row.currentReverse,
    currentUnbalance: row.currentUnbalance,
    createTime: hourlyCreateTime(row),
    updateDate: row.updateDate || row.updateTime || row.createDate || row.timestamp || "",
    status: row.status
  };
}

export function intervalRowMatchesSearch(row = {}, searchTerm = "") {
  const query = String(searchTerm || "").trim().toLowerCase();
  if (!query) return true;
  return [
    row.meterId,
    row.serialNumber,
    row.customerId,
    row.customerAccountId,
    row.customerName,
    row.name,
    row.gatewayId,
    row.gateway,
    row.stationId,
    row.station,
    row.siteId,
    row.currentDate,
    row.collectionDate,
    row.updateDate,
    row.updateTime
  ].some((value) => String(value ?? "").toLowerCase().includes(query));
}

export function sliceIntervalRows(rows, page = 1, pageSize = 10) {
  const safePage = Math.max(1, Number(page) || 1);
  const safePageSize = Math.max(1, Number(pageSize) || 10);
  const start = (safePage - 1) * safePageSize;
  return rows.slice(start, start + safePageSize);
}
