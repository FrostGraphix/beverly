# Beverly Design System

This document outlines the core design tokens for the **Beverly** platform. We maintain a single source of truth for our CSS variables, making it easy to ensure visual consistency, implement themes (like dark mode), and globally update the look and feel of the application.

All design tokens are defined in the `:root` selector within `src/styles/reference.css`.

## Core Colors

Our color palette is built for clarity and approachability, using modern hues for primary actions and semantic feedback.

| Token | Value | Description |
| :--- | :--- | :--- |
| `--primary` | `#3b82f6` | The main brand and action color. |
| `--primary-hover` | `#2563eb` | Used for hover states on primary buttons. |
| `--primary-light` | `rgba(59, 130, 246, 0.15)` | Subtle background highlighting. |
| `--success` | `#10b981` | Semantic color for positive actions (e.g., tags, success states). |
| `--danger` | `#ef4444` | Semantic color for destructive actions (e.g., delete buttons, errors). |
| `--warning` | `#f59e0b` | Semantic color for warnings or pending states. |
| `--info` | `#0ea5e9` | Semantic color for neutral information. |

## Typography & Neutrals

We prioritize legibility using the 'Poppins' font stack and a carefully calibrated set of neutral grays for typography.

| Token | Value | Description |
| :--- | :--- | :--- |
| `--font-family` | `'Poppins', system-ui, -apple-system, sans-serif` | The global font stack. |
| `--text-strong` | `#111827` | High contrast text (Headings, active items). |
| `--text-main` | `#4b5563` | Standard body text. |
| `--text-muted` | `#9ca3af` | Low contrast text (Placeholders, secondary info). |
| `--text-inverse`| `#f9fafb` | Light text meant to sit on top of dark backgrounds. |

## Surfaces & Backgrounds

The application layout consists of distinct layers, separated by subtle background colors and borders.

| Token | Value | Description |
| :--- | :--- | :--- |
| `--bg-page` | `#f3f4f6` | The lowest layer background color. |
| `--bg-card` | `#ffffff` | Background for panels, tables, and modals. |
| `--bg-header` | `rgba(255, 255, 255, 0.9)` | Frosted glass background for sticky headers. |
| `--border-color` | `#e5e7eb` | Standard border color for dividers and inputs. |
| `--border-dark` | `rgba(255, 255, 255, 0.05)` | Subtle borders used in dark mode/sidebar elements. |

## Sidebar Theme

The sidebar features a premium, distinct dark-mode treatment with unique tokens.

| Token | Value | Description |
| :--- | :--- | :--- |
| `--sidebar-bg-start` | `#111827` | Gradient start for the sidebar background. |
| `--sidebar-bg-end` | `#1f2937` | Gradient end for the sidebar background. |
| `--sidebar-text` | `#9ca3af` | Unselected text color in the sidebar. |
| `--sidebar-text-hover`| `#f3f4f6` | Hover state text color. |
| `--sidebar-active-bg` | `linear-gradient(...)` | Highlight background for the active route. |

## Shadows & Elevations

Shadows establish hierarchy. We use a progressive shadow system with slight cool/blue tinting for a premium feel.

| Token | Value | Description |
| :--- | :--- | :--- |
| `--shadow-sm` | `0 1px 2px rgba(0, 0, 0, 0.05)` | Used for inputs and subtle structural elements. |
| `--shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.08)` | Used for standard cards and panels. |
| `--shadow-lg` | `0 12px 28px rgba(43, 67, 91, 0.09)`| Used for modals, dropdowns, and floating elements. |
| `--shadow-glow` | `0 0 8px rgba(59, 130, 246, 0.5)` | Highlight glow, typically for active indicators. |

## Geometry & Motion

Rounded corners and fluid animations contribute to the "Pro-Max" UX feel.

| Token | Description |
| :--- | :--- |
| `--radius-sm` | Small rounding (4px) for inputs, tags, and buttons. |
| `--radius-md` | Medium rounding (8px) for icons and standard containers. |
| `--radius-lg` | Large rounding (12px) for major structural elements (cards, modals). |
| `--transition-fast` | 0.2s duration for simple hover states and color shifts. |
| `--transition-normal` | 0.3s duration for micro-animations (icon scaling, toggles). |
| `--transition-layout` | 0.4s cubic-bezier duration for large structural layout shifts (sidebar open/close). |

---

> **Note on Maintenance:** When creating new UI components, always reference these variables via the `var(--token-name)` syntax rather than hardcoding hexadecimal values or pixel sizes. This ensures the component will automatically adapt if the global theme is updated.
