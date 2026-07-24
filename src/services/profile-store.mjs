import { deleteApi, postApi } from "./api";
import { assertPasswordChangePayload, validatePreferenceState, validateProfileState } from "./runtime-schemas.mjs";

const profileKey = "beverly.profile.v1";
const preferenceKey = "beverly.preferences.v1";

function readJson(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    return fallback;
  }
}

export function loadProfileState(userName = "") {
  const saved = validateProfileState(readJson(profileKey, {}));
  return validateProfileState({
    name: saved.name || userName,
    email: saved.email,
    phone: saved.phone,
    profilePictureUrl: saved.profilePictureUrl
  });
}

export function saveProfileState(profile) {
  const state = validateProfileState(profile);
  localStorage.setItem(profileKey, JSON.stringify(state));
  return state;
}

export function loadPreferenceState(theme = "system") {
  return validatePreferenceState({
    ...readJson(preferenceKey, {}),
    theme: localStorage.getItem("acob-theme") || theme
  });
}

export function savePreferenceState(preferences) {
  const state = validatePreferenceState(preferences);
  localStorage.setItem(preferenceKey, JSON.stringify(state));
  localStorage.setItem("acob-theme", state.theme);
  return state;
}

export async function updateRemoteProfile(profile) {
  const state = saveProfileState(profile);
  try {
    await postApi("/api/user/profile", state);
  } catch (error) {
    if (import.meta.env?.PROD) throw error;
  }
  return state;
}

export async function uploadProfilePictureFlow(file) {
  const buf = await file.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  const contentBase64 = btoa(binary);

  await postApi("/api/v1/admin/profile-picture/scan", {
    file_name: file.name,
    content_base64: contentBase64
  });

  const payload = await postApi("/api/v1/admin/profile-picture/upload-url", {
    file_name: file.name,
    content_type: file.type,
    size_bytes: file.size
  });

  if (!payload?.signed_url || !payload?.public_url) {
    throw new Error("profile_picture_upload_unavailable");
  }

  const uploadResponse = await fetch(payload.signed_url, {
    method: "PUT",
    headers: { "Content-Type": file.type },
    body: file
  });

  if (!uploadResponse.ok) {
    throw new Error("profile_picture_upload_failed");
  }

  const activated = await postApi("/api/v1/admin/profile-picture/activate", {
    path: payload.path
  });

  const current = loadProfileState();
  const newState = saveProfileState({
    ...current,
    profilePictureUrl: activated?.profile_picture_url || payload.public_url
  });
  return newState;
}

export async function removeProfilePictureFlow() {
  await deleteApi("/api/v1/admin/profile-picture");
  const current = loadProfileState();
  const newState = saveProfileState({
    ...current,
    profilePictureUrl: ""
  });
  return newState;
}

export async function changeUserPassword(payload) {
  const safePayload = assertPasswordChangePayload(payload);
  return postApi("/api/user/changePassword", safePayload);
}

