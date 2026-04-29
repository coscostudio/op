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

const FALLBACK_PRIMARY_ROW = 1; // upper-middle row of 4 — used only if Webflow marker is missing
const CIRCLE_START_ANGLE = -112.5;
const VIDEO_READY_TIMEOUT_MS = 1200;
const INTRO_FADE_IN_DUR = 0.42;
const INITIAL_VIDEO_SCALE = 1.16;
const INITIAL_VIDEO_MAX_VIEWPORT = 0.92;
const INITIAL_VIDEO_MOBILE_MAX_VW = 1.7;
const INITIAL_VIDEO_MASK_OUTER_RATIO = 0.72;
const INITIAL_VIDEO_RING_PADDING = 80;
const INTRO_MOBILE_OVERSCAN_REM = 14;
const MOBILE_BREAKPOINT = 767;

type CircularTextItem = {
  chars: HTMLSpanElement[];
  element: HTMLElement;
};

type IntroRouteVariant = 'default' | 'work';
type IntroVideoLayout = {
  finalVideoWidth: number;
  initialVideoSize: number;
};

let activeTl: gsap.core.Timeline | null = null;
let activeHls: Hls | null = null;
let activeIntroScrollLocked = false;
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

function prepareIntroLogo(svg: SVGSVGElement, logoEl: HTMLElement | null): void {
  const logoEmbed = svg.closest<HTMLElement>('.logo-1');

  gsap.set([logoEl, logoEmbed, svg].filter(Boolean), { overflow: 'visible' });
  if (logoEmbed) gsap.set(logoEmbed, { display: 'block', lineHeight: 0 });
  gsap.set(svg, { display: 'block' });
  svg.setAttribute('overflow', 'visible');
}

function prepareIntroOverlay(introEl: HTMLElement, videoWrapEl: HTMLElement): void {
  const videoLayer = videoWrapEl.closest<HTMLElement>('.intro-video-div');
  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

  gsap.set(introEl, {
    display: 'flex',
    overflow: 'visible',
  });

  if (!isMobile) return;

  const overscanHeight = `calc(100dvh + ${INTRO_MOBILE_OVERSCAN_REM}rem)`;
  const overscanProps = {
    bottom: 'auto',
    height: overscanHeight,
    left: 0,
    maxHeight: 'none',
    minHeight: overscanHeight,
    overflow: 'visible',
    right: 'auto',
    top: '50%',
    width: '100%',
    xPercent: 0,
    yPercent: -50,
  };

  gsap.set(introEl, overscanProps);
  if (videoLayer) gsap.set(videoLayer, overscanProps);
}

function preventIntroScroll(event: Event): void {
  if (!activeIntroScrollLocked) return;

  event.preventDefault();
}

function preventIntroScrollKeys(event: KeyboardEvent): void {
  if (!activeIntroScrollLocked) return;

  const scrollKeys = new Set([' ', 'ArrowDown', 'ArrowUp', 'End', 'Home', 'PageDown', 'PageUp']);
  if (!scrollKeys.has(event.key)) return;

  event.preventDefault();
}

function lockIntroScroll(): void {
  if (activeIntroScrollLocked) return;

  activeIntroScrollLocked = true;

  window.addEventListener('touchmove', preventIntroScroll, { passive: false });
  window.addEventListener('wheel', preventIntroScroll, { passive: false });
  window.addEventListener('keydown', preventIntroScrollKeys);

  document.documentElement.style.overscrollBehavior = 'none';
  document.body.style.overscrollBehavior = 'none';
}

function unlockIntroScroll(): void {
  if (!activeIntroScrollLocked) return;

  activeIntroScrollLocked = false;
  window.removeEventListener('touchmove', preventIntroScroll);
  window.removeEventListener('wheel', preventIntroScroll);
  window.removeEventListener('keydown', preventIntroScrollKeys);

  document.documentElement.style.overscrollBehavior = '';
  document.body.style.overscrollBehavior = '';
}

function waitForVideoReady(videoEl: HTMLVideoElement): Promise<void> {
  if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && !videoEl.paused) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId = 0;

    const cleanupListeners = () => {
      window.clearTimeout(timeoutId);
      videoEl.removeEventListener('playing', onPlaying);
      videoEl.removeEventListener('loadeddata', onReady);
      videoEl.removeEventListener('canplay', onReady);
      videoEl.removeEventListener('error', onReady);
    };

    const finish = () => {
      if (settled) return;

      settled = true;
      cleanupListeners();
      resolve();
    };

    const onReady = () => finish();
    const onPlaying = () => {
      if (videoEl.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) finish();
    };

    videoEl.addEventListener('playing', onPlaying);
    videoEl.addEventListener('loadeddata', onReady);
    videoEl.addEventListener('canplay', onReady);
    videoEl.addEventListener('error', onReady);
    timeoutId = window.setTimeout(finish, VIDEO_READY_TIMEOUT_MS);
  });
}

