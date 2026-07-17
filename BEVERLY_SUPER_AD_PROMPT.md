# Beverly — Cinematic Feature Reveal ("Super Ad") Build Prompt

> Paste everything below the line into Claude. It is written to be handed over whole, with no
> additional context. It assumes the Beverly repo is the working directory.

---

## ROLE

You are a motion director and front-end engineer building a **cinematic product reveal** for
Beverly — a prepaid-energy CRM and wallet platform operating in Nigeria. Think product-launch
film, not a UI walkthrough. The reference standard is **Higgsfield-grade camera work**: hard,
deliberate camera moves (crash zoom, dolly-zoom, FPV drone push, bullet-time orbit, whip pan,
robo-arm arc, match cut), aggressive cut rhythm, heavy depth of field, motion blur on transit,
and a single unbroken sense of momentum from first frame to last.

You are **not** making a demo video. You are making a **rendered-in-browser film** — real DOM,
real type, real data, real animation — that plays like it was cut in an edit bay.

## DELIVERABLE

A single self-contained file: `beverly-reveal.html`.

- No external network requests. No CDN, no remote fonts, no remote images. Everything inline.
- Vanilla HTML/CSS/JS only. No frameworks, no animation libraries. Use the Web Animations API
  and CSS `@keyframes`. Hand-author the easing.
- Target: **1920×1080, 60fps, ~52 seconds**, letterboxed 2.39:1 inside the frame.
- Scales down to 1280×720 and 390×844 (mobile) without breaking the cut rhythm — on mobile,
  reframe to 9:16 safe areas rather than shrinking type.
- Playback controls: auto-play on load, `Space` to pause/resume, `←`/`→` to scrub by scene,
  `R` to restart. A thin scrubber bar with scene markers pinned to the bottom edge.
- Honor `prefers-reduced-motion: reduce`: replace camera moves and blur with 200ms opacity
  cross-dissolves, keep every scene's dwell time, keep all copy legible. The film must still
  make sense end to end.

## NON-NEGOTIABLE: FACTUAL ACCURACY

Every number, label, route, role name, and feature shown on screen must be real. Beverly is an
operational financial system — a fabricated metric in the reveal is a defect, not a flourish.
Before animating any screen, read the source of truth for it:

- `ARCHITECTURE.md` — canonical architecture. Read first, in full.
- `PRODUCT.md` — brand personality and design principles.
- `src/data/route-manifest.js` — every CRM route, its APIs, columns, actions, and roles.
- `src/styles/tokens.css` — the only legal source of color, type, spacing, radius, motion.
- `src/services/fraud-engine.mjs` — risk tiers and signal weights.
- `src/services/consumption-aggregator.mjs` — the EIH math.
- `apps/admin/src/views/`, `apps/customer/src/views/`, `apps/vendor/src/views/` — portal surfaces.
- `src/components/wallet/`, `src/components/vendor/` — wallet operations UI.

If a fact you want on screen isn't in the repo, **do not invent it** — either find it or cut the
shot. Where a figure must be illustrative (a naira amount, a customer name), use obviously
plausible Nigerian-context values and keep them internally consistent across every scene:
the same vendor, the same meter, the same token follows through the whole film.

### Established facts you may rely on

| Fact | Value |
|---|---|
| Live stations | TUNGA, UMAISHA, OGUFA, KYAKALE, MUSHA |
| Standard tariff | ₦350/kWh |
| Risk tiers | LOW 0–30, MEDIUM 31–60, HIGH 61–80, CRITICAL 81–100 |
| Fraud signals | Divergence, Tamper, Flatline, Gap |
| Consumption truth | `DailyDataMeter.total1` (cumulative odometer; delta it, clamp negatives to 0) |
| Ignored field | `usage1` — never display it |
| Vendor roles | `vendor_user`, `vendor` |
| Finance approval role | `finance-checker` |
| CRM roles | super-admin, operations-manager, account |
| Payments | Paystack |
| Ledger | append-only; corrections are compensating entries |
| Money writes | default disabled; require idempotency keys |

## BRAND

