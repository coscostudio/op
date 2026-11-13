# Outside Perspective — Claude Code Guidance

This repo builds custom JavaScript/TypeScript features for the **Outside Perspective** Webflow site.

- **Webflow site:** Outside Perspective
- **Staging domain:** https://op-web-329358.webflow.io/
- **Stack:** TypeScript + esbuild, bundled and served to Webflow via `<script>` tag

The UI, DOM structure, and responsive CSS live entirely in Webflow. This repo handles complex logic only.

---

## Core Rules

### 1. Fix Issues at Source in Webflow First
If an issue is layout, styling, visibility, or HTML structure — do **not** write JavaScript workarounds here. Instead, tell the user what to change natively in Webflow (settings to click, HTML to modify in the builder).

### 2. Handle CSS Globally in Webflow
Provide base CSS directly so the user can paste it into the `.global-styles` custom code embed in Webflow. Do **not** use JS inline styles (`element.style.width = '100%'`) for static layout. Only use JS for styling when it strictly requires dynamic calculation (e.g. scroll progress interpolation) that CSS cannot handle.

### 3. Keep Repo Code Focused on Logic
This repo is for: complex logic, data integrations, state management, and advanced interactivity (GSAP animations, hls.js streaming, Lenis/smooothy scrolling). Leave HTML structure and responsive CSS to Webflow.

---

## Dev Workflow

```bash
pnpm dev      # Build + local server at http://localhost:3000 with live reload
pnpm build    # Production build → dist/
pnpm lint     # ESLint + Prettier check
pnpm check    # TypeScript type check (no emit)
```

During development, load scripts in Webflow via:
```html
<script defer src="http://localhost:3000/index.js"></script>
```

For production, point to the built `dist/index.js` hosted wherever the project deploys.

---

## Project Structure

```
src/
  index.ts                    # Orchestrator — Webflow.push, patchMainWrapperCSS, barba.init + global hooks
  features/
    barbaTransitions.ts       # Barba transition definition (fade leave/enter/once, updateBodyTheme, patchMainWrapperCSS)
    barbaViews.ts             # Barba view lifecycle hooks for all namespaces (home, about, work, cases)
    loopSlider.ts             # Infinite scroll slider with Lenis smooth scroll, scale/blur focus FX
    videoPlayer.ts            # HLS.js video player for .home-project-card elements
    nav.ts                    # Nav w--current state sync after barba page transitions
  utils/
    greet.ts                  # Console greeting with last publish date (Finsweet ts-utils)
bin/
  build.js                    # esbuild config (entry points, dev server, live reload)
  dev-tunnel.js               # Dev tunnel helper
  live-reload.js              # Live reload injection for dev
dist/                         # Production build output (gitignored)
```

### Path Alias
`$utils/*` → `src/utils/*`

---

## Key Features

### Barba.js page transitions (`src/features/barbaTransitions.ts`, `src/features/barbaViews.ts`, `src/index.ts`)

**Architecture:** `index.ts` is the orchestrator only. `barbaTransitions.ts` owns the generic fade transition. `barbaViews.ts` owns all namespace-specific lifecycle hooks.

**Transition (`barbaTransitions.ts`):**
- Sequential (non-sync): leave (0.35s) completes before enter (0.4s) — old container removed before `beforeEnter` fires
- `updateBodyTheme(namespace)` adds/removes `.dark` combo class on `body` during `beforeEnter` (screen is blank — no flash). Currently: `about` → `.dark`, all others → light
- `patchMainWrapperCSS()` strips `display:none` or `opacity:0 !important` Webflow injects on `.main-wrapper` — called once on init
- Persistent nav (`.logo-container`, `.nav`, `.nav-wrapper-mobile`) revealed once on hard load via `once` hook
- `gsap.set(container, { opacity: 0 })` in `beforeEnter` guarantees the container is hidden regardless of whether the CSS rule loaded

**Views (`barbaViews.ts`) — namespaces:**
- `home`: destroys slider on leave; inits slider + videos in `beforeEnter` (with `data-loop-slider-snap` for correct initial blur state); calls `remeasureLoopSlider()` in `afterEnter` via rAF to snap video blur after layout settles; controls `.home-blurb` opacity directly with GSAP (see below)
- `about`: no additional logic — theme handled by transition
- `work`: hides `.worklist-item` elements in `beforeEnter`, staggers them in (`opacity`, `y: 16→0`, 0.07s stagger) in `afterEnter`
- `cases`: stub for future case study template page

**`.home-blurb` special handling:**
`.home-blurb` is `position:fixed` + `mix-blend-mode:difference` + `transition: opacity 0.2s`. Animating the parent container's opacity creates a compositing stacking context — the blend mode only resolves globally when the parent reaches `opacity:1`, causing the element to visually "pop". Fix: GSAP sets it to `opacity:0` in `beforeEnter` and fades it in independently in `afterEnter` after the container is at `opacity:1`.

