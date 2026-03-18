import Lenis from 'lenis';

const LOOP_SLIDER_SELECTORS = {
  root: ['[data-loop-slider="root"]', '.loop-slider-wrapper', '.slider-section'],
  track: ['[data-loop-slider="track"]', '.loop-slider-track'],
  list: ['[data-loop-slider="list"]', '.loop-slider', '.slider-wrapper'],
  loop: [
    '[data-loop-slider="loop"]',
    '.loop-slider.w-dyn-items',
    '.loop-slider',
    '.loop-slider.w-dyn-list',
  ],
  item: ['[data-loop-slider="item"]', '.slide', '.slide-w'],
  content: ['[data-loop-slider="content"]', '.home-project-card'],
  blur: ['[data-loop-slider="blur"]', '.slide-blur'],
  media: ['[data-loop-slider="focus"]', '.home-project-card'],
} as const satisfies Record<string, readonly string[]>;

const LOOP_SLIDER_CONFIG = {
  baseScale: 0.85,
  focusScale: 1,
  blurMax: 100,
  translateMax: 0,
  lerp: 0.08,
  progressLerp: 0.12,
  minOpacity: 0.66,
  safeZoneBuffer: 0,
};

type SlideState = {
  node: HTMLElement;
  contentNode: HTMLElement;
  blurNode: HTMLElement | null;
  focusNodes: HTMLElement[];
  progress: number;
  targetProgress: number;
  scale: number;
  targetScale: number;
};

const LENIS_STYLE_ID = 'loop-slider-lenis-styles';
const LENIS_STYLES =
  'html.lenis,html.lenis body{height:auto}.lenis:not(.lenis-autoToggle).lenis-stopped{overflow:clip}.lenis [data-lenis-prevent],.lenis [data-lenis-prevent-wheel],.lenis [data-lenis-prevent-touch]{overscroll-behavior:contain}.lenis.lenis-smooth iframe{pointer-events:none}.lenis.lenis-autoToggle{transition-property:overflow;transition-duration:1ms;transition-behavior:allow-discrete}';
const LOOP_SLIDER_SNAP_ATTR = 'data-loop-slider-snap';

let sliderAnimationFrame: number | null = null;
let sliderScrollListenerAttached = false;
let sliderResizeListenerAttached = false;

const loopSliderInstances: LoopSliderInstance[] = [];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const ensureLenisStyles = () => {
  if (document.getElementById(LENIS_STYLE_ID)) {
    return;
  }

  const style = document.createElement('style');
  style.id = LENIS_STYLE_ID;
  style.textContent = LENIS_STYLES;
  document.head.appendChild(style);
};

const queryElementWithFallback = <T extends Element>(
  root: ParentNode | Document,
  selectors: readonly string[]
): T | null => {
  for (const selector of selectors) {
    const element = root.querySelector<T>(selector);
    if (element) {
      return element;
    }
  }

  return null;
};

const queryAllWithFallback = <T extends Element>(
  root: ParentNode | Document,
  selectors: readonly string[]
): T[] => {
  for (const selector of selectors) {
    const elements = Array.from(root.querySelectorAll<T>(selector));
    if (elements.length) {
      return elements;
    }
  }

  return [];
};

const getLoopSliderRoots = () => {
  const roots = queryAllWithFallback<HTMLElement>(document, LOOP_SLIDER_SELECTORS.root);
  return roots.filter((root) => queryElementWithFallback(root, LOOP_SLIDER_SELECTORS.list));
};

let currentSource: HTMLElement | null = null;

/**
 * Cleanly swap text and items without FLIP morphs or crossfades.
 */