Beverly's product surface is deliberately restrained — `PRODUCT.md` says calm, precise,
accountable, and explicitly rejects ornamental motion. **The ad is the one place that rule
inverts.** The film is dramatic; the product inside the film is not. That contrast *is* the
concept: violent camera, serene interface. The UI never bounces, never sparkles, never
celebrates. It simply resolves — instantly, correctly — while the camera goes hard around it.

Never show the product doing something it wouldn't do. A KPI tile does not pulse. A table does
not stagger in with elastic easing. The drama lives in the camera, the cut, the type, and the
sound — never in the chrome.

**Palette** — pull the literal values from `src/styles/tokens.css`; do not eyeball them:

- Signal green `--bev-color-green-500` `#10b981` → the hero accent. Delivery, success, live state.
- Deep green `--bev-color-green-950` `#022c22` → the void the film lives in.
- Slate `--bev-color-slate-900` `#0f172a` → structural darkness, panel fills.
- Red `--bev-color-red-500` `#ef4444` → risk, tamper, dispute. Used exactly twice in the film.
- Amber `--bev-color-amber-500` `#f59e0b` → pending, held, awaiting approval.
- White `#ffffff` → type and light.

**Type** — display face `Plus Jakarta Sans`, UI face `Inter`, mono face `JetBrains Mono` for
tokens, ledger rows, and IDs. Since no remote fonts are allowed, fall back through
`system-ui, -apple-system, sans-serif` and set tracking manually so the fallback still reads as
deliberate. Title cards: tight tracking, heavy weight, optically centered, never more than four
words. Mono is where the drama actually lands — a 20-digit STS token typing itself out in
`JetBrains Mono` is the single best shot available to you. Use it.

**Grade** — the whole film sits in near-black `#022c22`→`#000` gradients. Green is a light
source, not a fill: it rims edges, bleeds through panel gaps, and pools under floating UI.
Add a fine film grain overlay (SVG `feTurbulence`, ~3% opacity, animated), subtle chromatic
aberration on the hardest camera moves only, and a vignette that tightens during crash zooms.

## THE FILM — SHOT LIST

Total: 52s across 7 acts. Timings are hard. If a scene runs long, cut copy, never cut dwell.

### ACT 0 — COLD OPEN (0:00–0:05)

Black. One mono line types at 30ms/char, centered, small:

```
TUNGA · UMAISHA · OGUFA · KYAKALE · MUSHA
```

Beat. The line collapses to a single point of green light. **Crash zoom into that point** —
600ms, `cubic-bezier(0.85, 0, 0.15, 1)`, scale 1 → 40, motion blur ramping to 12px, the vignette
slamming shut. Cut hard on the white frame.

Title card, 900ms hold, display face, ~180px:

> **BEVERLY**

Under it, 14px, letterspaced 0.4em, slate: `PREPAID ENERGY OPERATIONS`

### ACT 1 — THE GRID (0:05–0:12)

**FPV drone push.** Camera flies through a dark 3D field of meter nodes — five clusters, one per
live station, each cluster's node count proportional to nothing you're making up (label the
clusters by station name only, no counts). Nodes pulse faintly green when they report.

The camera threads *between* two clusters and arrives at the CRM dashboard, which assembles from
the node field itself: nodes fly into place and become the dashboard's alarm panel. Use the real
alarm labels from `src/services/mappers/dashboard-mapper.mjs`:

`No Data Report` · `Current Unbalance` · `Current Reverse` · `Cover Open` · `Terminal Cover Open` ·
`Magnetic Interference` · `Battery Low` · `Relay Open`

Title, lower-third, wipes in on a 200ms mask:

> **ONE GRID. FIVE STATIONS. LIVE.**

### ACT 2 — THE FRAUD ENGINE (0:12–0:21)

The film's most dramatic act. This is Beverly's Energy Intelligence Hub.

**Bullet-time orbit.** Freeze on a single meter's consumption chart mid-air. Camera orbits it
180° over 1.4s while the chart stays frozen, then time resumes. As it resumes, the four risk
signals strike in sequence — each one a hard 80ms cut to a different camera angle, each one
stamping its weight in mono:

