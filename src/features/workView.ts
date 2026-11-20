import gsap from 'gsap';
import Hls from 'hls.js';

import { applyHlsQuality, HLS_QUALITY_CONFIG } from '$utils/hlsQuality';

// ─────────────────────────────────────────────────────────────────────────────
// Work View Mode Switcher
//
// Manages three view modes on the Work page, driven by [viewTrigger] buttons:
//   'list'          → component-worklist visible, worklist-expand collapsed
//   'list-expanded' → component-worklist visible, worklist-expand open, no borders
//   'grid'          → component-workgrid visible, component-worklist hidden
//
// Additional hover interactions:
//   list mode          → mouse-follow cursor card showing the hovered item's media
//   list-expanded mode → dim + blur siblings of hovered .worklist-item; play expand video
//   grid mode          → play .work-media-embed video on hovered grid card
//
// Videos inside .work-media-embed use data-src (HLS .m3u8) — initialized lazily
// via HLS.js on first hover and play/paused on subsequent hovers.
// ─────────────────────────────────────────────────────────────────────────────

export type WorkViewMode = 'list' | 'list-expanded' | 'grid';

const DURATION_FAST = 0.22;
const DURATION_MED = 0.4;
const DURATION_SLOW = 0.55;
const DURATION_EXPAND = 0.45;
const EASE_OUT = 'power2.out';
const EASE_IN = 'power2.in';
const EASE_INOUT = 'power2.inOut';

const STORAGE_KEY = 'work-view-mode';

// The Expanded view is off until every row has its expand media. While off, a stored
// 'list-expanded' falls back to 'list' and its toggle does nothing (hidden in Webflow CSS).
const EXPANDED_VIEW_ENABLED = false;

// Shown until the visitor picks a view; their pick is remembered for the session.
const DEFAULT_VIEW_MODE: WorkViewMode = 'grid';

// Grid cards are the CMS items of .workgrid (currently .top-projects-card in Webflow).
// Not `.component-workgrid .w-dyn-item`: that would also match the nested category bubbles.
export const GRID_ITEM_SELECTOR = '.workgrid-item, .workgrid > .w-dyn-item';

let currentMode: WorkViewMode = DEFAULT_VIEW_MODE;
let container: HTMLElement | null = null;
let cleanupFns: (() => void)[] = [];

let itemBorderColor = '';
let listBorderColor = '';

// ─── Storage helpers ──────────────────────────────────────────────────────────

export function getStoredWorkViewMode(): WorkViewMode {
  try {
    const stored = sessionStorage.getItem(STORAGE_KEY);
    if (stored === 'list-expanded') return EXPANDED_VIEW_ENABLED ? stored : 'list';
    if (stored === 'list' || stored === 'grid') return stored;
  } catch {
    // sessionStorage unavailable
  }
  return DEFAULT_VIEW_MODE;
}

function saveWorkViewMode(mode: WorkViewMode) {
  try {
    sessionStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // sessionStorage unavailable
  }
}

// ─── HLS video helpers ────────────────────────────────────────────────────────
// Videos inside .work-media-embed use data-src for their HLS URL.
// We lazily initialize HLS.js on first play and track instances for cleanup.

const workHlsInstances: Hls[] = [];

function initWorkHls(video: HTMLVideoElement, url: string): void {
  // Already loaded — nothing to do
  if (video.src || video.getAttribute('data-hls-ready')) return;

  video.setAttribute('data-hls-ready', '1');

  if (Hls.isSupported() && url.includes('.m3u8')) {
    const hls = new Hls({ ...HLS_QUALITY_CONFIG, startPosition: -1, maxBufferLength: 15 });
    applyHlsQuality(hls, video);
    hls.loadSource(url);
    hls.attachMedia(video);
    workHlsInstances.push(hls);
  } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
    // Native HLS (Safari)
    video.src = url;
  } else {
    video.src = url;
  }
}

