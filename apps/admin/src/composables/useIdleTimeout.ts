/**
 * Idle session timeout per SOP.
 * Staff: 30 min idle, 8 h absolute.
 * Mirrors apps/customer/src/composables/useIdleTimeout.ts.
 */
import { onMounted, onBeforeUnmount, ref } from 'vue';

export interface IdleTimeoutOpts {
    idleMs: number;
    warningMs: number;
    absoluteMs?: number;
    storageKey?: string;
    onTimeout: () => void;
    onWarning?: () => void;
    onResume?: () => void;
}

const EVENTS = ['mousemove', 'mousedown', 'click', 'keydown', 'touchstart', 'scroll'] as const;

export function useIdleTimeout(opts: IdleTimeoutOpts) {
    const sessionStart = Date.now();
    const key = opts.storageKey ?? 'beverly.admin.last_activity';
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
        try {
            const v = Number(localStorage.getItem(key) ?? 0);
            if (v > lastActivity) lastActivity = v;
        } catch { /* noop */ }
        const now = Date.now();
        const idleFor = now - lastActivity;
        const sessionAge = now - sessionStart;
        if (opts.absoluteMs && sessionAge >= opts.absoluteMs) { cleanup(); opts.onTimeout(); return; }
        if (idleFor >= opts.idleMs) { cleanup(); opts.onTimeout(); return; }
        if (idleFor >= opts.idleMs - opts.warningMs) {
            secondsLeft.value = Math.max(0, Math.ceil((opts.idleMs - idleFor) / 1000));
            if (!warningVisible.value) { warningVisible.value = true; opts.onWarning?.(); }
        }
    }

    function cleanup() {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = null;
        EVENTS.forEach((evt) => window.removeEventListener(evt, bump));
        window.removeEventListener('storage', onStorage);
    }

    function stayActive() { bump(); }

    onMounted(() => {
        bump();
        EVENTS.forEach((evt) => window.addEventListener(evt, bump, { passive: true }));
        window.addEventListener('storage', onStorage);
        pollTimer = setInterval(tick, 1000);
    });
    onBeforeUnmount(cleanup);

    return { warningVisible, secondsLeft, stayActive };
}
