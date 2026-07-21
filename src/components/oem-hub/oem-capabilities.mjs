// Capability definitions for the OEM Add/Edit form and the Settings page.
// `previewGroups` is an illustrative mapping to today's CRM sidebar groups —
// real per-route capability gating (route-manifest.js `capabilityKey` fields)
// lands in Phase 3; until then this is display-only guidance for the person
// configuring a new OEM, not something the sidebar actually reads yet.
export const CAPABILITY_DEFINITIONS = [
  {
    key: "remote_meter_task",
    label: "Remote meter tasks & STS vending",
    description: "Credit token generation, meter key changes, remote reading/control/token tasks.",
    previewGroups: ["Token Generate", "Token Record", "Remote Operation", "Remote Operation Task"]
  },
  {
    key: "tariff_management",
    label: "Tariff management",
    description: "Create and edit tariff/pricing plans.",
    previewGroups: ["Management (Tariff)"]
  },
  {
    key: "gprs_support",
    label: "GPRS remote support",
    description: "GPRS task dispatch and online/offline meter status.",
    previewGroups: ["Remote Support (GPRS Tasks, GPRS Online Status)"]
  },
  {
    key: "event_notification",
    label: "Event notifications",
    description: "Meter-originated event/alarm notifications.",
    previewGroups: ["Remote Support (Event Notification)"]
  },
  {
    key: "load_profile",
    label: "Load profile",
    description: "Interval load-curve data for meters.",
    previewGroups: ["Remote Support (Load Profile)"]
  },
  {
    key: "firmware_update",
    label: "Firmware updates",
    description: "Over-the-air firmware update tasks.",
    previewGroups: ["Remote Support (Firmware Update)"]
  },
  {
    key: "dlms_protocol",
    label: "DLMS protocol",
    description: "DLMS object/attribute browsing for compatible meters.",
    previewGroups: ["Protocol (DLMS)"]
  },
  {
    key: "dlt645_protocol",
    label: "DLT645 protocol",
    description: "DLT645 object browsing for compatible meters.",
    previewGroups: ["Protocol (DLT645)"]
  },
  {
    key: "wallet_vending",
    label: "Wallet vending",
    description: "This OEM's meters can be topped up through the Beverly Wallet.",
    previewGroups: ["Wallet"]
  }
];

export function defaultCapabilities() {
  return Object.fromEntries(CAPABILITY_DEFINITIONS.map((definition) => [definition.key, false]));
}

export function previewGroupsFor(capabilities) {
  const groups = new Set(["Dashboard", "Data Report", "Administration"]);
  for (const definition of CAPABILITY_DEFINITIONS) {
    if (capabilities?.[definition.key]) {
      for (const group of definition.previewGroups) groups.add(group);
    }
  }
  return Array.from(groups);
}
