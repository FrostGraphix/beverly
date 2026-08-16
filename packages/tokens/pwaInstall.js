/**
 * @beverly/tokens/pwaInstall — shared PWA install-prompt helpers.
 *
 * Framework-agnostic (no Vue reactivity here, same convention as setTheme/toggleTheme).
 * Each app wires these into local refs inside AppShell.vue / Profile.vue.
 */

const DISMISS_KEY = 'beverly-pwa-install-dismissed-until';
const DISMISS_DAYS = 14;

// `beforeinstallprompt` fires at most once per tab lifetime. Vue components that
// wrap themselves in AppShell get destroyed/recreated on every route navigation
// (there's no persistent layout), so a component-local listener only catches the
// event if it happens to be mounted at the exact moment it fires — miss that and
// the prompt is gone for the rest of the session, even for pages mounted later.
// Capture it once here, at module scope, so any component can ask for it at any time.
let deferredPrompt = null;
const listeners = new Set();

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        listeners.forEach((cb) => cb(deferredPrompt));
    });
    window.addEventListener('appinstalled', () => {
        deferredPrompt = null;
        listeners.forEach((cb) => cb(null));
    });
}

/** Returns the captured install-prompt event, or null if none has fired yet (or it was already used/installed). */
export function getDeferredInstallPrompt() {
    return deferredPrompt;
}

/** Subscribe to changes (event captured, or cleared after install). Returns an unsubscribe function. */
export function onInstallPromptChange(callback) {
    listeners.add(callback);
    return () => listeners.delete(callback);
}

/** Triggers the native install prompt if one is available. Returns the userChoice result, or null if unavailable. */
export async function triggerInstallPrompt() {
    if (!deferredPrompt) return null;
    deferredPrompt.prompt();
    const choice = await deferredPrompt.userChoice;
    if (choice.outcome === 'accepted') deferredPrompt = null;
    return choice;
}

export function isInstallDismissed() {
    try {
        const until = Number(localStorage.getItem(DISMISS_KEY) ?? 0);
        return Date.now() < until;
    } catch {
        return false;
    }
}

export function dismissInstallPrompt(days = DISMISS_DAYS) {
    try {
        localStorage.setItem(DISMISS_KEY, String(Date.now() + days * 24 * 60 * 60 * 1000));
    } catch { /* noop */ }
}

export function clearInstallDismissal() {
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* noop */ }
}

export function isStandalone() {
    if (typeof window === 'undefined') return false;
    return window.matchMedia?.('(display-mode: standalone)').matches
        || window.navigator.standalone === true;
}

export function isIos() {
    if (typeof navigator === 'undefined') return false;
    return /iphone|ipad|ipod/i.test(navigator.userAgent)
        // iPadOS 13+ reports as Mac but has touch support
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isIosInstallable() {
    return isIos() && !isStandalone();
}