function playIntroVideo(videoEl: HTMLVideoElement): void {
  videoEl.play().catch(() => {});
}

function attachVideo(videoEl: HTMLVideoElement, src: string): Promise<void> {
  videoEl.muted = true;
  videoEl.autoplay = true;
  videoEl.loop = true;
  videoEl.playsInline = true;
  videoEl.preload = 'auto';

  const readyPromise = waitForVideoReady(videoEl);

  if (Hls.isSupported() && src.includes('.m3u8')) {
    activeHls = new Hls({ startPosition: 0, maxBufferLength: 30 });
    activeHls.loadSource(src);
    activeHls.attachMedia(videoEl);
    playIntroVideo(videoEl);
    activeHls.on(Hls.Events.MANIFEST_PARSED, () => {
      playIntroVideo(videoEl);
    });
    activeHls.on(Hls.Events.ERROR, (_e, data) => {
      if (data.fatal) {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) activeHls?.startLoad();
        else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) activeHls?.recoverMediaError();
      }
    });
  } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
    videoEl.src = src;
    videoEl.addEventListener('loadedmetadata', () => playIntroVideo(videoEl), {
      once: true,
    });
  } else {
    videoEl.src = src;
    playIntroVideo(videoEl);
  }

  return readyPromise;
}

function prepareIntroVideoLayout(
  videoEl: HTMLVideoElement,
  videoWrapEl: HTMLElement,
  minVideoSize = 0
): IntroVideoLayout {
  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const wrapRect = videoWrapEl.getBoundingClientRect();
  const measuredVideoHeight =
    wrapRect.height || videoWrapEl.offsetHeight || Math.min(viewportW, viewportH) * 0.32;
  const measuredVideoWidth = wrapRect.width || videoWrapEl.offsetWidth || measuredVideoHeight;
  const measuredVideoSize = Math.min(measuredVideoHeight, measuredVideoWidth, viewportW, viewportH);
  const maxInitialVideoSize =
    viewportW <= MOBILE_BREAKPOINT
      ? viewportW * INITIAL_VIDEO_MOBILE_MAX_VW
      : Math.min(viewportW, viewportH) * INITIAL_VIDEO_MAX_VIEWPORT;
  const initialVideoSize = Math.min(
    maxInitialVideoSize,
    Math.max(measuredVideoSize * INITIAL_VIDEO_SCALE, minVideoSize)
  );
  const finalVideoWidth = Math.hypot(viewportW, viewportH) * 1.08;

  gsap.set(videoWrapEl, {
    borderRadius: 0,
    height: initialVideoSize,
    maskImage: 'radial-gradient(circle, black 40%, transparent 72%)',
    overflow: 'visible',
    WebkitMaskImage: 'radial-gradient(circle, black 40%, transparent 72%)',
    width: initialVideoSize,
    willChange: 'width, height, transform',
  });
  gsap.set(videoEl, { filter: 'blur(120px)', scale: 1, transformOrigin: '50% 50%' });

  return { finalVideoWidth, initialVideoSize };
}

function cleanup(introEl: HTMLElement): void {
  activeTl = null;
  activeHls?.destroy();
  activeHls = null;
  unlockIntroScroll();
  gsap.set(introEl, { display: 'none' });

  // Fire after overlay is fully gone so page content starts from blank
  _introActive = false;
  _introResolve?.();
  _introResolve = null;
}

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value));

function getIntroRouteVariant(): IntroRouteVariant {
  const namespace = document
    .querySelector('[data-barba-namespace]')
    ?.getAttribute('data-barba-namespace');

  if (namespace === 'work') return 'work';

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/work') return 'work';

  return 'default';
}

