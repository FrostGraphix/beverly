function field(name, label, options = {}) {
  return {
    name,
    label,
    required: Boolean(options.required),
    readonly: Boolean(options.readonly),
    type: options.type || "text",
    picker: Boolean(options.picker),
    pickerApi: options.pickerApi || "",
    pickerColumns: options.pickerColumns || [],
    pickerColumnLabels: options.pickerColumnLabels || [],
    pickerValueKey: options.pickerValueKey || "",
    pickerTitle: options.pickerTitle || label,
    options: options.options || []       // for type:"permissions" grouped choices
  };
}

// ─── Role permission catalogue ────────────────────────────────────────────────
// The API stores these as a comma-separated string in the `remark` field.
// Each entry: { value: "<PermKey>", label: "<Human label>" }
// Grouped by menu section for the picker UI.
export const ROLE_PERMISSIONS = [
  {
    group: "Token Generate",
    items: [
      { value: "Token.CreditToken",               label: "Credit Token" },
      { value: "Token.ClearTamperToken",           label: "Clear Tamper Token" },
      { value: "Token.ClearCreditToken",           label: "Clear Credit Token" },
      { value: "Token.SetMaximumPowerLimitToken",  label: "Set Max Power Limit Token" }
    ]
  },
  {
    group: "Token Record",
    items: [
      { value: "TokenRecord.CreditTokenRecord",                  label: "Credit Token Record" },
      { value: "TokenRecord.ClearTamperTokenRecord",             label: "Clear Tamper Token Record" },
      { value: "TokenRecord.ClearCreditTokenRecord",             label: "Clear Credit Token Record" },
      { value: "TokenRecord.SetMaximumPowerLimitTokenRecord",    label: "Set Max Power Limit Record" }
    ]
  },
  {
    group: "Remote Operation",
    items: [
      { value: "RemoteOperation.MeterReading", label: "Meter Reading" },
      { value: "RemoteOperation.MeterControl", label: "Meter Control" },
      { value: "RemoteOperation.MeterToken",   label: "Meter Token" }
    ]
  },
  {
    group: "Remote Operation Task",
    items: [
      { value: "RemoteMeterTask.MeterReadingTask", label: "Reading Task" },
      { value: "RemoteMeterTask.MeterControlTask", label: "Control Task" },
      { value: "RemoteMeterTask.MeterTokenTask",   label: "Token Task" }
    ]
  },
  {
    group: "Data Report",
    items: [
      { value: "DataReport.LongNonpurchase",      label: "Long Nonpurchase Situation" },
      { value: "DataReport.LowPurchase",          label: "Low Purchase Situation" },
      { value: "DataReport.ConsumptionStatistics",label: "Consumption Statistics" },
      { value: "AutomaticMeterReading.DailyDataMeter", label: "Interval Data (Daily Meter)" },
      { value: "DataReport.SiteConsumption",      label: "Site Consumption" }
    ]
  },
  {
    group: "Management",
    items: [
      { value: "Management.Gateway",  label: "Gateway" },
      { value: "Management.Customer", label: "Customer" },
      { value: "Management.Tariff",   label: "Tariff" },
      { value: "Management.Account",  label: "Account" }
    ]
  },
  {
    group: "Administration",
    items: [
      { value: "Admin.User",    label: "User" },
      { value: "Admin.Role",    label: "Role" },
      { value: "Admin.Log",     label: "Log" },
      { value: "Admin.Station", label: "Station" },
      { value: "Admin.Item",    label: "Item" },
      { value: "Admin.Meter",   label: "Meter" },
      { value: "Admin.Debt",    label: "Debt" }
    ]
  },
  {
    group: "Protocol",
    items: [
      { value: "Protocol.DLMS",   label: "DLMS" },
      { value: "Protocol.DLT645", label: "DLT645" }
    ]
  },
  {
    group: "Remote Support",
    items: [
      { value: "RemoteSupport.GPRSTasks",          label: "GPRS Tasks" },
      { value: "RemoteSupport.GPRSOnlineStatus",   label: "GPRS Online Status" },
      { value: "RemoteSupport.LoadProfile",        label: "Load Profile" },
      { value: "RemoteSupport.EventNotification",  label: "Event Notification" },
      { value: "RemoteSupport.FirmwareUpdate",     label: "Firmware Update" },
      { value: "RemoteSupport.FileUpload",         label: "File Upload" }
    ]
  }
];

