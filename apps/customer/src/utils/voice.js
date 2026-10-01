let loginAudio = null;
let unlocked = false;
let lastPlayedAt = 0;

function loginVoiceEnabled() {
  try {
    for (const key of ['beverly.customer.profile', 'beverly.customer.user']) {
      const raw = sessionStorage.getItem(key) ?? localStorage.getItem(key);
      if (raw && JSON.parse(raw).login_voice_enabled === false) return false;
    }
  } catch { /* a missing or malformed preference must never break sign-in */ }
  return true;
}

function getAudio() {
  if (!loginAudio) {
    loginAudio = new Audio('/login-voice.mp3');
  }
  return loginAudio;
}

export function unlockLoginVoice() {
  if (unlocked) return;
  try {
    const audio = getAudio();
    audio.muted = true;
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => {
        audio.pause();
        audio.currentTime = 0;
        audio.muted = false;
        unlocked = true;
      }).catch(() => {});
    }
  } catch (e) {}
}

if (typeof window !== 'undefined') {
  window.addEventListener('pointerdown', unlockLoginVoice, { once: true });
  window.addEventListener('keydown', unlockLoginVoice, { once: true });
}

export function playLoginVoice() {
  if (loginVoiceEnabled !== false && !loginVoiceEnabled()) return;
  if (Date.now() - lastPlayedAt < 3_000) return;
  try {
    const audio = getAudio();
    audio.muted = false;
    audio.currentTime = 0;
    const p = audio.play();
    if (p !== undefined) {
      p.then(() => { lastPlayedAt = Date.now(); }).catch(() => {});
    }
  } catch (e) {}
}