function playWorkVideo(video: HTMLVideoElement): void {
  const url = video.getAttribute('data-src') || '';
  if (!url) return;
  initWorkHls(video, url);
  video.play().catch(() => {});
}

function pauseWorkVideo(video: HTMLVideoElement): void {
  video.pause();
}

function resetWorkVideo(video: HTMLVideoElement): void {
  pauseWorkVideo(video);
  try {
    video.currentTime = 0;
  } catch {
    // Ignore reset failures for streams that aren't seekable yet.
  }
}

function showWorkVideo(video: HTMLVideoElement): void {
  video.style.display = 'block';
}

function hideWorkVideo(video: HTMLVideoElement): void {
  video.style.display = 'none';
}

function destroyWorkHls(): void {
  workHlsInstances.forEach((hls) => hls.destroy());
  workHlsInstances.length = 0;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function q<T extends HTMLElement>(sel: string): T[] {
  return container ? Array.from(container.querySelectorAll<T>(sel)) : [];
}

function qs<T extends HTMLElement>(sel: string): T | null {
  return container ? container.querySelector<T>(sel) : null;
}

function setActiveToggle(mode: WorkViewMode) {
  q<HTMLElement>('.view-toggle').forEach((el) => {
    el.classList.toggle('is-active', el.getAttribute('viewTrigger') === mode);
  });
}

// ─── Border helpers ───────────────────────────────────────────────────────────

function hideBorders(duration = DURATION_SLOW) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length)
    gsap.to(items, {
      borderBottomColor: 'rgba(0,0,0,0)',
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
    });
  if (list)
    gsap.to(list, {
      borderTopColor: 'rgba(0,0,0,0)',
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
    });
}

function showBorders(duration = DURATION_SLOW) {
  const items = q<HTMLElement>('.worklist-item');
  const list = qs<HTMLElement>('.worklist');
  if (items.length) {
    gsap.to(items, {
      borderBottomColor: itemBorderColor,
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(items, { clearProps: 'borderBottomColor' });
      },
    });
  }
  if (list) {
    gsap.to(list, {
      borderTopColor: listBorderColor,
      duration,
      ease: EASE_INOUT,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(list!, { clearProps: 'borderTopColor' });
      },
    });
  }
}

// ─── Expand / Collapse worklist-expand panels ─────────────────────────────────

function expandWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) {
    onComplete?.();
    return;
  }
  gsap.killTweensOf(items);
  items.forEach((el) =>
    gsap.set(el, { display: 'flex', height: 0, opacity: 0, overflow: 'hidden' })
  );
  gsap.to(items, {
    height: 'auto',
    opacity: 1,
    duration: DURATION_EXPAND,
    ease: EASE_OUT,
    stagger: 0.04,
    overwrite: 'auto',
    onComplete,
    clearProps: 'height,overflow',
  });
}

function collapseWorklistExpand(items: HTMLElement[], onComplete?: () => void) {
  if (!items.length) {
    onComplete?.();
    return;
  }
  gsap.killTweensOf(items);
  items.forEach((el) => {
    el.querySelectorAll<HTMLVideoElement>('.work-media-embed video').forEach((video) => {
      resetWorkVideo(video);
      hideWorkVideo(video);
    });
  });
  gsap.to(items, {
    opacity: 0,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.02,
    overwrite: 'auto',
    onComplete: () => {
      gsap.to(items, {
        height: 0,
        duration: DURATION_FAST,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(items, { display: 'none', clearProps: 'height,opacity,overflow' });
          onComplete?.();
        },
      });
    },
  });
}

// ─── Staggered exit helpers ───────────────────────────────────────────────────

function staggerExitListItems(onComplete: () => void) {
  const items = q<HTMLElement>('.worklist-item');
  if (!items.length) {
    onComplete();
    return;
  }
  gsap.to(items, {
    opacity: 0,
    y: -8,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.03,
    overwrite: 'auto',
    onComplete,
  });
}

