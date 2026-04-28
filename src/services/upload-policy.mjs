export const allowedUploadExtensions = [".bin", ".csv", ".txt", ".xml", ".xls", ".xlsx"];
export const allowedUploadMimeTypes = [
  "application/octet-stream",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/xml",
  "text/csv",
  "text/plain",
  "text/xml"
];
export const maxUploadBytes = 4 * 1024 * 1024;

export function isFileUploadRoute(route) {
  return Boolean(route?.hash?.includes("file-upload"));
}

export function uploadAcceptValue() {
  return allowedUploadExtensions.join(",");
}

export function validateUploadFile(file) {
  if (!file) return "Upload file is required";
  const lowerName = String(file.name || "").toLowerCase();
  const extensionAllowed = allowedUploadExtensions.some((extension) => lowerName.endsWith(extension));
  const typeAllowed = !file.type || allowedUploadMimeTypes.includes(file.type);
  if (!extensionAllowed || !typeAllowed) return `Allowed upload types: ${allowedUploadExtensions.join(", ")}`;
  if (Number(file.size || 0) > maxUploadBytes) return `Upload file must be ${Math.floor(maxUploadBytes / 1024 / 1024)}MB or smaller`;
  return "";
}

export function uploadSummary(file) {
  if (!file) return "";
  const sizeKb = Math.ceil(Number(file.size || 0) / 1024);
  return `Upload ready: ${file.name}, ${sizeKb} KB`;
}