function selectIntroTextWrapper(
  introEl: HTMLElement,
  routeVariant: IntroRouteVariant
): HTMLElement | null {
  const wrappers = Array.from(introEl.querySelectorAll<HTMLElement>('.intro-text-wrapper'));
  const variantName = routeVariant === 'work' ? 'work' : 'home';
  const activeWrapper =
    wrappers.find((wrapper) => wrapper.getAttribute('intro-variant') === variantName) ??
    wrappers.find((wrapper) => wrapper.getAttribute('intro-variant') === 'home') ??
    wrappers[0] ??
    null;

  wrappers.forEach((wrapper) => {
    if (wrapper === activeWrapper) {
      gsap.set(wrapper, { display: 'flex', opacity: 1 });
      return;
    }

    gsap.set(wrapper, { display: 'none', opacity: 0 });
  });

  return activeWrapper;
}

function getPrimaryRowIndex(rows: HTMLElement[]): number {
  const centerClassIndex = rows.findIndex((row) => row.classList.contains('center'));
  const centerAttributeIndex = rows.findIndex(
    (row) =>
      row.getAttribute('intro-text-rowID') === 'center' ||
      row.getAttribute('intro-text-rowid') === 'center'
  );

  return centerClassIndex >= 0
    ? centerClassIndex
    : centerAttributeIndex >= 0
      ? centerAttributeIndex
      : Math.min(FALLBACK_PRIMARY_ROW, rows.length - 1);
}

function prepareStraightRow(
  row: HTMLElement,
  wrapper: HTMLElement,
  anchor: 'bottom' | 'center'
): void {
  gsap.set(wrapper, {
    display: 'flex',
    overflow: 'visible',
  });
  gsap.set(row, {
    bottom: anchor === 'bottom' ? 'clamp(1rem, 8vh, 7rem)' : 'auto',
    clearProps: 'gap',
    display: 'flex',
    inset: 'auto',
    justifyContent: 'space-between',
    left: 0,
    opacity: 1,
    pointerEvents: 'none',
    position: 'absolute',
    top: anchor === 'bottom' ? 'auto' : '50%',
    transformOrigin: '50% 50%',
    whiteSpace: 'nowrap',
    width: '100%',
    willChange: 'transform, opacity',
    xPercent: 0,
    yPercent: anchor === 'bottom' ? 0 : -50,
  });
  gsap.set(row.querySelectorAll<HTMLElement>('.intro-text'), {
    clearProps: 'left,top,x,y,xPercent,yPercent,rotation,position',
    opacity: 1,
  });
}

function setWorkRowCopy(row: HTMLElement): void {
  const copy = ['creative', 'and', 'production', 'studio'];
  let words = Array.from(row.querySelectorAll<HTMLElement>('.intro-text'));

  while (words.length < copy.length) {
    const word = document.createElement('div');
    word.className = 'intro-text';
    row.appendChild(word);
    words.push(word);
  }

  const extraWords = words.slice(copy.length);
  extraWords.forEach((word) => word.remove());
  words = words.slice(0, copy.length);

  words.forEach((word, i) => {
    let textEl = word.firstElementChild instanceof HTMLElement ? word.firstElementChild : null;

    if (!textEl) {
      textEl = document.createElement('div');
      word.textContent = '';
      word.appendChild(textEl);
    }

    textEl.textContent = copy[i] ?? '';
    gsap.set(word, { clearProps: 'all' });
    gsap.set(textEl, { clearProps: 'all' });
  });
}

function prepareInlineTextChars(row: HTMLElement): HTMLSpanElement[] {
  const chars: HTMLSpanElement[] = [];

  row.querySelectorAll<HTMLElement>('.intro-text').forEach((word) => {
    const textEl = word.firstElementChild instanceof HTMLElement ? word.firstElementChild : word;
    const text = textEl.textContent ?? '';
    const wordChars = Array.from(text).map((char) => {
      const span = document.createElement('span');
      span.dataset.introChar = '';
      span.textContent = char === ' ' ? '\u00a0' : char;
      span.style.display = 'inline-block';
      span.style.whiteSpace = 'pre';
      return span;
    });

    textEl.textContent = '';
    wordChars.forEach((span) => textEl.appendChild(span));
    chars.push(...wordChars);
  });

  return chars;
}

function cloneStraightRows(
  primaryRow: HTMLElement,
  textWrapper: HTMLElement,
  cloneCount: number,
  anchor: 'bottom' | 'center'
): HTMLElement[] {
  return Array.from({ length: cloneCount }, (_, i) => {
    const clone = primaryRow.cloneNode(true) as HTMLElement;
    clone.setAttribute('aria-hidden', 'true');
    clone.classList.add('intro-text-row-duplicate');
    clone.dataset.introDuplicate = String(i + 1);
    textWrapper.appendChild(clone);
    prepareStraightRow(clone, textWrapper, anchor);
    gsap.set(clone.querySelectorAll<HTMLElement>('[data-intro-char]'), { opacity: 1 });
    gsap.set(clone, { opacity: 0, y: 0 });
    return clone;
  });
}

