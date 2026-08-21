/**
 * Transactional email templates.
 * Each builder returns { subject, html, text } ready for the Resend adapter.
 * Inline-styled, table-based HTML for broad email-client support (Outlook/Gmail/Apple Mail).
 */
import { env } from '../config/env.js';

const BRAND = '#059669';       // emerald-600 — primary accent
const BRAND_DARK = '#047857';  // emerald-700 — button hover / emphasis
const BRAND_TINT = '#ECFDF5';  // emerald-50 — highlight box fill
const BRAND_TINT_BORDER = '#A7F3D0'; // emerald-200
const INK = '#0F172A';         // slate-900 — headings/body
const MUTED = '#64748B';       // slate-500 — secondary text
const FAINT = '#94A3B8';       // slate-400 — footer text
const BORDER = '#E2E8F0';      // slate-200
const BG = '#F1F5F9';          // slate-100 — page background
const AMBER_TINT = '#FFFBEB';  // amber-50 — caution box fill
const AMBER_BORDER = '#FDE68A';// amber-200
const AMBER_INK = '#92400E';   // amber-800

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

function firstName(name: string): string {
    const trimmed = (name || '').trim();
    if (!trimmed) return 'there';
    return trimmed.split(' ')[0];
}

function esc(value: string): string {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Absolute URL for the official Beverly lockup PNG, served by this backend at
 * /assets/beverly-logo.png (see routes/assets.ts). Email clients cannot use the
 * SPA's relative /brand/* paths, so this needs EMAIL_ASSET_BASE_URL configured
 * once the backend is deployed. Returns null (text-only header) until then —
 * never a broken-image icon.
 */
function logoUrl(): string | null {
    const base = env.EMAIL_ASSET_BASE_URL?.trim().replace(/\/+$/, '');
    return base ? `${base}/assets/beverly-logo.png` : null;
}

interface LayoutOpts {
    preheader: string;
    eyebrow: string;
    heading: string;
    bodyHtml: string;
    highlightHtml?: string;
    cautionHtml?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    footerNote?: string;
}

function layout(opts: LayoutOpts): string {
    const cta = opts.ctaLabel && opts.ctaUrl
        ? `<tr><td style="padding:8px 40px 4px;">
             <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:${BRAND};">
               <a href="${opts.ctaUrl}" style="display:inline-block;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:10px;">${esc(opts.ctaLabel)}</a>
             </td></tr></table>
           </td></tr>`
        : '';
    const highlight = opts.highlightHtml
        ? `<tr><td style="padding:4px 40px 8px;">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND_TINT};border:1px solid ${BRAND_TINT_BORDER};border-radius:12px;">
               <tr><td style="padding:20px 24px;">${opts.highlightHtml}</td></tr>
             </table>
           </td></tr>`
        : '';
    const caution = opts.cautionHtml
        ? `<tr><td style="padding:4px 40px 8px;">
             <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${AMBER_TINT};border:1px solid ${AMBER_BORDER};border-radius:12px;">
               <tr><td style="padding:14px 18px;font-size:13px;line-height:1.6;color:${AMBER_INK};">${opts.cautionHtml}</td></tr>
             </table>
           </td></tr>`
        : '';

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(opts.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${BG};font-family:${FONT};-webkit-font-smoothing:antialiased;">
  <div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BG};padding:40px 16px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;">

        <!-- wordmark (official Beverly lockup — falls back to text if not yet deployed) -->
        <tr><td style="padding:0 4px 20px;">
          ${logoUrl()
            ? `<img src="${logoUrl()}" width="120" height="52" alt="Beverly" style="display:block;border:0;outline:none;text-decoration:none;">`
            : `<span style="color:${INK};font-size:18px;font-weight:800;letter-spacing:-0.2px;">Beverly</span>`}
        </td></tr>

        <!-- card -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid ${BORDER};border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(15,23,42,0.04);">
          <tr><td style="padding:36px 40px 4px;">
            <span style="display:block;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:${BRAND_DARK};margin-bottom:10px;">${esc(opts.eyebrow)}</span>
            <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${INK};font-weight:700;">${opts.heading}</h1>
            <div style="font-size:15px;line-height:1.65;color:${INK};">${opts.bodyHtml}</div>
          </td></tr>
          ${highlight}
          ${caution}
          ${cta}
          <tr><td style="padding:28px 40px 32px;">
            <div style="height:1px;background:${BORDER};margin-bottom:20px;"></div>
            <p style="margin:0 0 4px;font-size:13px;color:${MUTED};">— The Beverly Team</p>
            ${opts.footerNote ? `<p style="margin:12px 0 0;font-size:12px;line-height:1.6;color:${FAINT};">${opts.footerNote}</p>` : ''}
          </td></tr>
        </table>

        <!-- footer -->
        <tr><td style="padding:24px 4px 0;">
          <p style="margin:0 0 10px;font-size:12px;line-height:1.6;color:${FAINT};">This is an automated message — replies to this address aren't monitored.</p>
          <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${MUTED};">
            Need help? <a href="mailto:info@acoblighting.com" style="color:${MUTED};text-decoration:underline;">info@acoblighting.com</a>
            &nbsp;&middot;&nbsp; <a href="mailto:infoacob@gmail.com" style="color:${MUTED};text-decoration:underline;">infoacob@gmail.com</a>
          </p>
          <p style="margin:0 0 4px;font-size:12px;line-height:1.6;color:${MUTED};">
            +234 704 920 2634 &nbsp;&middot;&nbsp; +234 803 290 2825
            &nbsp;&middot;&nbsp; <a href="https://www.acoblighting.com" style="color:${MUTED};text-decoration:underline;">www.acoblighting.com</a>
          </p>
          <p style="margin:0;font-size:11px;line-height:1.6;color:${FAINT};">ACOB Lighting Technology Limited &middot; Plot 2, Block 14 Extension, Setraco Gate, Gwarinpa, FCT, Nigeria</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function codeBox(code: string): string {
    return `<span style="display:block;text-align:center;font-size:32px;font-weight:800;letter-spacing:10px;color:${INK};font-family:'SF Mono',SFMono-Regular,Consolas,'Liberation Mono',Menlo,monospace;">${esc(code)}</span>`;
}

export interface EmailContent { subject: string; html: string; text: string }

// ── Welcome ──────────────────────────────────────────────────────────────────

export function welcomeEmail(opts: { fullName: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = `You're in, ${esc(name)}.`;
    const body = `<p>Your Beverly account is live. From here you can fund your wallet, buy electricity tokens in seconds, and keep every transaction in one clear history — no queues, no waiting on anyone.</p>
        <p>If you're new to prepaying this way, it's simple: top up your balance, generate a token, and your meter takes care of the rest.</p>
        <p>Glad to have you with us.</p>`;
    return {
        subject: 'Welcome to Beverly — your account is ready',
        html: layout({
            eyebrow: 'Welcome to Beverly',
            heading,
            preheader: 'Your account is live — fund your wallet and buy your first token in seconds.',
            bodyHtml: body,
        }),
        text: `You're in, ${name}.\n\nYour Beverly account is live. From here you can fund your wallet, buy electricity tokens in seconds, and keep every transaction in one clear history — no queues, no waiting on anyone.\n\nIf you're new to prepaying this way, it's simple: top up your balance, generate a token, and your meter takes care of the rest.\n\nGlad to have you with us.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Email verification ───────────────────────────────────────────────────────

export function verificationEmail(opts: { fullName: string; code: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'Confirm it’s really you';
    const body = `<p>Hi ${esc(name)},</p>
        <p>Enter this code in the app to verify your email address. It's a quick step that keeps your account secure and makes sure receipts, alerts, and account updates actually reach you.</p>`;
    return {
        subject: `${opts.code} — verify your email for Beverly`,
        html: layout({
            eyebrow: 'Verify your email',
            heading,
            preheader: `Your verification code is ${opts.code}. It expires in 15 minutes.`,
            bodyHtml: body,
            highlightHtml: codeBox(opts.code),
            footerNote: 'This code expires in 15 minutes. Didn’t request it? No changes were made — you can safely ignore this email.',
        }),
        text: `Hi ${name},\n\nEnter this code in the app to verify your email address:\n\n${opts.code}\n\nThis code expires in 15 minutes. Didn't request it? No changes were made — you can safely ignore this email.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Password recovery ────────────────────────────────────────────────────────

export function passwordRecoveryEmail(opts: { fullName: string; code: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'Let’s get you back in';
    const body = `<p>Hi ${esc(name)},</p>
        <p>We received a request to reset the password on your Beverly account. Enter the code below to continue — it's valid for the next 15 minutes.</p>`;
    return {
        subject: `${opts.code} — reset your Beverly password`,
        html: layout({
            eyebrow: 'Password reset',
            heading,
            preheader: `Your password reset code is ${opts.code}. It expires in 15 minutes.`,
            bodyHtml: body,
            highlightHtml: codeBox(opts.code),
            cautionHtml: `<strong>Wasn't you?</strong> Someone may have typed your email by mistake. Your password stays unchanged unless this exact code is used — no action needed on your end.`,
        }),
        text: `Hi ${name},\n\nWe received a request to reset the password on your Beverly account. Enter this code to continue:\n\n${opts.code}\n\nThis code expires in 15 minutes.\n\nWasn't you? Someone may have typed your email by mistake — your password stays unchanged unless this exact code is used.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

export function passwordResetLinkEmail(opts: { fullName: string; resetUrl: string; expiresMinutes: number; accountLabel?: string }): EmailContent {
    const name = firstName(opts.fullName);
    const accountLabel = opts.accountLabel?.trim() ? `${opts.accountLabel.trim()} ` : '';
    const heading = `Reset your ${accountLabel}password`;
    const ttlLabel = `${opts.expiresMinutes} minute${opts.expiresMinutes === 1 ? '' : 's'}`;
    const body = `<p>Hi ${esc(name)},</p>
        <p>We received a request to reset your Beverly ${esc(accountLabel)}password. Use the secure link below to choose a new password.</p>`;
    return {
        subject: `Reset your Beverly ${accountLabel}password`,
        html: layout({
            eyebrow: 'Vendor password reset',
            heading,
            preheader: `Your ${accountLabel}password reset link expires in ${ttlLabel}.`,
            bodyHtml: body,
            ctaLabel: 'Reset my password',
            ctaUrl: opts.resetUrl,
            cautionHtml: `<strong>Wasn't you?</strong> Your password stays unchanged unless this one-time link is used. You can safely ignore this email.`,
            footerNote: `This one-time link expires in ${ttlLabel}.`,
        }),
        text: `Hi ${name},\n\nWe received a request to reset your Beverly ${accountLabel}password. Use this secure link to choose a new password:\n\n${opts.resetUrl}\n\nThis one-time link expires in ${ttlLabel}. If you didn't request this, you can safely ignore this email.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Wallet funded ─────────────────────────────────────────────────────────────

export function walletFundedEmail(opts: { fullName: string; amountLabel: string; reference: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'Your wallet just got a top-up';
    const body = `<p>Hi ${esc(name)},</p>
        <p>Good news — your funding came through and your balance is already updated. You're all set to buy tokens whenever you need power.</p>`;
    const highlight = `<span style="display:block;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:4px;">Amount added</span>
        <span style="display:block;font-size:28px;font-weight:800;color:${INK};margin-bottom:10px;">${esc(opts.amountLabel)}</span>
        <span style="display:block;font-size:13px;color:${MUTED};">Reference ${esc(opts.reference)}</span>`;
    return {
        subject: `${opts.amountLabel} added to your Beverly wallet`,
        html: layout({
            eyebrow: 'Wallet funded',
            heading,
            preheader: `${opts.amountLabel} was just added to your Beverly wallet.`,
            bodyHtml: body,
            highlightHtml: highlight,
        }),
        text: `Hi ${name},\n\nGood news — your funding came through and your balance is already updated.\n\nAmount added: ${opts.amountLabel}\nReference: ${opts.reference}\n\nYou're all set to buy tokens whenever you need power.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Payment failed ────────────────────────────────────────────────────────────

export function paymentFailedEmail(opts: { fullName: string; amountLabel: string; reason?: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'That payment didn’t go through';
    const reason = opts.reason ?? 'This can happen for a few reasons — a bank decline, insufficient funds, or a network hiccup along the way.';
    const body = `<p>Hi ${esc(name)},</p>
        <p>We tried to process your <strong>${esc(opts.amountLabel)}</strong> payment, but it didn't complete. ${esc(reason)}</p>
        <p>Nothing was deducted from your wallet. Try again whenever you're ready — and if it keeps happening, just reply and we'll help you sort it out.</p>`;
    return {
        subject: `Action needed — your ${opts.amountLabel} payment didn't complete`,
        html: layout({
            eyebrow: 'Payment',
            heading,
            preheader: `Your ${opts.amountLabel} payment didn't go through. Nothing was deducted.`,
            bodyHtml: body,
        }),
        text: `Hi ${name},\n\nWe tried to process your ${opts.amountLabel} payment, but it didn't complete. ${reason}\n\nNothing was deducted from your wallet. Try again whenever you're ready — and if it keeps happening, just reply and we'll help you sort it out.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── KYC update ────────────────────────────────────────────────────────────────

export function kycUpdateEmail(opts: { fullName: string; tierLabel: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'You’re verified — limits raised';
    const body = `<p>Hi ${esc(name)},</p>
        <p>We've confirmed your identity and unlocked <strong>${esc(opts.tierLabel)}</strong> on your account. That means higher daily funding and purchase limits, so you can power through without hitting a ceiling.</p>`;
    return {
        subject: 'You’re verified — new limits are live on Beverly',
        html: layout({
            eyebrow: 'Identity verified',
            heading,
            preheader: `Your account is now verified to ${opts.tierLabel}.`,
            bodyHtml: body,
        }),
        text: `Hi ${name},\n\nWe've confirmed your identity and unlocked ${opts.tierLabel} on your account. That means higher daily funding and purchase limits, so you can power through without hitting a ceiling.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Dispute update ────────────────────────────────────────────────────────────

export function disputeUpdateEmail(opts: { fullName: string; message: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'An update on your dispute';
    const body = `<p>Hi ${esc(name)},</p>
        <p>${esc(opts.message)}</p>
        <p>Thanks for your patience while we looked into this. If anything still feels off, just reply to this email — we're happy to take another look.</p>`;
    return {
        subject: 'An update on your Beverly dispute',
        html: layout({
            eyebrow: 'Dispute update',
            heading,
            preheader: opts.message,
            bodyHtml: body,
        }),
        text: `Hi ${name},\n\n${opts.message}\n\nThanks for your patience while we looked into this. If anything still feels off, just reply to this email — we're happy to take another look.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Meter order update ────────────────────────────────────────────────────────

export function meterOrderUpdateEmail(opts: { fullName: string; message: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'Your meter order is moving';
    const body = `<p>Hi ${esc(name)},</p>
        <p>${esc(opts.message)}</p>`;
    return {
        subject: 'Update on your Beverly meter order',
        html: layout({
            eyebrow: 'Meter order',
            heading,
            preheader: opts.message,
            bodyHtml: body,
        }),
        text: `Hi ${name},\n\n${opts.message}\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Generic (fallback for unforeseen notification types) ────────────────────

export function genericEmail(opts: { fullName: string; title: string; body: string }): EmailContent {
    const name = firstName(opts.fullName);
    return {
        subject: opts.title,
        html: layout({
            eyebrow: 'Beverly',
            heading: esc(opts.title),
            preheader: opts.body,
            bodyHtml: `<p>Hi ${esc(name)},</p><p>${esc(opts.body)}</p>`,
        }),
        text: `Hi ${name},\n\n${opts.body}\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Admin announcement ────────────────────────────────────────────────────────

export function adminAnnouncementEmail(opts: { name: string; title: string; body: string }): EmailContent {
    const name = firstName(opts.name);
    return {
        subject: opts.title,
        html: layout({
            eyebrow: 'Announcement',
            heading: esc(opts.title),
            preheader: opts.body,
            bodyHtml: `<p>Hi ${esc(name)},</p><p>${esc(opts.body)}</p>`,
        }),
        text: `Hi ${name},\n\n${opts.body}\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Vendor onboarding ─────────────────────────────────────────────────────────

export function vendorOnboardingEmail(opts: {
    contactName: string; legalName: string; loginEmail: string; temporaryPassword: string; loginUrl: string;
}): EmailContent {
    const name = firstName(opts.contactName);
    const heading = `${esc(opts.legalName)} is live on Beverly`;
    const body = `<p>Hi ${esc(name)},</p>
        <p>You're onboarded as a Beverly vendor — which means you can vend electricity tokens, manage funding, and track every transaction from your own portal.</p>
        <p>Sign in with the credentials below. You'll be asked to set a password of your own on first login — the one below is temporary and shown only this once, so keep it safe until then.</p>`;
    const highlight = `<span style="display:block;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Your sign-in details</span>
        <span style="display:block;font-size:14px;color:${INK};margin-bottom:6px;">Email &nbsp;<strong>${esc(opts.loginEmail)}</strong></span>
        <span style="display:block;font-size:14px;color:${INK};">Temporary password &nbsp;<strong style="font-family:'SF Mono',SFMono-Regular,Consolas,monospace;">${esc(opts.temporaryPassword)}</strong></span>`;
    return {
        subject: `Welcome to Beverly — ${opts.legalName} is ready to vend`,
        html: layout({
            eyebrow: 'Vendor account',
            heading,
            preheader: `Your vendor account is ready. Sign in and set your password to get started.`,
            bodyHtml: body,
            highlightHtml: highlight,
            ctaLabel: 'Sign in to the vendor portal',
            ctaUrl: opts.loginUrl,
            footerNote: 'Looking forward to working with you.',
        }),
        text: `Hi ${name},\n\n${opts.legalName} is onboarded as a Beverly vendor. You can now vend electricity tokens, manage funding, and track every transaction from your own portal.\n\nSign-in details:\nEmail: ${opts.loginEmail}\nTemporary password: ${opts.temporaryPassword}\n\nSign in and set your own password: ${opts.loginUrl}\n\nLooking forward to working with you.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Staff invitation ──────────────────────────────────────────────────────────

export function staffInvitationEmail(opts: {
    fullName: string; loginEmail: string; temporaryPassword: string; roleLabel: string; loginUrl: string;
}): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'You’ve been added to Beverly';
    const body = `<p>Hi ${esc(name)},</p>
        <p>An account has been created for you on the Beverly admin portal with <strong>${esc(opts.roleLabel)}</strong> access. Sign in with the credentials below — you'll set your own password on first login.</p>`;
    const highlight = `<span style="display:block;font-size:12px;font-weight:600;color:${MUTED};text-transform:uppercase;letter-spacing:0.04em;margin-bottom:8px;">Your sign-in details</span>
        <span style="display:block;font-size:14px;color:${INK};margin-bottom:6px;">Email &nbsp;<strong>${esc(opts.loginEmail)}</strong></span>
        <span style="display:block;font-size:14px;color:${INK};">Temporary password &nbsp;<strong style="font-family:'SF Mono',SFMono-Regular,Consolas,monospace;">${esc(opts.temporaryPassword)}</strong></span>`;
    return {
        subject: 'Welcome to Beverly — your staff account is ready',
        html: layout({
            eyebrow: 'Team access',
            heading,
            preheader: `Your ${opts.roleLabel} account is ready. Sign in and set your password to get started.`,
            bodyHtml: body,
            highlightHtml: highlight,
            ctaLabel: 'Sign in',
            ctaUrl: opts.loginUrl,
            footerNote: 'Welcome to the team.',
        }),
        text: `Hi ${name},\n\nAn account has been created for you on the Beverly admin portal with ${opts.roleLabel} access.\n\nSign-in details:\nEmail: ${opts.loginEmail}\nTemporary password: ${opts.temporaryPassword}\n\nSign in and set your own password: ${opts.loginUrl}\n\nWelcome to the team.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Role assignment ───────────────────────────────────────────────────────────

export function roleAssignmentEmail(opts: { fullName: string; roleLabel: string }): EmailContent {
    const name = firstName(opts.fullName);
    const heading = 'Your access level has changed';
    const body = `<p>Hi ${esc(name)},</p>
        <p>Your Beverly staff account has been updated to <strong>${esc(opts.roleLabel)}</strong>. This may change what you can see and do across the admin portal — worth a quick look next time you sign in.</p>`;
    return {
        subject: 'Your Beverly staff role has been updated',
        html: layout({
            eyebrow: 'Role updated',
            heading,
            preheader: `Your account role is now ${opts.roleLabel}.`,
            bodyHtml: body,
        }),
        text: `Hi ${name},\n\nYour Beverly staff account has been updated to ${opts.roleLabel}. This may change what you can see and do across the admin portal — worth a quick look next time you sign in.\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}

// ── Station assignment ────────────────────────────────────────────────────────

export function stationAssignmentEmail(opts: { name: string; stationLabel: string; previousStationLabel?: string | null }): EmailContent {
    const name = firstName(opts.name);
    const heading = opts.previousStationLabel ? 'Your station assignment has changed' : 'You’ve been assigned a station';
    const changeLine = opts.previousStationLabel
        ? `Your station assignment has moved from <strong>${esc(opts.previousStationLabel)}</strong> to <strong>${esc(opts.stationLabel)}</strong>.`
        : `You've been assigned to station <strong>${esc(opts.stationLabel)}</strong>.`;
    const changeLinePlain = opts.previousStationLabel
        ? `Your station assignment has moved from ${opts.previousStationLabel} to ${opts.stationLabel}.`
        : `You've been assigned to station ${opts.stationLabel}.`;
    return {
        subject: 'Your Beverly station assignment has changed',
        html: layout({
            eyebrow: 'Station assignment',
            heading,
            preheader: changeLinePlain,
            bodyHtml: `<p>Hi ${esc(name)},</p><p>${changeLine}</p>`,
        }),
        text: `Hi ${name},\n\n${changeLinePlain}\n\n— The Beverly Team\n\nNeed help? info@acoblighting.com · infoacob@gmail.com · +234 704 920 2634 · +234 803 290 2825 · www.acoblighting.com`,
    };
}
