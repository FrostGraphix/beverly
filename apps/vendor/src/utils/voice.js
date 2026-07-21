let loginAudio = null;
let unlocked = false;

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
  try {
    const audio = getAudio();
    audio.muted = false;
    audio.currentTime = 0;
    const p = audio.play();
    if (p !== undefined) {
      p.catch(e => console.warn('Play failed', e));
    }
  } catch (e) {}
}
