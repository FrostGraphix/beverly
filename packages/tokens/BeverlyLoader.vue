<script setup lang="ts">
withDefaults(defineProps<{
  label?: string;
}>(), {
  label: 'Verifying session',
});
</script>

<template>
  <div class="bw-app-loading" role="status" :aria-label="label">
    <div class="beverly-loader">
      <span class="beverly-loader-halo" aria-hidden="true"></span>
      <span class="beverly-loader-spin-ring" aria-hidden="true"></span>
      <div class="beverly-loader-sparks" aria-hidden="true">
        <span class="beverly-loader-spark beverly-loader-spark--1"></span>
        <span class="beverly-loader-spark beverly-loader-spark--2"></span>
        <span class="beverly-loader-spark beverly-loader-spark--3"></span>
      </div>
      <div class="beverly-loader-mark-wrap">
        <img class="beverly-loader-mark-img beverly-loader-mark-img--dark" src="/brand/beverly-mark-light.png" alt="Beverly" />
        <img class="beverly-loader-mark-img beverly-loader-mark-img--light" src="/brand/beverly-mark.png" alt="Beverly" />
        <span class="beverly-loader-shine" aria-hidden="true"></span>
      </div>
    </div>
    <p class="bw-app-loading-text">
      {{ label }}<span class="beverly-loader-dots" aria-hidden="true"><span>.</span><span>.</span><span>.</span></span>
    </p>
  </div>
</template>

<style scoped>
/* Beverly session/role loading screen — single shared implementation for
   every portal (root CRM, admin, customer, vendor). Do not fork this. */
.bw-app-loading {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1.25rem;
  background: var(--color-surface-page, var(--bg, #0a0f0a));
  z-index: 9999;
}

.beverly-loader {
  position: relative;
  width: 140px;
  height: 160px;
  display: grid;
  place-items: center;
}

.beverly-loader-mark-wrap {
  position: relative;
  z-index: 2;
  width: 96px;
  animation: beverly-mark-enter 0.25s ease-out both,
             beverly-body-float 3.2s ease-in-out 0.25s infinite;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.4));
}

.beverly-loader-mark-img {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: contain;
}
.beverly-loader-mark-img--light { display: none; }
[data-theme="light"] .beverly-loader-mark-img--dark { display: none; }
[data-theme="light"] .beverly-loader-mark-img--light { display: block; }

/* Diagonal shine sweep, masked to the logo's own alpha so it only ever
   lights up real pixels of the actual mark — never a fabricated shape. */
.beverly-loader-shine {
  position: absolute;
  inset: 0;
  background: linear-gradient(115deg, transparent 35%, rgba(255, 255, 255, 0.9) 50%, transparent 65%);
  background-size: 250% 250%;
  background-position: -120% -120%;
  -webkit-mask-image: var(--brand-mark-url, url("/brand/beverly-mark-light.png"));
  mask-image: var(--brand-mark-url, url("/brand/beverly-mark-light.png"));
  -webkit-mask-size: contain;
  mask-size: contain;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  mix-blend-mode: overlay;
  animation: beverly-shine-sweep 2.6s ease-in-out 0.3s infinite;
  pointer-events: none;
}

/* Ambient glow breathing behind the mark.
   Uses beverly-opacity-fade (opacity only) so it never conflicts with
   beverly-halo-pulse which animates transform:scale. */
.beverly-loader-halo {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: radial-gradient(circle, rgba(34, 197, 94, 0.32) 0%, rgba(34, 197, 94, 0.08) 45%, transparent 70%);
  animation: beverly-opacity-fade 0.25s ease-out both, beverly-halo-pulse 2.6s ease-in-out 0.25s infinite;
}

/* Rotating loading ring framing the logo.
   Uses beverly-opacity-fade (opacity only) so it never conflicts with
   beverly-ring-spin which animates transform:rotate. */
.beverly-loader-spin-ring {
  position: absolute;
  width: 128px;
  height: 128px;
  border-radius: 50%;
  padding: 2px;
  background: conic-gradient(from 0deg, transparent 0deg, rgba(74, 222, 128, 0.9) 90deg, transparent 200deg);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  animation: beverly-opacity-fade 0.25s ease-out both, beverly-ring-spin 1.8s linear 0.25s infinite;
}

/* Orbiting spark particles */
.beverly-loader-sparks {
  position: absolute;
  inset: 0;
}

.beverly-loader-spark {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 5px;
  height: 5px;
  margin: -2.5px 0 0 -2.5px;
  border-radius: 50%;
  background: #86efac;
  box-shadow: 0 0 8px 2px rgba(134, 239, 172, 0.75);
  animation: beverly-spark-orbit 2.6s linear infinite;
}

.beverly-loader-spark--1 { animation-delay: 0s; background: #86efac; }
.beverly-loader-spark--2 { animation-delay: -0.87s; background: #4ade80; }
.beverly-loader-spark--3 { animation-delay: -1.73s; background: #bbf7d0; }

.bw-app-loading-text {
  font-size: 0.875rem;
  color: var(--color-text-muted, var(--text-muted, rgba(255, 255, 255, 0.45)));
  letter-spacing: 0.02em;
  display: inline-flex;
  align-items: baseline;
}

.beverly-loader-dots span {
  display: inline-block;
  opacity: 0.2;
  animation: beverly-dot-pulse 1.4s ease-in-out infinite;
}

.beverly-loader-dots span:nth-child(1) { animation-delay: 0s; }
.beverly-loader-dots span:nth-child(2) { animation-delay: 0.2s; }
.beverly-loader-dots span:nth-child(3) { animation-delay: 0.4s; }

/* Opacity-only entrance — does NOT touch transform, so the
   parallel beverly-body-float animation can own transform
   without any conflict or override. */
@keyframes beverly-mark-enter {
  from { opacity: 0; }
  to   { opacity: 1; }
}

/* Shared opacity-only fade used by the ring and halo so they
   can coexist cleanly with their transform-based animations. */
@keyframes beverly-opacity-fade {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes beverly-body-float {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-5px) rotate(-1deg); }
}

@keyframes beverly-shine-sweep {
  0% { background-position: -120% -120%; }
  55%, 100% { background-position: 120% 120%; }
}

@keyframes beverly-halo-pulse {
  0%, 100% { transform: scale(0.9); opacity: 0.7; }
  50% { transform: scale(1.08); opacity: 1; }
}

@keyframes beverly-ring-spin {
  to { transform: rotate(360deg); }
}

@keyframes beverly-spark-orbit {
  from { transform: rotate(0deg) translateX(64px) rotate(0deg); }
  to { transform: rotate(360deg) translateX(64px) rotate(-360deg); }
}

@keyframes beverly-dot-pulse {
  0%, 60%, 100% { opacity: 0.2; transform: translateY(0); }
  30% { opacity: 1; transform: translateY(-2px); }
}

@media (prefers-reduced-motion: reduce) {
  .beverly-loader-mark-wrap,
  .beverly-loader-shine,
  .beverly-loader-halo,
  .beverly-loader-spin-ring,
  .beverly-loader-spark,
  .beverly-loader-dots span {
    animation: none !important;
  }
  .beverly-loader-mark-wrap { opacity: 1; }
  .beverly-loader-shine { display: none; }
}
</style>
