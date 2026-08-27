/**
 * Beverly Wallet landing — content + portal wiring.
 * Portal URLs resolve via ./portals (dev ports / prod paths / env override).
 */

import { PORTAL_URLS } from './portals';

export const PORTALS = {
    customer: {
        login: PORTAL_URLS.customer + 'login',
        signup: PORTAL_URLS.customer + 'signup',
        home: PORTAL_URLS.customer,
    },
    vendor: {
        login: PORTAL_URLS.vendor + 'login',
        home: PORTAL_URLS.vendor,
    },
} as const;

export interface PortalDef {
    key: 'customer' | 'vendor';
    eyebrow: string;
    title: string;
    tagline: string;
    bullets: { icon: string; text: string }[];
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    accent: string;
}

export const PORTAL_CARDS: PortalDef[] = [
    {
        key: 'customer',
        eyebrow: 'landing.portal.customer.eyebrow',
        title: 'landing.portal.customer.title',
        tagline: 'landing.portal.tagline',
        bullets: [
            { icon: 'bolt', text: 'landing.portal.customer.bullet1' },
            { icon: 'wallet', text: 'landing.portal.customer.bullet2' },
            { icon: 'shield', text: 'landing.portal.customer.bullet3' },
            { icon: 'download', text: 'landing.portal.installable' },
        ],
        primaryLabel: 'landing.portal.customer.primary',
        primaryHref: PORTALS.customer.signup,
        secondaryLabel: 'common.signIn',
        secondaryHref: PORTALS.customer.login,
        accent: 'brand',
    },
    {
        key: 'vendor',
        eyebrow: 'landing.portal.vendor.eyebrow',
        title: 'landing.portal.vendor.title',
        tagline: 'landing.portal.tagline',
        bullets: [
            { icon: 'store', text: 'landing.portal.vendor.bullet1' },
            { icon: 'chart', text: 'landing.portal.vendor.bullet2' },
            { icon: 'send', text: 'landing.portal.vendor.bullet3' },
            { icon: 'download', text: 'landing.portal.installable' },
        ],
        primaryLabel: 'landing.hero.vendorCta',
        primaryHref: PORTALS.vendor.login,
        secondaryLabel: 'landing.portal.vendor.secondary',
        secondaryHref: 'mailto:wallet@acoblighting.com?subject=Becoming%20a%20Beverly%20vendor',
        accent: 'violet',
    },
];

export interface Feature {
    icon: string;
    title: string;
    body: string;
}

export const FEATURES: Feature[] = Array.from({ length: 6 }, (_, index) => ({
    icon: ['bolt', 'wallet', 'shield', 'receipt', 'chart', 'send'][index],
    title: `landing.feature.${index + 1}.title`,
    body: `landing.feature.${index + 1}.body`,
}));

export interface Step {
    n: string;
    title: string;
    body: string;
}

export const CUSTOMER_STEPS: Step[] = Array.from({ length: 3 }, (_, index) => ({
    n: `0${index + 1}`, title: `landing.how.customer.${index + 1}.title`, body: `landing.how.customer.${index + 1}.body`,
}));

export const VENDOR_STEPS: Step[] = Array.from({ length: 3 }, (_, index) => ({
    n: `0${index + 1}`, title: `landing.how.vendor.${index + 1}.title`, body: `landing.how.vendor.${index + 1}.body`,
}));

export interface Stat {
    value: string;
    label: string;
}

export const STATS: Stat[] = [
    { value: 'Live', label: 'landing.stats.sites' },
    { value: '4', label: 'landing.stats.languages' },
    { value: '2', label: 'landing.stats.portals' },
    { value: '1', label: 'landing.stats.wallet' },
];

export interface Testimonial {
    name: string;
    role: string;
    avatar: string;
    body: string;
    rating: number;
}

export const TESTIMONIALS: Testimonial[] = [];

export const PARTNER_LOGOS = [
    { name: 'Musha', abbr: 'MUSHA' },
    { name: 'Kyakale', abbr: 'KYAKALE' },
    { name: 'Umaisha', abbr: 'UMAISHA' },
    { name: 'Tunga', abbr: 'TUNGA' },
    { name: 'Ogufa', abbr: 'OGUFA' },
];

/* ── Distribution companies ── */
export interface Disco {
    code: string;
    name: string;
    region: string;
}

export const DISCOS: Disco[] = [
    { code: 'MUSHA',   name: 'Musha',   region: 'Nasarawa State' },
    { code: 'KYAKALE', name: 'Kyakale', region: 'Nasarawa State' },
    { code: 'UMAISHA', name: 'Umaisha', region: 'Nasarawa State' },
    { code: 'TUNGA',   name: 'Tunga',   region: 'Nasarawa State' },
    { code: 'OGUFA',   name: 'Ogufa',   region: 'Nasarawa State' },
];

export interface Faq {
    q: string;
    a: string;
}

export const FAQS: Faq[] = Array.from({ length: 10 }, (_, index) => ({
    q: `landing.faq.${index + 1}.q`, a: `landing.faq.${index + 1}.a`,
}));