function readableTangentRotation(angleDeg: number): number {
  return angleDeg + 90;
}

function prepareCircularTextItems(words: HTMLElement[]): CircularTextItem[] {
  return words.map((word) => {
    const textEl = word.firstElementChild instanceof HTMLElement ? word.firstElementChild : word;
    const text = (textEl.textContent ?? '').trim();
    const chars = Array.from(text).map((char) => {
      const span = document.createElement('span');
      span.textContent = char === ' ' ? '\u00a0' : char;
      span.style.display = 'inline-block';
      span.style.left = '50%';
      span.style.position = 'absolute';
      span.style.top = '50%';
      span.style.transformOrigin = '50% 50%';
      span.style.whiteSpace = 'pre';
      return span;
    });

    textEl.textContent = '';
    chars.forEach((span) => textEl.appendChild(span));

    gsap.set(textEl, {
      display: 'block',
      height: 0,
      left: 0,
      position: 'absolute',
      top: 0,
      width: 0,
    });

    return { chars, element: word };
  });
}

function positionCircularWords(
  items: CircularTextItem[],
  radius: number,
  angleOffset: number,
  trackCount = items.length
): void {
  const angleStep = 360 / Math.max(trackCount, 1);

  items.forEach((item, i) => {
    const angle = angleOffset + i * angleStep;
    const charWidths = item.chars.map((char) => char.offsetWidth || 8);
    const totalWidth = charWidths.reduce((sum, width) => sum + width, 0);
    let cursor = -totalWidth / 2;

    item.chars.forEach((char, charIndex) => {
      const charCenter = cursor + charWidths[charIndex] / 2;
      const charAngle = angle + (charCenter / radius) * (180 / Math.PI);
      const radians = (charAngle * Math.PI) / 180;

      gsap.set(char, {
        rotation: readableTangentRotation(charAngle),
        x: Math.cos(radians) * radius,
        xPercent: -50,
        y: Math.sin(radians) * radius,
        yPercent: -50,
      });

      cursor += charWidths[charIndex];
    });
  });
}