const managementForms = {
  "#/management/gateway": {
    Add: [
      field("gatewayId", "Gateway Id", { required: true }),
      field("gatewayName", "Gateway Name"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Edit: [
      field("gatewayId", "Gateway Id", { required: true, readonly: true }),
      field("gatewayName", "Gateway Name"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Delete: [
      field("gatewayId", "Gateway Id", { required: true, readonly: true })
    ]
  },
  "#/management/customer": {
    Add: [
      field("customerId", "Id", { required: true }),
      field("customerName", "Name", { required: true }),
      field("phone", "Phone"),
      field("address", "Address"),
      field("certifiName", "CertifiName"),
      field("certifiNo", "CertifiNo"),
      field("remark", "Remark"),
      field("stationId", "StationId", { required: true, type: "select" })
    ],
    Edit: [
      field("customerId", "Id", { required: true, readonly: true }),
      field("customerName", "Name", { required: true }),
      field("phone", "Phone"),
      field("address", "Address"),
      field("certifiName", "CertifiName"),
      field("certifiNo", "CertifiNo"),
      field("remark", "Remark"),
      field("stationId", "StationId", { required: true, type: "select" })
    ],
    Delete: [
      field("customerId", "Customer Id", { required: true, readonly: true })
    ]
  },
  "#/management/tariff": {
    Add: [
      field("tariffId", "Tariff Id", { required: true }),
      field("tariffName", "Tariff Name"),
      field("price", "Price"),
      field("tax", "Tax"),
      field("remark", "Remark")
    ],
    Edit: [
      field("tariffId", "Tariff Id", { required: true, readonly: true }),
      field("tariffName", "Tariff Name"),
      field("price", "Price"),
      field("tax", "Tax"),
      field("remark", "Remark")
    ],
    Delete: [
      field("tariffId", "Tariff Id", { required: true, readonly: true })
    ]
  },
  "#/management/account": {
    Add: [
      field("customerId", "Customer Id", {
        required: true,
        picker: true,
        pickerApi: "/api/customer/read",
        pickerColumns: ["customerId", "customerName", "stationId"],
        pickerColumnLabels: ["Id", "Name", "Station Id"],
        pickerValueKey: "customerId",
        pickerTitle: "Customer"
      }),
      field("meterId", "Meter Id", {
        required: true,
        picker: true,
        pickerApi: "/api/meter/read",
        pickerColumns: ["meterId", "meterType", "stationId"],
        pickerColumnLabels: ["Id", "Type", "Station Id"],
        pickerValueKey: "meterId",
        pickerTitle: "Meter"
      }),
      field("tariffId", "Tariff Id", {
        required: true,
        picker: true,
        pickerApi: "/api/tariff/read",
        pickerColumns: ["tariffId", "tariffName", "price"],
        pickerColumnLabels: ["Id", "Name", "Price"],
        pickerValueKey: "tariffId",
        pickerTitle: "Tariff"
      }),
      field("ctRatio", "CT Ratio"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Edit: [
      field("customerId", "Customer Id", {
        required: true,
        picker: true,
        pickerApi: "/api/customer/read",
        pickerColumns: ["customerId", "customerName", "stationId"],
        pickerColumnLabels: ["Id", "Name", "Station Id"],
        pickerValueKey: "customerId",
        pickerTitle: "Customer"
      }),
      field("meterId", "Meter Id", {
        required: true,
        picker: true,
        pickerApi: "/api/meter/read",
        pickerColumns: ["meterId", "meterType", "stationId"],
        pickerColumnLabels: ["Id", "Type", "Station Id"],
        pickerValueKey: "meterId",
        pickerTitle: "Meter"
      }),
      field("tariffId", "Tariff Id", {
        required: true,
        picker: true,
        pickerApi: "/api/tariff/read",
        pickerColumns: ["tariffId", "tariffName", "price"],
        pickerColumnLabels: ["Id", "Name", "Price"],
        pickerValueKey: "tariffId",
        pickerTitle: "Tariff"
      }),
      field("ctRatio", "CT Ratio"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Delete: [
      field("customerId", "Customer Id", { required: true, readonly: true }),
      field("meterId", "Meter Id", { required: true, readonly: true })
    ]
  },
  "#/admin/user": {
    Add: [
      field("userId",    "User Id",   { required: true }),
      field("nickName",  "Nick Name", { required: true }),
      field("password",  "Password",  { required: true, type: "password" }),
      field("roleId",    "Role",      { type: "role-select" }),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark",    "Remark")
    ],
    Edit: [
      field("userId",    "User Id",   { required: true, readonly: true }),
      field("nickName",  "Nick Name", { required: true }),
      field("roleId",    "Role",      { type: "role-select" }),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark",    "Remark")
    ],
    Delete: [
      field("userId", "User Id", { required: true, readonly: true })
    ]
  },
  "#/admin/role": {
    Add: [
      field("roleId", "Role Id", { required: true }),
      field("name",   "Name",    { required: true }),
      field("remark", "Permissions", { type: "permissions" })
    ],
    Edit: [
      field("roleId", "Role Id", { required: true, readonly: true }),
      field("name",   "Name",    { required: true }),
      field("remark", "Permissions", { type: "permissions" })
    ],
    Delete: [
      field("roleId", "Role Id", { required: true, readonly: true })
    ]
  },
  "#/admin/station": {
    Add: [
      field("stationId", "Station Id", { required: true }),
      field("name", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Edit: [
      field("stationId", "Station Id", { required: true, readonly: true }),
      field("name", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Delete: [
      field("stationId", "Station Id", { required: true, readonly: true })
    ]
  },
  "#/admin/item": {
    Add: [
      field("itemType", "Item Type", { required: true }),
      field("itemName", "Item Name", { required: true }),
      field("remark", "Remark")
    ],
    Edit: [
      field("itemType", "Item Type", { required: true, readonly: true }),
      field("itemName", "Item Name", { required: true }),
      field("remark", "Remark")
    ],
    Delete: [
      field("itemType", "Item Type", { required: true, readonly: true })
    ]
  },
  "#/admin/meter": {
    Edit: [
      field("meterId",       "Meter Id",     { required: true, readonly: true }),
      field("stationId",     "StationId",    { required: true, type: "select" }),
      field("remark",        "Remark")
    ]
  },
  "#/protocol/dlms": {
    Add: [
      field("dlmsId", "Id", { required: true }),
      field("version", "Version", { required: true }),
      field("type", "Type", { required: true }),
      field("classId", "Class Id", { required: true }),
      field("obis", "OBIS", { required: true }),
      field("nameEN", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Edit: [
      field("dlmsId", "Id", { required: true, readonly: true }),
      field("version", "Version", { required: true }),
      field("type", "Type", { required: true }),
      field("classId", "Class Id", { required: true }),
      field("obis", "OBIS", { required: true }),
      field("nameEN", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Delete: [
      field("dlmsId", "Id", { required: true, readonly: true })
    ]
  },
  "#/protocol/dlt645": {
    Add: [
      field("dlt645Id", "Id", { required: true }),
      field("version", "Version", { required: true }),
      field("type", "Type", { required: true }),
      field("nameEN", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Edit: [
      field("dlt645Id", "Id", { required: true, readonly: true }),
      field("version", "Version", { required: true }),
      field("type", "Type", { required: true }),
      field("nameEN", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Delete: [
      field("dlt645Id", "Id", { required: true, readonly: true })
    ]
  },
  "#/remote-support/firmware-update": {
    Add: [
      field("gatewayId", "Gateway Id", { required: true }),
      field("fileName", "Firmware", {
        required: true,
        picker: true,
        pickerApi: "/api/local/importJobs/read",
        pickerColumns: ["name", "status", "createDate", "stationId"],
        pickerColumnLabels: ["Firmware", "Status", "Create Date", "Station Id"],
        pickerValueKey: "name",
        pickerTitle: "Uploaded Firmware"
      }),
      field("stationId", "Station Id", { required: true, type: "select" }),
      field("remark", "Remark")
    ]
  }
};

export function isManagementRoute(route) {
  const hash = String(route?.hash || "");
  return hash.startsWith("#/management/")
    || hash.startsWith("#/admin/")
    || hash.startsWith("#/protocol/")
    || hash === "#/remote-support/firmware-update";
}

export function managementFields(route, action) {
  if (!isManagementRoute(route)) return [];
  return managementForms[route.hash]?.[action] || [];
}

export function managementFormSeed(route, action, row = {}) {
  if (!isManagementRoute(route)) return {};
  const fields = managementFields(route, action);
  const seed = {};
  for (const currentField of fields) {
    let value = row[currentField.name];
    if (value === undefined || value === null) {
      // Try to find the key case-insensitively
      const actualKey = Object.keys(row).find(k => k.toLowerCase() === currentField.name.toLowerCase());
      if (actualKey) value = row[actualKey];
    }
    if (value === undefined || value === null) {
      if (currentField.name === "customerId") value = row.customerId || row.id;
      else if (currentField.name === "tariffId") value = row.tariffId || row.id;
      else if (currentField.name === "roleId") value = row.roleId || row.id;
      else if (currentField.name === "itemType") value = row.itemType || row.id;
      else if (currentField.name === "itemName") value = row.itemName || row.name;
      else if (currentField.name === "dlmsId") value = row.dlmsId || row.id;
      else if (currentField.name === "dlt645Id") value = row.dlt645Id || row.id;
      else if (currentField.name === "nameEN") value = row.nameEN || row.name;
      else if (currentField.name === "nickName") value = row.nickName || row.fullName || row.name;
      else if (["gatewayId", "userId"].includes(currentField.name)) value = row.id || row.userId;
      else if (["customerName", "gatewayName", "tariffName"].includes(currentField.name)) value = row.name;
      else if (currentField.name === "stationId") value = row.stationId || row.station || row.siteId || row.StationId || "";
    }
    if (currentField.name === "stationId" && typeof value === "string") {
      value = value.toUpperCase();
    }
    seed[currentField.name] = value ?? "";
  }
  if (route.hash === "#/management/account" && action === "Edit") {
    seed.oldMeterId = row.oldMeterId || row.meterId || "";
  }
  return seed;
}
