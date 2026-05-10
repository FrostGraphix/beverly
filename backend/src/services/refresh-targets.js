"use strict";

const stations = ["TUNGA", "UMAISHA", "OGUFA", "KYAKALE", "MUSHA"];

function todayRange(now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(now);
  startDate.setUTCDate(startDate.getUTCDate() - 30);
  return {
    from: startDate.toISOString().slice(0, 10),
    to: end
  };
}

function localDateKey(now = new Date(), offsetMinutes = 60) {
  const date = new Date(now);
  date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
  return date.toISOString().slice(0, 10);
}

function previousDayRange(now = new Date(), offsetMinutes = 60) {
  const date = new Date(`${localDateKey(now, offsetMinutes)}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  const day = date.toISOString().slice(0, 10);
  return {
    from: day,
    to: day
  };
}

function monthlyRange(now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const startDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  return {
    from: startDate.toISOString().slice(0, 10),
    to: end
  };
}

function basePayload(extra = {}) {
  return {
    pageNumber: 1,
    pageSize: 20,
    ...extra
  };
}

function pagedDailyMeterPayload(extra = {}) {
  return basePayload({
    pageSize: 500,
    ...extra
  });
}

function refreshTargets(scope = "hot", now = new Date()) {
  const daily = todayRange(now);
  const monthly = monthlyRange(now);
  const midnight = previousDayRange(now);
  const hot = [
    { name: "dashboard-panels", path: "/api/dashboard/readPanelGroup", payload: {}, cadence: "5m" },
    { name: "dashboard-line", path: "/api/dashboard/readLineChart", payload: {}, cadence: "5m" },
    { name: "stations", path: "/api/station/read", payload: basePayload(), cadence: "15m" },
    { name: "tariffs", path: "/api/tariff/read", payload: basePayload(), cadence: "15m" },
    { name: "token-records", path: "/api/token/creditTokenRecord/read", payload: basePayload({ from: monthly.from, to: monthly.to }), cadence: "15m" }
  ];
  const hourly = [
    { name: "accounts", path: "/api/account/read", payload: basePayload(), cadence: "1h" },
    { name: "customers", path: "/api/customer/read", payload: basePayload(), cadence: "1h" },
    { name: "meters", path: "/api/meter/read", payload: basePayload(), cadence: "1h" },
    ...stations.map((stationId) => ({
      name: `daily-meter-${stationId.toLowerCase()}`,
      path: "/api/DailyDataMeter/read",
      payload: basePayload({ stationId, from: daily.from, to: daily.to }),
      cadence: "1h"
    }))
  ];
  const dailyReports = [
    ...stations.map((stationId) => ({
      name: `daily-consumption-sync-${stationId.toLowerCase()}`,
      path: "/api/DailyDataMeter/read",
      payload: pagedDailyMeterPayload({ stationId, FROM: midnight.from, TO: midnight.to }),
      cadence: "24h",
      paginate: true
    })),
    { name: "long-nonpurchase", path: "/API/PrepayReport/LongNonpurchaseSituation", payload: basePayload({ from: daily.from, to: daily.to }), cadence: "24h" },
    { name: "low-purchase", path: "/API/PrepayReport/LowPurchaseSituation", payload: basePayload({ from: daily.from, to: daily.to }), cadence: "24h" },
    { name: "consumption-statistics", path: "/API/PrepayReport/ConsumptionStatistics", payload: basePayload({ from: daily.from, to: daily.to }), cadence: "24h" }
  ];
  const backfill = stations.map((stationId) => ({
    name: `historical-consumption-backfill-${stationId.toLowerCase()}`,
    path: "/api/DailyDataMeter/read",
    payload: pagedDailyMeterPayload({
      lang: "en",
      stationId,
      FROM: process.env.CONSUMPTION_BACKFILL_FROM || "2025-01-01",
      TO: localDateKey(now),
    }),
    cadence: "manual",
    paginate: true,
    maxPages: Number(process.env.CONSUMPTION_BACKFILL_MAX_PAGES_PER_RUN || 2)
  }));

  if (scope === "hot") return hot;
  if (scope === "hourly") {
    const includeDaily = now.getUTCHours() === 0;
    return includeDaily ? [...hourly, ...dailyReports] : hourly;
  }
  if (scope === "daily") return dailyReports;
  if (scope === "backfill") return backfill;
  if (scope === "all") return [...hot, ...hourly, ...dailyReports];
  return hot;
}

module.exports = {
  localDateKey,
  previousDayRange,
  refreshTargets,
  stations,
  todayRange
};
