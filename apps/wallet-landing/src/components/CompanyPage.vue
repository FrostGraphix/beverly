<script setup lang="ts">
import { computed } from 'vue';
import IconSvg from './IconSvg.vue';
import { PORTALS } from '../content';

type PageKind = 'about' | 'contact' | 'support';
type PageSection = {
    title: string;
    body: string;
    bullets?: string[];
};

const props = defineProps<{ kind: PageKind }>();

const pages: Record<PageKind, {
    eyebrow: string;
    title: string;
    intro: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
    sections: PageSection[];
}> = {
    about: {
        eyebrow: 'About ACOB',
        title: 'Power access, rebuilt.',
        intro: 'Beverly Wallet is an ACOB Lighting Technology Limited product for electricity customers, vending agents, finance teams, and field operators.',
        primaryLabel: 'Create account',
        primaryHref: PORTALS.customer.signup,
        secondaryLabel: 'Vendor portal',
        secondaryHref: PORTALS.vendor.login,
        sections: [
            {
                title: 'What we build',
                body: 'We connect prepaid electricity users to token vending, wallet funding, receipt storage, remote delivery, dispute handling, and operational controls.',
                bullets: [
                    'Customer wallet for instant electricity purchases.',
                    'Vendor portal for float-based vending.',
                    'Admin workflows for funding, support, risk, and reconciliation.',
                    'Remote meter task flows for compatible meter networks.',
                ],
            },
            {
                title: 'Who it serves',
                body: 'The platform supports households, shops, agents, finance teams, support teams, and distribution operations.',
                bullets: [
                    'Customers get tokens, receipts, meter history, and support.',
                    'Vendors manage float, transactions, remote sends, and statements.',
                    'Staff monitor risk, approvals, disputes, wallets, and delivery state.',
                ],
            },
            {
                title: 'Operating principles',
                body: 'Beverly Wallet is designed around ledger truth, role permissions, audit trails, secure authentication, and clear recovery paths.',
                bullets: [
                    'Wallet balances come from immutable ledger entries.',
                    'Live vending requires authorization and traceable records.',
                    'Failed or unknown delivery remains reviewable.',
                ],
            },
        ],
    },
    contact: {
        eyebrow: 'Contact',
        title: 'Reach the right team.',
        intro: 'Use these channels for customer support, vendor onboarding, finance review, privacy requests, and technical escalation.',
        primaryLabel: 'Email support',
        primaryHref: 'mailto:support@acoblighting.com',
        secondaryLabel: 'Become a vendor',
        secondaryHref: 'mailto:wallet@acoblighting.com?subject=Becoming%20a%20Beverly%20vendor',
        sections: [
            {
                title: 'Customer support',
                body: 'For account access, meter setup, receipts, missing tokens, failed payments, or disputes.',
                bullets: [
                    'Email: support@acoblighting.com',
                    'Include meter number, receipt ID, amount, and payment time.',
                    'Never send passwords, OTPs, or full card details.',
                ],
            },
            {
                title: 'Vendor onboarding',
                body: 'For agent setup, float funding, vending access, staff roles, or settlement questions.',
                bullets: [
                    'Email: wallet@acoblighting.com',
                    'Include business name, location, contact person, and vending volume.',
                    'Vendor approval may require identity and business checks.',
                ],
            },
            {
                title: 'Privacy and compliance',
                body: 'For data access, correction, deletion, export, restriction, or regulatory requests.',
                bullets: [
                    'Email: support@acoblighting.com',
                    'Some ledger, tax, fraud, and settlement records must be retained.',
                ],
            },
        ],
    },
    support: {
        eyebrow: 'Support',
        title: 'Resolve vending issues fast.',
        intro: 'Support covers customer purchases, vendor vending, wallet balances, remote sends, receipts, disputes, and security recovery.',
        primaryLabel: 'Open customer app',
        primaryHref: PORTALS.customer.home,
        secondaryLabel: 'Open vendor portal',
        secondaryHref: PORTALS.vendor.home,
        sections: [
            {
                title: 'Before contacting support',
                body: 'Gather the key details first so the team can trace the transaction quickly.',
                bullets: [
                    'Meter number and customer name.',
                    'Receipt ID or transaction reference.',
                    'Amount, date, payment channel, and visible error.',
                    'Token shown, if a token was generated.',
                ],
            },
            {
                title: 'Token and meter issues',
                body: 'Generated tokens depend on correct meter keys, tariff data, meter phase, upstream systems, and network delivery state.',
                bullets: [
                    'Token generated but not entered: retrieve it from receipts.',
                    'Remote send stays pending: check meter network and task status.',
                    'TokenReject: meter key sync or upstream correction may be required.',
                ],
            },
            {
                title: 'Wallet and payment issues',
                body: 'Wallet funding and vending use holds, approvals, captures, reversals, and immutable ledger records.',
                bullets: [
                    'Pending funding waits for finance approval or payment confirmation.',
                    'Failed vending should release or review the hold.',
                    'Duplicate deposits or chargebacks may be reversed.',
                ],
            },
        ],
    },
};

const page = computed(() => pages[props.kind]);
</script>

<template>
  <main class="lp-company-page">
    <section class="lp-company-hero">
      <a class="lp-legal-back" href="#top">
        <IconSvg name="arrow" />
        Back home
      </a>
      <span class="lp-eyebrow">{{ page.eyebrow }}</span>
      <h1>{{ page.title }}</h1>
      <p>{{ page.intro }}</p>
      <div class="lp-company-actions">
        <a class="lp-btn lp-btn--primary lp-btn--lg" :href="page.primaryHref">{{ page.primaryLabel }} <IconSvg name="arrow" /></a>
        <a class="lp-btn lp-btn--ghost lp-btn--lg" :href="page.secondaryHref">{{ page.secondaryLabel }}</a>
      </div>
    </section>

    <section class="lp-company-body">
      <article v-for="section in page.sections" :key="section.title" class="lp-company-section" v-reveal>
        <h2>{{ section.title }}</h2>
        <p>{{ section.body }}</p>
        <ul v-if="section.bullets?.length">
          <li v-for="item in section.bullets" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>
  </main>
</template>
