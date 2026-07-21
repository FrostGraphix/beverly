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
        eyebrow: 'For households & businesses',
        title: 'I want to buy electricity',
        tagline: 'Your Smart Power Partner.',
        bullets: [
            { icon: 'bolt', text: 'Instant token delivery — paste into any meter' },
            { icon: 'wallet', text: 'Fund a wallet once, buy in one tap' },
            { icon: 'shield', text: 'Receipts & history saved automatically' },
        ],
        primaryLabel: 'Create free account',
        primaryHref: PORTALS.customer.signup,
        secondaryLabel: 'Sign in',
        secondaryHref: PORTALS.customer.login,
        accent: 'brand',
    },
    {
        key: 'vendor',
        eyebrow: 'For agents & resellers',
        title: 'I want to sell electricity',
        tagline: 'Your Smart Power Partner.',
        bullets: [
            { icon: 'store', text: 'Vend to any customer, any disco, instantly' },
            { icon: 'chart', text: 'Live float balance & daily statements' },
            { icon: 'send', text: 'Remote-send tokens by SMS or print' },
        ],
        primaryLabel: 'Open vendor portal',
        primaryHref: PORTALS.vendor.login,
        secondaryLabel: 'Talk to sales',
        secondaryHref: 'mailto:wallet@acoblighting.com?subject=Becoming%20a%20Beverly%20vendor',
        accent: 'violet',
    },
];

export interface Feature {
    icon: string;
    title: string;
    body: string;
}

export const FEATURES: Feature[] = [
    { icon: 'bolt', title: 'Tokens in seconds', body: 'Pay and receive your 20-digit token immediately — no queues, no agents, no waiting for a callback.' },
    { icon: 'wallet', title: 'One wallet, every meter', body: 'Save your meters once. Fund your balance and buy power for home, shop, or family in a single tap.' },
    { icon: 'shield', title: 'Bank-grade security', body: 'PCI-compliant payments, encrypted at rest, with MFA and session protection on every account.' },
    { icon: 'receipt', title: 'Receipts that stay', body: 'Every purchase is stored with a downloadable receipt. Reconcile spend across months effortlessly.' },
    { icon: 'chart', title: 'Real-time insight', body: 'See consumption trends, vending volume, and float health update live as money moves.' },
    { icon: 'send', title: 'Remote delivery', body: "Vendors deliver tokens straight to a customer's phone by SMS, or print at the counter." },
];

export interface Step {
    n: string;
    title: string;
    body: string;
}

export const CUSTOMER_STEPS: Step[] = [
    { n: '01', title: 'Create your account', body: 'Sign up with your phone or email in under a minute. No paperwork to start.' },
    { n: '02', title: 'Add your meter', body: 'Enter your meter number once. Beverly remembers it for every future top-up.' },
    { n: '03', title: 'Buy & power up', body: "Pay with card or wallet balance and get your token instantly. Type it in and you're lit." },
];

export const VENDOR_STEPS: Step[] = [
    { n: '01', title: 'Get onboarded', body: 'Our team activates your vendor account and float wallet, ready to trade.' },
    { n: '02', title: 'Fund your float', body: 'Top up your float balance securely. Your buying power updates in real time.' },
    { n: '03', title: 'Vend & settle', body: 'Sell to any customer on any disco. Settlement and statements are automatic.' },
];

export interface Stat {
    value: string;
    label: string;
}

export const STATS: Stat[] = [
    { value: '<15s', label: 'Avg. token delivery' },
    { value: '24 / 7', label: 'Always-on service' },
    { value: '99.9%', label: 'Platform uptime' },
    { value: '5', label: 'Sites supported' },
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

export const FAQS: Faq[] = [
    {
        q: "Is Beverly Wallet free to use?",
        a: "Creating an account and storing your meters is completely free. You only pay for the electricity tokens you buy — no subscriptions, no hidden charges.",
    },
    {
        q: "How fast do I get my token?",
        a: "Tokens are delivered the moment your payment is confirmed — typically in under 15 seconds. Your token appears on screen and is saved to your receipts automatically.",
    },
    {
        q: 'Which meters and sites are supported?',
        a: 'Beverly works with prepaid meters across our five supported sites: Musha, Kyakale, Umaisha, Tunga, and Ogufa. Enter your meter number and we route it to the right site automatically.',
    },
    {
        q: 'How do I become a vendor?',
        a: 'Open the vendor portal to request access, or email wallet@acoblighting.com. Once onboarded you receive a float wallet and vendor credentials, and can start vending immediately.',
    },
    {
        q: 'Is my money and data safe?',
        a: 'Payments run through PCI-compliant providers, all data is encrypted at rest and in transit, and every account supports multi-factor authentication for extra protection.',
    },
    {
        q: 'Can I save multiple meters?',
        a: 'Yes — save as many meters as you need under one account. Name them (Home, Office, Shop) and top up any of them with a single tap whenever you need power.',
    },
    {
        q: 'What happens if I enter the wrong meter number?',
        a: 'Meter numbers are validated against the disco system before any token is generated. If a number is not found or invalid, the transaction is declined and you are not charged.',
    },
    {
        q: 'How do vendors manage their float?',
        a: 'Vendor float is funded via bank transfer or payment gateway. Your balance updates in real time and you can top it up, check balances, or download daily statements anytime from the vendor portal.',
    },
    {
        q: 'Can tokens be delivered by SMS?',
        a: 'Yes — vendors can send tokens directly to a customer\'s phone number by SMS, or print a receipt at the counter. Customers also see their token on screen the moment it is generated.',
    },
    {
        q: 'What if my token does not work on the meter?',
        a: 'Contact Beverly support with your transaction receipt and meter number. We will investigate with the energy backend and arrange a replacement or refund within one business day.',
    },
];