| Cut | Signal | Weight | Frame |
|---|---|---|---|
| 1 | `DIVERGENCE` | 40 | Whip pan onto the consumption/recharge divergence gap, red fill flooding the delta |
| 2 | `TAMPER` | 30 | Snap zoom to a `Cover Open` alarm chip, red |
| 3 | `FLATLINE` | 20 | Slow dolly along a dead-flat `total1` line |
| 4 | `GAP` | 10 | Rack focus from a recharge record to the silence after it |

The four weights fly together and **collide** into a score. The score counts up in mono at
~24fps, and as it crosses each threshold the tier label snaps over: `LOW` → `MEDIUM` → `HIGH` →
`CRITICAL` — with the whole frame's grade shifting green → amber → red as it climbs. Land on
`CRITICAL`. Hold 500ms in silence.

> **RISK, SCORED BEFORE THE LOSS.**

This is one of exactly two places red appears. Earn it.

### ACT 3 — THE VENDOR PORTAL (0:21–0:30)

Hard cut to green. Tone resets — this act is fluid, not violent.

**Robo-arm arc** around a vendor's hand-held view. Follow one continuous transaction. Real vendor
surfaces, real order (read `apps/vendor/src/views/`):

1. `Wallet.vue` — balance, held, available. The three states are distinct; label them.
2. `Fund.vue` → funding request submitted with proof. Chip goes **amber**: `PENDING REVIEW`.
3. **Match cut** on the amber chip → the same chip inside admin `Funding.vue`.
4. A `finance-checker` approves. Ledger credit posts. Chip goes **green**.
5. **Whip pan** back to vendor `Vend.vue`. Purchase places a hold — amber again.
6. The STS token generates. **This is the money shot.** The 20-digit token types itself in
   `JetBrains Mono`, digit by digit, 40ms each, each digit landing with a mechanical tick,
   camera pushing in 3% the whole time. On the last digit: delivery confirms, hold **captures**,
   chip goes green, everything settles at once.

Lower third, timed to the capture:

> **HOLD. DELIVER. CAPTURE.**
> `Failed delivery releases the hold. Always.`

That second line matters — it's the trust claim. Hold it long enough to read.

### ACT 4 — THE LEDGER (0:30–0:38)

**Dolly zoom** (Vertigo: camera pushes in, FOV widens) down an infinite append-only ledger. Rows
in mono, receding to a vanishing point. The camera falls through them.

A correction enters. Do **not** mutate a row — Beverly's ledger is append-only. Instead: the
camera stops on the original row, holds it, and a **compensating entry** writes itself beneath.
Both rows stay. Both rows glow. Pull back to reveal the derived balance resolving from the full
column.

> **NOTHING IS OVERWRITTEN.**
> `Corrections are entries. History is immutable.`

Follow with a fast 3-cut montage, 400ms each, on reconciliation surfaces
(`Reconciliation.vue`, `Settlement.vue`, `Disputes.vue`) — Paystack webhook reconciling, a
settlement resolving, a dispute case opening. This is red's second and final appearance, on the
dispute chip, for under 400ms.

### ACT 5 — THREE PORTALS (0:38–0:46)

The reveal proper. **Bullet-time orbit** around three floating panes suspended in the void, each
lit green from below, arranged in depth. Camera arcs across all three in one 4s unbroken move —
no cuts inside this shot. Each pane is a real portal, and as the camera passes it, that pane's
features stamp in as mono lines beside it:

**ADMIN** — `apps/admin/`
```
Vendors · Customers · Wallets · Funding queue · Purchases
Vending monitor · Fraud · Reconciliation · Settlement
Refunds · Disputes · Reports · Audit · Permissions
Meter orders · Feature flags · Developer console
```

**VENDOR** — `apps/vendor/`
```
Wallet · Fund · Vend · Remote send · Receipts
Transactions · Statement · Meter orders · Disputes
```

**CUSTOMER** — `apps/customer/`
```
Wallet · Fund wallet · Buy token · Buy meter · Meters
Onboard meter · Receipts · Transactions · KYC · Disputes
```

