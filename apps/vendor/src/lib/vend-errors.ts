export interface VendFailurePresentation {
    showPopup: boolean;
    blockConfirmation: boolean;
    action?: string;
}

function positiveSeconds(details: unknown): number | null {
    if (!details || typeof details !== 'object') return null;
    const value = Number((details as Record<string, unknown>).retryAfterSeconds);
    return Number.isFinite(value) && value > 0 ? Math.ceil(value) : null;
}

export function presentVendorVendFailure(
    code: unknown,
    details?: unknown,
): VendFailurePresentation {
    if (code === 'oem_quota_circuit_unavailable') {
        return {
            showPopup: false,
            blockConfirmation: true,
            action: 'No wallet debit occurred. Retry after one minute.',
        };
    }
    if (code !== 'oem_insufficient_quota') {
        return { showPopup: true, blockConfirmation: false };
    }

    const seconds = positiveSeconds(details);
    const minutes = seconds ? Math.max(1, Math.ceil(seconds / 60)) : null;
    const notified = Boolean(details && typeof details === 'object'
        && (details as Record<string, unknown>).operationsNotified === true);
    const operationsMessage = notified
        ? 'Beverly operations were notified.'
        : 'Beverly operations must restore quota.';
    const retryMessage = minutes ? ` Retry after ${minutes} minutes.` : '';

    return {
        showPopup: false,
        blockConfirmation: true,
        action: `No wallet debit occurred. ${operationsMessage}${retryMessage}`,
    };
}