function staggerExitGridItems(onComplete: () => void) {
  const items = q<HTMLElement>(GRID_ITEM_SELECTOR);
  if (!items.length) {
    onComplete();
    return;
  }
  gsap.to(items, {
    opacity: 0,
    y: -8,
    duration: DURATION_FAST,
    ease: EASE_IN,
    stagger: 0.03,
    overwrite: 'auto',
    onComplete,
  });
}

// ─── Mode transitions ─────────────────────────────────────────────────────────

function toList(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const listItems = q<HTMLElement>('.worklist-item');

  if (from === 'grid') {
    showBorders();
    staggerExitGridItems(() => {
      gsap.to(workgrid, {
        opacity: 0,
        duration: DURATION_MED,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(workgrid, { display: 'none' });
          gsap.killTweensOf(expandPanels);
          expandPanels.forEach((el) =>
            gsap.set(el, { display: 'none', opacity: 0, height: 0, clearProps: 'overflow' })
          );
          gsap.set(worklist, { display: 'block', opacity: 0 });
          gsap.set(listItems, { opacity: 0, y: 12 });
          gsap.to(worklist, {
            opacity: 1,
            duration: DURATION_MED,
            ease: EASE_OUT,
            overwrite: 'auto',
          });
          gsap.to(listItems, {
            opacity: 1,
            y: 0,
            duration: DURATION_MED,
            ease: EASE_OUT,
            stagger: 0.05,
            overwrite: 'auto',
          });
        },
      });
    });
  } else if (from === 'list-expanded') {
    collapseWorklistExpand(expandPanels, () => {
      showBorders();
    });
  }
}

function toListExpanded(from: WorkViewMode) {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');

  if (from === 'grid') {
    staggerExitGridItems(() => {
      gsap.to(workgrid, {
        opacity: 0,
        duration: DURATION_MED,
        ease: EASE_IN,
        overwrite: 'auto',
        onComplete: () => {
          gsap.set(workgrid, { display: 'none' });
          gsap.killTweensOf(expandPanels);
          expandPanels.forEach((el) =>
            gsap.set(el, { display: 'flex', height: 'auto', opacity: 1, clearProps: 'overflow' })
          );
          gsap.set(worklist, { display: 'block', opacity: 0 });
          hideBorders(0);
          const listItems = q<HTMLElement>('.worklist-item');
          gsap.set(listItems, { opacity: 0, y: 12 });
          gsap.to(worklist, {
            opacity: 1,
            duration: DURATION_MED,
            ease: EASE_OUT,
            overwrite: 'auto',
          });
          gsap.to(listItems, {
            opacity: 1,
            y: 0,
            duration: DURATION_MED,
            ease: EASE_OUT,
            stagger: 0.05,
            overwrite: 'auto',
          });
        },
      });
    });
  } else if (from === 'list') {
    hideBorders();
    expandWorklistExpand(expandPanels);
  }
}

function toGrid() {
  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const gridItems = q<HTMLElement>(GRID_ITEM_SELECTOR);

  q<HTMLVideoElement>('.worklist-expand .work-media-embed video').forEach((video) => {
    resetWorkVideo(video);
    hideWorkVideo(video);
  });

  const showGrid = () => {
    gsap.set(workgrid, { display: 'block', opacity: 0 });
    gsap.set(gridItems, { opacity: 0, y: 16 });
    gsap.to(workgrid, { opacity: 1, duration: DURATION_MED, ease: EASE_OUT, overwrite: 'auto' });
    gsap.to(gridItems, {
      opacity: 1,
      y: 0,
      duration: DURATION_MED,
      ease: EASE_OUT,
      stagger: 0.06,
      delay: 0.1,
      overwrite: 'auto',
    });
  };

  staggerExitListItems(() => {
    gsap.to(worklist, {
      opacity: 0,
      duration: DURATION_FAST,
      ease: EASE_IN,
      overwrite: 'auto',
      onComplete: () => {
        gsap.set(worklist, { display: 'none' });
        showGrid();
      },
    });
  });
}

