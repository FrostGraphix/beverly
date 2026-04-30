import { normalizeActionResult, normalizeEnvelope } from "../response-normalizers.mjs";

export function mapActionResponse(payload, action, fallbackLabel = "success") {
  const actionResult = normalizeActionResult(payload);
  const envelope = normalizeEnvelope(payload);
  const resultText = actionResult.token
    ? `Token: ${actionResult.token}`
    : action === "Import"
      ? "Import submitted"
      : action === "Upload"
        ? "Upload submitted"
        : `${action} ${fallbackLabel}`;

  return {
    envelope,
    token: actionResult.token,
    receiptId: actionResult.receiptId,
    data: actionResult.data,
    resultText
  };
}

export function mapWriteLog(endpoint, payload, uploadMeta = null) {
  return {
    endpoint,
    payload: uploadMeta || payload
  };
}