Then the camera pulls back further and the CRM itself rises **behind** all three — the operations
spine. Route groups stamp from `src/data/route-manifest.js`: Dashboard · Data Report ·
Token Generate · Prepay Report · System. Roles stamp last, small: `super-admin` ·
`operations-manager` · `account`.

> **THREE PORTALS. ONE LEDGER. ONE TRUTH.**

### ACT 6 — CLOSE (0:46–0:52)

Everything — every pane, every row, every node — **collapses inward** into a single point of
green light. 800ms, hard ease-in, motion blur to 20px, sound sucking out to silence.

Beat of pure black. 400ms. Nothing.

The point re-expands into the wordmark:

> **BEVERLY**

Under it: `PREPAID ENERGY OPERATIONS`

A final mono line fades in, 12px, slate, and holds for 1.5s:

```
beverly.acoblighting.com
```

Fade to black.

## MOTION SPEC

Build these as named CSS custom properties at the top of the file and use them everywhere.
Do not hand-tune easings per-element.

| Move | Duration | Easing |
|---|---|---|
| Crash zoom | 600ms | `cubic-bezier(0.85, 0, 0.15, 1)` |
| Whip pan | 180ms | `cubic-bezier(0.9, 0, 0.1, 1)` + 24px horizontal blur |
| FPV drone push | 2200ms | `cubic-bezier(0.33, 0, 0.15, 1)` |
| Bullet-time orbit | 1400ms | `linear` — orbits must not ease, that's the whole effect |
| Dolly zoom | 1800ms | `cubic-bezier(0.4, 0, 0.2, 1)`, scale and FOV counter-animated |
| Robo-arm arc | 900ms | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Snap zoom | 120ms | `cubic-bezier(0.7, 0, 0.2, 1)` |
| Match cut | 0ms | shared element, identical position/scale across the cut |
| Hard cut | 0ms | no transition — 1-frame black only if the grade shifts |
| UI resolve | 120ms | `cubic-bezier(0.4, 0, 0.2, 1)` — the product's own token, unchanged |

**Rhythm.** Average shot length under 1.4s. Never three cuts in a row on the same axis. Every act
gets exactly one held beat over 500ms — the silence is what makes the speed read as speed. Acts 2
and 6 are the fastest; Acts 3 and 4 breathe.

**Camera grammar.** Use CSS 3D — `perspective` on the stage, `transform-style: preserve-3d`,
`translate3d`/`rotate3d` on a single camera element. Move the camera, not the content. Content
that moves independently of the camera reads as a slideshow, and the entire film dies.

**Depth.** Every scene has foreground, subject, and background moving at different rates.
Foreground elements are blurred and fast. Background is slow and dim. Subject is the only thing
in focus. Rack focus between them by animating `filter: blur()` on layer groups.

## SOUND

Silent by default — autoplay audio is hostile. Add an unmuted toggle in the corner, `M` to
mute/unmute, off on first load.

If sound is on, synthesize it with the Web Audio API (no files, no CDN):

- A low sub drone under everything, pitching up through Act 2.
- Mechanical ticks on each token digit in Act 3 — short, dry, ~2kHz click.
- Impact on each hard cut in Act 2's signal sequence — filtered noise burst, 40ms.
- Total silence in Act 6's black beat. The silence is the point.

## IMPLEMENTATION PITFALLS

These are not hypothetical. Every one of them was hit building this film, and each produced a
bug that looked like a design problem rather than a code problem. Read them before you start.

**One animation per element per property. Not one per moment.**
Every animation needs `fill: 'both'` so scrubbing to any time yields a correct frame. That makes
a second animation on the same element and property actively harmful: before its delay it holds
its *own* first keyframe, and being added later it wins the cascade. So the natural idiom —
"fade in at t1" as one call, "fade out at t2" as another — silently makes the element visible
from t=0. The fix is structural: accumulate keyframes onto a per-element track and fold each
track into a single full-timeline animation at the end. Do this from the start; retrofitting it
means rewriting every act.

