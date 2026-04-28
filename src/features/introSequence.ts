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

const FALLBACK_PRIMARY_ROW = 2; // centre row of 5 — used only if Webflow marker is missing

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
  primaryRowIndex: number,
  primaryWords: HTMLElement[],
  wrapperH: number
): void {
  const tl = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: () => cleanup(introEl),
  });
  activeTl = tl;

  // ── Timing constants ───────────────────────────────────────────────────────
  const EASE_OUT = 'power3.out';
  const EASE_IN_OUT = 'power3.inOut';
  const EASE_IN = 'power3.in';
  const LOGO_FADE_IN_T = 0.25;
  const LOGO_FADE_DUR = 0.25;
  const REVEAL_T = 1.25; // icon → wordmark starts
  const REVEAL_DUR = 0.65;
  const TAGLINE_T = 2.7; // previous tagline entry was 1.7s; hold 1s longer
  const LOGO_FADE_OUT_DUR = 0.25;
  const WORD_FADE_DUR = 0.22;
  const WORD_STAGGER = 0.5;
  const OTHER_ROWS_T = TAGLINE_T + primaryWords.length * WORD_STAGGER;
  const EXPAND_DUR = 1;
  const FINAL_LEAVE_T = OTHER_ROWS_T + EXPAND_DUR;
  const FINAL_LEAVE_DUR = 0.65;
  const VIDEO_UNBLUR_T = TAGLINE_T;
  const VIDEO_UNBLUR_DUR = FINAL_LEAVE_T + FINAL_LEAVE_DUR - VIDEO_UNBLUR_T;

  const rowH = rows[primaryRowIndex]?.offsetHeight || 0;
  const rowSpread = Math.max(0, wrapperH / 2 - rowH / 2);
  const maxDistanceFromCenter = Math.max(primaryRowIndex, rows.length - 1 - primaryRowIndex, 1);
  const expandedY = rows.map((_, i) => {
    const distanceFromCenter = i - primaryRowIndex;
    return (distanceFromCenter / maxDistanceFromCenter) * rowSpread;
  });

  // ── Video: stay heavily blurred until the exit, then resolve late ──────────
  tl.set(videoEl, { filter: 'blur(120px)' }, 0);
  tl.to(
    videoEl,
    {
      filter: 'blur(0px)',
      duration: VIDEO_UNBLUR_DUR,
      ease: 'power2.out',
    },
    VIDEO_UNBLUR_T
  );
  // Slow push-in during grid expand + exit
  tl.to(
    videoWrapEl,
    { scale: 1.35, duration: FINAL_LEAVE_DUR + 1.5, ease: EASE_OUT },
    OTHER_ROWS_T
  );

  // ── Logo: fade in, then icon → wordmark ────────────────────────────────────
  tl.to(logoEl, { opacity: 1, duration: LOGO_FADE_DUR, ease: EASE_OUT }, LOGO_FADE_IN_T);
  // O slides left, (P) slides right a touch, ) slides far right ("pushed" by erspective),
  // utside clip grows right, erspective clip grows right.
  tl.to(gO, { x: 0, duration: REVEAL_DUR, ease: EASE_OUT }, REVEAL_T);
  tl.to(gParen, { x: 0, duration: REVEAL_DUR, ease: EASE_OUT }, REVEAL_T);
  tl.to(gClose, { x: 0, duration: REVEAL_DUR, ease: EASE_OUT }, REVEAL_T);
  tl.to(
    utsideRect,
    { attr: { x: O_RIGHT, width: UTSIDE_CLIP_W_FINAL }, duration: REVEAL_DUR, ease: EASE_OUT },
    REVEAL_T
  );
  tl.to(
    erspRect,
    { attr: { width: ERSP_CLIP_W_FINAL }, duration: REVEAL_DUR, ease: EASE_OUT },
    REVEAL_T
  );

  // ── Logo: quick fade as the initial tagline row enters ─────────────────────
  tl.to(logoEl, { opacity: 0, duration: LOGO_FADE_OUT_DUR, ease: EASE_IN }, TAGLINE_T);

  // ── Tagline: primary row words stagger-fade in first ───────────────────────
  primaryWords.forEach((word, i) => {
    tl.to(
      word,
      { opacity: 1, duration: WORD_FADE_DUR, ease: EASE_OUT },
      TAGLINE_T + i * WORD_STAGGER
    );
  });

  // ── Tagline: other rows fade in underneath, then expand from center ────────
  const otherRows = rows.filter((_, i) => i !== primaryRowIndex);
  tl.to(otherRows, { opacity: 1, duration: 0.25, ease: EASE_OUT }, OTHER_ROWS_T);
  tl.to(
    rows,
    {
      y: (i) => expandedY[i] ?? 0,
      duration: EXPAND_DUR,
      ease: EASE_IN_OUT,
      stagger: 0.035,
    },
    OTHER_ROWS_T
  );

  // ── Exit: overlay fade is locked to the final tagline leave motion ─────────
  tl.addLabel('taglineLeave', FINAL_LEAVE_T);
  rows.forEach((row, i) => {
    const distanceFromCenter = i - primaryRowIndex;
    const exitY =
      distanceFromCenter < 0
        ? (expandedY[i] ?? 0) - wrapperH
        : distanceFromCenter >= 0
          ? (expandedY[i] ?? 0) + wrapperH
          : 0;
    tl.to(row, { y: exitY, duration: FINAL_LEAVE_DUR, ease: EASE_IN }, 'taglineLeave');
  });
  tl.to(introEl, { opacity: 0, duration: FINAL_LEAVE_DUR, ease: EASE_IN }, 'taglineLeave');
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

  // Logo starts hidden so the compact O(P) icon can fade in after the intro begins.
  gsap.set(logoEl, { opacity: 0 });

  // Video: start blurred; overscan hides the blur hard edge
  gsap.set(videoEl, { filter: 'blur(120px)' });
  gsap.set(videoWrapEl, { scale: 1.1 });

  // ── Tagline setup ──────────────────────────────────────────────────────────
  // Centre all absolute rows on top of each other; the timeline expands them
  // outward from the Webflow-marked center row.
  const wrapperH = textWrapper.offsetHeight;
  const markedPrimaryIndex = rows.findIndex(
    (row) =>
      row.getAttribute('intro-text-rowID') === 'center' ||
      row.getAttribute('intro-text-rowid') === 'center' ||
      row.classList.contains('center')
  );
  const primaryRowIndex =
    markedPrimaryIndex >= 0 ? markedPrimaryIndex : Math.min(FALLBACK_PRIMARY_ROW, rows.length - 1);
  const primaryRow = rows[primaryRowIndex];

  rows.forEach((row, i) => {
    gsap.set(row, { opacity: i === primaryRowIndex ? 1 : 0, y: 0 });
  });

  // Primary row words hidden; they fade in one-by-one when the logo fades out.
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
    primaryRowIndex,
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
