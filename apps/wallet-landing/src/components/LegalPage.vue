<script setup lang="ts">
import { computed } from 'vue';
import IconSvg from './IconSvg.vue';

type LegalSection = {
    title: string;
    body: string;
    bullets?: string[];
};

const props = defineProps<{
    kind: 'privacy' | 'terms';
}>();

const updated = 'May 25, 2026';

const privacySections: LegalSection[] = [
    {
        title: 'Information we collect',
        body: 'We collect account, meter, wallet, payment, device, and support information needed to operate Beverly Wallet.',
        bullets: [
            'Identity details, contact details, and account credentials.',
            'Meter numbers, customer references, tariffs, station links, and transaction history.',
            'Wallet funding records, receipts, dispute messages, proof files, and approval records.',
            'Session, device, security, audit, and fraud-prevention signals.',
        ],
    },
    {
        title: 'How we use data',
        body: 'We use data to provide prepaid vending, remote token delivery, wallet ledgers, receipts, support, compliance, and platform security.',
        bullets: [
            'Generate and deliver electricity tokens.',
            'Confirm wallet balances, holds, captures, reversals, and refunds.',
            'Prevent fraud, abuse, unauthorized access, and suspicious vending.',
            'Send receipts, service notices, support updates, and security alerts.',
        ],
    },
    {
        title: 'Sharing and processors',
        body: 'We share data only with service providers required to deliver the service, comply with law, or protect users.',
        bullets: [
            'Energy backend providers for meter lookup, token generation, and remote meter tasks.',
            'Payment, banking, SMS, email, hosting, storage, analytics, and support providers.',
            'Regulators, courts, or law-enforcement bodies where legally required.',
        ],
    },
    {
        title: 'Security and retention',
        body: 'We use access controls, MFA, audit logs, encrypted transport, private storage, and role-based permissions.',
        bullets: [
            'Financial records are kept for audit, tax, reconciliation, and dispute obligations.',
            'Proof files remain private and are accessed only by authorized staff.',
            'Inactive data may be archived, minimized, or deleted when no longer required.',
        ],
    },
    {
        title: 'Your choices',
        body: 'You can request access, correction, deletion, export, or restriction where applicable.',
        bullets: [
            'Some records must remain for ledger, legal, fraud, tax, or settlement reasons.',
            'Contact support@acoblighting.com for privacy requests.',
        ],
    },
];

const termsSections: LegalSection[] = [
    {
        title: 'Using Beverly Wallet',
        body: 'Beverly Wallet provides customer top-ups, vendor vending, wallet funding, receipts, disputes, and remote token delivery.',
        bullets: [
            'You must provide accurate account, meter, and payment information.',
            'You are responsible for protecting passwords, OTPs, MFA devices, and session access.',
            'You must not attempt unauthorized access, fraud, reverse engineering, abuse, or illegal vending.',
        ],
    },
    {
        title: 'Payments and wallet balance',
        body: 'Wallet balances represent usable platform credit after successful funding approval or payment confirmation.',
        bullets: [
            'Pending funding, holds, reversals, refunds, and disputes may reduce available balance.',
            'Beverly may delay or block transactions for fraud, compliance, settlement, or risk review.',
            'Chargebacks, duplicate funding, or incorrect deposits may be reversed.',
        ],
    },
    {
        title: 'Tokens and meter delivery',
        body: 'Token generation depends on meter data, tariff data, upstream energy systems, and network availability.',
        bullets: [
            'A generated token is considered issued when returned by the energy backend.',
            'Remote meter send depends on the meter network, protocol, and physical meter keys.',
            'If a meter rejects a token, Beverly may require key sync, manual support, or upstream correction.',
        ],
    },
    {
        title: 'Vendors and staff access',
        body: 'Vendor and staff features require approval, role permissions, MFA, audit logging, and operational controls.',
        bullets: [
            'Frozen, suspended, or restricted wallets cannot transact.',
            'Vendor float, commissions, settlement, and reconciliation follow Beverly operational rules.',
            'Misuse may lead to suspension, reversal, investigation, or termination.',
        ],
    },
    {
        title: 'Service limits',
        body: 'We work to keep the service available, but outages, maintenance, upstream failures, or payment delays can occur.',
        bullets: [
            'Beverly is not liable for losses caused by incorrect meter numbers or unauthorized account use.',
            'These terms may be updated as the platform, regulation, or provider requirements change.',
            'Contact support@acoblighting.com for terms questions.',
        ],
    },
];

const page = computed(() => props.kind === 'privacy'
    ? {
        eyebrow: 'Privacy Notice',
        title: 'Privacy built for energy wallets.',
        intro: 'This notice explains how ACOB Lighting Technology Limited handles data for Beverly Wallet customers, vendors, staff, and support users.',
        sections: privacySections,
    }
    : {
        eyebrow: 'Terms of Service',
        title: 'Terms for safe vending.',
        intro: 'These terms govern Beverly Wallet accounts, customer token purchases, vendor vending, wallet funding, remote send, and support workflows.',
        sections: termsSections,
    });
</script>

<template>
  <main class="lp-legal-page">
    <section class="lp-legal-hero">
      <a class="lp-legal-back" href="#top">
        <IconSvg name="arrow" />
        Back home
      </a>
      <span class="lp-eyebrow">{{ page.eyebrow }}</span>
      <h1>{{ page.title }}</h1>
      <p>{{ page.intro }}</p>
      <small>Last updated: {{ updated }}</small>
    </section>

    <section class="lp-legal-body">
      <article v-for="section in page.sections" :key="section.title" class="lp-legal-section" v-reveal>
        <h2>{{ section.title }}</h2>
        <p>{{ section.body }}</p>
        <ul v-if="section.bullets?.length">
          <li v-for="item in section.bullets" :key="item">{{ item }}</li>
        </ul>
      </article>
    </section>
  </main>
</template>
