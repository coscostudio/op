import gsap from 'gsap';
import Hls from 'hls.js';

// ── SVG path index map (viewBox 0 0 221 29, 20 flat paths) ──────────────────
// [0]=O  [1-6]=utside  [7]=(  [8]=P  [9-18]=erspective  [19]=)
//
// Bounding boxes (SVG user units, measured from live DOM):
//   O:           x 0–26.13
//   utside:      x 27.35–121.70
//   (:           x 124.81–129.57
//   P:           x 130.21–139.92
//   erspective:  x 139.61–216.59   (paths 9-18 only)
//   ):           x 216.03–220.78   (path 19 — lives in its own group)
//   SVG center:  110.5
//
// Icon centering: "O(P)" centred at SVG mid-point
//   icon width = O(26.13) + gap(2) + ((4.77) + gap(0.64) + P(9.72) = 43.26
//   O left  = 110.5 − 43.26/2 = 88.87  →  O_TX   = +88.87
//   ( left  = 88.87 + 26.13 + 2 = 117.0 → PAREN_TX = 117.0 − 124.81 = −7.81
//   ) after P (icon): P right in icon = 132.11; ) left = 132.61
//                      ) original left = 216.03  → CLOSE_TX = 132.61 − 216.03 = −83.42
const O_TX = 88.87;
const PAREN_TX = -7.81;
const CLOSE_TX = -83.42;

const O_RIGHT = 26.13;
const UTSIDE_RIGHT = 121.7;
const P_RIGHT = 139.92;
const ERSP_RIGHT = 216.59; // erspective only (paths 9-18); ) lives in gClose

const UTSIDE_CLIP_X_ICON = O_TX + O_RIGHT; // 115.00 — O's right edge in icon mode
const UTSIDE_CLIP_W_FINAL = UTSIDE_RIGHT - O_RIGHT; // 95.57
const ERSP_CLIP_X = P_RIGHT; // 139.92
const ERSP_CLIP_W_FINAL = ERSP_RIGHT - P_RIGHT; // 76.67

const PRIMARY_ROW = 2; // centre row of 5 — stays put during grid expansion

let activeTl: gsap.core.Timeline | null = null;
let activeHls: Hls | null = null;
let _introActive = false;
let _introResolve: (() => void) | null = null;
let _introPromise: Promise<void> = Promise.resolve();

// Resolves when the overlay is fully gone — page entrance animations wait on this
export function waitForIntro(): Promise<void> {
  return _introPromise;
}

// ── SVG restructure ──────────────────────────────────────────────────────────
// 5 groups: gO | gUtside (clipped) | gParen | gErsp (clipped) | gClose
function restructureLogo(svg: SVGSVGElement): {
  gO: SVGGElement;
  gParen: SVGGElement;
  gClose: SVGGElement;
  utsideRect: SVGRectElement;
  erspRect: SVGRectElement;
} {
  const paths = Array.from(svg.querySelectorAll<SVGPathElement>('path'));
  const ns = 'http://www.w3.org/2000/svg';

  const gO = document.createElementNS(ns, 'g') as SVGGElement;
  const gUtside = document.createElementNS(ns, 'g') as SVGGElement;
  const gParen = document.createElementNS(ns, 'g') as SVGGElement;
  const gErsp = document.createElementNS(ns, 'g') as SVGGElement;
  const gClose = document.createElementNS(ns, 'g') as SVGGElement;

  const cpUtside = document.createElementNS(ns, 'clipPath');
  cpUtside.id = 'op-cp-utside';
  cpUtside.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const utsideRect = document.createElementNS(ns, 'rect') as SVGRectElement;
  utsideRect.setAttribute('x', String(UTSIDE_CLIP_X_ICON));
  utsideRect.setAttribute('y', '-2');
  utsideRect.setAttribute('width', '0');
  utsideRect.setAttribute('height', '33');
  cpUtside.appendChild(utsideRect);

  const cpErsp = document.createElementNS(ns, 'clipPath');
  cpErsp.id = 'op-cp-ersp';
  cpErsp.setAttribute('clipPathUnits', 'userSpaceOnUse');
  const erspRect = document.createElementNS(ns, 'rect') as SVGRectElement;
  erspRect.setAttribute('x', String(ERSP_CLIP_X));
  erspRect.setAttribute('y', '-2');
  erspRect.setAttribute('width', '0');
  erspRect.setAttribute('height', '33');
  cpErsp.appendChild(erspRect);

  const defs = document.createElementNS(ns, 'defs');
  defs.appendChild(cpUtside);
  defs.appendChild(cpErsp);

  gUtside.setAttribute('clip-path', 'url(#op-cp-utside)');
  gErsp.setAttribute('clip-path', 'url(#op-cp-ersp)');

  gO.appendChild(paths[0]);
  for (let i = 1; i <= 6; i++) gUtside.appendChild(paths[i]);
  for (let i = 7; i <= 8; i++) gParen.appendChild(paths[i]);
  for (let i = 9; i <= 18; i++) gErsp.appendChild(paths[i]);
  gClose.appendChild(paths[19]);

  svg.innerHTML = '';
  svg.appendChild(defs);
  svg.appendChild(gO);
  svg.appendChild(gUtside);
  svg.appendChild(gParen);
  svg.appendChild(gErsp);
  svg.appendChild(gClose);

  return { gO, gParen, gClose, utsideRect, erspRect };
}