function runTimeline(
  introEl: HTMLElement,
  videoEl: HTMLVideoElement,
  videoWrapEl: HTMLElement,
  logoEl: HTMLElement | null,
  gO: SVGGElement,
  gParen: SVGGElement,
  gClose: SVGGElement,
  utsideRect: SVGRectElement,
  erspRect: SVGRectElement,
  rows: HTMLElement[],
  primaryRowIndex: number,
  rowWords: CircularTextItem[][],
  wrapperW: number,
  wrapperH: number,
  videoLayout: IntroVideoLayout
): void {
  const tl = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: () => cleanup(introEl),
    paused: true,
  });
  activeTl = tl;

  // ── Timing constants ───────────────────────────────────────────────────────
  const EASE_OUT = 'power3.out';
  const EASE_IN_OUT = 'power3.inOut';
  const EASE_IN = 'power3.in';
  // Icon visible from the start; wordmark reveals almost immediately
  const REVEAL_T = 0.5;
  const REVEAL_DUR = 0.5;
  // Tagline starts shortly after wordmark settles
  const TAGLINE_T = 1.3;
  const CHAR_FADE_DUR = 0.16;
  const CHAR_STAGGER = 0.025;
  const primaryWords = rowWords[primaryRowIndex] ?? [];
  const totalPrimaryChars = primaryWords.reduce((sum, w) => sum + w.chars.length, 0);
  const DUPLICATE_REVEAL_T = TAGLINE_T + totalPrimaryChars * CHAR_STAGGER + 0.1;
  const SPIN_REVEAL_T = DUPLICATE_REVEAL_T + 0.18;

  // Each ring runs its full spin-expand journey (two phases) as one sub-timeline,
  // echo-staggered by distance from center ring so outer rings start slightly later
  const SPIN_REVEAL_DUR = 1.18;
  const FINAL_LEAVE_DUR = 1.55;
  const RING_STAGGER = 0.16;
  const maxDistFromCenter = Math.max(...rows.map((_, i) => Math.abs(i - primaryRowIndex)));
  const PHASE_2_T = SPIN_REVEAL_T + SPIN_REVEAL_DUR;
  const PHASE_2_DUR = maxDistFromCenter * RING_STAGGER + FINAL_LEAVE_DUR;
  const VIDEO_FILL_T = PHASE_2_T + 0.22;
  const PHASE_2_END_T = PHASE_2_T + PHASE_2_DUR;
  const VIDEO_FILL_DUR = PHASE_2_END_T - VIDEO_FILL_T;
  const LOGO_LEAVE_T = PHASE_2_T + 0.06;
  const LOGO_LEAVE_DUR = 0.78;
  // Video grows just behind the second ring expansion, then lands with the ripple.
  const FILL_T = VIDEO_FILL_T + VIDEO_FILL_DUR;

  const minDimension = Math.min(wrapperW, wrapperH);
  const baseRadius = clamp(150, minDimension * 0.29, 300);
  const tightRingGap = clamp(18, minDimension * 0.035, 40);
  const ringGap = clamp(70, minDimension * 0.12, 150);
  const offscreenRadius = Math.hypot(wrapperW, wrapperH) / 2 + ringGap * 2;
  const { finalVideoWidth } = videoLayout;

  const ringStates = rowWords.map(() => ({
    angleOffset: CIRCLE_START_ANGLE,
    radius: baseRadius,
  }));
  const applyCircularLayout = () => {
    rowWords.forEach((words, i) => {
      const state = ringStates[i];
      if (!state) return;
      positionCircularWords(words, state.radius, state.angleOffset, primaryWords.length);
    });
  };

  applyCircularLayout();

  // Unblur from tagline reveal through the full ring expansion
  tl.to(
    videoEl,
    { filter: 'blur(0px)', duration: FILL_T - TAGLINE_T, ease: 'power2.out' },
    TAGLINE_T
  );

  // Mask opens and wrapper expands to fill screen in sync with ring spin-expand
  const maskState = { inner: 40, outer: 72 };
  const updateMask = () => {
    const grad = `radial-gradient(circle, black ${maskState.inner.toFixed(1)}%, transparent ${maskState.outer.toFixed(1)}%)`;
    videoWrapEl.style.maskImage = grad;
    (videoWrapEl.style as CSSStyleDeclaration & { WebkitMaskImage: string }).WebkitMaskImage = grad;
  };
  tl.to(
    maskState,
    {
      inner: 100,
      outer: 150,
      duration: VIDEO_FILL_DUR,
      ease: 'power2.inOut',
      onUpdate: updateMask,
    },
    VIDEO_FILL_T
  );
  tl.to(
    videoWrapEl,
    {
      height: finalVideoWidth,
      width: finalVideoWidth,
      duration: VIDEO_FILL_DUR,
      ease: 'power2.inOut',
    },
    VIDEO_FILL_T
  );
  tl.to(videoEl, { scale: 1.35, duration: VIDEO_FILL_DUR, ease: 'power2.out' }, VIDEO_FILL_T);

  // ── Logo: O(P) icon visible from start; wordmark reveals early ────────────
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
  if (logoEl) {
    tl.to(
      logoEl,
      { opacity: 0, scale: 0.92, duration: LOGO_LEAVE_DUR, ease: EASE_IN },
      LOGO_LEAVE_T + 0.1
    );
  }
  tl.to(gO, { x: O_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(gParen, { x: PAREN_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(gClose, { x: CLOSE_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(
    utsideRect,
    {
      attr: { x: UTSIDE_CLIP_X_ICON, width: 0 },
      duration: LOGO_LEAVE_DUR,
      ease: EASE_IN_OUT,
    },
    LOGO_LEAVE_T
  );
  tl.to(
    erspRect,
    { attr: { width: 0 }, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT },
    LOGO_LEAVE_T
  );

  // ── Tagline: primary ring chars stagger in letter by letter ───────────────
  let charIndex = 0;
  primaryWords.forEach((word) => {
    word.chars.forEach((char) => {
      tl.to(
        char,
        { opacity: 1, duration: CHAR_FADE_DUR, ease: EASE_OUT },
        TAGLINE_T + charIndex * CHAR_STAGGER
      );
      charIndex += 1;
    });
  });

  // ── Tagline: duplicates appear stacked, then echo ripple outward ──────────
  const duplicateIndices = rows.map((_, i) => i).filter((i) => i !== primaryRowIndex);
  const duplicateRankByIndex = new Map(duplicateIndices.map((index, rank) => [index, rank + 1]));
  // Phase 1 uses a tighter gap so rings start close together before spreading
  const expandedRadii = rows.map(
    (_, i) => baseRadius + (duplicateRankByIndex.get(i) ?? 0) * tightRingGap
  );

  rows.forEach((row, i) => {
    if (i === primaryRowIndex) return;
    tl.to(row, { opacity: 1, duration: 0.22, ease: EASE_OUT }, DUPLICATE_REVEAL_T);
  });

  rows.forEach((row, i) => {
    const rank = duplicateRankByIndex.get(i) ?? 0;
    const dist = Math.abs(i - primaryRowIndex);
    const direction = i < primaryRowIndex ? -1 : 1;
    const ringStartT = SPIN_REVEAL_T + dist * RING_STAGGER;
    const phase1Angle = CIRCLE_START_ANGLE + direction * rank * 13;
    const phase2Radius = offscreenRadius + Math.pow(rank + 1, 1.72) * ringGap;
    const phase2Angle = phase1Angle + direction * (42 + rank * 18);

    const ringTl = gsap.timeline({ onUpdate: applyCircularLayout });
    ringTl.to(ringStates[i], {
      radius: expandedRadii[i] ?? baseRadius,
      angleOffset: phase1Angle,
      duration: SPIN_REVEAL_DUR,
      ease: EASE_IN_OUT,
    });
    ringTl.to(ringStates[i], {
      radius: phase2Radius,
      angleOffset: phase2Angle,
      duration: FINAL_LEAVE_DUR,
      ease: 'power4.in',
    });
    tl.add(ringTl, ringStartT);

    tl.to(
      row,
      { opacity: 0, duration: FINAL_LEAVE_DUR * 0.8, ease: EASE_IN },
      ringStartT + SPIN_REVEAL_DUR
    );
  });

  // ── Overlay fade: second expansion, video fill, text ripple, and logo leave clear together
  tl.to(introEl, { opacity: 0, duration: 0.62, ease: EASE_IN }, FILL_T - 0.48);
}

function runVerticalTimeline(
  introEl: HTMLElement,
  videoEl: HTMLVideoElement,
  videoWrapEl: HTMLElement,
  logoEl: HTMLElement | null,
  gO: SVGGElement,
  gParen: SVGGElement,
  gClose: SVGGElement,
  utsideRect: SVGRectElement,
  erspRect: SVGRectElement,
  rows: HTMLElement[],
  primaryRowIndex: number,
  textWrapper: HTMLElement,
  videoLayout: IntroVideoLayout
): void {
  const tl = gsap.timeline({
    defaults: { ease: 'power3.inOut' },
    onComplete: () => cleanup(introEl),
    paused: true,
  });
  activeTl = tl;

  const EASE_OUT = 'power3.out';
  const EASE_IN_OUT = 'power3.inOut';
  const EASE_IN = 'power3.in';
  const REVEAL_T = 0.5;
  const REVEAL_DUR = 0.5;
  const ROW_REVEAL_T = 1.2;
  const CHAR_FADE_DUR = 0.16;
  const CHAR_STAGGER = 0.025;
  const EXPLODE_T = 2.05;
  const EXPLODE_DUR = 1.38;
  const LOGO_LEAVE_T = EXPLODE_T + 0.12;
  const LOGO_LEAVE_DUR = 0.78;
  const FILL_T = EXPLODE_T + 0.35;
  const FILL_DUR = 1.05;
  const FADE_T = EXPLODE_T + 1.28;

  const viewportH = window.innerHeight;
  const { finalVideoWidth } = videoLayout;
  const primaryRow = rows[primaryRowIndex];
  if (primaryRow) setWorkRowCopy(primaryRow);
  const primaryChars = primaryRow ? prepareInlineTextChars(primaryRow) : [];
  const duplicateCount = clamp(36, Math.round(viewportH / 14), 64);
  const duplicates = primaryRow
    ? cloneStraightRows(primaryRow, textWrapper, duplicateCount, 'bottom')
    : [];
  const allStraightRows = primaryRow ? [primaryRow, ...duplicates] : duplicates;
  const rowHeight = primaryRow?.offsetHeight || 24;
  const rowGap = clamp(rowHeight * 0.9, viewportH / 42, rowHeight * 1.35);

  rows.forEach((row, i) => {
    if (i === primaryRowIndex) return;
    gsap.set(row, { display: 'none', opacity: 0 });
  });
  if (primaryRow) {
    prepareStraightRow(primaryRow, textWrapper, 'bottom');
    gsap.set(primaryRow, { opacity: 0, scale: 0.98, y: 0 });
    gsap.set(primaryChars, { opacity: 0, yPercent: 20 });
  }

  tl.to(
    videoEl,
    { filter: 'blur(0px)', duration: FILL_T + FILL_DUR - ROW_REVEAL_T, ease: 'power2.out' },
    ROW_REVEAL_T
  );

  const maskState = { inner: 40, outer: 72 };
  const updateMask = () => {
    const grad = `radial-gradient(circle, black ${maskState.inner.toFixed(1)}%, transparent ${maskState.outer.toFixed(1)}%)`;
    videoWrapEl.style.maskImage = grad;
    (videoWrapEl.style as CSSStyleDeclaration & { WebkitMaskImage: string }).WebkitMaskImage = grad;
  };
  tl.to(
    maskState,
    {
      inner: 100,
      outer: 150,
      duration: FILL_DUR,
      ease: 'power2.inOut',
      onUpdate: updateMask,
    },
    FILL_T
  );
  tl.to(
    videoWrapEl,
    { height: finalVideoWidth, width: finalVideoWidth, duration: FILL_DUR, ease: 'power2.inOut' },
    FILL_T
  );
  tl.to(videoEl, { scale: 1.35, duration: FILL_DUR, ease: 'power2.out' }, FILL_T);

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

  if (primaryRow) {
    tl.to(primaryRow, { opacity: 1, scale: 1, duration: 0.36, ease: EASE_OUT }, ROW_REVEAL_T);
  }
  if (primaryChars.length) {
    tl.to(
      primaryChars,
      {
        opacity: 1,
        yPercent: 0,
        duration: CHAR_FADE_DUR,
        ease: EASE_OUT,
        stagger: CHAR_STAGGER,
      },
      ROW_REVEAL_T
    );
  }

  duplicates.forEach((row, i) => {
    const rank = i + 1;
    const targetY = -rank * rowGap;
    const startTime = EXPLODE_T + Math.min(rank * 0.01, 0.22);

    gsap.set(row, {
      opacity: 0,
      y: 0,
      zIndex: duplicateCount - i,
    });
    tl.to(row, { opacity: 1, duration: 0.08, ease: EASE_OUT }, startTime);
    tl.to(
      row,
      {
        y: targetY,
        duration: EXPLODE_DUR + rank * 0.006,
        ease: 'power3.inOut',
      },
      startTime
    );
    tl.to(
      row,
      { opacity: 0, duration: 0.36, ease: EASE_IN },
      startTime + EXPLODE_DUR * 0.78 + rank * 0.004
    );
  });

  if (primaryRow) {
    tl.to(
      primaryRow,
      { opacity: 0, y: -viewportH * 0.08, duration: EXPLODE_DUR * 0.55, ease: EASE_IN },
      EXPLODE_T + 0.58
    );
  }

  if (logoEl) {
    tl.to(
      logoEl,
      { opacity: 0, scale: 0.92, duration: LOGO_LEAVE_DUR, ease: EASE_IN },
      LOGO_LEAVE_T + 0.1
    );
  }
  tl.to(gO, { x: O_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(gParen, { x: PAREN_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(gClose, { x: CLOSE_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, LOGO_LEAVE_T);
  tl.to(
    utsideRect,
    {
      attr: { x: UTSIDE_CLIP_X_ICON, width: 0 },
      duration: LOGO_LEAVE_DUR,
      ease: EASE_IN_OUT,
    },
    LOGO_LEAVE_T
  );
  tl.to(
    erspRect,
    { attr: { width: 0 }, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT },
    LOGO_LEAVE_T
  );

  tl.to(introEl, { opacity: 0, duration: 0.62, ease: EASE_IN }, FADE_T);
  tl.add(() => allStraightRows.forEach((row) => gsap.set(row, { clearProps: 'willChange' })));
}

export function initIntroSequence(): void {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const routeVariant = getIntroRouteVariant();

  const introEl = document.querySelector<HTMLElement>('.intro');
  if (!introEl) return;

  const svg = introEl.querySelector<SVGSVGElement>('.logo-1 svg');
  const videoEl = introEl.querySelector<HTMLVideoElement>('.intro-video');
  const videoWrapEl = introEl.querySelector<HTMLElement>('.intro-video-wrapper');
  const logoEl = introEl.querySelector<HTMLElement>('.intro-logo');
  const textWrapper = selectIntroTextWrapper(introEl, routeVariant);
  const rows = textWrapper
    ? Array.from(textWrapper.querySelectorAll<HTMLElement>('.intro-text-row'))
    : [];

  if (!svg || !videoEl || !videoWrapEl || !textWrapper) {
    return;
  }

  if (rows.length === 0) {
    return;
  }

  _introActive = true;
  _introPromise = new Promise<void>((resolve) => {
    _introResolve = resolve;
  });
  lockIntroScroll();

  // ── Tagline setup ──────────────────────────────────────────────────────────
  const wrapperW = textWrapper.offsetWidth;
  const wrapperH = textWrapper.offsetHeight;
  const minDimension = Math.min(wrapperW, wrapperH);
  const baseRingRadius = clamp(150, minDimension * 0.29, 300);
  const ringAwareVideoSize =
    ((baseRingRadius + INITIAL_VIDEO_RING_PADDING) * 2) / INITIAL_VIDEO_MASK_OUTER_RATIO;
  const baseMinVideoSize = clamp(320, minDimension * 0.66, 720);
  const minVideoSize =
    window.innerWidth <= MOBILE_BREAKPOINT
      ? Math.max(baseMinVideoSize, ringAwareVideoSize)
      : baseMinVideoSize;

  // Make intro visible (Webflow keeps it display:none by default)
  prepareIntroOverlay(introEl, videoWrapEl);
  const videoLayout = prepareIntroVideoLayout(videoEl, videoWrapEl, minVideoSize);
  gsap.to(introEl, { opacity: 1, duration: INTRO_FADE_IN_DUR, ease: 'power2.out' });

  // Restructure SVG for icon → wordmark animation
  prepareIntroLogo(svg, logoEl);
  const { gO, gParen, gClose, utsideRect, erspRect } = restructureLogo(svg);

  // Icon mode: groups translated to centre the tight "O(P)" symbol
  gsap.set(gO, { x: O_TX });
  gsap.set(gParen, { x: PAREN_TX });
  gsap.set(gClose, { x: CLOSE_TX });
  if (logoEl) gsap.set(logoEl, { opacity: 0 });

  // Init video
  const src = videoEl.getAttribute('data-src') || videoEl.getAttribute('src') || '';
  const videoReady = src ? attachVideo(videoEl, src) : Promise.resolve();
  const startIntro = () => {
    if (!_introActive || activeTl?.isActive()) return;

    if (logoEl) gsap.set(logoEl, { opacity: 1 });
    activeTl?.play(0);
  };

  const primaryRowIndex = getPrimaryRowIndex(rows);

  if (routeVariant === 'work') {
    runVerticalTimeline(
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
      textWrapper,
      videoLayout
    );
    videoReady.then(startIntro);
    return;
  }

  // The home/default intro temporarily takes over each word as an absolute point on a circle.
  const rowWords = rows.map((row) =>
    prepareCircularTextItems(Array.from(row.querySelectorAll<HTMLElement>('.intro-text')))
  );

  rows.forEach((row, i) => {
    gsap.set(row, {
      display: 'block',
      inset: 0,
      opacity: i === primaryRowIndex ? 1 : 0,
      pointerEvents: 'none',
      position: 'absolute',
      width: '100%',
      y: 0,
    });
  });

  // All word containers positioned on circle center; visible by default.
  // Primary row uses per-char opacity for the letter-by-letter reveal.
  rowWords.flat().forEach((word) => {
    gsap.set(word.element, {
      left: '50%',
      opacity: 1,
      position: 'absolute',
      top: '50%',
      transformOrigin: '50% 50%',
      whiteSpace: 'nowrap',
      willChange: 'transform, opacity',
      xPercent: -50,
      yPercent: -50,
    });
  });
  rowWords[primaryRowIndex]?.forEach((word) => gsap.set(word.chars, { opacity: 0 }));

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
    rowWords,
    wrapperW,
    wrapperH,
    videoLayout
  );
  videoReady.then(startIntro);
}

export function destroyIntroSequence(): void {
  activeTl?.kill();
  activeTl = null;
  activeHls?.destroy();
  activeHls = null;
  unlockIntroScroll();

  if (_introActive) {
    _introActive = false;
    _introResolve?.();
    _introResolve = null;
  }

  const introEl = document.querySelector<HTMLElement>('.intro');
  if (introEl) gsap.set(introEl, { display: 'none', clearProps: 'opacity,filter,transform' });
}
