"use strict";

const now = "2026-04-28 10:29:23";

const baseCustomers = [
  {
    id: "123",
    name: "test",
    phone: "",
    address: "",
    certifiName: "",
    certifiNo: "",
    remark: "",
    createTime: "2025-07-21 09:25:57",
    updateTime: "2025-07-21 09:25:57",
    stationId: "0001",
    gatewayId: "G_001"
  },
  {
    id: "470005342689",
    name: "HARUNA ADAMU",
    phone: "",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "167",
    remark: "",
    createTime: "2026-01-27 13:11:10",
    updateTime: "2026-01-27 13:11:10",
    stationId: "TUNGA",
    gatewayId: "G_167"
  },
  {
    id: "470005343091",
    name: "ALI MUHAMMAD",
    phone: "",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "G_271",
    remark: "",
    createTime: "2026-01-27 13:06:56",
    updateTime: "2026-01-27 13:06:56",
    stationId: "TUNGA",
    gatewayId: "G_271"
  },
  {
    id: "470005343133",
    name: "AHJBU BUZA SANI",
    phone: "",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "G_271",
    remark: "",
    createTime: "2026-01-27 12:57:06",
    updateTime: "2026-01-27 12:57:06",
    stationId: "TUNGA",
    gatewayId: "G_271"
  },
  {
    id: "470005362616",
    name: "DAUDA MUSA",
    phone: "",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "254",
    remark: "",
    createTime: "2026-01-27 12:37:11",
    updateTime: "2026-01-27 12:37:11",
    stationId: "TUNGA",
    gatewayId: "G_254"
  },
  {
    id: "470005367363",
    name: "MUHAMMED SHUAIBU",
    phone: "",
    address: "TUNGA",
    certifiName: "",
    certifiNo: "G_212",
    remark: "",
    createTime: "2026-01-27 12:33:26",
    updateTime: "2026-01-27 12:33:26",
    stationId: "TUNGA",
    gatewayId: "G_212"
  }
];

const tariffs = [
  { id: "123", name: "test", price: 350, remark: "", createTime: "2025-07-21 09:26:19", updateTime: "2025-11-07 11:08:24" },
  { id: "COMMERCIAL", name: "COMMERCIAL", price: 350, remark: "", createTime: "2025-11-10 13:53:38", updateTime: "2026-01-06 07:46:20" },
  { id: "PRODUCTIVE", name: "PRODUCTIVE", price: 350, remark: "", createTime: "2025-11-10 13:54:10", updateTime: "2026-01-06 07:46:28" },
  { id: "PUBLIC", name: "PUBLIC", price: 350, remark: "", createTime: "2025-11-10 13:54:45", updateTime: "2026-01-06 07:46:38" },
  { id: "RESIDENTIAL", name: "RESIDENTIAL", price: 350, remark: "", createTime: "2025-11-10 13:53:05", updateTime: "2026-01-06 07:46:45" }
];

const stations = [
  { id: "0001", name: "0001", remark: "", createTime: "2025-07-21 09:25:57", updateTime: "2025-07-21 09:25:57" },
  { id: "TUNGA", name: "TUNGA", remark: "", createTime: "2026-01-02 14:02:22", updateTime: "2026-01-27 13:28:46" },
  { id: "MUSHA", name: "MUSHA", remark: "", createTime: "2026-01-17 20:47:09", updateTime: "2026-03-18 15:55:57" },
  { id: "KYAKALE", name: "KYAKALE", remark: "", createTime: "2026-01-02 14:02:22", updateTime: "2026-01-03 18:27:51" }
];

function accountFromCustomer(customer, index) {
  const tariffId = index === 0 ? "123" : "RESIDENTIAL";
  return {
    customerId: customer.id,
    customerName: customer.name,
    meterId: index === 0 ? "47005346144" : customer.id,
    meterType: "Electricity",
    communicationWay: "LoraWan",
    tariffId,
    protocolVersion: "2.2",
    ctRatio: index === 0 ? "" : "1",
    remark: customer.remark,
    createTime: index === 0 ? "2025-07-21 11:48:10" : customer.createTime,
    updateTime: index === 0 ? "2025-07-21 11:48:10" : customer.updateTime,
    stationId: customer.stationId,
    gatewayId: customer.gatewayId
  };
}

const customers = Array.from({ length: 24 }, (_, index) => {
  const source = baseCustomers[index % baseCustomers.length];
  const suffix = String(index + 1).padStart(2, "0");
  const cloneId = source.id === "123" ? `${source.id}${suffix}` : `${source.id}${suffix}`;
  return {
    ...source,
    id: cloneId,
    name: index < baseCustomers.length ? source.name : `${source.name} ${suffix}`,
    certifiNo: source.certifiNo ? `${source.certifiNo}${suffix}` : suffix,
    gatewayId: source.gatewayId ? `${source.gatewayId}_${suffix}` : `G_${suffix}`,
    createTime: index % 2 === 0 ? source.createTime : now,
    updateTime: now
  };
});

const accounts = customers.map(accountFromCustomer);

const gateways = customers.slice(0, 18).map((customer, index) => ({
  id: customer.gatewayId,
  name: customer.gatewayId,
  status: index % 3 === 0 ? "Offline" : "Online",
  successRate: index % 3 === 0 ? "0%" : "100%",
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: customer.stationId
}));

const roles = [
  { id: "super-admin", name: "Super Admin", dataRole: "all", remark: "Full system access" },
  { id: "operations-manager", name: "Operations Manager", dataRole: "operations", remark: "Operations and task access" },
  { id: "account", name: "Account", dataRole: "account", remark: "Token and billing access" }
];

