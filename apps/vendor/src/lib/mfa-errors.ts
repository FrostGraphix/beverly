export interface VendorMfaErrorPresentation {
    message: string;
    reference: string | null;
    recoveryRequired: boolean;
}

export function presentVendorMfaError(error: unknown, fallback: string): VendorMfaErrorPresentation {
    const candidate = error && typeof error === 'object'
        ? error as { code?: unknown; message?: unknown; details?: unknown }
        : {};
    const details = candidate.details && typeof candidate.details === 'object'
        ? candidate.details as { correlationId?: unknown }
        : {};
    const reference = typeof details.correlationId === 'string' && details.correlationId.trim()
        ? details.correlationId.trim().slice(0, 120)
        : null;

    return {
        message: typeof candidate.message === 'string' && candidate.message.trim()
            ? candidate.message.trim()
            : fallback,
        reference,
        recoveryRequired: candidate.code === 'mfa_secret_invalid',
    };
}