// ─── Cursor card (list mode) ──────────────────────────────────────────────────
// JS-injected fixed div that follows the mouse. Shows the hovered item's media:
//   - HLS video from .worklist-expand .work-media-embed video[data-src] if available
//   - Falls back to background image from .worklist-media-item
//
// Required CSS in Webflow .global-styles embed:
//   .worklist-cursor-card { position:fixed; width:320px; height:220px; top:0; left:0;
//     overflow:hidden; background-size:cover; background-position:center;
//     border-radius:3px; pointer-events:none; z-index:100;
//     will-change:transform,opacity; }
//   .worklist-cursor-card video { width:100%; height:100%; object-fit:cover;
//     display:block; }

let cursorCard: HTMLDivElement | null = null;
let cursorVideo: HTMLVideoElement | null = null;
let cursorHls: Hls | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cursorXTo: ((...args: any[]) => any) | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cursorYTo: ((...args: any[]) => any) | null = null;
let lastMouseX = 0;
let lastMouseY = 0;
// Bumped whenever the hovered row changes, so a late image/video "ready" from an earlier row
// can't reveal the card.
let cursorHoverToken = 0;

// ─── Hover image preloading ───────────────────────────────────────────────────
// The hover image is the row's "Image - Hero" (CMS), bound as the background of the collapsed
// .worklist-expand embed. Backgrounds inside display:none aren't fetched, so without preloading
// the first hover over each row showed an empty card until a ~170KB image downloaded — by
// which time the cursor had usually moved on (rows without a video showed nothing at all).

// Fetched a couple at a time in list order rather than all at once: on a slow connection a dozen
// parallel downloads all finish late together, whereas a short queue makes each one usable
// as early as possible. A hovered row that hasn't started yet jumps the queue.
const PRELOAD_CONCURRENCY = 2;
const hoverImageLoads = new Map<string, Promise<boolean>>();
const hoverImageResolvers = new Map<string, (loaded: boolean) => void>();
let preloadQueue: string[] = [];
let preloadsInFlight = 0;