const updateActiveDetailsFromSource = (source: HTMLElement) => {
  if (source === currentSource) return false;
  currentSource = source;

  const targetNormal = document.querySelector('.list-title-normal');
  const targetSuper = document.querySelector('.list-title-super, .list-subtitle');
  const servicesOut = document.querySelector('.activeitem-services-list');

  const sourceTitle = source.querySelector('.cms-homepage-title')?.textContent?.trim() || '';
  const sourceSuper = source.querySelector('.cms-homepage-super')?.textContent?.trim() || '';

  const incomingLabels = Array.from(source.querySelectorAll('.active-services-source-item')).map(
    (item) => item.textContent?.trim() || ''
  );

  // Instant update
  if (targetNormal && targetNormal.textContent !== sourceTitle) {
    targetNormal.textContent = sourceTitle;
  }

  if (targetSuper) {
    const formattedSuper = sourceSuper ? ` // ${sourceSuper}` : '';
    if (targetSuper.textContent !== formattedSuper) {
      targetSuper.textContent = formattedSuper;
    }
  }

  if (servicesOut) {
    servicesOut.innerHTML = '';
    incomingLabels.forEach((label) => {
      if (!label) return;
      const li = document.createElement('li');
      li.className = 'activeitem-service-bubble';
      const inner = document.createElement('div');
      inner.textContent = label;
      li.appendChild(inner);
      servicesOut.appendChild(li);
    });
  }

  return true;
};

class LoopSliderInstance {
  public readonly root: HTMLElement;
  public readonly prefersInfinite: boolean;
  private readonly config = LOOP_SLIDER_CONFIG;
  private slides: SlideState[] = [];
  private viewportHeight = window.innerHeight || 0;
  private primaryList: HTMLElement | null = null;
  private loopHeight = 0;
  private loopOffset = 0;
  private virtualScroll = 0;
  private loopIndex = 0;
  private previousScroll: number | null = null;
  private trackElement: HTMLElement | null = null;
  private loopLists: HTMLElement[] = [];
  private localLenis: Lenis | null = null;
  private localLenisRaf: number | null = null;
  private handleLenisScroll?: () => void;
  private mostVisibleSlide: SlideState | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.prefersInfinite = root.dataset.loopSliderInfinite !== 'false';

    let track = queryElementWithFallback<HTMLElement>(root, LOOP_SLIDER_SELECTORS.track);
    const list = queryElementWithFallback<HTMLElement>(root, LOOP_SLIDER_SELECTORS.list);

    // Auto-inject missing track wrapper if Webflow deleted it
    if (!track && list) {
      track = document.createElement('div');
      track.style.position = 'relative'; // CRITICAL: acts as offsetParent anchor
      track.className = 'loop-slider-track';
      list.parentNode?.insertBefore(track, list);
      track.appendChild(list);
    }

    if (!list || !track) {
      throw new Error(
        'Loop slider list not found. Add data-loop-slider="list" to the slider wrapper.'
      );
    }

    this.primaryList = list;
    this.loopHeight = this.primaryList.scrollHeight;
    this.trackElement = track;
    this.prepareLoopLists(track);

    // Fade-in list natively after ready
    this.primaryList.style.opacity = '0';
    this.primaryList.style.transition = 'opacity 0.4s ease-out';

    if (this.prefersInfinite) {
      this.initLocalLenis();
    }

