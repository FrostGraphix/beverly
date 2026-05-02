function field(name, label, options = {}) {
  return {
    name,
    label,
    required: Boolean(options.required),
    readonly: Boolean(options.readonly),
    type: options.type || "text",
    picker: Boolean(options.picker),
    pickerApi: options.pickerApi || "",
    pickerColumns: options.pickerColumns || [],     // API field names to show as columns
    pickerColumnLabels: options.pickerColumnLabels || [], // friendly header labels (optional)
    pickerValueKey: options.pickerValueKey || "",   // which API field to use as the final value
    pickerTitle: options.pickerTitle || label
  };
}

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
      field("remark", "Remark")
    ],
    Delete: [
      field("customerId", "Customer Id", { required: true, readonly: true }),
      field("meterId", "Meter Id", { required: true, readonly: true })
    ]
  },
  "#/admin/user": {
    Add: [
      field("userId", "User Id", { required: true }),
      field("nickName", "Nick Name", { required: true }),
      field("roleId", "Role Id"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Edit: [
      field("userId", "User Id", { required: true, readonly: true }),
      field("nickName", "Nick Name", { required: true }),
      field("roleId", "Role Id"),
      field("stationId", "StationId", { required: true, type: "select" }),
      field("remark", "Remark")
    ],
    Delete: [
      field("userId", "User Id", { required: true, readonly: true })
    ]
  },
  "#/admin/role": {
    Add: [
      field("roleId", "Role Id", { required: true }),
      field("name", "Name", { required: true }),
      field("remark", "Remark")
    ],
    Edit: [
      field("roleId", "Role Id", { required: true, readonly: true }),
      field("name", "Name", { required: true }),
      field("remark", "Remark")
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
  }
};

export function isManagementRoute(route) {
  const hash = String(route?.hash || "");
  return hash.startsWith("#/management/") || hash.startsWith("#/admin/");
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
      else if (currentField.name === "nickName") value = row.nickName || row.fullName || row.name;
      else if (["gatewayId", "userId"].includes(currentField.name)) value = row.id || row.userId;
      else if (["customerName", "gatewayName", "tariffName"].includes(currentField.name)) value = row.name;
      else if (currentField.name === "stationId") value = row.stationId || row.station || row.siteId || row.StationId || row.id;
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
