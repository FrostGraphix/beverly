import {
  approveFundingRequest as approveFundingRequestRaw,
  createFundingRequest as createFundingRequestRaw,
  listFundingRequests,
  readVendorOrganizationId,
  uploadFundingProof as uploadFundingProofRaw
} from "./vendor-wallet-service.mjs";

function toMinor(amount = 0) {
  return Math.round(Number(amount || 0) * 100);
}

export async function createFundingRequest({ amount, amountMinor, actorId = "vendor-portal" }) {
  return createFundingRequestRaw({
    organizationId: readVendorOrganizationId(),
    amountMinor: amountMinor ?? toMinor(amount),
    actorId
  });
}

export async function uploadFundingProof({ fundingRequestId, actorId = "vendor-portal", metadata = {} }) {
  const safeName = String(metadata.reference || "proof-upload").replace(/[^a-z0-9._-]+/gi, "-");
  return uploadFundingProofRaw({ fundingRequestId, actorId, fileName: `${safeName}.png` });
}

export async function approveFundingRequest({ fundingRequestId, verifiedAmountMinor, approvedBy, actorId }) {
  return approveFundingRequestRaw({
    fundingRequestId,
    verifiedAmountMinor,
    actorId: actorId || approvedBy || "finance-checker"
  });
}

export { listFundingRequests };