    this.collectSlides();
  }

  public destroy() {
    if (this.handleLenisScroll && this.localLenis) {
      this.localLenis.off('scroll', this.handleLenisScroll);
    }

    if (this.localLenisRaf !== null) {
      window.cancelAnimationFrame(this.localLenisRaf);
      this.localLenisRaf = null;
    }

    this.localLenis?.destroy();
    this.localLenis = null;
  }

  private initLocalLenis() {
    if (this.localLenis || !this.trackElement) {
      return;
    }

    ensureLenisStyles();

    this.root.style.overflow = 'hidden';
    this.root.style.position = 'relative';
    this.root.style.touchAction = 'none'; // Prevent iOS native interference
    this.trackElement.style.willChange = 'transform';

    this.localLenis = new Lenis({
      wrapper: this.root,
      content: this.trackElement,
      smoothWheel: true,
      infinite: true,
      syncTouch: true,
      touchMultiplier: 0.65,
    });

    this.handleLenisScroll = () => {
      this.measure();
    };

    this.localLenis.on('scroll', this.handleLenisScroll);

    const raf = (time: number) => {
      this.localLenis?.raf(time);
      this.localLenisRaf = window.requestAnimationFrame(raf);
    };

    this.localLenisRaf = window.requestAnimationFrame(raf);

    // Reveal list after initialization
    requestAnimationFrame(() => {
      if (this.primaryList) {
        this.primaryList.style.opacity = '1';
      }
    });
  }

  private collectSlides() {
    const nodes = queryAllWithFallback<HTMLElement>(this.root, LOOP_SLIDER_SELECTORS.item);

    this.slides = nodes.map((node) => ({
      node,
      contentNode:
        queryElementWithFallback<HTMLElement>(node, LOOP_SLIDER_SELECTORS.content) ?? node,
      blurNode: queryElementWithFallback<HTMLElement>(node, LOOP_SLIDER_SELECTORS.blur),
      focusNodes: (() => {
        const focusTargets: HTMLElement[] = [];
        const primaryFocus = queryElementWithFallback<HTMLElement>(
          node,
          LOOP_SLIDER_SELECTORS.media
        );
        if (primaryFocus) {
          focusTargets.push(primaryFocus);
        }
        return focusTargets.length ? focusTargets : [node];
      })(),
      progress: 0,
      targetProgress: 0,
      scale: this.config.baseScale,
      targetScale: this.config.baseScale,
    }));

    this.slides.forEach((slide) => {
      const content = slide.contentNode;
      content.style.willChange = 'transform, opacity, filter';
      content.style.transformOrigin = 'center center';
    });
  }

  private applySlideStyles(slide: SlideState) {
    const opacity = this.config.minOpacity + (1 - this.config.minOpacity) * slide.progress;

    slide.contentNode.style.transform = `scale(${slide.scale.toFixed(4)})`;
    slide.contentNode.style.opacity = opacity.toFixed(3);

    slide.focusNodes.forEach((target) => {
      const visibility =
        (target as HTMLElement & { _currentVisibility?: number })._currentVisibility ??
        slide.progress;
      const bValue = (1 - visibility) * this.config.blurMax;
      const xRayIntensity = (1 - visibility) * 100;
      target.style.filter = `blur(${bValue.toFixed(2)}px) grayscale(${xRayIntensity.toFixed(1)}%) invert(${xRayIntensity.toFixed(1)}%)`;
    });
  }

  private prepareLoopLists(track: HTMLElement) {
    this.loopLists = queryAllWithFallback<HTMLElement>(track, LOOP_SLIDER_SELECTORS.loop);

    if (!this.loopLists.length) return;

    if (this.loopLists.length < 2) {
      const clone = this.loopLists[0].cloneNode(true) as HTMLElement;
      track.appendChild(clone);
      this.loopLists.push(clone);
    }
  }

  private rotateLists(direction: 'forward' | 'backward') {
    if (!this.trackElement || !this.loopLists.length) return;

    if (direction === 'forward') {
      const first = this.loopLists.shift();
      if (first) {
        this.trackElement.appendChild(first);
        this.loopLists.push(first);
      }
    } else {
      const last = this.loopLists.pop();
      if (last) {
        const firstChild = this.trackElement.firstElementChild;
        if (firstChild) {
          this.trackElement.insertBefore(last, firstChild);
        } else {
          this.trackElement.appendChild(last);
        }
        this.loopLists.unshift(last);
      }
    }
  }

  private computeLoopHeight() {
    if (!this.primaryList) return this.loopHeight;
    const height = this.primaryList.scrollHeight || this.primaryList.offsetHeight;
    if (height) this.loopHeight = height;
    return this.loopHeight;
  }

  private applyLoopOffset() {
    if (!this.prefersInfinite || !this.localLenis || !this.trackElement) return;

    const loopHeight = this.loopHeight || this.computeLoopHeight();
    if (!loopHeight) return;

    const { scroll, limit } = this.localLenis;

    if (this.previousScroll === null) {
      this.previousScroll = scroll;
      this.virtualScroll = 0;
      this.loopIndex = 0;
      this.loopOffset = 0;
      this.trackElement.style.transform = '';
      return;
    }

    let delta = scroll - this.previousScroll;
    if (Math.abs(delta) > limit * 0.5) {
      delta += delta > 0 ? -limit : limit;
    }

    this.virtualScroll += delta;
    this.previousScroll = scroll;
    const nextLoopIndex = Math.floor(this.virtualScroll / loopHeight);
    let diff = nextLoopIndex - this.loopIndex;

    while (diff > 0) {
      this.rotateLists('forward');
      this.loopIndex += 1;
      diff -= 1;
    }

    while (diff < 0) {
      this.rotateLists('backward');
      this.loopIndex -= 1;
      diff += 1;
    }

    const remainder = this.virtualScroll - this.loopIndex * loopHeight;
    this.loopOffset = scroll - remainder;
    this.trackElement.style.transform = `translate3d(0, ${this.loopOffset}px, 0)`;
  }

  public measure() {
    if (!this.slides.length) return;

    this.viewportHeight = Math.max(window.innerHeight, 1);
    this.computeLoopHeight();
    this.applyLoopOffset();

    const buffer = this.config.safeZoneBuffer;
    let maxVisibility = -1;
    let nextActiveSlide: SlideState | null = null;

    this.slides.forEach((slide) => {
      const scaleTarget = slide.focusNodes[0] || slide.node;
      const scaleRect = scaleTarget.getBoundingClientRect();
      const scaleHeight = scaleRect.height;

      const scaleTransitionDistance = scaleHeight;
      const scaleProgressTop = clamp(
        (scaleRect.top + buffer + scaleTransitionDistance) / scaleTransitionDistance,
        0,
        1
      );
      const scaleProgressBottom = clamp(
        (this.viewportHeight + buffer + scaleTransitionDistance - scaleRect.bottom) /
          scaleTransitionDistance,
        0,
        1
      );

      const scaleVisibility = Math.pow(Math.min(scaleProgressTop, scaleProgressBottom), 0.8);

      slide.targetProgress = scaleVisibility;
      slide.targetScale =
        this.config.baseScale + (this.config.focusScale - this.config.baseScale) * scaleVisibility;

      if (scaleVisibility > maxVisibility) {
        maxVisibility = scaleVisibility;
        nextActiveSlide = slide;
      }

      slide.focusNodes.forEach((node) => {
        const extendedNode = node as HTMLElement & {
          _targetVisibility?: number;
          _currentVisibility?: number;
        };
        const nodeRect = node.getBoundingClientRect();
        const nodeHeight = nodeRect.height;
        const nodeDist = nodeHeight;

        const pTop = clamp((nodeRect.top + buffer + nodeDist) / nodeDist, 0, 1);
        const pBottom = clamp(
          (this.viewportHeight + buffer + nodeDist - nodeRect.bottom) / nodeDist,
          0,
          1
        );
        const nodeVis = Math.pow(Math.min(pTop, pBottom), 0.8);

        extendedNode._targetVisibility = nodeVis;
        if (typeof extendedNode._currentVisibility === 'undefined') {
          extendedNode._currentVisibility = nodeVis;
        }
      });
    });

    if (nextActiveSlide && nextActiveSlide !== this.mostVisibleSlide && maxVisibility > 0.5) {
      this.mostVisibleSlide = nextActiveSlide as SlideState;
      const source = this.mostVisibleSlide.node.querySelector<HTMLElement>('.cms-homepage-source');
      if (source) updateActiveDetailsFromSource(source);
    }
  }

  public animate() {
    if (!this.slides.length) return;

    this.slides.forEach((slide) => {
      slide.scale += (slide.targetScale - slide.scale) * this.config.lerp;
      slide.progress += (slide.targetProgress - slide.progress) * this.config.progressLerp;

      slide.focusNodes.forEach((node) => {
        const extendedNode = node as HTMLElement & {
          _targetVisibility?: number;
          _currentVisibility?: number;
        };
        const target = extendedNode._targetVisibility ?? 0;
        const current = extendedNode._currentVisibility ?? 0;
        const next = current + (target - current) * this.config.progressLerp;
        extendedNode._currentVisibility = next;
      });

      this.applySlideStyles(slide);
    });
  }

  public syncToTargets() {
    if (!this.slides.length) return;
    this.slides.forEach((slide) => {
      slide.scale = slide.targetScale;
      slide.progress = slide.targetProgress;
      this.applySlideStyles(slide);
    });
  }
}