function attachVideo(videoEl: HTMLVideoElement, src: string): void {
  if (Hls.isSupported() && src.includes('.m3u8')) {
    activeHls = new Hls({ startPosition: 0, maxBufferLength: 30 });
    activeHls.loadSource(src);
    activeHls.attachMedia(videoEl);
    activeHls.on(Hls.Events.MANIFEST_PARSED, () => {
      videoEl.play().catch(() => {});
    });
    activeHls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) activeHls?.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) activeHls?.recoverMediaError();
      }
    });
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = src;
    videoEl.addEventListener('loadedmetadata', () => videoEl.play().catch(() => {}), {
      once: true,
    });
  }
}

function cleanup(introEl: HTMLElement): void {
  activeTl = null;
  activeHls?.destroy();
  activeHls = null;
  gsap.set(introEl, { display: 'none' });

  // Fire after overlay is fully gone so page content starts from blank
  _introActive = false;
  _introResolve?.();
  _introResolve = null;
}

function runTimeline(
  introEl: HTMLElement,
  videoEl: HTMLVideoElement,
  videoWrapEl: HTMLElement,
  logoEl: HTMLElement,
  gO: SVGGElement,
  gParen: SVGGElement,
  gClose: SVGGElement,
  utsideRect: SVGRectElement,
  erspRect: SVGRectElement,
  rows: HTMLElement[],
  primaryWords: HTMLElement[],
  wrapperH: number
): void {
  const tl = gsap.timeline({ onComplete: () => cleanup(introEl) });
  activeTl = tl;

  // ── Timing constants ───────────────────────────────────────────────────────
  const REVEAL_T = 0.5; // icon → wordmark starts
  const REVEAL_DUR = 0.7;
  const LOGO_CUT = REVEAL_T + REVEAL_DUR + 0.5; // 1.7 — instant logo cut
  const STAGGER = 0.5;
  const EXPAND_T = LOGO_CUT + (primaryWords.length - 1) * STAGGER + STAGGER; // 1.7 + 1.5 + 0.5 = 3.7
  const EXPAND_DUR = 0.8;
  const FADE_T = EXPAND_T + EXPAND_DUR; // 4.5
  const FADE_DUR = 0.7;

  // ── Video: unblur over the full active intro duration ──────────────────────
  tl.to(videoEl, { filter: 'blur(0px)', duration: FADE_T, ease: 'power1.inOut' }, 0);
  // Slow push-in during grid expand + exit
  tl.to(videoWrapEl, { scale: 1.35, duration: FADE_DUR + 1.5, ease: 'power2.out' }, EXPAND_T - 0.5);

  // ── Logo: icon → wordmark ──────────────────────────────────────────────────
  // O slides left, (P) slides right a touch, ) slides far right ("pushed" by erspective),
  // utside clip grows right, erspective clip grows right.
  tl.to(gO, { x: 0, duration: REVEAL_DUR, ease: 'power2.out' }, REVEAL_T);
  tl.to(gParen, { x: 0, duration: REVEAL_DUR, ease: 'power2.out' }, REVEAL_T);
  tl.to(gClose, { x: 0, duration: REVEAL_DUR, ease: 'power2.out' }, REVEAL_T);
  tl.to(
    utsideRect,
    { attr: { x: O_RIGHT, width: UTSIDE_CLIP_W_FINAL }, duration: REVEAL_DUR, ease: 'power2.out' },
    REVEAL_T
  );
  tl.to(
    erspRect,
    { attr: { width: ERSP_CLIP_W_FINAL }, duration: REVEAL_DUR, ease: 'power2.out' },
    REVEAL_T
  );

  // ── Logo: instant cut — no fade ────────────────────────────────────────────
  tl.set(logoEl, { opacity: 0 }, LOGO_CUT);

  // ── Tagline: primary row words snap in one at a time (no fade) ────────────
  primaryWords.forEach((word, i) => {
    tl.set(word, { opacity: 1 }, LOGO_CUT + i * STAGGER);
  });

  // ── Tagline: other rows fade in + ALL rows slide to natural flex positions ─
  const otherRows = rows.filter((_, i) => i !== PRIMARY_ROW);
  tl.to(otherRows, { opacity: 1, duration: 0.4, ease: 'power2.out' }, EXPAND_T);
  tl.to(rows, { y: 0, duration: EXPAND_DUR, ease: 'power2.inOut', stagger: 0.05 }, EXPAND_T);

  // ── Exit: overlay fades + rows continue past viewport edges ───────────────
  // Rows above centre slide up; rows below slide down — feels like one motion.
  rows.forEach((row, i) => {
    const exitY = i < PRIMARY_ROW ? -wrapperH : i > PRIMARY_ROW ? wrapperH : 0;
    tl.to(row, { y: exitY, duration: FADE_DUR, ease: 'power2.in' }, FADE_T);
  });
  tl.to(introEl, { opacity: 0, duration: FADE_DUR, ease: 'power2.in' }, FADE_T);
}

