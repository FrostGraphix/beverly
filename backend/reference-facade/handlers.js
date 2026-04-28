"use strict";

const data = require("./data");

function ok(dataValue, extra = {}) {
  return {
    code: 200,
    msg: "success",
    data: dataValue,
    ...extra
  };
}

function list(items, total = items.length) {
  return ok({
    records: items,
    list: items,
    total,
    size: 10,
    current: 1,
    pages: Math.max(1, Math.ceil(total / 10))
  });
}

function login(body) {
  const userId = String(body.userId || "").trim();
  const password = String(body.password || "").trim();
  const verifycode = String(body.verifycode || "").trim();
  if (!userId || !password || !verifycode) {
    return { status: 400, body: { code: 400, msg: "Missing login fields", data: null } };
  }
  const user = data.users.find((item) => item.userId === userId) || data.users[0];
  return {
    status: 200,
    body: ok({
      token: "reference-compatible-token",
      userId,
      userName: user.userName,
      roleId: user.roleId,
      company: "ACB"
    })
  };
}

function userInfo(body = {}) {
  const user = data.users.find((item) => item.userId === String(body.userId || "admin")) || data.users[0];
  return ok({
    userId: user.userId,
    roleId: user.roleId,
    name: user.userName,
    avatar: "",
    roles: [user.roleId],
    permissions: user.roleId === "super-admin" ? ["*:*:*"] : user.roleId === "operations-manager" ? ["remote:*:*", "report:*:*"] : ["token:*:*", "account:*:*"]
  });
}

function dashboardPanel() {
  return ok({
    totalAccountCount: 2420,
    totalPurchaseTimes: 7305,
    totalPurchaseUnit: 100369,
    totalPurchaseMoney: 35253085
  });
}

function dashboardChart() {
  return ok({
    title: "Purchase Money",
    xData: ["04-24", "04-25", "04-26", "04-27", "04-28"],
    yData: [320000, 260000, 650000, 340000, 235000]
  });
}

function meterRows() {
  return data.accounts.map((account) => ({
    meterId: account.meterId,
    customerId: account.customerId,
    customerName: account.customerName,
    tariffId: account.tariffId,
    stationId: account.stationId,
    meterType: account.meterType,
    communicationWay: account.communicationWay,
    remark: account.remark
  }));
}

function dailyDataRows() {
  return data.accounts.map((account) => ({
    meterId: account.meterId,
    gatewayId: account.gatewayId,
    collectionDate: data.now,
    customerId: account.customerId,
    customerName: account.customerName,
    stationId: account.stationId,
    totalEnergy: 128.6,
    lastHourUsage: 1.2,
    creditBalance: 49.8,
    maximumDemand: 8.3,
    power: 1.1,
    relayStatus: "Open",
    batteryStatus: "Normal",
    magneticStatus: "Normal",
    terminalCover: "Closed",
    upperOpen: "No",
    currentReverse: "No",
    currentUnbalance: "No",
    updateTime: data.now
  }));
}

function remoteTaskRows(kind) {
  return data.accounts.slice(0, 4).map((account, index) => ({
    customerId: account.customerId,
    customerName: account.customerName,
    meterId: account.meterId,
    dataItem: kind,
    token: kind === "Send Token" ? "0021 2636 8628 4408 6688" : "",
    stationId: account.stationId,
    dataValue: kind === "Total Consumption" ? "128.6" : "",
    status: index === 0 ? "StandBy" : "Success",
    remark: "",
    createTime: "2026-04-28 09:47:49",
    updateTime: "2026-04-28 09:47:55"
  }));
}

function longNonpurchaseRows() {
  return data.accounts.map((account) => ({
    customerId: account.customerId,
    customerName: account.customerName,
    meterId: account.meterId,
    tariffId: account.tariffId,
    lastPurchaseUnit: 1.4,
    lastPurchasePaid: 500,
    lastPurchaseDate: "2026-03-18",
    nonpurchaseDays: 40,
    customerAddress: account.stationId
  }));
}

function lowPurchaseRows() {
  return data.accounts.map((account) => ({
    customerId: account.customerId,
    customerName: account.customerName,
    meterId: account.meterId,
    tariffId: account.tariffId,
    totalUnit: 0.8,
    totalPaid: 300,
    customerAddress: account.stationId
  }));
}