const triggerSliderMeasurements = () => {
  loopSliderInstances.forEach((instance) => instance.measure());
};

const handleNativeScroll = () => triggerSliderMeasurements();
const handleResize = () => triggerSliderMeasurements();

const attachNativeScrollListener = () => {
  if (sliderScrollListenerAttached) return;
  window.addEventListener('scroll', handleNativeScroll, { passive: true });
  sliderScrollListenerAttached = true;
};

const attachResizeListener = () => {
  if (sliderResizeListenerAttached) return;
  window.addEventListener('resize', handleResize);
  sliderResizeListenerAttached = true;
};

const startSliderAnimationLoop = () => {
  if (sliderAnimationFrame !== null) return;
  const loop = () => {
    loopSliderInstances.forEach((instance) => instance.animate());
    sliderAnimationFrame = window.requestAnimationFrame(loop);
  };
  sliderAnimationFrame = window.requestAnimationFrame(loop);
};

export const destroyLoopSlider = () => {
  if (sliderAnimationFrame !== null) {
    window.cancelAnimationFrame(sliderAnimationFrame);
    sliderAnimationFrame = null;
  }
  if (sliderScrollListenerAttached) {
    window.removeEventListener('scroll', handleNativeScroll);
    sliderScrollListenerAttached = false;
  }
  if (sliderResizeListenerAttached) {
    window.removeEventListener('resize', handleResize);
    sliderResizeListenerAttached = false;
  }
  loopSliderInstances.forEach((instance) => instance.destroy());
  loopSliderInstances.length = 0;
};

