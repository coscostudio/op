import Lenis from 'lenis';
import Snap from 'lenis/snap';
const LOOP_SLIDER_SELECTORS = {
  root: ['[data-loop-slider="root"]', '.loop-slider-wrapper', '.slider-section'],
  track: ['[data-loop-slider="track"]', '.loop-slider-track'],
  list: ['[data-loop-slider="list"]', '.slider-wrapper'],
  loop: ['[data-loop-slider="loop"]', '.loop-slider.w-dyn-list', '.loop-slider'],
  item: ['[data-loop-slider="item"]', '.slide-w'],
  content: ['[data-loop-slider="content"]', '.home-project-card'],
  blur: ['[data-loop-slider="blur"]', '.slide-blur'],
  media: ['[data-loop-slider="focus"]', '.home-project-card'],
} as const satisfies Record<string, readonly string[]>;

const LOOP_SLIDER_CONFIG = {
  baseScale: 0.4, // reduced to avoid full bleed
  focusScale: 0.825, // max scale doesn't reach edges
  blurMax: 100, // blur on enter/leave
  translateMax: 0,
  lerp: 0.08, // faster snapping
  progressLerp: 0.12,
  minOpacity: 0.5, // increased to prevent items looking completely gone
  safeZoneBuffer: -32, // negative buffer pulls items into transition earlier
  bgBaseScale: 0.5, // larger than card's baseScale
  bgFocusScale: 0.85, //  larger than card's focusScale
};

