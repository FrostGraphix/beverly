// Notification reads must not keep hidden tabs producing requests and session writes.
export function startVisiblePolling(refresh, intervalMs) {
    let stopped = false;
    let pending = false;
    async function run() {
        if (stopped || pending || document.visibilityState === 'hidden' || navigator.onLine === false) return;
        pending = true;
        try {
            await refresh();
        } catch {
            // Callers own error presentation; a failed background read may retry next tick.
        } finally {
            pending = false;
        }
    }
    const timer = setInterval(run, intervalMs);
    document.addEventListener('visibilitychange', run);
    window.addEventListener('online', run);
    void run();
    return () => {
        stopped = true;
        clearInterval(timer);
        document.removeEventListener('visibilitychange', run);
        window.removeEventListener('online', run);
    };
}