export const initLoopSlider = () => {
  const shouldSnap = document.body.hasAttribute(LOOP_SLIDER_SNAP_ATTR);
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const sliderRoots = getLoopSliderRoots();
  if (!sliderRoots.length) {
    if (shouldSnap) document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
    return;
  }

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    if (shouldSnap) document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
    return;
  }

  const instances = sliderRoots
    .map((root) => {
      try {
        return new LoopSliderInstance(root);
      } catch {
        return null;
      }
    })
    .filter((instance): instance is LoopSliderInstance => Boolean(instance));

  if (!instances.length) return;

  loopSliderInstances.push(...instances);

  attachNativeScrollListener();
  attachResizeListener();

  triggerSliderMeasurements();
  if (shouldSnap) {
    instances.forEach((instance) => instance.syncToTargets());
    document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
  }

  startSliderAnimationLoop();

  // Initialize active details exactly once on load
  const initActiveWithRetries = (tries = 40, delay = 50) => {
    let count = 0;
    const tick = () => {
      const firstSlide = document.querySelector('.slide-w, .slide');
      const source = firstSlide?.querySelector('.cms-homepage-source') as HTMLElement | null;
      if (source && updateActiveDetailsFromSource(source)) return;
      count += 1;
      if (count >= tries) return;
      setTimeout(tick, delay);
    };
    tick();
  };
  initActiveWithRetries();
};