const users = [
  { userId: "admin", userName: "ACB(admin)", roleId: "super-admin", stationId: "ALL", status: "Normal" },
  { userId: "ops", userName: "Operations Manager", roleId: "operations-manager", stationId: "ALL", status: "Normal" },
  { userId: "account", userName: "Account", roleId: "account", stationId: "ALL", status: "Normal" }
];

const logs = Array.from({ length: 18 }, (_, index) => ({
  id: `LOG-${String(index + 1).padStart(3, "0")}`,
  userId: users[index % users.length].userId,
  status: ["LOGIN", "EXPORT", "CREATE_TASK", "READ"][index % 4],
  remark: ["Token", "Customer", "RemoteTask", "User"][index % 4],
  createTime: now,
  updateTime: now,
  stationId: stations[index % stations.length].id
}));

const items = [
  { id: "ITEM-001", name: "Voltage", remark: "", createTime: now, updateTime: now },
  { id: "ITEM-002", name: "Current", remark: "", createTime: now, updateTime: now },
  { id: "ITEM-003", name: "Power Factor", remark: "", createTime: now, updateTime: now }
];

const debts = accounts.slice(0, 12).map((account, index) => ({
  customerId: account.customerId,
  meterId: account.meterId,
  totalPaid: 300 + index * 25,
  totalUnit: Number((0.5 + index * 0.1).toFixed(1)),
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: account.stationId
}));

const dlms = accounts.slice(0, 10).map((account, index) => ({
  id: `DLMS-${String(index + 1).padStart(3, "0")}`,
  customerId: account.customerId,
  meterId: account.meterId,
  protocolVersion: "DLMS",
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: account.stationId
}));

const dlt645 = accounts.slice(0, 10).map((account, index) => ({
  id: `DLT-${String(index + 1).padStart(3, "0")}`,
  customerId: account.customerId,
  meterId: account.meterId,
  protocolVersion: "DLT645",
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: account.stationId
}));

const gprsTasks = gateways.map((gateway, index) => ({
  id: `GPRS-TASK-${String(index + 1).padStart(3, "0")}`,
  gatewayId: gateway.id,
  status: index % 2 === 0 ? "Success" : "StandBy",
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: gateway.stationId
}));

const gprsOnlineStatus = gateways.map((gateway, index) => ({
  id: gateway.id,
  name: gateway.name,
  status: index % 3 === 0 ? "Offline" : "Online",
  successRate: gateway.successRate,
  updateTime: now,
  stationId: gateway.stationId
}));

const loadProfiles = accounts.slice(0, 12).map((account) => ({
  customerId: account.customerId,
  meterId: account.meterId,
  totalEnergy: 128.6,
  power: 1.1,
  createTime: now,
  updateTime: now,
  stationId: account.stationId
}));

const eventNotifications = accounts.slice(0, 12).map((account, index) => ({
  id: `EVT-${String(index + 1).padStart(3, "0")}`,
  customerId: account.customerId,
  meterId: account.meterId,
  status: index % 2 === 0 ? "Open" : "Closed",
  remark: "Abnormal alarm",
  createTime: now,
  updateTime: now,
  stationId: account.stationId
}));

const firmwareUpdates = gateways.slice(0, 12).map((gateway, index) => ({
  id: `FW-${String(index + 1).padStart(3, "0")}`,
  gatewayId: gateway.id,
  status: index % 2 === 0 ? "Success" : "StandBy",
  remark: "Firmware package",
  createTime: now,
  updateTime: now,
  stationId: gateway.stationId
}));

const fileUploads = Array.from({ length: 8 }, (_, index) => ({
  id: `FILE-${String(index + 1).padStart(3, "0")}`,
  name: `upload-${index + 1}.csv`,
  status: index % 2 === 0 ? "Success" : "StandBy",
  remark: "",
  createTime: now,
  updateTime: now,
  stationId: stations[index % stations.length].id
}));

const creditTokenRecords = accounts.slice(0, 18).map((account, index) => ({
  receiptId: String(8311 + index),
  customerId: account.customerId,
  customerName: account.customerName,
  meterId: account.meterId,
  meterType: account.meterType,
  tariffId: account.tariffId,
  vatCharge: 0,
  totalUnit: Number((1.4 + index * 0.2).toFixed(1)),
  totalPaid: 500 + index * 50,
  token: `0021 2636 8628 4408 ${String(6688 + index).padStart(4, "0")}`,
  vend: "2026-04-28",
  time: now,
  remark: "",
  stationId: account.stationId
}));

const clearCreditTokenRecords = accounts.slice(0, 14).map((account, index) => ({
  receiptId: String(20 + index),
  customerId: account.customerId,
  customerName: account.customerName,
  meterId: account.meterId,
  token: `3989 5108 1746 2930 ${String(3260 + index).padStart(4, "0")}`,
  createTime: "2026-04-20 16:56:51",
  updateTime: now,
  remark: "",
  stationId: account.stationId
}));

module.exports = {
  accounts,
  clearCreditTokenRecords,
  creditTokenRecords,
  customers,
  debts,
  dlms,
  dlt645,
  eventNotifications,
  fileUploads,
  firmwareUpdates,
  gateways,
  gprsOnlineStatus,
  gprsTasks,
  items,
  loadProfiles,
  logs,
  now,
  roles,
  stations,
  tariffs,
  users
};
