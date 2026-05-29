<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'

const route  = useRoute()
const router = useRouter()

type IconName = 'lock' | 'slash' | 'zap-off' | 'phone' | 'key' | 'wifi-off' | 'triangle'
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
  wallet_frozen:           { icon: 'lock',     color: 'danger',  title: 'Wallet Frozen',           desc: 'Your wallet has been temporarily frozen. Contact your administrator.',     cta: 'Dashboard',       to: '/' },
  vending_failed:          { icon: 'zap-off',  color: 'danger',  title: 'Vending Failed',          desc: 'The vending operation could not be completed. Please try again.',          cta: 'Try Again',       to: '/vend' },
  mfa_required:            { icon: 'phone',    color: 'warning', title: 'MFA Setup Required',      desc: 'Set up two-factor authentication before accessing this account.',           cta: 'Set Up MFA',      to: '/security' },
  password_reset_required: { icon: 'key',      color: 'warning', title: 'Password Reset Required', desc: 'Your password must be changed before you can continue.',                   cta: 'Reset Password',  to: '/password-change' },
  account_suspended:       { icon: 'slash',    color: 'danger',  title: 'Account Suspended',       desc: 'Your account has been suspended. Contact your administrator for help.',    cta: 'Get Help',        to: '/help' },
  network_error:           { icon: 'wifi-off', color: 'muted',   title: 'Connection Problem',      desc: 'Check your internet connection and try again.',                            cta: 'Dashboard',       to: '/' },
  server_error:            { icon: 'triangle', color: 'muted',   title: 'Something Went Wrong',    desc: 'Our servers hit a snag. Please try again shortly.',                       cta: 'Dashboard',       to: '/' },
}

const FALLBACK: ErrorDef = {
  icon: 'triangle', color: 'muted',
  title: 'Something Went Wrong', desc: 'An unexpected error occurred. Please try again.',
  cta: 'Dashboard', to: '/',
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
  <main style="min-height:100dvh; display:grid; place-items:center; padding: var(--s-5); text-align:center">
    <div style="max-width:380px; width:100%">

      <!-- icon circle -->
      <div :style="{ width:'72px', height:'72px', borderRadius:'50%', background: ic.bg, display:'grid', placeItems:'center', margin:'0 auto var(--s-5)', color: ic.fg }">

        <svg v-if="def.icon==='lock'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
        </svg>

        <svg v-else-if="def.icon==='slash'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
        </svg>

        <svg v-else-if="def.icon==='zap-off'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="12.41 6.75 13 2 10.57 4.92"/>
          <polyline points="18.57 12.91 21 10 15.91 10"/>
          <polyline points="8 8 3 14 12 14 11 22 16 16"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>

        <svg v-else-if="def.icon==='phone'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
          <line x1="12" y1="18" x2="12.01" y2="18"/>
        </svg>

        <svg v-else-if="def.icon==='key'" xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="7.5" cy="15.5" r="5.5"/>
          <path d="M21 2l-9.6 9.6"/>
          <path d="M15.5 7.5l3 3L22 7l-3-3"/>
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

        <svg v-else xmlns="http://www.w3.org/2000/svg" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
          <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>

      </div>

      <p style="font-size:var(--t-xl); font-weight:700; color:var(--text-main); margin:0 0 var(--s-2)">{{ title }}</p>
      <p class="bw-muted" style="font-size:var(--t-sm); margin:0 0 var(--s-6); line-height:1.5">{{ desc }}</p>

      <div style="display:flex; gap:var(--s-2); justify-content:center; flex-wrap:wrap">
        <button class="bw-btn ghost" @click="router.back()">Go back</button>
        <router-link :to="def.to" class="bw-btn primary" style="text-decoration:none">{{ def.cta }}</router-link>
      </div>

    </div>
  </main>
</template>
