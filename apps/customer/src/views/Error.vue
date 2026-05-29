<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

type IconName = 'lock' | 'slash' | 'wallet' | 'alert-circle' | 'search-x' | 'shield-alert' | 'clock' | 'wifi-off' | 'triangle' | 'power'
type ColorKey = 'danger' | 'warning' | 'info' | 'muted'

interface ErrorDef {
  icon:  IconName
  color: ColorKey
  title: string
  desc:  string
  cta:   string
  to:    string
}

const ERRORS: Record<string, ErrorDef> = {
  wallet_frozen:        { icon: 'lock',         color: 'danger',  title: 'Wallet Frozen',             desc: 'Your wallet has been temporarily frozen. Contact support for help.',        cta: 'Get Help',    to: '/help' },
  purchase_blocked:     { icon: 'slash',         color: 'danger',  title: 'Purchase Blocked',          desc: 'This transaction was blocked by our safety system.',                        cta: 'Try Again',   to: '/buy-token' },
  insufficient_balance: { icon: 'wallet',        color: 'warning', title: 'Insufficient Balance',      desc: "You don't have enough balance for this transaction.",                       cta: 'Add Money',   to: '/wallet/fund' },
  kyc_required:         { icon: 'alert-circle',  color: 'warning', title: 'Verification Required',     desc: 'Complete identity verification to continue using your wallet.',             cta: 'Verify Now',  to: '/kyc' },
  meter_not_found:      { icon: 'search-x',      color: 'muted',   title: 'Meter Not Found',           desc: "We couldn't find that meter. Double-check the number and try again.",      cta: 'My Meters',   to: '/meters' },
  payment_failed:       { icon: 'alert-circle',  color: 'danger',  title: 'Payment Failed',            desc: 'Your payment could not be processed. Please try again.',                   cta: 'Try Again',   to: '/buy-token' },
  step_up_required:     { icon: 'shield-alert',  color: 'warning', title: 'Extra Verification Needed', desc: 'Additional verification is required to complete this purchase.',            cta: 'Verify',      to: '/security' },
  session_expired:      { icon: 'clock',         color: 'info',    title: 'Session Expired',           desc: 'Your session has expired. Sign in again to continue.',                     cta: 'Sign In',     to: '/login' },
  network_error:        { icon: 'wifi-off',      color: 'muted',   title: 'Connection Problem',        desc: 'Check your internet connection and try again.',                            cta: 'Go Home',     to: '/' },
  server_error:         { icon: 'triangle',      color: 'muted',   title: 'Something Went Wrong',      desc: 'Our servers hit a snag. Please try again shortly.',                       cta: 'Go Home',     to: '/' },
  feature_disabled:     { icon: 'power',         color: 'muted',   title: 'Feature Unavailable',       desc: 'This feature is temporarily unavailable.',                                 cta: 'Go Home',     to: '/' },
}

const FALLBACK: ErrorDef = {
  icon: 'triangle', color: 'muted',
  title: 'Something Went Wrong', desc: 'An unexpected error occurred. Please try again.',
  cta: 'Go Home', to: '/',
}

const code  = computed(() => route.query.code as string || '')
const def   = computed(() => ERRORS[code.value] ?? FALLBACK)
const title = computed(() => (route.query.title   as string) || def.value.title)
const desc  = computed(() => (route.query.message as string) || def.value.desc)

const colorMap: Record<ColorKey, { bg: string; fg: string }> = {
  danger:  { bg: 'var(--danger-bg)',  fg: 'var(--danger)'  },
  warning: { bg: 'var(--warning-bg)', fg: 'var(--warning)' },
  info:    { bg: 'var(--info-bg)',    fg: 'var(--info)'    },
  muted:   { bg: 'var(--bg-card)',    fg: 'var(--text-dim)' },
}

const ic = computed(() => colorMap[def.value.color])
</script>

<template>
  <div style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5); background: var(--canvas); text-align:center">
    <div style="max-width:340px; width:100%">

      <!-- icon circle -->
      <div :style="{ width:'72px', height:'72px', borderRadius:'50%', background: ic.bg, display:'grid', placeItems:'center', margin:'0 auto var(--s-5)', color: ic.fg }">

        <svg v-if="def.icon==='lock'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>

        <svg v-else-if="def.icon==='slash'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>

        <svg v-else-if="def.icon==='wallet'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 12V7H5a2 2 0 010-4h14v4"/><path d="M3 5v14a2 2 0 002 2h16v-5"/><path d="M18 12h.01"/>
        </svg>

        <svg v-else-if="def.icon==='alert-circle'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>

        <svg v-else-if="def.icon==='search-x'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          <line x1="8.5" y1="8.5" x2="13.5" y2="13.5"/><line x1="13.5" y1="8.5" x2="8.5" y2="13.5"/>
        </svg>

        <svg v-else-if="def.icon==='shield-alert'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
          <line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
        </svg>

        <svg v-else-if="def.icon==='clock'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>

        <svg v-else-if="def.icon==='wifi-off'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="1" y1="1" x2="23" y2="23"/>
          <path d="M16.72 11.06A10.94 10.94 0 0119 12.55"/>
          <path d="M5 12.55a10.94 10.94 0 0110.17-2.93"/>
          <path d="M10.71 5.05A16 16 0 0122.56 9"/>
          <path d="M1.42 9a15.91 15.91 0 014.7-2.88"/>
          <path d="M8.53 16.11a6 6 0 016.95 0"/>
          <line x1="12" y1="20" x2="12.01" y2="20"/>
        </svg>

        <svg v-else-if="def.icon==='triangle'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>

        <svg v-else xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M18.36 6.64a9 9 0 11-12.73 0"/><line x1="12" y1="2" x2="12" y2="12"/>
        </svg>

      </div>

      <p style="font-size:var(--t-xl); font-weight:700; color:var(--text-main); margin:0 0 var(--s-2)">{{ title }}</p>
      <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-6); line-height:1.5">{{ desc }}</p>

      <div style="display:flex; gap:var(--s-2); justify-content:center; flex-wrap:wrap">
        <button class="bw-btn ghost" @click="router.back()">Go back</button>
        <router-link :to="def.to" class="bw-btn primary" style="text-decoration:none">{{ def.cta }}</router-link>
      </div>

    </div>
  </div>
</template>
