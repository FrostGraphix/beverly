// @ts-check
// Deliberately separate from upload-policy.mjs (which is locked to non-image
// data files for the generic import/upload route) — OEM logos need image
// mimetypes, a much smaller size cap, and have nothing to do with that surface.
export const allowedLogoExtensions = [".jpg", ".jpeg", ".png", ".webp"];
export const allowedLogoMimeTypes = ["image/jpeg", "image/png", "image/webp"];
export const maxLogoUploadBytes = 2 * 1024 * 1024;

/**
 * @typedef {{ name?: string, type?: string, size?: number }} UploadFileLike
 */

export function logoUploadAcceptValue() {
  return allowedLogoMimeTypes.join(",");
}

/**
 * @param {UploadFileLike | null} [file]
 * @returns {string} empty string when valid, otherwise the validation error
 */
export function validateLogoFile(file) {
  if (!file) return "Logo file is required";
  const lowerName = String(file.name || "").toLowerCase();
  const extensionAllowed = allowedLogoExtensions.some((extension) => lowerName.endsWith(extension));
  const typeAllowed = !file.type || allowedLogoMimeTypes.includes(file.type);
  if (!extensionAllowed || !typeAllowed) return `Allowed logo types: ${allowedLogoExtensions.join(", ")}`;
  if (Number(file.size || 0) > maxLogoUploadBytes) return `Logo must be ${Math.floor(maxLogoUploadBytes / 1024 / 1024)}MB or smaller`;
  return "";
}
