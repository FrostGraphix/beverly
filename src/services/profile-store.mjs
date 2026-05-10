import { postApi } from "./api";
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
    phone: saved.phone
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

export async function changeUserPassword(payload) {
  const safePayload = assertPasswordChangePayload(payload);
  return postApi("/api/user/changePassword", safePayload);
}