export function initIntroSequence(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const introEl = document.querySelector<HTMLElement>('.intro');
  if (!introEl) return;

  const svg = introEl.querySelector<SVGSVGElement>('.logo-1 svg');
  const videoEl = introEl.querySelector<HTMLVideoElement>('.intro-video');
  const videoWrapEl = introEl.querySelector<HTMLElement>('.intro-video-wrapper');
  const logoEl = introEl.querySelector<HTMLElement>('.intro-logo');
  const textWrapper = introEl.querySelector<HTMLElement>('.intro-text-wrapper');
  const rows = Array.from(introEl.querySelectorAll<HTMLElement>('.intro-text-row'));

  if (!svg || !videoEl || !videoWrapEl || !logoEl || !textWrapper || rows.length === 0) return;

  _introActive = true;
  _introPromise = new Promise<void>((resolve) => {
    _introResolve = resolve;
  });

  // Make intro visible (Webflow keeps it display:none by default)
  gsap.set(introEl, { display: 'flex', opacity: 1 });

  // Restructure SVG for icon → wordmark animation
  const { gO, gParen, gClose, utsideRect, erspRect } = restructureLogo(svg);

  // Icon mode: groups translated to centre the tight "O(P)" symbol
  gsap.set(gO, { x: O_TX });
  gsap.set(gParen, { x: PAREN_TX });
  gsap.set(gClose, { x: CLOSE_TX });

  // Logo visible immediately — icon appears the instant the intro shows (no fade-in)
  gsap.set(logoEl, { opacity: 1 });

  // Video: start blurred; overscan hides the blur hard edge
  gsap.set(videoEl, { filter: 'blur(60px)' });
  gsap.set(videoWrapEl, { scale: 1.1 });

  // ── Tagline setup ──────────────────────────────────────────────────────────
  // Centre all rows at the vertical midpoint of the wrapper.
  // Primary row stays centred throughout; other rows slide to their natural
  // flex positions during the expand phase.
  const wrapperH = textWrapper.offsetHeight;
  const primaryRow = rows[PRIMARY_ROW];
  const rowH = primaryRow.offsetHeight;
  const centerY = (wrapperH - rowH) / 2;
  const rowOffsets = rows.map((r) => r.offsetTop);
  const centerOffset = centerY - rowOffsets[PRIMARY_ROW];

  rows.forEach((row, i) => {
    gsap.set(row, { y: centerOffset });
    if (i !== PRIMARY_ROW) gsap.set(row, { opacity: 0 });
  });

  // Primary row words hidden; they snap in one-by-one when the logo cuts
  const primaryWords = Array.from(primaryRow.querySelectorAll<HTMLElement>('.intro-text > div'));
  gsap.set(primaryWords, { opacity: 0 });

  // Init video
  const src = videoEl.getAttribute('data-src') || videoEl.getAttribute('src') || '';
  if (src) attachVideo(videoEl, src);

  runTimeline(
    introEl,
    videoEl,
    videoWrapEl,
    logoEl,
    gO,
    gParen,
    gClose,
    utsideRect,
    erspRect,
    rows,
    primaryWords,
    wrapperH
  );
}

export function destroyIntroSequence(): void {
  activeTl?.kill();
  activeTl = null;
  activeHls?.destroy();
  activeHls = null;

  if (_introActive) {
    _introActive = false;
    _introResolve?.();
    _introResolve = null;
  }

  const introEl = document.querySelector<HTMLElement>('.intro');
  if (introEl) gsap.set(introEl, { display: 'none', clearProps: 'opacity,filter,transform' });
}
