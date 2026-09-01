/**
 * @beverly/tokens — runtime helpers for token consumption.
 *
 * Use the CSS files directly in your app entry:
 *   import '@beverly/tokens/tokens.css';
 *   import '@beverly/tokens/theme.css';
 *
 * This module exports JS constants mirroring the CSS values
 * for use in chart libraries, canvas drawing, etc.
 */

export const brand = {
    50:  'oklch(96% 0.05 145)',
    100: 'oklch(92% 0.10 145)',
    300: 'oklch(80% 0.16 145)',
    500: 'oklch(70% 0.19 145)',
    600: 'oklch(62% 0.17 145)',
    700: 'oklch(52% 0.14 145)',
    glow: 'oklch(70% 0.19 145 / 0.18)',
};

export const semantic = {
    accent:  'oklch(65% 0.18 270)',
    info:    'oklch(72% 0.13 220)',
    warn:    'oklch(78% 0.16 75)',
    danger:  'oklch(68% 0.20 25)',
    success: 'oklch(70% 0.19 145)',
};

export const motion = {
    easeOut:    'cubic-bezier(0.22, 1, 0.36, 1)',
    easeInOut:  'cubic-bezier(0.65, 0, 0.35, 1)',
    easeSpring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
    durFast: 120,
    durBase: 220,
    durSlow: 380,
};

export const fontStacks = {
    sans: "'Inter', -apple-system, BlinkMacSystemFont, system-ui, sans-serif",
    mono: "'JetBrains Mono', ui-monospace, monospace",
};

export const VENDING_VAT_BASIS_POINTS = 750;

export function calculateVendingVatBreakdown(
    grossAmountMinor,
    vatRateBasisPoints = VENDING_VAT_BASIS_POINTS,
) {
    if (!Number.isInteger(grossAmountMinor) || grossAmountMinor <= 0) {
        throw new Error('grossAmountMinor must be a positive integer.');
    }
    if (!Number.isInteger(vatRateBasisPoints) || vatRateBasisPoints < 0 || vatRateBasisPoints > 10000) {
        throw new Error('vatRateBasisPoints must be between 0 and 10000.');
    }

    // VAT is inclusive: the customer pays grossAmountMinor total.
    // Back-calculate the net energy portion and the embedded VAT.
    const energyAmountMinor = Math.round((grossAmountMinor * 10000) / (10000 + vatRateBasisPoints));
    const vatAmountMinor = grossAmountMinor - energyAmountMinor;
    return {
        grossAmountMinor,
        energyAmountMinor,
        vatAmountMinor,
        vatRateBasisPoints,
    };
}

export function getWalletGreeting(date = new Date()) {
    const hour = date.getHours();
    const period = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'night';
    const greetings = {
        morning: {
            period,
            english: 'Good morning',
            yoruba: 'E kaaro',
            hausa: 'Ina kwana',
            igbo: 'Ụtụtụ ọma',
            pulse: 'Fresh starts',
        },
        afternoon: {
            period,
            english: 'Good afternoon',
            yoruba: 'E kaasan',
            hausa: 'Ina wuni',
            igbo: 'Ehihie ọma',
            pulse: 'Steady flow',
        },
        night: {
            period,
            english: 'Good night',
            yoruba: 'E ku ale',
            hausa: 'Barka da dare',
            igbo: 'Mgbede ọma',
            pulse: 'Calm close',
        },
    };

    return greetings[period];
}

const NOTIFICATION_COUNT_EVENT = 'beverly:notification-count';

export function publishNotificationCount(count) {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(NOTIFICATION_COUNT_EVENT, {
        detail: Math.max(0, Number(count) || 0),
    }));
}

export function onNotificationCountChange(callback) {
    if (typeof window === 'undefined') return () => {};
    const handler = (event) => callback(event.detail);
    window.addEventListener(NOTIFICATION_COUNT_EVENT, handler);
    return () => window.removeEventListener(NOTIFICATION_COUNT_EVENT, handler);
}

export function setTheme(name) {
    if (typeof document === 'undefined') return;
    document.documentElement.setAttribute('data-theme', name);
    try { localStorage.setItem('beverly-theme', name); } catch { /* noop */ }
}

export function initTheme(defaultName = 'dark') {
    if (typeof document === 'undefined') return;
    let saved = null;
    try { saved = localStorage.getItem('beverly-theme'); } catch { /* noop */ }
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const initial = saved ?? (prefersDark ? 'dark' : defaultName);
    document.documentElement.setAttribute('data-theme', initial);
}

export function toggleTheme() {
    if (typeof document === 'undefined') return;
    const cur = document.documentElement.getAttribute('data-theme');
    setTheme(cur === 'dark' ? 'light' : 'dark');
}

// ── Table pagination ─────────────────────────────────────────────────────────
// Shared by the consumption tables in all three wallet portals. The maths lives
// here rather than in each view so "page 3 of 12" and the rows actually shown
// can never disagree between apps.

export const DEFAULT_PAGE_SIZE = 10;

/** Number of pages needed for `total` rows. Always at least 1, so an empty
 *  table reads "Page 1 of 1" rather than "Page 1 of 0". */
export function pageCount(total, pageSize = DEFAULT_PAGE_SIZE) {
    const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
    return Math.max(1, Math.ceil(Math.max(0, Number(total) || 0) / size));
}

/** Clamp a requested page into range. Guards the case where a filter shrinks
 *  the list under the current page and the table would render empty. */
export function clampPage(page, total, pageSize = DEFAULT_PAGE_SIZE) {
    const last = pageCount(total, pageSize);
    const requested = Math.floor(Number(page)) || 1;
    return Math.min(Math.max(1, requested), last);
}

/** The rows belonging to `page`. Clamps first, so an out-of-range page returns
 *  the last page's rows instead of an empty array. */
export function paginate(rows, page, pageSize = DEFAULT_PAGE_SIZE) {
    const list = Array.isArray(rows) ? rows : [];
    const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
    const current = clampPage(page, list.length, size);
    return list.slice((current - 1) * size, current * size);
}

/** 1-based inclusive row range shown on `page`, for "Showing 11–20 of 317". */
export function pageRange(page, total, pageSize = DEFAULT_PAGE_SIZE) {
    const count = Math.max(0, Number(total) || 0);
    if (count === 0) return { first: 0, last: 0 };
    const size = Math.max(1, Math.floor(pageSize) || DEFAULT_PAGE_SIZE);
    const current = clampPage(page, count, size);
    return { first: (current - 1) * size + 1, last: Math.min(current * size, count) };
}

export * from './pwaInstall.js';
export * from './i18n.js';
export * from './wallet-export.js';
