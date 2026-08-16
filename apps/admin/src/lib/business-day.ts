/**
 * Business-day boundaries for admin KPIs.
 *
 * "Today" must mean the same thing for every operator. Using the browser's local
 * midnight makes a revenue figure depend on the viewer's machine timezone, so
 * the cut-off is pinned to the operating timezone instead.
 *
 * Mirrors backend/wallet/src/services/wallet-summary.ts — keep the two in step.
 */
export const BUSINESS_TIMEZONE = 'Africa/Lagos';

// Africa/Lagos is UTC+01:00 year-round (no DST), so a fixed offset is exact.
const BUSINESS_UTC_OFFSET = '+01:00';

function businessDateParts(now: Date): { year: string; month: string; day: string } {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: BUSINESS_TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).formatToParts(now);
    const part = (type: string) => parts.find((entry) => entry.type === type)!.value;
    return { year: part('year'), month: part('month'), day: part('day') };
}

export function startOfBusinessDay(now: Date = new Date()): Date {
    const { year, month, day } = businessDateParts(now);
    return new Date(`${year}-${month}-${day}T00:00:00${BUSINESS_UTC_OFFSET}`);
}

/**
 * First instant of the current month in the business timezone.
 *
 * Do NOT derive this with `date.setDate(1)` on the result of
 * startOfBusinessDay(): those setters operate in the *viewer's* local timezone,
 * so for anyone not at UTC+01:00 the result lands on the wrong instant — a full
 * day off, which silently drops the first day of the month from the range.
 */
export function startOfBusinessMonth(now: Date = new Date()): Date {
    const { year, month } = businessDateParts(now);
    return new Date(`${year}-${month}-01T00:00:00${BUSINESS_UTC_OFFSET}`);
}

/** Start of the business day `days` days before today (inclusive windows). */
export function businessDaysAgo(days: number, now: Date = new Date()): Date {
    const start = startOfBusinessDay(now);
    return new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
}

export function isSameBusinessDay(iso: string, now: Date = new Date()): boolean {
    const created = new Date(iso);
    if (Number.isNaN(created.getTime())) return false;
    return created >= startOfBusinessDay(now);
}