type SlideState = {
  node: HTMLElement;
  contentNode: HTMLElement;
  bgObjectNode: HTMLElement | null;
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
  if (!document.getElementById(LENIS_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = LENIS_STYLE_ID;
    style.textContent = LENIS_STYLES;
    document.head.appendChild(style);
  }
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

// Function extracted from the activeitem script inside HTML
const updateActiveDetailsFromSource = (source: HTMLElement) => {
  const targetNormal = document.querySelector('.list-title-normal');
  const targetSuper = document.querySelector('.list-title-super');

  if (!targetNormal || !targetSuper || !source) return false;

  const sourceTitle = source.querySelector('.cms-homepage-title')?.textContent?.trim() || '';
  const sourceSuper = source.querySelector('.cms-homepage-super')?.textContent?.trim() || '';

  if (targetNormal.textContent !== sourceTitle) {
    targetNormal.textContent = sourceTitle;
  }
  if (targetSuper.textContent !== sourceSuper) {
    targetSuper.textContent = sourceSuper;
  }

  // Services: rebuild the visible list from the CMS nested list
  const servicesOut = document.querySelector('.activeitem-services-list');
  const visibleLabels = new Set(
    Array.from(servicesOut?.children || []).map((li) => li.textContent?.trim())
  );
  const incomingLabels = new Set(
    Array.from(source.querySelectorAll('.active-services-source-item')).map(
      (item) => item.textContent?.trim() || ''
    )
  );

  // If labels are exactly the same, avoid DOM thrashing
  let changed = false;
  if (visibleLabels.size !== incomingLabels.size) {
    changed = true;
  } else {
    for (const label of incomingLabels) {
      if (!visibleLabels.has(label)) {
        changed = true;
        break;
      }
    }
  }

  if (changed && servicesOut) {
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private localSnap: any | null = null;
  private localLenisRaf: number | null = null;
  private handleLenisScroll?: () => void;
  private mostVisibleSlide: SlideState | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.prefersInfinite = root.dataset.loopSliderInfinite !== 'false';

    const track = queryElementWithFallback<HTMLElement>(root, LOOP_SLIDER_SELECTORS.track);
    const list = queryElementWithFallback<HTMLElement>(root, LOOP_SLIDER_SELECTORS.list);

    if (!list || !track) {
      throw new Error(
        'Loop slider list not found. Add data-loop-slider="list" to the slider wrapper.'
      );
    }

    this.primaryList = list;
    this.loopHeight = this.primaryList.scrollHeight;
    this.trackElement = track;
    this.prepareLoopLists(track);

    // Hide list initially to prevent jump
    this.primaryList.style.opacity = '0';
    this.primaryList.style.transition = 'opacity 0.4s ease-out';

    this.collectSlides();

    if (this.prefersInfinite) {
      this.initLocalLenis();
    }
  }

  public destroy() {
    if (this.handleLenisScroll && this.localLenis) {
      this.localLenis.off('scroll', this.handleLenisScroll);
    }

    if (this.localLenisRaf !== null) {
      window.cancelAnimationFrame(this.localLenisRaf);
      this.localLenisRaf = null;
    }

    this.localSnap?.destroy();
    this.localSnap = null;

    this.localLenis?.destroy();
    this.localLenis = null;
  }

  public applyInitialOffset() {
    if (!this.localLenis) return;

    // Ensure we're in a fresh frame to avoid race conditions with layout
    requestAnimationFrame(() => {
      const offset = this.viewportHeight * this.config.initialOffset;
      if (offset > 0 && this.localLenis) {
        // Scroll backwards (negative) to shift content down
        this.localLenis.scrollTo(-offset, { immediate: true });
      }

      // Reveal the list in the next frame after scroll is applied
      requestAnimationFrame(() => {
        if (this.primaryList) {
          this.primaryList.style.opacity = '1';
        }
      });
    });
  }

  private initLocalLenis() {
    if (this.localLenis || !this.trackElement) {
      return;
    }

    ensureLenisStyles();

    this.root.style.overflow = this.root.style.overflow || 'hidden';
    this.root.style.position = this.root.style.position || 'relative';
    this.trackElement.style.willChange = this.trackElement.style.willChange || 'transform';

    this.localLenis = new Lenis({
      wrapper: this.root,
      content: this.trackElement,
      smoothWheel: true,
      infinite: true,
      syncTouch: true,
      touchMultiplier: 1.66,
      wheelMultiplier: 1.66, // Lower = less travel per gesture before snap kicks in
    });

    this.handleLenisScroll = () => {
      this.measure();
    };

    this.localLenis.on('scroll', this.handleLenisScroll);

    // Mandatory snap: always snaps to the nearest card when scrolling slows down.
    // Short debounce = snap kicks in quickly, but you still get fluid momentum.
    this.localSnap = new Snap(this.localLenis, {
      type: 'mandatory',
      duration: 0.33,
      debounce: 33,
      easing: (t: number) => 1 - Math.pow(1 - t, 3),
    });

    // Register all slides as snap points (center-aligned)
    this.slides.forEach((slide) => {
      this.localSnap?.addElement(slide.node as HTMLElement, { align: ['center'] });
    });

    const raf = (time: number) => {
      this.localLenis?.raf(time);
      this.localLenisRaf = window.requestAnimationFrame(raf);
    };

    this.localLenisRaf = window.requestAnimationFrame(raf);
  }

  private collectSlides() {
    const nodes = queryAllWithFallback<HTMLElement>(this.root, LOOP_SLIDER_SELECTORS.item);

    this.slides = nodes.map((node) => ({
      node,
      contentNode:
        queryElementWithFallback<HTMLElement>(node, LOOP_SLIDER_SELECTORS.content) ?? node,
      bgObjectNode: node.querySelector<HTMLElement>('.bg-object'),
      blurNode: queryElementWithFallback<HTMLElement>(node, LOOP_SLIDER_SELECTORS.blur),
      focusNodes: (() => {
        const focusTargets: HTMLElement[] = [];
        const primaryFocus = queryElementWithFallback<HTMLElement>(
          node,
          LOOP_SLIDER_SELECTORS.media
        );
        const titleNode = node.querySelector<HTMLElement>('.work-title');
        if (primaryFocus) {
          focusTargets.push(primaryFocus);
        }
        if (titleNode) {
          focusTargets.push(titleNode);
        }
        if (!focusTargets.length) {
          focusTargets.push(
            queryElementWithFallback<HTMLElement>(node, LOOP_SLIDER_SELECTORS.content) ?? node
          );
        }
        return focusTargets;
      })(),
      progress: 0,
      targetProgress: 0,
      scale: this.config.baseScale,
      targetScale: this.config.baseScale,
    }));

    this.slides.forEach((slide) => {
      const content = slide.contentNode;
      content.style.willChange = 'transform, opacity, filter, mix-blend-mode';
      content.style.transformOrigin = 'center center';
      content.style.position = content.style.position || 'relative';

      if (slide.bgObjectNode) {
        slide.bgObjectNode.style.willChange = 'transform';
        slide.bgObjectNode.style.transformOrigin = 'center center';
      }
    });
  }

  private applySlideStyles(slide: SlideState) {
    const opacity = this.config.minOpacity + (1 - this.config.minOpacity) * slide.progress;

    slide.contentNode.style.transform = `scale(${slide.scale.toFixed(4)})`;
    slide.contentNode.style.opacity = opacity.toFixed(3);

    if (slide.bgObjectNode) {
      const bgScale =
        this.config.bgBaseScale +
        (this.config.bgFocusScale - this.config.bgBaseScale) * slide.progress;

      // Only scaling applied; Webflow native styles determine positioning/blur
      slide.bgObjectNode.style.transform = `scale(${bgScale.toFixed(4)})`;
    }

    const shadowOpacity = slide.progress * 0.15;
    slide.contentNode.style.boxShadow = `0px 20px 120px 20px rgba(0, 0, 0, ${shadowOpacity.toFixed(3)})`;

    slide.focusNodes.forEach((target) => {
      const visibility = slide.progress;

      const blurValue = (1 - visibility) * this.config.blurMax;
      const xRayIntensity = (1 - visibility) * 100;

      // We apply desaturation (grayscale) and inversion simultaneously with the blur
      // to create a smooth, low-saturation x-ray effect that avoids 'difference' harshness
      target.style.filter = `blur(${blurValue.toFixed(2)}px) grayscale(${xRayIntensity.toFixed(1)}%) invert(${xRayIntensity.toFixed(1)}%)`;
    });

    if (slide.blurNode) {
      slide.blurNode.style.opacity = (1 - slide.progress).toFixed(3);
    }
  }

  private prepareLoopLists(track: HTMLElement) {
    this.loopLists = queryAllWithFallback<HTMLElement>(track, LOOP_SLIDER_SELECTORS.loop);

    if (!this.loopLists.length) {
      this.loopLists = [];
      return;
    }

    if (this.loopLists.length < 2) {
      const clone = this.loopLists[0].cloneNode(true) as HTMLElement;
      track.appendChild(clone);
      this.loopLists.push(clone);
    }
  }

  private rotateLists(direction: 'forward' | 'backward') {
    if (!this.trackElement || !this.loopLists.length) {
      return;
    }

    if (direction === 'forward') {
      const first = this.loopLists.shift();

      if (!first) {
        return;
      }

      this.trackElement.appendChild(first);
      this.loopLists.push(first);
    } else {
      const last = this.loopLists.pop();

      if (!last) {
        return;
      }

      const firstChild = this.trackElement.firstElementChild;
      if (firstChild) {
        this.trackElement.insertBefore(last, firstChild);
      } else {
        this.trackElement.appendChild(last);
      }

      this.loopLists.unshift(last);
    }
  }

  private computeLoopHeight() {
    if (!this.primaryList) {
      return this.loopHeight;
    }

    const height = this.primaryList.scrollHeight || this.primaryList.offsetHeight;

    if (height) {
      this.loopHeight = height;
    }

    return this.loopHeight;
  }

  private applyLoopOffset() {
    if (!this.prefersInfinite || !this.localLenis || !this.trackElement) {
      return;
    }

    const loopHeight = this.loopHeight || this.computeLoopHeight();

    if (!loopHeight) {
      return;
    }

    const { scroll } = this.localLenis;
    const limit = Math.max(this.localLenis.limit || loopHeight, loopHeight);

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
    if (!this.slides.length) {
      return;
    }

    const viewportHeight = Math.max(window.innerHeight, 1);
    this.viewportHeight = viewportHeight;
    this.computeLoopHeight();
    this.applyLoopOffset();

    const buffer = this.config.safeZoneBuffer;

    let maxVisibility = -1;
    let nextActiveSlide: SlideState | null = null;

    this.slides.forEach((slide) => {
      const scaleRect = slide.node.getBoundingClientRect();
      const nodeCenter = scaleRect.top + scaleRect.height / 2;
      const viewportCenter = viewportHeight / 2;

      // Distance of the slide's center from the viewport center
      const distance = Math.abs(nodeCenter - viewportCenter);

      // If the slide is taller than the viewport, it has a "plateau" where it stays perfectly centered visually
      const plateau = Math.max(0, (scaleRect.height - viewportHeight) / 2);

      // Distance past the plateau
      const activeDistance = Math.max(0, distance - plateau);

      // Transition over half the viewport height + buffer
      const transitionDist = viewportHeight / 2 + buffer - 1;

      // We want items to grow much faster when they enter, so the exponent is smaller
      // and we use a more aggressive clamping
      let scaleVisibility = 1 - activeDistance / transitionDist;

      // Force it to reach 100% visibility (width) much earlier in its scroll journey
      // Multiply by 2.5 so that it's 100% wide for the entire middle portion of its transition
      scaleVisibility = clamp(scaleVisibility * 2.5, 0, 1);

      // use an aggressive curve to puff them out quickly instead of shrinking linearly
      scaleVisibility = Math.pow(scaleVisibility, 0.3);

      slide.targetProgress = scaleVisibility;
      slide.targetScale =
        this.config.baseScale + (this.config.focusScale - this.config.baseScale) * scaleVisibility;

      if (scaleVisibility > maxVisibility) {
        maxVisibility = scaleVisibility;
        nextActiveSlide = slide;
      }
    });

    if (nextActiveSlide && nextActiveSlide !== this.mostVisibleSlide && maxVisibility > 0.5) {
      this.mostVisibleSlide = nextActiveSlide as SlideState;
      const source = this.mostVisibleSlide.node.querySelector<HTMLElement>('.cms-homepage-source');
      if (source) {
        updateActiveDetailsFromSource(source);
      }
    }
  }

  public animate() {
    if (!this.slides.length) {
      return;
    }

    this.slides.forEach((slide) => {
      slide.scale += (slide.targetScale - slide.scale) * this.config.lerp;
      slide.progress += (slide.targetProgress - slide.progress) * this.config.progressLerp;

      this.applySlideStyles(slide);
    });
  }

  public syncToTargets() {
    if (!this.slides.length) {
      return;
    }

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

const handleNativeScroll = () => {
  triggerSliderMeasurements();
};

const handleResize = () => {
  triggerSliderMeasurements();
};

const attachNativeScrollListener = () => {
  if (sliderScrollListenerAttached) {
    return;
  }

  window.addEventListener('scroll', handleNativeScroll, { passive: true });
  sliderScrollListenerAttached = true;
};

const attachResizeListener = () => {
  if (sliderResizeListenerAttached) {
    return;
  }

  window.addEventListener('resize', handleResize);
  sliderResizeListenerAttached = true;
};

const startSliderAnimationLoop = () => {
  if (sliderAnimationFrame !== null) {
    return;
  }

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
  // Prevent browser scroll restoration from interfering with our custom offset
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  const sliderRoots = getLoopSliderRoots();

  if (!sliderRoots.length) {
    if (shouldSnap) {
      document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
    }
    return;
  }

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  if (prefersReducedMotion.matches) {
    if (shouldSnap) {
      document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
    }
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

  if (!instances.length) {
    return;
  }

  loopSliderInstances.push(...instances);

  attachNativeScrollListener();
  attachResizeListener();

  triggerSliderMeasurements();
  if (shouldSnap) {
    instances.forEach((instance) => instance.syncToTargets());
    document.body.removeAttribute(LOOP_SLIDER_SNAP_ATTR);
  }

  instances.forEach((instance) => instance.applyInitialOffset());

  startSliderAnimationLoop();
};
