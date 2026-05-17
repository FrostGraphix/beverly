import {
  approveVendorOrganization as approveVendorOrganizationRaw,
  createVendorOrganization as createVendorOrganizationRaw,
  reviewOnboarding,
  submitOnboarding
} from "./vendor-wallet-service.mjs";

export async function createVendorOrganization(payload = {}) {
  return createVendorOrganizationRaw({
    ...payload,
    organizationName: payload.organizationName || payload.legalName || payload.displayName,
    stationIds: payload.stationIds || [payload.siteCode || "SITE_001"],
    actorId: payload.actorId || payload.createdBy || "ops-admin"
  });
}

export async function approveVendorOrganization(payload = {}) {
  const organizationId = typeof payload === "string" ? payload : payload.organizationId;
  const actorId = typeof payload === "string" ? "finance-checker" : payload.approvedBy || payload.actorId || "finance-checker";
  return approveVendorOrganizationRaw(organizationId, actorId);
}

export { reviewOnboarding, submitOnboarding };