function tokenGenerate(type) {
  return ok({
    receiptId: String(Date.now()),
    token: type === "credit" ? "0021 2636 8628 4408 6688" : "3989 5108 1746 2930 3260",
    createTime: data.now
  });
}

function simpleRows(items) {
  return list(items);
}

const routes = new Map([
  ["POST /api/user/login", login],
  ["POST /api/user/info", userInfo],
  ["POST /api/user/logout", () => ok(true)],
  ["POST /api/dashboard/readPanelGroup", dashboardPanel],
  ["POST /api/dashboard/readLineChart", dashboardChart],
  ["POST /api/item/readItemList", () => list([{ label: "Electricity", value: "Electricity" }, { label: "LoraWan", value: "LoraWan" }])],
  ["POST /api/user/read", () => list(data.users)],
  ["POST /api/user/create", () => ok(true)],
  ["POST /api/user/update", () => ok(true)],
  ["POST /api/user/delete", () => ok(true)],
  ["POST /api/user/import", () => ok(true)],
  ["POST /api/user/reset", () => ok(true)],
  ["POST /api/user/updateInfo", () => ok(true)],
  ["POST /api/user/modifyLoginPassword", () => ok(true)],
  ["POST /api/user/modifyAuthorizationPassword", () => ok(true)],
  ["POST /api/role/read", () => list(data.roles)],
  ["POST /api/role/readDataRole", () => list(data.roles.map((role) => ({ id: role.id, name: role.dataRole })))],
  ["POST /api/role/create", () => ok(true)],
  ["POST /api/role/update", () => ok(true)],
  ["POST /api/role/delete", () => ok(true)],
  ["POST /api/role/import", () => ok(true)],
  ["POST /api/log/read", () => simpleRows(data.logs)],
  ["POST /api/Log/read", () => simpleRows(data.logs)],
  ["POST /api/station/read", () => list(data.stations)],
  ["POST /api/account/read", () => list(data.accounts, 2420)],
  ["POST /api/customer/read", () => list(data.customers, 2456)],
  ["POST /api/tariff/read", () => list(data.tariffs)],
  ["POST /api/meter/read", () => list(meterRows(), 2420)],
  ["POST /api/item/read", () => simpleRows(data.items)],
  ["POST /api/gateway/read", () => list(data.gateways)],
  ["POST /api/debt/read", () => simpleRows(data.debts)],
  ["POST /api/dlms/Read", () => simpleRows(data.dlms)],
  ["POST /api/dlt645/read", () => simpleRows(data.dlt645)],
  ["POST /API/GPRSMeterTask/GPRSGetReadingTask", () => simpleRows(data.gprsTasks)],
  ["POST /API/GPRSOnlineStatus/Read", () => simpleRows(data.gprsOnlineStatus)],
  ["POST /API/LoadProfile/ElectricEnergyCurve", () => simpleRows(data.loadProfiles)],
  ["POST /API/EventNotification/Read", () => simpleRows(data.eventNotifications)],
  ["POST /API/UpdateFirmwareTask/GetUpdateFirmwareTask", () => simpleRows(data.firmwareUpdates)],
  ["POST /API/File/Upload", () => simpleRows(data.fileUploads)],
  ["POST /api/DailyDataMeter/read", () => list(dailyDataRows())],
  ["POST /api/DailyDataMeter/readMore", () => list(dailyDataRows())],
  ["POST /api/dailyData/read", () => list([{ collectionDate: "2026-04-28", consumption: 128.6 }])],
  ["POST /api/dailyData/readMonthly", () => list([{ collectionDate: "2026-04", consumption: 3180.4 }])],
  ["POST /api/token/creditToken/generate", () => tokenGenerate("credit")],
  ["POST /api/token/clearCreditToken/generate", () => tokenGenerate("clearCredit")],
  ["POST /api/token/clearTamperToken/generate", () => tokenGenerate("clearTamper")],
  ["POST /api/token/setMaximumPowerLimitToken/generate", () => tokenGenerate("powerLimit")],
  ["POST /api/token/creditTokenRecord/read", () => list(data.creditTokenRecords, 8311)],
  ["POST /api/token/clearCreditTokenRecord/read", () => list(data.clearCreditTokenRecords, 20)],
  ["POST /api/token/clearTamperTokenRecord/read", () => list([])],
  ["POST /api/token/setMaximumPowerLimitTokenRecord/read", () => list([])],
  ["POST /api/token/creditTokenRecord/cancel", () => ok(true)],
  ["POST /api/token/creditTokenCancelRecord/read", () => list([])],
  ["POST /api/remoteMeterTask/getReadingTask", () => list(remoteTaskRows("Total Consumption"))],
  ["POST /api/remoteMeterTask/getControlTask", () => list(remoteTaskRows("Switch Off"))],
  ["POST /api/remoteMeterTask/getTokenTask", () => list(remoteTaskRows("Send Token"))],
  ["POST /api/remoteMeterTask/createReadingTask", () => ok(true)],
  ["POST /api/remoteMeterTask/createControlTask", () => ok(true)],
  ["POST /api/remoteMeterTask/createTokenTask", () => ok(true)],
  ["POST /api/prepayReport/longNonpurchaseSituation", () => list(longNonpurchaseRows())],
  ["POST /api/prepayReport/lowPurchaseSituation", () => list(lowPurchaseRows())],
  ["POST /api/prepayReport/consumptionStatistics", () => list([{ collectionDate: "2026-04-28", consumption: 128.6 }])],
  ["GET /api/token/creditTokenRecord/readMore", () => list(data.creditTokenRecords, 8311)],
  ["GET /api/DailyDataMeter/readHourly", () => list(dailyDataRows())],
  ["GET /api/PrepayReport/LongNonpurchaseSituation", () => list(longNonpurchaseRows())],
  ["GET /api/PrepayReport/LowPurchaseSituation", () => list(lowPurchaseRows())],
  ["GET /api/PrepayReport/ConsumptionStatistics", () => list([{ collectionDate: "2026-04-28", consumption: 128.6 }])],
  ["POST /api/PrepayReport/LongNonpurchaseSituation", () => list(longNonpurchaseRows())],
  ["POST /api/PrepayReport/LowPurchaseSituation", () => list(lowPurchaseRows())],
  ["POST /api/PrepayReport/ConsumptionStatistics", () => list([{ collectionDate: "2026-04-28", consumption: 128.6 }])],
  ["POST /api/RemoteMeterTask/CreateReadingTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/CreateSettingTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/CreateControlTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/CreateTokenTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/CreateTransparentForwardingTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/GetReadingTask", () => list(remoteTaskRows("Total Consumption"))],
  ["POST /api/RemoteMeterTask/GetSettingTask", () => list(remoteTaskRows("Setting"))],
  ["POST /api/RemoteMeterTask/GetControlTask", () => list(remoteTaskRows("Switch Off"))],
  ["POST /api/RemoteMeterTask/GetTokenTask", () => list(remoteTaskRows("Send Token"))],
  ["POST /api/RemoteMeterTask/GetTransparentForwardingTask", () => list(remoteTaskRows("Transparent Forwarding"))],
  ["POST /api/RemoteMeterTask/UpdateReadingTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/UpdateSettingTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/UpdateControlTask", () => ok(true)],
  ["POST /api/RemoteMeterTask/UpdateTokenTask", () => ok(true)],
  ["POST /api/gateway/create", () => ok(true)],
  ["POST /api/gateway/update", () => ok(true)],
  ["POST /api/gateway/delete", () => ok(true)],
  ["POST /api/gateway/import", () => ok(true)],
  ["POST /api/customer/create", () => ok(true)],
  ["POST /api/customer/update", () => ok(true)],
  ["POST /api/customer/delete", () => ok(true)],
  ["POST /api/customer/import", () => ok(true)],
  ["POST /api/tariff/create", () => ok(true)],
  ["POST /api/tariff/update", () => ok(true)],
  ["POST /api/tariff/delete", () => ok(true)],
  ["POST /api/tariff/import", () => ok(true)],
  ["POST /api/account/create", () => ok(true)],
  ["POST /api/account/update", () => ok(true)],
  ["POST /api/account/delete", () => ok(true)],
  ["POST /api/account/import", () => ok(true)]
]);

function dispatch(method, pathname, body) {
  const handler = routes.get(`${method} ${pathname}`);
  if (!handler) {
    if (pathname.startsWith("/api/")) {
      return {
        status: 200,
        body: ok({ records: [], list: [], total: 0, size: 10, current: 1, pages: 1 })
      };
    }
    return {
      status: 404,
      body: { code: 404, msg: "Reference facade route not implemented", data: null }
    };
  }
  const result = handler(body);
  return result && result.status ? result : { status: 200, body: result };
}

module.exports = {
  dispatch,
  routes
};
