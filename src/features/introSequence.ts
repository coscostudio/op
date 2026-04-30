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

type IntroRouteVariant = 'about' | 'default' | 'work';
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
    opacity: 0,
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
  if (namespace === 'about') return 'about';

  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  if (path === '/work') return 'work';
  if (path === '/about') return 'about';

  return 'default';
}

function selectIntroTextWrapper(
  introEl: HTMLElement,
  routeVariant: IntroRouteVariant
): HTMLElement | null {
  const wrappers = Array.from(introEl.querySelectorAll<HTMLElement>('.intro-text-wrapper'));
  const variantName = routeVariant === 'work' || routeVariant === 'about' ? 'work' : 'home';
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

function readableTangentRotation(angleDeg: number): number {
  return angleDeg + 90;
}

function getClockPoint(radius: number, angleDeg: number): { x: number; y: number } {
  const radians = (angleDeg * Math.PI) / 180;

  return {
    x: Math.cos(radians) * radius,
    y: Math.sin(radians) * radius,
  };
}

function getClockAngle(rank: number, totalSlots: number, rotationOffset = 0): number {
  const step = 360 / Math.max(totalSlots, 1);

  return 180 - rank * step - rotationOffset;
}

function prepareClockWords(
  rows: HTMLElement[],
  primaryRowIndex: number,
  textWrapper: HTMLElement
): HTMLElement[] {
  const primaryRow = rows[primaryRowIndex];
  if (!primaryRow) return [];

  rows.forEach((row, i) => {
    if (i === primaryRowIndex) return;
    gsap.set(row, { display: 'none', opacity: 0 });
  });

  gsap.set(textWrapper, {
    display: 'block',
    overflow: 'visible',
  });
  gsap.set(primaryRow, {
    bottom: 0,
    clearProps: 'inset,transform,x,y,xPercent,yPercent',
    display: 'block',
    height: '100%',
    left: 0,
    minHeight: '100%',
    opacity: 1,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  });

  const words = Array.from(primaryRow.querySelectorAll<HTMLElement>('.intro-text'));

  words.forEach((word) => {
    gsap.set(word, {
      left: '50%',
      opacity: 0,
      position: 'absolute',
      rotation: 0,
      top: '50%',
      transformOrigin: '50% 50%',
      whiteSpace: 'nowrap',
      willChange: 'transform, opacity',
      xPercent: -50,
      yPercent: -50,
    });
  });

  return words;
}

function cloneClockRowFromHomeIntro(introEl: HTMLElement): HTMLElement | null {
  const homeWrapper = introEl.querySelector<HTMLElement>(
    '.intro-text-wrapper[intro-variant="home"]'
  );
  const homeRows = homeWrapper
    ? Array.from(homeWrapper.querySelectorAll<HTMLElement>('.intro-text-row'))
    : [];
  const homePrimaryRow = homeRows[getPrimaryRowIndex(homeRows)];

  if (!homePrimaryRow) return null;

  const clockRow = homePrimaryRow.cloneNode(true) as HTMLElement;
  clockRow.setAttribute('aria-hidden', 'true');
  clockRow.dataset.introClockSource = 'home';

  return clockRow;
}

function createLineIntroRow(textWrapper: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.className = 'intro-text-row center';
  row.dataset.introLineSource = 'about';

  ['creative', 'and', 'production', 'studio'].forEach((copy) => {
    const word = document.createElement('div');
    const text = document.createElement('div');
    word.className = 'intro-text';
    text.textContent = copy;
    word.appendChild(text);
    row.appendChild(word);
  });

  textWrapper.appendChild(row);

  return row;
}

function prepareLineWords(
  rows: HTMLElement[],
  primaryRowIndex: number,
  textWrapper: HTMLElement
): HTMLElement[] {
  const primaryRow = rows[primaryRowIndex];
  if (!primaryRow) return [];

  rows.forEach((row, i) => {
    if (i === primaryRowIndex) return;
    gsap.set(row, { display: 'none', opacity: 0 });
  });

  gsap.set(textWrapper, {
    display: 'block',
    overflow: 'visible',
  });
  gsap.set(primaryRow, {
    bottom: 0,
    clearProps: 'inset,transform,x,y,xPercent,yPercent',
    display: 'block',
    height: '100%',
    left: 0,
    minHeight: '100%',
    opacity: 1,
    pointerEvents: 'none',
    position: 'absolute',
    right: 0,
    top: 0,
    width: '100%',
  });

  const words = Array.from(primaryRow.querySelectorAll<HTMLElement>('.intro-text'));

  words.forEach((word) => {
    gsap.set(word, {
      left: '50%',
      opacity: 0,
      position: 'absolute',
      rotation: 0,
      top: '50%',
      transformOrigin: '50% 50%',
      whiteSpace: 'nowrap',
      willChange: 'transform, opacity',
      xPercent: -50,
      yPercent: -50,
    });
  });

  return words;
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

function runClockTimeline(
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
  const WORD_START_T = 1.24;
  const WORD_GAP = 0.8;
  const WORD_ENTER_DUR = 0.46;
  const CLOCK_DRIFT_DEG = 14;
  const IMPLODE_DELAY = WORD_GAP;
  const IMPLODE_DUR = 0.52;
  const LOGO_LEAVE_DUR = 0.72;
  const FILL_DUR = 1.05;
  const FADE_DUR = 0.62;
  const FADE_OFFSET = 0.46;
  const spikeEase = 'expo.out';

  const wrapperW = textWrapper.offsetWidth;
  const wrapperH = textWrapper.offsetHeight;
  const radius = clamp(112, Math.min(wrapperW, wrapperH) * 0.26, 260);
  const { finalVideoWidth } = videoLayout;
  const words = prepareClockWords(rows, primaryRowIndex, textWrapper);
  const totalClockSlots = words.length;
  const clockStep = 360 / Math.max(totalClockSlots, 1);
  const clockDriftSlots = CLOCK_DRIFT_DEG / clockStep;
  const clockState = { baseAdvance: 0, enteringIndex: -1, slotPosition: 0, visibleUntil: -1 };
  const applyClockLayout = () => {
    const trackPosition = clockState.slotPosition + clockState.baseAdvance;

    words.forEach((word, wordIndex) => {
      if (wordIndex > clockState.visibleUntil) return;
      if (wordIndex === clockState.enteringIndex) return;

      const point = getClockPoint(
        radius,
        getClockAngle(trackPosition - wordIndex, totalClockSlots)
      );
      gsap.set(word, { x: point.x, y: point.y });
    });
  };
  const finalEntryT = WORD_START_T + Math.max(words.length - 1, 0) * WORD_GAP;
  const IMPLODE_T = finalEntryT + IMPLODE_DELAY;
  const FILL_T = IMPLODE_T;
  const FADE_T = IMPLODE_T + FADE_OFFSET;
  const cleanupT = FADE_T + FADE_DUR;
  const baseSpinEndT = IMPLODE_T + IMPLODE_DUR;
  const baseSpinDur = Math.max(0.1, baseSpinEndT - WORD_START_T);
  const getBaseAdvanceAt = (time: number) =>
    clockDriftSlots * clamp(0, (time - WORD_START_T) / baseSpinDur, 1);

  tl.to(
    videoEl,
    {
      filter: 'blur(0px)',
      duration: Math.max(0.1, FILL_T + FILL_DUR - WORD_START_T),
      ease: 'power2.out',
    },
    WORD_START_T
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

  // Logo starts as the centered icon, then opens just like the main circle intro.
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

  tl.to(
    clockState,
    {
      baseAdvance: clockDriftSlots,
      duration: baseSpinDur,
      ease: 'none',
      onUpdate: applyClockLayout,
    },
    WORD_START_T
  );

  words.forEach((word, wordIndex) => {
    const entryT = WORD_START_T + wordIndex * WORD_GAP;
    const joinT = entryT + WORD_ENTER_DUR;
    const gatePoint = getClockPoint(radius, 180);

    tl.add(() => {
      clockState.visibleUntil = wordIndex;
      clockState.enteringIndex = wordIndex;
      gsap.set(word, { x: gatePoint.x - 28, y: gatePoint.y + 2, opacity: 0 });
      applyClockLayout();
    }, entryT);
    tl.to(
      clockState,
      {
        slotPosition: wordIndex - getBaseAdvanceAt(joinT),
        duration: WORD_ENTER_DUR,
        ease: spikeEase,
        onUpdate: applyClockLayout,
      },
      entryT
    );
    tl.to(
      word,
      {
        x: gatePoint.x,
        y: gatePoint.y,
        opacity: 1,
        duration: WORD_ENTER_DUR,
        ease: spikeEase,
      },
      entryT
    );
    tl.add(() => {
      clockState.enteringIndex = -1;
      applyClockLayout();
    }, joinT);
  });

  words.forEach((word) => {
    const stagger = Math.random() * 0.16;
    const direction = Math.random() > 0.5 ? 1 : -1;

    tl.to(
      word,
      {
        x: direction * gsap.utils.random(2, 16),
        y: gsap.utils.random(-8, 8),
        scale: 0.24,
        opacity: 0,
        duration: IMPLODE_DUR,
        ease: 'power4.in',
      },
      IMPLODE_T + stagger
    );
  });

  if (logoEl) {
    tl.to(logoEl, { opacity: 0, scale: 0.92, duration: FADE_DUR, ease: EASE_IN }, FADE_T);
  }
  tl.to(gO, { x: O_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(gParen, { x: PAREN_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(gClose, { x: CLOSE_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(
    utsideRect,
    {
      attr: { x: UTSIDE_CLIP_X_ICON, width: 0 },
      duration: LOGO_LEAVE_DUR,
      ease: EASE_IN_OUT,
    },
    IMPLODE_T
  );
  tl.to(erspRect, { attr: { width: 0 }, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);

  tl.to(introEl, { opacity: 0, duration: 0.62, ease: EASE_IN }, FADE_T);
  tl.add(() => words.forEach((word) => gsap.set(word, { clearProps: 'willChange' })), cleanupT);
}

function runLineTimeline(
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
  const WORD_START_T = 1.24;
  const WORD_GAP = 0.8;
  const WORD_ENTER_DUR = 0.46;
  const LINE_START_X = 22;
  const LINE_END_X = -8;
  const IMPLODE_DELAY = WORD_GAP;
  const IMPLODE_DUR = 0.48;
  const LOGO_LEAVE_DUR = 0.72;
  const FILL_DUR = 1.05;
  const FADE_DUR = 0.62;
  const FADE_OFFSET = 0.46;

  const wrapperW = textWrapper.offsetWidth || window.innerWidth;
  const wrapperH = textWrapper.offsetHeight || window.innerHeight;
  const gap = clamp(8, wrapperW * 0.01, 18);
  const logoRect = logoEl?.getBoundingClientRect();
  const wrapperRect = textWrapper.getBoundingClientRect();
  const lineY = logoRect
    ? logoRect.bottom - (wrapperRect.top + wrapperH / 2) + clamp(26, wrapperH * 0.055, 58)
    : clamp(52, wrapperH * 0.1, 90);
  const { finalVideoWidth } = videoLayout;
  const words = prepareLineWords(rows, primaryRowIndex, textWrapper);
  const wordWidths = words.map((word) => word.offsetWidth || 24);
  const lineState = { enteringIndex: -1, flowX: LINE_START_X, layout: 0 };
  const entryOffsets = words.map(() => ({ x: 0 }));
  const getLineWordCenter = (latestIndex: number, targetIndex: number, flowX: number) => {
    const totalWidth =
      wordWidths.slice(0, latestIndex + 1).reduce((sum, width) => sum + width, 0) +
      gap * Math.max(0, latestIndex);
    let cursor = -totalWidth / 2;

    for (let wordIndex = 0; wordIndex < targetIndex; wordIndex += 1) {
      cursor += wordWidths[wordIndex] + gap;
    }

    return cursor + wordWidths[targetIndex] / 2 + flowX;
  };
  const applyLineLayout = () => {
    const layout = clamp(0, lineState.layout, Math.max(words.length - 1, 0));
    const baseIndex = Math.floor(layout);
    const nextIndex = Math.min(Math.ceil(layout), words.length - 1);
    const fraction = nextIndex === baseIndex ? 1 : layout - baseIndex;
    const includedLastIndex = nextIndex;
    const effectiveWidths = wordWidths.map((width, wordIndex) => {
      if (wordIndex <= baseIndex) return width;
      if (wordIndex === nextIndex) return width * Math.max(0.001, fraction);
      return 0;
    });
    const totalWidth =
      effectiveWidths.slice(0, includedLastIndex + 1).reduce((sum, width) => sum + width, 0) +
      gap * Math.max(0, baseIndex) +
      (nextIndex > baseIndex ? gap * fraction : 0);
    let cursor = -totalWidth / 2;

    for (let wordIndex = 0; wordIndex <= includedLastIndex; wordIndex += 1) {
      if (wordIndex === lineState.enteringIndex) {
        cursor += effectiveWidths[wordIndex];
        if (wordIndex < baseIndex) cursor += gap;
        else if (wordIndex === baseIndex && nextIndex > baseIndex) cursor += gap * fraction;
        continue;
      }

      const effectiveWidth = effectiveWidths[wordIndex];
      const centerX = cursor + effectiveWidth / 2 + lineState.flowX + entryOffsets[wordIndex].x;

      gsap.set(words[wordIndex], { x: centerX, y: lineY });
      cursor += effectiveWidth;
      if (wordIndex < baseIndex) cursor += gap;
      else if (wordIndex === baseIndex && nextIndex > baseIndex) cursor += gap * fraction;
    }
  };
  const finalEntryT = WORD_START_T + Math.max(words.length - 1, 0) * WORD_GAP;
  const IMPLODE_T = finalEntryT + IMPLODE_DELAY;
  const FILL_T = IMPLODE_T;
  const FADE_T = IMPLODE_T + FADE_OFFSET;
  const cleanupT = FADE_T + FADE_DUR;
  const getFlowXAt = (time: number) => {
    const flowEndT = IMPLODE_T + IMPLODE_DUR * 0.35;
    const progress = clamp(0, (time - WORD_START_T) / Math.max(0.1, flowEndT - WORD_START_T), 1);

    return LINE_START_X + (LINE_END_X - LINE_START_X) * progress;
  };

  tl.to(
    videoEl,
    {
      filter: 'blur(0px)',
      duration: Math.max(0.1, FILL_T + FILL_DUR - WORD_START_T),
      ease: 'power2.out',
    },
    WORD_START_T
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

  tl.to(
    lineState,
    {
      flowX: LINE_END_X,
      duration: Math.max(0.1, IMPLODE_T + IMPLODE_DUR * 0.35 - WORD_START_T),
      ease: 'none',
      onUpdate: applyLineLayout,
    },
    WORD_START_T
  );

  words.forEach((word, wordIndex) => {
    const entryT = WORD_START_T + wordIndex * WORD_GAP;
    const joinT = entryT + WORD_ENTER_DUR;
    const flowAtJoin = getFlowXAt(joinT);
    const joinX = getLineWordCenter(wordIndex, wordIndex, flowAtJoin);

    tl.add(() => {
      lineState.enteringIndex = wordIndex;
      entryOffsets[wordIndex].x = 0;
      gsap.set(word, { x: joinX + 30, y: lineY, opacity: 0 });
      applyLineLayout();
    }, entryT);
    tl.to(
      lineState,
      {
        layout: wordIndex,
        duration: WORD_ENTER_DUR,
        ease: 'expo.out',
        onUpdate: applyLineLayout,
      },
      entryT
    );
    tl.to(
      word,
      {
        x: joinX,
        y: lineY,
        opacity: 1,
        duration: WORD_ENTER_DUR,
        ease: 'expo.out',
      },
      entryT
    );
    tl.add(() => {
      lineState.enteringIndex = -1;
      lineState.layout = wordIndex;
      applyLineLayout();
    }, joinT);
  });

  words.forEach((word) => {
    const stagger = Math.random() * 0.14;

    tl.to(
      word,
      {
        x: gsap.utils.random(-6, 6),
        y: gsap.utils.random(-4, 4),
        scale: 0.18,
        opacity: 0,
        duration: IMPLODE_DUR,
        ease: 'power3.in',
      },
      IMPLODE_T + stagger
    );
  });

  if (logoEl) {
    tl.to(logoEl, { opacity: 0, scale: 0.92, duration: FADE_DUR, ease: EASE_IN }, FADE_T);
  }
  tl.to(gO, { x: O_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(gParen, { x: PAREN_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(gClose, { x: CLOSE_TX, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);
  tl.to(
    utsideRect,
    {
      attr: { x: UTSIDE_CLIP_X_ICON, width: 0 },
      duration: LOGO_LEAVE_DUR,
      ease: EASE_IN_OUT,
    },
    IMPLODE_T
  );
  tl.to(erspRect, { attr: { width: 0 }, duration: LOGO_LEAVE_DUR, ease: EASE_IN_OUT }, IMPLODE_T);

  tl.to(introEl, { opacity: 0, duration: FADE_DUR, ease: EASE_IN }, FADE_T);
  tl.add(() => words.forEach((word) => gsap.set(word, { clearProps: 'willChange' })), cleanupT);
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

  // Restructure SVG for icon → wordmark animation
  prepareIntroLogo(svg, logoEl);
  const { gO, gParen, gClose, utsideRect, erspRect } = restructureLogo(svg);

  // Icon mode: groups translated to centre the tight "O(P)" symbol
  gsap.set(gO, { x: O_TX });
  gsap.set(gParen, { x: PAREN_TX });
  gsap.set(gClose, { x: CLOSE_TX });
  if (logoEl) gsap.set(logoEl, { opacity: 1 });

  // Init video
  const src = videoEl.getAttribute('data-src') || videoEl.getAttribute('src') || '';
  const videoReady = src ? attachVideo(videoEl, src) : Promise.resolve();
  const startIntro = () => {
    if (!_introActive || activeTl?.isActive()) return;

    gsap.to(introEl, { opacity: 1, duration: INTRO_FADE_IN_DUR, ease: 'power2.out' });
    activeTl?.play(0);
  };

  let activeRows = rows;
  let primaryRowIndex = getPrimaryRowIndex(activeRows);

  if (routeVariant === 'about') {
    rows.forEach((row) => gsap.set(row, { display: 'none', opacity: 0 }));

    const lineRow = createLineIntroRow(textWrapper);
    activeRows = [lineRow];
    primaryRowIndex = 0;

    runLineTimeline(
      introEl,
      videoEl,
      videoWrapEl,
      logoEl,
      gO,
      gParen,
      gClose,
      utsideRect,
      erspRect,
      activeRows,
      primaryRowIndex,
      textWrapper,
      videoLayout
    );
    videoReady.then(startIntro);
    return;
  }

  if (routeVariant === 'work') {
    const clockRow = cloneClockRowFromHomeIntro(introEl);

    if (clockRow) {
      rows.forEach((row) => gsap.set(row, { display: 'none', opacity: 0 }));
      textWrapper.appendChild(clockRow);
      activeRows = [clockRow];
      primaryRowIndex = 0;
    }

    runClockTimeline(
      introEl,
      videoEl,
      videoWrapEl,
      logoEl,
      gO,
      gParen,
      gClose,
      utsideRect,
      erspRect,
      activeRows,
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
