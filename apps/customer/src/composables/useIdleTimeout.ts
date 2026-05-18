/**
 * Idle session timeout per SOP (§3 Auth, Sessions).
 *
 * Customer: 60 min idle, 30 day absolute
 * Vendor:   30 min idle, 12 h absolute
 * Staff:    30 min idle, 8 h  absolute
 *
 * Behavior:
 *   • Tracks activity via mousemove / click / keydown / touchstart / scroll.
 *   • Pings every 30s; if elapsed since lastActivity ≥ idleMs - warningMs → show warning.
 *   • If elapsed ≥ idleMs → call onTimeout() to log the user out.
 *   • Absolute cap independent of activity (sessionStart + absoluteMs).
 *   • Cross-tab sync via storage events on a shared key.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue';

export interface IdleTimeoutOpts {
    idleMs: number;          // ms of inactivity before logout
    warningMs: number;       // ms before timeout to show warning
    absoluteMs?: number;     // hard cap from session start
    storageKey?: string;     // for cross-tab sync of last-activity
    onTimeout: () => void;   // called when idle or absolute hits
    onWarning?: () => void;  // called when warning threshold crossed
    onResume?: () => void;   // called when user dismisses warning
}

const EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart', 'scroll'] as const;

export function useIdleTimeout(opts: IdleTimeoutOpts) {
    const sessionStart = Date.now();
    const key = opts.storageKey ?? 'beverly.last_activity';
    const warningVisible = ref(false);
    const secondsLeft = ref(Math.floor(opts.warningMs / 1000));

    let lastActivity = Date.now();
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    function bump() {
        lastActivity = Date.now();
        try { localStorage.setItem(key, String(lastActivity)); } catch { /* noop */ }
        if (warningVisible.value) {
            warningVisible.value = false;
            opts.onResume?.();
        }
    }

    function readSharedActivity() {
        try {
            const v = Number(localStorage.getItem(key) ?? 0);
            if (v > lastActivity) lastActivity = v;
        } catch { /* noop */ }
    }

    function onStorage(e: StorageEvent) {
        if (e.key === key && e.newValue) {
            const v = Number(e.newValue);
            if (v > lastActivity) {
                lastActivity = v;
                if (warningVisible.value) {
                    warningVisible.value = false;
                    opts.onResume?.();
                }
            }
        }
    }

    function tick() {
        readSharedActivity();
        const now = Date.now();
        const idleFor = now - lastActivity;
        const sessionAge = now - sessionStart;

        // Absolute cap
        if (opts.absoluteMs && sessionAge >= opts.absoluteMs) {
            cleanup();
            opts.onTimeout();
            return;
        }

        // Idle cap
        if (idleFor >= opts.idleMs) {
            cleanup();
            opts.onTimeout();
            return;
        }

        // Warning threshold
        if (idleFor >= opts.idleMs - opts.warningMs) {
            secondsLeft.value = Math.max(0, Math.ceil((opts.idleMs - idleFor) / 1000));
            if (!warningVisible.value) {
                warningVisible.value = true;
                opts.onWarning?.();
            }
        }
    }

    function cleanup() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        EVENTS.forEach((evt) => window.removeEventListener(evt, bump));
        window.removeEventListener('storage', onStorage);
    }

    function stayActive() {
        bump();
    }

    onMounted(() => {
        bump();
        EVENTS.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));
        window.addEventListener('storage', onStorage);
        pollTimer = setInterval(tick, 1000);
    });

    onBeforeUnmount(cleanup);

    return { warningVisible, secondsLeft, stayActive };
}