**Required CSS in Webflow `.global-styles` embed:**
```css
[data-barba="container"] { opacity: 0; }
.main-wrapper { opacity: 0; }
.logo-container, .nav, .nav-wrapper-mobile { opacity: 0; }
```
`[data-barba="container"]` ensures the incoming container is invisible the moment barba inserts it into the DOM (before any JS hooks run). Without it, new page content flashes in during the leave fade.

**Status bar / page background (nav.ts `syncChromeTheme`):** sets `html[data-chrome="dark"|"light"]` from the nav's own state — `cases`: dark while the logo is light over the hero, light once the logo switches to primary (`isActiveBg`); `about`: always dark; everything else light. Enabled via `enableChromeThemeSync()` at `waitForIntroFadeOut()` (until then head CSS `html:not([data-chrome])` keeps body + intro dark). `.global-styles` maps the attribute to html/body `background-color` (0.62s `power3.in` transition to match the intro fade). In iOS Safari 26+ this only shows at scroll position 0 and in overscroll bounce areas — once scrolled, the status bar shows the page content underneath.

**Pages must set** `data-barba-namespace` on their barba container: `home`, `about`, `work`, `cases`

### homeFanWheel (`src/features/homeFanWheel.ts`)
three.js "fan wheel" hero on the home page. In `section` layout (content below the hero), scroll input is split between the page and the wheel:
- **Scrolling down always moves the page** (wheel, trackpad, touch). Scrolling up (only at `scrollY ≈ 0`), left or right spins the wheel, as do pointer/touch circular drags. When the page is scrolled, vertical input is never intercepted.
- Wheel mode is locked per gesture (`CONFIG.wheelGestureGapMs`), so trackpad momentum from a page scroll that reaches the top keeps scrolling the page rather than grabbing the wheel.
- Touch: `.home-fan-wheel__interaction` is `touch-action: pan-y` (native scroll by default). The first move of a touch decides ownership. Finger-up, or any vertical move once scrolled, stays native. A sideways start, or finger-down at the top, is claimed by the wheel via a non-passive `touchmove` `preventDefault`.
- Featured slider: only horizontal input navigates it (sideways wheel/trackpad scrolls, horizontal drags), at any scroll position. Horizontal wheel events are always claimed so the ends don't trigger browser back/forward. Vertical wheel and touch input always scroll the page. (Locked layout keeps the old any-axis wheel behavior.)
- `prefers-reduced-motion`: wheel scroll is never captured (drags still spin). `locked` layout keeps capturing all wheel input (nothing to scroll to).
- No global smooth-scroll lib; page scroll is native.

### workView (`src/features/workView.ts`)
Manages the three list/grid UI modes on the Work page.
- Handles transitions between `list`, `list-expanded`, and `grid` views by cross-fading `.component-worklist` and `.component-workgrid`.
- Enforces strict tween cancellation using `gsap.killTweensOf()` and `overwrite: 'auto'` on all visibility animations to prevent conflicting GSAP states during rapid UI mode toggles or item hovers.
- Provides a fixed, mouse-following custom cursor card for the `list` view using `gsap.quickTo()`.

### nav (`src/features/nav.ts`)
Refreshes `w--current` on all nav `<a>` links after each barba transition by comparing `href` pathname to the current URL. Webflow only sets this class on hard load — this keeps active states correct during SPA navigation.

`ensureNavVisible()` is a no-op while `isIntroActive()` (introSequence): the intro overlay is transparent, so scroll/resize updates during the intro (scroll restoration, iOS toolbar resizes on reload) must not reveal the nav — the barba `once` hook fades it in after the intro.

### loopSlider (`src/features/loopSlider.ts`)
Infinite-scroll slider driven by Lenis smooth scroll. Supports:
- CSS class selectors with `data-loop-slider="*"` attribute overrides for flexible Webflow targeting
- Per-slide scale + blur + opacity focus effects based on viewport visibility
- Active slide detail sync (title, subtitle, services list) to `.activeitem-*` elements in the DOM
- `data-loop-slider-snap` body attribute to snap to targets on initial load
- Respects `prefers-reduced-motion`
- Exposes `initLoopSlider`, `destroyLoopSlider`, `remeasureLoopSlider` for barba lifecycle hooks

**Webflow selectors used:**
- Root: `.loop-slider-wrapper`, `.slider-section`
- Items: `.slide`, `.slide-w`
- Content: `.home-project-card`
- Active title target: `.list-title-normal`, `.list-title-super`
- Active services: `.activeitem-services-list`

