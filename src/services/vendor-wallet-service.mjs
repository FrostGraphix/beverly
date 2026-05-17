import { postApi } from "./api";

const organizationKey = "beverly.vendor.organizationId";

export function formatMoneyMinor(amountMinor = 0) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 2
  }).format(Number(amountMinor || 0) / 100);
}

export function readVendorOrganizationId() {
  return localStorage.getItem(organizationKey) || "";
}

export function rememberVendorOrganizationId(organizationId) {
  if (organizationId) localStorage.setItem(organizationKey, organizationId);
}

export async function createVendorOrganization(payload) {
  const response = await postApi("/api/vendor/organization/create", payload);
  rememberVendorOrganizationId(response.data?.id);
  return response.data;
}

export async function approveVendorOrganization(organizationId, actorId = "finance") {
  const response = await postApi("/api/vendor/organization/approve", { organizationId, actorId });
  rememberVendorOrganizationId(response.data?.organization?.id || organizationId);
  return response.data;
}

export async function loadWalletSummary(organizationId = readVendorOrganizationId()) {
  if (!organizationId) return null;
  const response = await postApi("/api/wallet/summary", { organizationId });
  return response.data;
}

export async function createFundingRequest({ organizationId, amountMinor, actorId }) {
  const response = await postApi("/api/wallet/funding/create", {
    organizationId,
    amountMinor,
    actorId,
    idempotencyKey: `funding:${organizationId}:${amountMinor}:${Date.now()}`
  });
  return response.data;
}

export async function uploadFundingProof({ fundingRequestId, actorId, fileName = "proof-upload.png" }) {
  const response = await postApi("/api/wallet/funding/upload-proof", {
    fundingRequestId,
    storagePath: `wallet-proofs/${fundingRequestId}/${fileName}`,
    fileName,
    contentType: "image/png",
    actorId
  });
  return response.data;
}

export async function approveFundingRequest({ fundingRequestId, verifiedAmountMinor, actorId }) {
  const response = await postApi("/api/wallet/funding/approve", {
    fundingRequestId,
    verifiedAmountMinor,
    actorId,
    idempotencyKey: `funding-approval:${fundingRequestId}:${Date.now()}`
  });
  return response.data;
}

export async function listFundingRequests(filters = {}) {
  const response = await postApi("/api/wallet/funding/list", filters);
  return response.data?.rows || [];
}

export async function createTokenPurchase({ organizationId, amountMinor, targetMeter, customerName, actorId }) {
  const response = await postApi("/api/wallet/purchase/create", {
    organizationId,
    amountMinor,
    targetMeter,
    customerName,
    actorId,
    mode: "token",
    idempotencyKey: `token:${organizationId}:${targetMeter}:${amountMinor}:${Date.now()}`
  });
  return response.data;
}

export async function createRemoteSendPurchase({ organizationId, amountMinor, targetMeter, customerName, actorId }) {
  const response = await postApi("/api/wallet/purchase/create", {
    organizationId,
    amountMinor,
    targetMeter,
    customerName,
    actorId,
    mode: "remote_send",
    idempotencyKey: `remote:${organizationId}:${targetMeter}:${amountMinor}:${Date.now()}`
  });
  return response.data;
}

export async function completeTokenPurchase({ purchaseOrderId, actorId }) {
  const response = await postApi("/api/wallet/purchase/complete-token", {
    purchaseOrderId,
    actorId
  });
  return response.data;
}

export async function markRemoteSendPending({ purchaseOrderId, actorId }) {
  const response = await postApi("/api/wallet/purchase/remote-pending", {
    purchaseOrderId,
    actorId,
    remoteReference: `REMOTE-${Date.now()}`
  });
  return response.data;
}

export async function completeRemoteSend({ purchaseOrderId, actorId }) {
  const response = await postApi("/api/wallet/purchase/complete-remote", {
    purchaseOrderId,
    actorId,
    remoteReference: `REMOTE-${Date.now()}`
  });
  return response.data;
}

export async function listPurchaseOrders(filters = {}) {
  const response = await postApi("/api/wallet/purchase/list", filters);
  return response.data?.rows || [];
}

export async function loadLedgerRows(organizationId = readVendorOrganizationId()) {
  if (!organizationId) return [];
  const response = await postApi("/api/wallet/ledger/list", { organizationId });
  return response.data?.rows || [];
}

export async function submitOnboarding({ organizationId, actorId }) {
  const response = await postApi("/api/vendor/onboarding/submit", {
    organizationId,
    actorId,
    businessIdentity: { registrationName: "Vendor Portal Account" },
    primaryContact: { name: "Vendor Manager" },
    bankDetails: { bankName: "Pending verification" },
    operatingSites: ["TUNGA"]
  });
  return response.data;
}

export async function reviewOnboarding({ onboardingSubmissionId, actorId, approved = true }) {
  const response = await postApi("/api/vendor/onboarding/review", {
    onboardingSubmissionId,
    actorId,
    approved
  });
  return response.data;
}

export async function requestManualCredit({ organizationId, amountMinor, actorId, reasonCode = "support_remediation" }) {
  const response = await postApi("/api/wallet/manual-credit/request", {
    organizationId,
    amountMinor,
    actorId,
    reasonCode,
    idempotencyKey: `manual-credit:${organizationId}:${amountMinor}:${Date.now()}`
  });
  return response.data;
}

export async function approveManualCredit({ approvalRequestId, actorId }) {
  const response = await postApi("/api/wallet/manual-credit/approve", {
    approvalRequestId,
    actorId
  });
  return response.data;
}

export async function listManualCredits(filters = {}) {
  const response = await postApi("/api/wallet/manual-credit/list", filters);
  return response.data?.rows || [];
}

export async function loadReconciliationReport() {
  const response = await postApi("/api/wallet/reconciliation/report", {});
  return response.data;
}

export async function runReconciliation() {
  const response = await postApi("/api/wallet/reconciliation/run", {});
  return response.data;
}