**Pin every animated property at both ends of the timeline.**
For any property missing from the first or last keyframe, the browser synthesises an implicit
keyframe from the element's underlying CSS value. A property that stops being mentioned does not
hold — it animates back to its stylesheet value across the rest of the film. A lower-third whose
`clip-path` wipes open at 0:28 and is never mentioned again will spend the next 24 seconds
quietly re-closing. When you commit a track, carry each property's first value into the offset-0
keyframe and its last value into the offset-1 keyframe.

**Camera keyframes overwrite centring.**
Anything positioned with `transform: translate(-50%, -50%)` loses its centring the moment a
keyframe sets `transform` to something else. Every keyframe must carry the full transform list,
including the centring translate. Normalise each element's transform to one function order and
keep it identical across all of that element's keyframes, or the interpolation breaks.

**Stand cameras back down after a move.**
A camera left at `scale(40) blur(12px)` by the last keyframe of its track holds that value for
the rest of the film. With `will-change`, it stays a giant composited layer for 49 seconds and
starves the GPU. Return it to identity once it is off screen. Likewise, put `visibility` on the
act envelopes — `opacity: 0` alone keeps inactive acts composited.

**Never write `currentTime` to every track each frame.**
The obvious transport — pause everything, drive `currentTime` from rAF — costs one style recalc
per track per frame. At ~190 tracks that measured 21–30ms per frame against a 16.7ms budget: it
cannot hold 60fps. Reserve `currentTime` writes for actual seeks. During playback, line every
track up against one wall clock via `startTime` and let them run natively on the compositor;
the frame loop should only read the clock and update counters.

**Verify state, not just pixels.**
Screenshots are unreliable when the preview pane is backgrounded (rAF throttles to zero and the
page never paints). Expose a debug handle (`window.__reveal.seek(t)`) so the timeline can be
driven to an exact frame, then assert on computed styles and geometry. Most of the bugs above
were found by reading `getComputedStyle` at a seeked time, not by looking at the film.

**Sweep for the whole bug class, not the instance.**
When you find one drifting property, enumerate `document.getAnimations()` and check that every
property appears in both the first and last keyframe of every track. Fixing the one you saw
leaves the rest.

## ACCEPTANCE CRITERIA

Do not consider this done until every line is true:

- [ ] Runs from `file://` with the network disabled. Zero requests in DevTools.
- [ ] Holds 60fps through Acts 2 and 6 on a mid-range laptop. Profile it; if it drops, cut layers
      until it doesn't. Animate `transform`, `opacity` and `filter` by default. `perspective`
      (the dolly zoom), `clip-path` (the wipes), stepped `width` (the typewriter) and
      `box-shadow` (two ledger rows) are permitted where the shot requires them — they are
      bounded, deliberate exceptions, not licence to animate layout generally.
- [ ] No element has two animations touching the same property. Assert it:
      every property appears in both the first and last keyframe of every track.
- [ ] Every station name, role, route, feature name, signal weight, and risk tier is traceable to
      a file in this repo. No invented metrics anywhere on screen.
- [ ] The naira figures, vendor name, meter ID, and token are consistent across all seven acts.
- [ ] Red appears exactly twice: Act 2's risk escalation, Act 4's dispute chip.
- [ ] The product UI never uses celebratory motion. No bounce, no elastic, no sparkle, no
      confetti. Check every keyframe.
- [ ] `prefers-reduced-motion: reduce` produces a film that is still coherent and still 52s.
- [ ] Legible at 1280×720 and reframed — not shrunk — at 390×844.
- [ ] `Space`, `←`, `→`, `R`, `M` all work. The scrubber seeks accurately to scene starts.
- [ ] Text contrast passes WCAG AA against its actual backdrop, including mid-transition frames.

## PROCESS

1. Read `ARCHITECTURE.md`, `PRODUCT.md`, `src/data/route-manifest.js`, `src/styles/tokens.css`,
   and `src/services/fraud-engine.mjs` before writing a line.
2. Build the camera rig and scene timeline first — an empty film with correct timing and correct
   camera moves. Verify the rhythm reads before adding a single pixel of UI.
3. Then build each act's content in order, verifying in the browser after each act.
4. Profile. Cut anything that costs frames.
5. Screenshot the peak frame of each act and show them.

Do not ask which act to start with. Start at Act 0 and build forward.
