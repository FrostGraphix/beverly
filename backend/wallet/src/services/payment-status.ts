export const PAYMENT_STATUS = {
    INITIATED: 'initiated',
    PENDING: 'pending',
    SUCCEEDED: 'succeeded',
    LEGACY_SUCCESS: 'success',
    REQUIRES_REVIEW: 'requires_review',
    FAILED: 'failed',
} as const;

export const PAYMENT_RECONCILABLE_STATUSES = [
    PAYMENT_STATUS.INITIATED,
    PAYMENT_STATUS.PENDING,
] as const;

export const PAYMENT_SUCCEEDED_STATUSES = [
    PAYMENT_STATUS.SUCCEEDED,
    PAYMENT_STATUS.LEGACY_SUCCESS,
] as const;