### caseHeroSound (`src/features/caseHeroSound.ts`)
Mute/unmute switch for case study hero videos (`cases` namespace), per Figma "sound-toggle". Built in the Webflow case template; JS only wires state.
- Toggle is looked up inside the hero, then in the surrounding `.section_case-header` (Webflow currently wraps it in `.case-sound-toggle-wrapper` — absolute, `100svh`, pointer-events none — so it sits above iOS Safari's floating toolbar).
- Mobile hero sizing (Webflow, small breakpoint): `.component-case-header-top` is `calc(100lvh + 4rem)`. In iOS 26/27 Safari the layout viewport never extends under the status bar or the floating toolbar (`viewport-fit=cover` has no effect, safe-area insets read 0); there's a ~58px strip below `100lvh` on every tested iPhone, so the hero overshoots it. iOS Safari 26+ never paints `position: fixed` content in the strip under its floating toolbar (only in-flow/absolute content), so the intro overlay and its blurred video layer are `position: absolute` on all screens, pinned at the current scroll position (scroll is locked during the intro; re-pinned on resize/scroll) — see `prepareIntroOverlay`. Phones and touch tablets (`pointer: coarse` or ≤767px) also overscan it (`100dvh + 14rem`, centred); desktop keeps an exact viewport-sized box.
- Markup inside `.component-case-header-top`: `.case-sound-toggle[data-video-sound="toggle"]` > `.case-sound-indicator[data-video-sound="indicator"]` (sliding active bg, absolute, behind) + two `.case-sound-btn` with `data-video-sound="mute"` / `"unmute"`, each holding a `.case-sound-icon` SVG embed (stroke `currentColor`).
- Indicator is moved with GSAP `x` (travel = unmute.offsetLeft - mute.offsetLeft). Tap a side, drag the indicator (snaps to nearest side), or Enter/Space/arrow keys.
- JS classes: wrapper `.is-available` (video confirmed to have audio via `watchVideoAudio`), `.is-sound-on`, `.is-dragging`; `.is-active` on the button matching the state.
- Preference persists for the session in `sessionStorage['op:video-sound']`. Restored on the next case video with audio (barba nav or reload) after `waitForIntroFadeOut()`: probes autoplay without touching the video (`getAutoplayPolicy` in Firefox; otherwise a throwaway AudioContext — Chrome creates it 'suspended' and flips to 'running' a beat later only if allowed, so wait for `statechange` up to 400ms). If allowed: unmute at volume 0, `play()`, fade up 0.6s; then watch 1s for a browser-initiated `pause` (Chrome/Safari let `play()` resolve, then pause a disallowed unmuted video → frozen frame) and fall back to muted playback. If blocked: stay muted, keep the pref. Never unmutes on unrelated clicks. Clicks fade in 0.35s / out 0.3s. Don't gate on `navigator.userActivation.hasBeenActive` (false after a same-origin reload even when Chrome allows sound).
- `.global-styles` hides the toggle until `.is-available` and sets `touch-action: pan-y` + `user-select: none` for dragging.

### caseHeroOverlay (`src/features/caseHeroOverlay.ts`)
iOS/iPadOS Safari 26+ tints the status bar from fixed/sticky elements touching the top edge, so the sticky case-hero title block (`.case-hero-overlay-sticky`) turned the otherwise see-through status bar opaque once the end of the hero pushed it up to the edge. While being pushed, a sticky element moves 1:1 with the page, so 32px into the push (well clear of the edge) it's switched to `position: relative` at the identical spot and then scrolls natively under the see-through status bar; scrolling back up it's switched back to sticky 16px before its stuck position (both hand-offs are inside the push, so there's no visual jump). Re-measures on resize. Init/destroy in the `cases` view.

### videoPlayer (`src/features/videoPlayer.ts`)
Autoplaying page videos (`initPageVideoPlayers`) buffer immediately but only start on `waitForIntroFadeOut()` (introSequence) — on a hard load they begin as the intro overlay starts fading; on barba navs the promise is already resolved. `waitForIntro()` by contrast resolves when the overlay is fully gone.
Initialises HLS.js (or native HLS on Safari) for `video.project-media` elements inside `.home-project-card`. Falls back to standard `<video>` for non-HLS sources. Reads URL from `data-src` or `src`.

---

## Dependencies

| Package | Purpose |
|---|---|
| `@barba/core` | Client-side page transitions (SPA navigation) |
| `gsap` | GSAP animations — crossfade transitions, opacity/position tweens |
| `hls.js` | HLS video streaming |
| `lenis` | Smooth scroll for loopSlider |
| `smooothy` | Smooth scroll (available as alternative) |
| `@finsweet/ts-utils` | Webflow utilities (publish date, etc.) |

---

## Commits
Do **not** add Claude or Anthropic as a co-author on any commits.