function getBackgroundUrl(el: HTMLElement | null): string {
  const bg = el?.style.backgroundImage ?? '';
  const match = /url\(["']?(.*?)["']?\)/.exec(bg);
  return match?.[1] ?? '';
}

/** Resolves once the image is downloaded and decoded (false if it failed). Doesn't fetch it. */
function hoverImageReady(url: string): Promise<boolean> {
  let ready = hoverImageLoads.get(url);
  if (!ready) {
    ready = new Promise<boolean>((resolve) => hoverImageResolvers.set(url, resolve));
    hoverImageLoads.set(url, ready);
  }
  return ready;
}

function fetchHoverImage(url: string) {
  const resolve = hoverImageResolvers.get(url);
  if (!resolve) return; // already fetched or fetching
  hoverImageResolvers.delete(url);
  preloadsInFlight += 1;

  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  img
    .decode()
    .then(
      () => true,
      () => img.complete && img.naturalWidth > 0
    )
    .then((loaded) => {
      resolve(loaded);
      preloadsInFlight -= 1;
      pumpPreloadQueue();
    });
}

function pumpPreloadQueue() {
  while (preloadsInFlight < PRELOAD_CONCURRENCY && preloadQueue.length) {
    fetchHoverImage(preloadQueue.shift()!);
  }
}

/** Waits for the hover image, fetching it now if the preload queue hasn't reached it. */
function loadHoverImage(url: string): Promise<boolean> {
  const ready = hoverImageReady(url);
  if (hoverImageResolvers.has(url)) {
    preloadQueue = preloadQueue.filter((queued) => queued !== url);
    fetchHoverImage(url);
  }
  return ready;
}

function preloadHoverImages(urls: string[]) {
  // The cursor card only exists for mouse/trackpad users.
  if (!window.matchMedia('(hover: hover)').matches) return;
  urls.forEach((url) => hoverImageReady(url));
  preloadQueue = urls.filter((url) => hoverImageResolvers.has(url));
  // Safari has no requestIdleCallback.
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(pumpPreloadQueue, { timeout: 1500 });
  } else {
    setTimeout(pumpPreloadQueue, 300);
  }
}

// The card's top-left sits on the cursor, but is kept this far inside the viewport, so near the
// right/bottom edge it stops instead of going off-screen (the cursor then moves over it).
const CURSOR_CARD_EDGE_GAP = 16;
let cursorCardWidth = 0;
let cursorCardHeight = 0;
let cursorCardResizeObserver: ResizeObserver | null = null;

/** Card position for a mouse position, clamped to the viewport. */
function getCursorCardTarget(mouseX: number, mouseY: number) {
  const { clientWidth, clientHeight } = document.documentElement; // excludes the scrollbar
  const maxX = clientWidth - cursorCardWidth - CURSOR_CARD_EDGE_GAP;
  const maxY = clientHeight - cursorCardHeight - CURSOR_CARD_EDGE_GAP;
  return {
    x: Math.max(CURSOR_CARD_EDGE_GAP, Math.min(mouseX, maxX)),
    y: Math.max(CURSOR_CARD_EDGE_GAP, Math.min(mouseY, maxY)),
  };
}

function moveCursorCard() {
  const { x, y } = getCursorCardTarget(lastMouseX, lastMouseY);
  cursorXTo?.(x);
  cursorYTo?.(y);
}

// Only the reveal/hide props: a plain killTweensOf(card) also killed the quickTo x/y tweens, so
// once the card had faded in it stayed frozen where the mouse first entered the row.
const CURSOR_CARD_FADE_PROPS = 'opacity,visibility,scale';

function initCursorCard() {
  cursorCard = document.createElement('div');
  cursorCard.className = 'worklist-cursor-card';
  cursorVideo = document.createElement('video');
  cursorVideo.muted = true;
  cursorVideo.loop = true;
  cursorVideo.playsInline = true;
  cursorVideo.preload = 'none';
  // Hidden by default — only shown when a video URL is available for the hovered item.
  // Without this, the video element covers the background-image fallback.
  cursorVideo.style.display = 'none';
  cursorCard.appendChild(cursorVideo);
  gsap.set(cursorCard, { opacity: 0, scale: 0.9 });
  document.body.appendChild(cursorCard);
  cursorXTo = gsap.quickTo(cursorCard, 'x', { duration: 0.45, ease: 'power3' });
  cursorYTo = gsap.quickTo(cursorCard, 'y', { duration: 0.45, ease: 'power3' });

  // Size comes from .global-styles (and may change per breakpoint); offset sizes ignore the
  // reveal's scale transform.
  const card = cursorCard;
  const measure = () => {
    cursorCardWidth = card.offsetWidth;
    cursorCardHeight = card.offsetHeight;
  };
  measure();
  cursorCardResizeObserver = new ResizeObserver(measure);
  cursorCardResizeObserver.observe(card);
}

function snapCursorCardToMouse() {
  const { x, y } = getCursorCardTarget(lastMouseX, lastMouseY);
  // quickTo's second argument is the start value: jump straight there instead of sliding over
  // from the previous row's position.
  cursorXTo?.(x, x);
  cursorYTo?.(y, y);
}

function loadCursorVideo(url: string) {
  if (!cursorVideo) return;
  if (cursorHls) {
    cursorHls.destroy();
    cursorHls = null;
  }
  if (Hls.isSupported() && url.includes('.m3u8')) {
    cursorHls = new Hls({ ...HLS_QUALITY_CONFIG, startPosition: -1, maxBufferLength: 10 });
    applyHlsQuality(cursorHls, cursorVideo);
    cursorHls.loadSource(url);
    cursorHls.attachMedia(cursorVideo);
    cursorHls.on(Hls.Events.MANIFEST_PARSED, () => cursorVideo?.play().catch(() => {}));
  } else if (cursorVideo.canPlayType('application/vnd.apple.mpegurl')) {
    cursorVideo.src = url;
    cursorVideo.play().catch(() => {});
  }
}

function resetCursorMedia() {
  cursorHoverToken += 1;
  if (cursorHls) {
    cursorHls.destroy();
    cursorHls = null;
  }
  if (cursorVideo) {
    cursorVideo.style.display = 'none';
    cursorVideo.pause();
    try {
      cursorVideo.currentTime = 0;
    } catch {
      // Ignore reset failures while media is unloading.
    }
    cursorVideo.src = '';
  }
  if (cursorCard) cursorCard.style.backgroundImage = '';
}

function showCursorCard() {
  if (!cursorCard) return;
  gsap.killTweensOf(cursorCard, CURSOR_CARD_FADE_PROPS);
  gsap.set(cursorCard, { visibility: 'visible' });
  gsap.to(cursorCard, {
    autoAlpha: 1,
    scale: 1,
    duration: 0.3,
    ease: EASE_OUT,
    overwrite: 'auto',
  });
}

function hideCursorCard(immediate = false) {
  if (!cursorCard) return;
  gsap.killTweensOf(cursorCard, CURSOR_CARD_FADE_PROPS);
  resetCursorMedia();

  if (immediate) {
    gsap.set(cursorCard, { autoAlpha: 0, scale: 0.9 });
    return;
  }

  gsap.to(cursorCard, {
    autoAlpha: 0,
    scale: 0.9,
    duration: 0.2,
    ease: EASE_IN,
    overwrite: 'auto',
  });
}

function destroyCursorCard() {
  resetCursorMedia();
  if (cursorVideo) {
    cursorVideo = null;
  }
  cursorCardResizeObserver?.disconnect();
  cursorCardResizeObserver = null;
  if (cursorCard) gsap.killTweensOf(cursorCard);
  cursorCard?.remove();
  cursorCard = null;
  cursorXTo = null;
  cursorYTo = null;
}

// ─── Expanded hover dimming (list-expanded mode) ──────────────────────────────

function dimSiblings(hovered: HTMLElement) {
  const all = q<HTMLElement>('.worklist-item');
  all.forEach((el) => {
    if (el === hovered) {
      gsap.to(el, {
        opacity: 1,
        filter: 'blur(0px)',
        duration: 0.25,
        ease: EASE_OUT,
        overwrite: 'auto',
      });
    } else {
      gsap.to(el, {
        opacity: 0.66,
        filter: 'blur(4px)',
        duration: 0.25,
        ease: EASE_OUT,
        overwrite: 'auto',
      });
    }
  });
}

function restoreAllItems() {
  gsap.to(q<HTMLElement>('.worklist-item'), {
    opacity: 1,
    filter: 'blur(0px)',
    duration: 0.3,
    ease: EASE_OUT,
    overwrite: 'auto',
  });
  q<HTMLVideoElement>('.worklist-expand .work-media-embed video').forEach((video) => {
    resetWorkVideo(video);
    hideWorkVideo(video);
  });
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function initWorkView(pageContainer: HTMLElement) {
  container = pageContainer;

  const savedMode = getStoredWorkViewMode();
  currentMode = savedMode;

  const worklist = qs<HTMLElement>('.component-worklist');
  const workgrid = qs<HTMLElement>('.component-workgrid');
  const expandPanels = q<HTMLElement>('.worklist-expand');
  const listItems = q<HTMLElement>('.worklist-item');
  const wl = qs<HTMLElement>('.worklist');

  if (listItems.length) itemBorderColor = getComputedStyle(listItems[0]).borderBottomColor;
  if (wl) listBorderColor = getComputedStyle(wl).borderTopColor;

  // Apply initial visual state for the restored mode
  if (savedMode === 'grid') {
    if (worklist) gsap.set(worklist, { display: 'none', opacity: 0 });
    if (workgrid) gsap.set(workgrid, { display: 'block', opacity: 1 });
  } else if (savedMode === 'list-expanded') {
    if (worklist) gsap.set(worklist, { display: 'block', opacity: 1 });
    if (workgrid) gsap.set(workgrid, { display: 'none', opacity: 0 });
    gsap.killTweensOf(expandPanels);
    expandPanels.forEach((el) =>
      gsap.set(el, { display: 'flex', height: 'auto', opacity: 1, clearProps: 'overflow' })
    );
    hideBorders(0);
  } else {
    if (worklist) gsap.set(worklist, { display: 'block', opacity: 1 });
    if (workgrid) gsap.set(workgrid, { display: 'none', opacity: 0 });
    expandPanels.forEach((el) => gsap.set(el, { display: 'none', height: 0, opacity: 0 }));
  }

  q<HTMLVideoElement>('.work-media-embed video').forEach((video) => {
    resetWorkVideo(video);
    hideWorkVideo(video);
  });

  setActiveToggle(savedMode);
  initCursorCard();

  // ── Mouse tracking ─────────────────────────────────────────────────────────
  const onMouseMove = (e: MouseEvent) => {
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;
    moveCursorCard();
  };
  document.addEventListener('mousemove', onMouseMove);

  // ── Per-item hover: worklist-item ──────────────────────────────────────────
  const itemHandlers: { el: HTMLElement; enter: () => void; leave: () => void }[] = [];
  const hoverImageUrls: string[] = [];

  listItems.forEach((item) => {
    // The background image (from CMS) is set as inline style on .work-media-embed itself
    const mediaEmbed = item.querySelector<HTMLElement>('.worklist-expand .work-media-embed');
    // Video lives inside the expand panel embed — available even when panel is collapsed
    const expandVideo = item.querySelector<HTMLVideoElement>(
      '.worklist-expand .work-media-embed video'
    );
    const expandVideoUrl = expandVideo?.getAttribute('data-src') || '';
    const imageUrl = getBackgroundUrl(mediaEmbed);
    if (imageUrl) hoverImageUrls.push(imageUrl);

    const onEnter = () => {
      if (currentMode === 'list') {
        if (!cursorCard || !cursorVideo) return;
        // Nothing to show (no hero image or video in the CMS) — keep the card hidden.
        if (!imageUrl && !expandVideoUrl) return;

        const token = (cursorHoverToken += 1);
        const card = cursorCard;
        const video = cursorVideo;
        const reveal = () => {
          if (token === cursorHoverToken && currentMode === 'list') showCursorCard();
        };
        snapCursorCardToMouse();

        // The hero image is the card background in both cases: on its own for rows without a
        // video, and as the poster under the video while the stream starts.
        card.style.backgroundImage = imageUrl ? `url("${imageUrl}")` : '';

        if (expandVideoUrl) {
          video.style.display = 'block';
          video.style.opacity = '0';
          video.addEventListener(
            'playing',
            () => {
              if (token !== cursorHoverToken) return;
              video.style.opacity = '1';
              reveal();
            },
            { once: true }
          );
          loadCursorVideo(expandVideoUrl);
        } else {
          video.style.display = 'none';
          video.pause();
          video.removeAttribute('src');
        }

        // Reveal once there's something to see, instead of an empty card.
        if (imageUrl) {
          loadHoverImage(imageUrl).then((loaded) => {
            if (loaded) reveal();
          });
        }
      } else if (currentMode === 'list-expanded') {
        dimSiblings(item);
        if (expandVideo && expandVideoUrl) {
          showWorkVideo(expandVideo);
          playWorkVideo(expandVideo);
        }
      }
    };

    const onLeave = () => {
      if (currentMode === 'list') {
        hideCursorCard(true);
      } else if (currentMode === 'list-expanded') {
        if (expandVideo) {
          resetWorkVideo(expandVideo);
          hideWorkVideo(expandVideo);
        }
      }
    };

    item.addEventListener('mouseenter', onEnter);
    item.addEventListener('mouseleave', onLeave);
    itemHandlers.push({ el: item, enter: onEnter, leave: onLeave });
  });

  preloadHoverImages(hoverImageUrls);

  // ── Per-item hover: workgrid-item ──────────────────────────────────────────
  const gridItems = q<HTMLElement>(GRID_ITEM_SELECTOR);
  const gridItemHandlers: { el: HTMLElement; enter: () => void; leave: () => void }[] = [];

  gridItems.forEach((gridItem) => {
    const gridVideo = gridItem.querySelector<HTMLVideoElement>('.work-media-embed video');
    const gridVideoUrl = gridVideo?.getAttribute('data-src') || '';

    const onEnter = () => {
      if (currentMode !== 'grid' || !gridVideo || !gridVideoUrl) return;
      showWorkVideo(gridVideo);
      playWorkVideo(gridVideo);
    };
    const onLeave = () => {
      if (currentMode !== 'grid' || !gridVideo) return;
      resetWorkVideo(gridVideo);
      hideWorkVideo(gridVideo);
    };

    gridItem.addEventListener('mouseenter', onEnter);
    gridItem.addEventListener('mouseleave', onLeave);
    gridItemHandlers.push({ el: gridItem, enter: onEnter, leave: onLeave });
  });

  // ── Worklist container leave ───────────────────────────────────────────────
  const worklistEl = qs<HTMLElement>('.component-worklist');
  const onWorklistLeave = () => {
    hideCursorCard(true);
    if (currentMode === 'list-expanded') restoreAllItems();
  };
  worklistEl?.addEventListener('mouseleave', onWorklistLeave);

  // ── Toggle clicks ──────────────────────────────────────────────────────────
  const toggles = q<HTMLElement>('.view-toggle');
  const toggleHandlers: { el: HTMLElement; fn: (e: Event) => void }[] = [];

  toggles.forEach((toggle) => {
    const trigger = toggle.getAttribute('viewTrigger') as WorkViewMode | null;
    if (!trigger) return;

    const handler = (e: Event) => {
      e.preventDefault();
      if (trigger === 'list-expanded' && !EXPANDED_VIEW_ENABLED) return;
      if (trigger === currentMode) return;

      // Hide cursor card
      hideCursorCard(true);

      restoreAllItems();
      q<HTMLVideoElement>(`:is(${GRID_ITEM_SELECTOR}) .work-media-embed video`).forEach((video) => {
        resetWorkVideo(video);
        hideWorkVideo(video);
      });

      const from = currentMode;
      currentMode = trigger;
      saveWorkViewMode(trigger);
      setActiveToggle(trigger);

      if (trigger === 'list') toList(from);
      else if (trigger === 'list-expanded') toListExpanded(from);
      else if (trigger === 'grid') toGrid();
    };

    toggle.addEventListener('click', handler);
    toggleHandlers.push({ el: toggle, fn: handler });
  });

  // ── Cleanup registry ───────────────────────────────────────────────────────
  cleanupFns = [
    () => document.removeEventListener('mousemove', onMouseMove),
    ...itemHandlers.map(({ el, enter, leave }) => () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    }),
    ...gridItemHandlers.map(({ el, enter, leave }) => () => {
      el.removeEventListener('mouseenter', enter);
      el.removeEventListener('mouseleave', leave);
    }),
    () => worklistEl?.removeEventListener('mouseleave', onWorklistLeave),
    ...toggleHandlers.map(
      ({ el, fn }) =>
        () =>
          el.removeEventListener('click', fn)
    ),
  ];
}

export function destroyWorkView() {
  cleanupFns.forEach((fn) => fn());
  cleanupFns = [];
  destroyWorkHls();
  destroyCursorCard();
  preloadQueue = []; // unfetched images stay pending and are re-queued on the next visit
  container = null;
  currentMode = DEFAULT_VIEW_MODE;
  itemBorderColor = '';
  listBorderColor = '';
}
