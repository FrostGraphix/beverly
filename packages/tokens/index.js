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
